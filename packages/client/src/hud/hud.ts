import { CLASSES, getAction, slotAction, type AbilitySlot, type ClassId, type EntitySnap } from '@etherfall/shared';
import { actionIconUrl } from './icons';
import { prettyKey, type KeyMap } from '../input/keymap';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

interface Bar {
  root: HTMLElement;
  fill: HTMLElement;
  lag: HTMLElement;
  label: HTMLElement;
  lagValue: number;
}

function bar(cls: string, name: string): Bar {
  const root = el('div', `bar ${cls}`);
  const lag = el('div', 'lag');
  const fill = el('div', 'fill');
  const label = el('div', 'label');
  root.append(lag, fill, label);
  root.title = name;
  return { root, fill, lag, label, lagValue: 1 };
}

function setBar(b: Bar, v: number, max: number, text = true): void {
  const k = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
  b.fill.style.width = `${k * 100}%`;
  b.lagValue = k > b.lagValue ? k : b.lagValue + (k - b.lagValue) * 0.06;
  b.lag.style.width = `${b.lagValue * 100}%`;
  if (text) b.label.textContent = `${Math.ceil(v)}/${Math.round(max)}`;
}

interface Slot {
  root: HTMLElement;
  cd: HTMLElement;
  icon: HTMLImageElement;
  lbl: HTMLElement;
  actionId?: string;
  /** Re-assignable ability slot (Q, E, 1–4, R); fixed slots (attacks, dodge) have none. */
  slot?: AbilitySlot;
  tip?: string;
}

const tooltip = (actionId: string, text: string): string => {
  const cost = getAction(actionId);
  return `${text}${cost.stamina ? ` · ${cost.stamina} stamina` : ''}${cost.mana ? ` · ${cost.mana} mana` : ''}${cost.cooldown ? ` · recarga ${(cost.cooldown / 30).toFixed(1)}s` : ''}`;
};

/** DOM HUD: vitals, ability bar with cooldowns, target frame, combat log, death screen, perf. */
export class Hud {
  private hp = bar('hp', 'Vida');
  private st = bar('st', 'Stamina');
  private mp = bar('mp', 'Mana');
  private xpb = bar('xp', 'Experiência');
  private points = el('div', 'points hidden');
  private name = el('div', 'hud-name');
  private slots: Slot[] = [];
  private target = el('div', 'target hidden');
  private targetName = el('div', 'target-name');
  private targetBar = bar('boss', 'Alvo');
  private log = el('div', 'log');
  private death = el('div', 'death hidden');
  private perf = el('div', 'perf');
  private roomTag = el('div', 'room-tag hidden');
  private toastEl = el('div', 'toast hidden');
  private toastUntil = 0;

  constructor(
    private root: HTMLElement,
    private classId: ClassId,
    keymap: KeyMap,
  ) {
    const vitals = el('div', 'vitals panel');
    vitals.append(this.name, this.hp.root, this.st.root, this.mp.root, this.xpb.root, this.points);
    const cls = CLASSES[classId];
    const ab = el('div', 'abilities');
    const make = (key: string, label: string, actionId: string | undefined, tip: string, slot?: AbilitySlot) => {
      const s = el('div', 'slot');
      const icon = el('img', 'slot-icon');
      icon.alt = '';
      icon.src = actionIconUrl(actionId ?? 'block', 64);
      const lbl = el('div', 'lbl', label);
      const cd = el('div', 'cd');
      s.append(icon, el('div', 'key', key), lbl, cd);
      s.title = actionId ? tooltip(actionId, tip) : tip;
      ab.append(s);
      this.slots.push({ root: s, cd, icon, lbl, actionId, slot, tip });
    };
    make(prettyKey(keymap.light[0] ?? ''), 'Leve', cls.lightAction, 'Ataque leve');
    make(prettyKey(keymap.heavy[1] ?? keymap.heavy[0] ?? ''), 'Pesado', cls.heavyAction, 'Ataque pesado — segure para carregar');
    make(prettyKey(keymap.block[0] ?? ''), 'Guarda', undefined, 'Bloquear. Erga no instante do golpe para APARAR.');
    make(prettyKey(keymap.dodge[0] ?? ''), 'Esquiva', 'dodge', 'Esquiva com invulnerabilidade curta');
    const keys: Array<[AbilitySlot, string]> = [
      ['q', 'Q'], ['e', 'E'],
      ['a1', prettyKey(keymap.abil1[0] ?? 'Digit1')], ['a2', prettyKey(keymap.abil2[0] ?? 'Digit2')],
      ['a3', prettyKey(keymap.abil3[0] ?? 'Digit3')], ['a4', prettyKey(keymap.abil4[0] ?? 'Digit4')],
      ['r', prettyKey(keymap.ultimate[0] ?? 'KeyR')],
    ];
    for (const [slot, key] of keys) {
      const def = cls.abilities[slot];
      make(key, def?.label ?? '—', def?.action, def?.description ?? 'Vazio: equipe uma habilidade da árvore (K).', slot);
    }
    this.target.append(this.targetName, this.targetBar.root);
    this.death.append(el('div', 'death-text', 'VOCÊ PERECEU'), el('div', 'death-sub', 'Retornando à última fogueira…'));
    this.root.append(vitals, ab, this.target, this.log, this.death, this.perf, this.toastEl, this.roomTag);
  }

