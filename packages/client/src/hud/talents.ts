import {
  ABILITY_SLOTS, CLASSES, TALENT_TREES, archetypeOf, getAction, slotAction, unlockedSkills,
  type AbilitySlot, type ClassId, type EntitySnap, type TalentNode,
} from '@etherfall/shared';
import { actionIcon, iconCanvas, statIcon } from './icons';

const h = (tag: string, cls?: string, text?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** A fresh canvas element showing the action's icon (the cached tile is shared). */
function iconEl(actionId: string): HTMLCanvasElement {
  const i = actionIcon(actionId);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  c.getContext('2d')!.drawImage(iconCanvas(i.motif, i.color, 64), 0, 0);
  return c;
}

const SLOT_KEY: Record<AbilitySlot, string> = { q: 'Q', e: 'E', a1: '1', a2: '2', a3: '3', a4: '4', r: 'R' };
const KIND_LABEL: Record<TalentNode['kind'], string> = { start: 'Início', minor: 'Atributo', notable: 'Talento notável', skill: 'Habilidade nova', keystone: 'Pedra angular' };
const KIND_SIZE: Record<TalentNode['kind'], number> = { start: 30, minor: 20, notable: 30, skill: 38, keystone: 44 };

/**
 * Skill tree (K): a big free graph per class, drawn on a canvas you can drag and zoom. Click a
 * glowing node next to what you own to buy it; skill nodes unlock new abilities you then put
 * in the Q/E/1–4/R slots on the right. Purely a view: every click is a request the server validates.
 */
export class TalentPanel {
  readonly root = h('div', 'talents panel hidden');
  open = false;
  private canvas = document.createElement('canvas');
  private side = h('div', 'tree-side');
  private tip = h('div', 'tree-tip hidden');
  private key = '';
  private me: EntitySnap | null = null;
  private view = { x: 0, y: 0, s: 0 };
  private hover: TalentNode | null = null;
  private drag: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
  private byId = new Map<string, TalentNode>();
  private dirty = true;

  constructor(
    parent: HTMLElement,
    private classId: ClassId,
    private onTalent: (node: string) => void,
    private onEquip: (slot: AbilitySlot, action: string | null) => void,
    private onRespec: () => void,
  ) {
    for (const n of TALENT_TREES[classId].nodes) this.byId.set(n.id, n);
    const wrap = h('div', 'tree-wrap');
    this.canvas.className = 'tree-canvas';
    wrap.append(this.canvas, this.tip);
    this.root.append(wrap, this.side);
    parent.append(this.root);
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y, moved: false };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (this.drag) {
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
        this.view.x = this.drag.vx - dx / this.view.s;
        this.view.y = this.drag.vy + dy / this.view.s;
        this.dirty = true;
      }
      const n = this.pick(e);
      if (n !== this.hover) {
        this.hover = n;
        this.dirty = true;
      }
      this.showTip(e, n);
    });
    c.addEventListener('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      if (d && !d.moved) {
        const n = this.pick(e);
        if (n && this.me && this.canBuy(n)) this.onTalent(n.id);
      }
    });
    c.addEventListener('pointerleave', () => {
      this.hover = null;
      this.tip.classList.add('hidden');
      this.dirty = true;
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.view.s = Math.min(90, Math.max(10, this.view.s * Math.pow(0.9, Math.sign(e.deltaY))));
      this.dirty = true;
    }, { passive: false });
  }

  toggle(me: EntitySnap | null): void {
    this.open = !this.open;
    this.root.classList.toggle('hidden', !this.open);
    this.key = '';
    this.dirty = true;
    this.update(me);
  }

  update(me: EntitySnap | null): void {
    if (!this.open || !me) return;
    this.me = me;
    const owned = me.talents ?? {};
    const pts = me.talentPoints ?? 0;
    const key = JSON.stringify([me.level, pts, owned, me.subclass ?? null, me.loadout ?? {}, me.action === 'sit']);
    if (key !== this.key) {
      this.key = key;
      this.renderSide(me);
      this.dirty = true;
    }
    this.draw();
  }

  /** Page coordinates of a node's centre (E2E tests click the canvas through this). */
  nodeClientPos(id: string): { x: number; y: number } | null {
    const n = this.byId.get(id);
    if (!n) return null;
    const r = this.canvas.getBoundingClientRect();
    const [x, y] = this.toScreen(n.x, n.y, r.width, r.height);
    return { x: r.left + x, y: r.top + y };
  }

  // ---------------------------------------------------------------- graph
  private owned(id: string): boolean {
    return (this.me?.talents?.[id] ?? 0) > 0;
  }

  private canBuy(n: TalentNode): boolean {
    if (!this.me || n.kind === 'start' || this.owned(n.id) || (this.me.talentPoints ?? 0) <= 0) return false;
    const start = TALENT_TREES[this.classId].start;
    return n.links.some((l) => l === start || this.owned(l));
  }

  private toScreen(x: number, y: number, w: number, hgt: number): [number, number] {
    return [w / 2 + (x - this.view.x) * this.view.s, hgt / 2 - (y - this.view.y) * this.view.s];
  }

  private pick(e: PointerEvent): TalentNode | null {
    const r = this.canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best: TalentNode | null = null;
    let bd = Infinity;
    for (const n of this.byId.values()) {
      const [x, y] = this.toScreen(n.x, n.y, r.width, r.height);
      const d = Math.hypot(x - mx, y - my);
      const rad = (KIND_SIZE[n.kind] * Math.min(1.4, this.view.s / 34)) / 2 + 4;
      if (d < rad && d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  private showTip(e: PointerEvent, n: TalentNode | null): void {
    if (!n) {
      this.tip.classList.add('hidden');
      return;
    }
    const arch = archetypeOf(this.classId, n.path);
    const state = n.kind === 'start' ? '' : this.owned(n.id) ? 'Adquirido' : this.canBuy(n) ? 'Clique para adquirir (1 ponto)' : 'Precisa estar ligado a um nó seu';
    let body = n.description;
    if (n.skill) {
      const a = getAction(n.skill);
      const cost = [a.mana ? `${a.mana} mana` : '', a.stamina ? `${a.stamina} stamina` : '', a.cooldown ? `recarga ${(a.cooldown / 30).toFixed(1)}s` : ''].filter(Boolean).join(' · ');
      body = `${a.desc ?? ''}${cost ? `\n${cost}` : ''}`;
    }
    this.tip.innerHTML = '';
    this.tip.append(
      h('b', '', n.name),
      h('div', 'tip-kind', `${KIND_LABEL[n.kind]}${arch ? ` · ${arch.name}` : ''}`),
      h('div', 'tip-body', body),
      h('div', 'tip-state', state),
    );
    const r = this.canvas.getBoundingClientRect();
    this.tip.style.left = `${Math.min(r.width - 240, e.clientX - r.left + 16)}px`;
    this.tip.style.top = `${Math.min(r.height - 120, e.clientY - r.top + 12)}px`;
    this.tip.classList.remove('hidden');
  }

  private draw(): void {
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth;
    const hh = c.clientHeight;
    if (w === 0 || hh === 0) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hh * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(hh * dpr);
      this.dirty = true;
    }
    if (this.view.s === 0) this.view.s = Math.min(w, hh) / 44;
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 260);
    const g = c.getContext('2d')!;
    // redraw every frame only when something can buy (pulsing glow) or the view changed
    if (!this.dirty && (this.me?.talentPoints ?? 0) <= 0) return;
    this.dirty = false;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hh);
    const tree = TALENT_TREES[this.classId];
    const color = (n: TalentNode) => archetypeOf(this.classId, n.path)?.color ?? '#cfd3dc';
    // arm labels
    g.font = '600 13px "DejaVu Sans Mono", Consolas, monospace';
    g.textAlign = 'center';
    for (const a of tree.archetypes) {
      const ang = (a.angle * Math.PI) / 180;
      const [x, y] = this.toScreen(Math.cos(ang) * 19.8, Math.sin(ang) * 19.8, w, hh);
      g.fillStyle = a.color;
      g.globalAlpha = 0.9;
      g.fillText(a.name.toUpperCase(), x, y);
    }
    g.globalAlpha = 1;
    // edges
    for (const n of tree.nodes) {
      for (const l of n.links) {
        if (l < n.id) continue;
        const m = this.byId.get(l)!;
        const [x1, y1] = this.toScreen(n.x, n.y, w, hh);
        const [x2, y2] = this.toScreen(m.x, m.y, w, hh);
        const on = (this.owned(n.id) || n.kind === 'start') && (this.owned(m.id) || m.kind === 'start');
        g.strokeStyle = on ? color(n.path ? n : m) : 'rgba(150,155,170,0.22)';
        g.lineWidth = on ? 3 : 1.5;
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
      }
    }
    // nodes
    const scale = Math.min(1.4, this.view.s / 34);
    for (const n of tree.nodes) {
      const [x, y] = this.toScreen(n.x, n.y, w, hh);
      if (x < -60 || y < -60 || x > w + 60 || y > hh + 60) continue;
      const size = KIND_SIZE[n.kind] * scale;
      const owned = this.owned(n.id) || n.kind === 'start';
      const buy = this.canBuy(n);
      const ic = n.skill ? actionIcon(n.skill) : n.kind === 'keystone' ? { motif: 'keystone', color: color(n) } : n.kind === 'start' ? { motif: 'gem', color: '#ffffff' } : statIcon(n.effects);
      const img = iconCanvas(ic.motif, ic.color, 64);
      g.save();
      g.globalAlpha = owned ? 1 : buy ? 0.75 + 0.25 * pulse : 0.38;
      if (n.kind === 'minor' || n.kind === 'start') {
        g.beginPath();
        g.arc(x, y, size / 2, 0, Math.PI * 2);
        g.clip();
      }
      g.drawImage(img, x - size / 2, y - size / 2, size, size);
      g.restore();
      g.strokeStyle = owned ? color(n) : buy ? `rgba(255,240,200,${0.5 + 0.5 * pulse})` : 'rgba(120,125,140,0.6)';
      g.lineWidth = owned ? 2.5 : buy ? 2 : 1;
      if (this.hover === n) {
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2.5;
      }
      g.beginPath();
      if (n.kind === 'minor' || n.kind === 'start') g.arc(x, y, size / 2 + 1, 0, Math.PI * 2);
      else if (n.kind === 'keystone') {
        g.moveTo(x, y - size / 2 - 3);
        g.lineTo(x + size / 2 + 3, y);
        g.lineTo(x, y + size / 2 + 3);
        g.lineTo(x - size / 2 - 3, y);
        g.closePath();
      } else g.rect(x - size / 2 - 1, y - size / 2 - 1, size + 2, size + 2);
      g.stroke();
    }
  }

  // ---------------------------------------------------------------- side panel
  private renderSide(me: EntitySnap): void {
    const tree = TALENT_TREES[this.classId];
    const owned = me.talents ?? {};
    const pts = me.talentPoints ?? 0;
    const title = archetypeOf(this.classId, me.subclass);
    const head = h('div', 'tree-head');
    head.append(
      h('div', 'menu-title', 'Árvore de Habilidades'),
      h('div', 'hint', `${CLASSES[this.classId].name}${title ? ` · ${title.name}` : ''}`),
      h('div', pts > 0 ? 'points' : 'hint', pts > 0 ? `${pts} ponto(s) para gastar` : 'Sem pontos: ganhe 1 a cada nível.'),
    );
    const paths = h('div', 'tree-paths');
    for (const a of tree.archetypes) {
      const n = tree.nodes.filter((x) => x.path === a.id && (owned[x.id] ?? 0) > 0).length;
      const total = tree.nodes.filter((x) => x.path === a.id).length;
      const row = h('div', 'tree-path');
      row.style.borderColor = a.color;
      const name = h('b', '', `${a.name} · ${n}/${total}`);
      name.style.color = a.color;
      row.append(name, h('div', 'hint', a.description));
      paths.append(row);
    }

    // loadout: every slot, then every unlocked skill with buttons to equip it
    const skills = h('div', 'tree-skills');
    skills.append(h('div', 'sub-title', 'Atalhos'));
    const slots = h('div', 'loadout');
    for (const s of ABILITY_SLOTS) {
      const id = slotAction(this.classId, me.loadout ?? {}, owned, s);
      const cell = h('div', 'loadout-slot');
      if (id) {
        cell.append(iconEl(id));
        cell.title = getAction(id).name;
      }
      cell.append(h('span', 'key', SLOT_KEY[s]));
      slots.append(cell);
    }
    skills.append(slots, h('div', 'sub-title', 'Habilidades disponíveis'));
    const list = h('div', 'skill-list');
    const kit = new Set(Object.values(CLASSES[this.classId].abilities).map((x) => x?.action));
    for (const id of unlockedSkills(this.classId, owned)) {
      const a = getAction(id);
      const row = h('div', `skill-row${kit.has(id) ? '' : ' fromtree'}`);
      const img = iconEl(id);
      const info = h('div', 'skill-info');
      const kitDef = Object.values(CLASSES[this.classId].abilities).find((x) => x?.action === id);
      info.append(h('b', '', kitDef?.label ?? a.name), h('div', 'hint', kitDef?.description ?? a.desc ?? ''));
      const btns = h('div', 'skill-btns');
      for (const s of ABILITY_SLOTS) {
        const b = document.createElement('button');
        b.className = 'btn tiny';
        b.textContent = SLOT_KEY[s];
        b.dataset.equip = `${id}:${s}`;
        const here = slotAction(this.classId, me.loadout ?? {}, owned, s) === id;
        b.classList.toggle('on', here);
        b.title = here ? 'Já está neste atalho' : `Colocar no atalho ${SLOT_KEY[s]}`;
        b.addEventListener('click', () => this.onEquip(s, id));
        btns.append(b);
      }
      row.append(img, info, btns);
      list.append(row);
    }
    skills.append(list);

    const respec = document.createElement('button');
    respec.className = 'btn';
    respec.id = 'respec';
    respec.textContent = 'Redistribuir pontos';
    respec.title = 'Devolve todos os pontos de atributo e da árvore. Só funciona sentado numa fogueira.';
    respec.disabled = me.action !== 'sit';
    respec.addEventListener('click', () => this.onRespec());
    const foot = h('div', 'talent-foot');
    foot.append(h('p', 'hint', me.action === 'sit' ? 'Sentado na fogueira: você pode redistribuir tudo.' : 'Arraste para mover · roda do mouse para zoom · K fecha · fogueira (F) para redistribuir'), respec);
    this.side.replaceChildren(head, paths, skills, foot);
  }
}