  update(me: EntitySnap, tick: number, target: EntitySnap | null): void {
    this.name.textContent = `${me.name} · ${CLASSES[this.classId].name} · Nv ${me.level}`;
    setBar(this.hp, me.hp, me.maxHp);
    setBar(this.st, me.stamina, me.maxStamina);
    setBar(this.mp, me.mana, me.maxMana);
    if (me.xpNext !== undefined && Number.isFinite(me.xpNext)) {
      setBar(this.xpb, me.xp ?? 0, me.xpNext, false);
      this.xpb.label.textContent = `XP ${me.xp ?? 0}/${me.xpNext}`;
    } else {
      setBar(this.xpb, 1, 1, false);
      this.xpb.label.textContent = 'Nível máximo';
    }
    const pts = me.unspent ?? 0;
    this.points.classList.toggle('hidden', pts <= 0);
    this.points.textContent = `+${pts} ponto${pts > 1 ? 's' : ''} de atributo · C para distribuir`;
    for (const s of this.slots) {
      if (s.slot) {
        // the loadout may have changed (skills equipped from the tree)
        const id = slotAction(this.classId, me.loadout ?? {}, me.talents ?? {}, s.slot) ?? undefined;
        if (id !== s.actionId) {
          s.actionId = id;
          const a = id ? getAction(id) : undefined;
          const kit = Object.values(CLASSES[this.classId].abilities).find((x) => x?.action === id);
          s.lbl.textContent = kit?.label ?? a?.name ?? '—';
          s.icon.src = id ? actionIconUrl(id, 64) : actionIconUrl('block', 64);
          s.icon.style.opacity = id ? '1' : '0.25';
          s.root.title = id ? tooltip(id, kit?.description ?? a?.desc ?? a?.name ?? '') : 'Vazio: equipe uma habilidade da árvore (K).';
        }
      }
      if (!s.actionId) continue;
      const ready = me.cooldowns[s.actionId] ?? 0;
      const def = getAction(s.actionId);
      const left = ready - tick;
      if (left > 0 && def.cooldown) {
        s.cd.style.height = `${(left / def.cooldown) * 100}%`;
        s.cd.textContent = (left / 30).toFixed(1);
      } else {
        s.cd.style.height = '0%';
        s.cd.textContent = '';
      }
      const lacking = (def.stamina && me.stamina <= 0) || (def.mana && me.mana < def.mana) || (def.requires && !(me.statuses ?? []).includes(def.requires));
      s.root.classList.toggle('lacking', !!lacking);
      s.root.classList.toggle('active', me.action === s.actionId);
    }
    if (target && !target.dead) {
      this.target.classList.remove('hidden');
      this.targetName.textContent = target.name;
      setBar(this.targetBar, target.hp, target.maxHp, false);
    } else {
      this.target.classList.add('hidden');
    }
    this.death.classList.toggle('hidden', !me.dead);
    if (performance.now() > this.toastUntil) this.toastEl.classList.add('hidden');
  }

  message(text: string, kind: 'info' | 'good' | 'bad' | 'crit' = 'info'): void {
    const m = el('div', `msg ${kind}`, text);
    this.log.prepend(m);
    while (this.log.childElementCount > 6) this.log.lastElementChild?.remove();
    setTimeout(() => m.classList.add('fade'), 3500);
    setTimeout(() => m.remove(), 4600);
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    this.toastUntil = performance.now() + 2200;
  }

  flash(which: 'stamina' | 'mana'): void {
    const b = which === 'stamina' ? this.st : this.mp;
    b.root.classList.remove('flash');
    void b.root.offsetWidth;
    b.root.classList.add('flash');
  }

  /** Co-op room code shown under the vitals ('' hides it). */
  setRoom(code: string): void {
    this.roomTag.textContent = code ? `SALA ${code}` : '';
    this.roomTag.title = 'Código da sala: seus amigos digitam no lobby online e clicam em Jogar';
    this.roomTag.classList.toggle('hidden', !code);
  }

  setPerf(text: string): void {
    this.perf.textContent = text;
  }
}
