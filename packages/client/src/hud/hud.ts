import { CLASSES, getAction, type ClassId, type EntitySnap } from '@etherfall/shared';
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
  actionId?: string;
}

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
    const defs: Array<[string, string, string | undefined, string]> = [
      [prettyKey(keymap.light[0] ?? ''), 'Leve', cls.lightAction, 'Ataque leve'],
      [prettyKey(keymap.heavy[1] ?? keymap.heavy[0] ?? ''), 'Pesado', cls.heavyAction, 'Ataque pesado — segure para carregar'],
      [prettyKey(keymap.block[0] ?? ''), 'Guarda', undefined, 'Bloquear. Erga no instante do golpe para APARAR.'],
      [prettyKey(keymap.dodge[0] ?? ''), 'Esquiva', 'dodge', 'Esquiva com invulnerabilidade curta'],
      ['Q', cls.abilities.q.label, cls.abilities.q.action, cls.abilities.q.description],
      ['E', cls.abilities.e.label, cls.abilities.e.action, cls.abilities.e.description],
    ];
    for (const [key, label, actionId, tip] of defs) {
      const s = el('div', 'slot');
      const cost = actionId ? getAction(actionId) : undefined;
      s.title = `${tip}${cost?.stamina ? ` · ${cost.stamina} stamina` : ''}${cost?.mana ? ` · ${cost.mana} mana` : ''}${cost?.cooldown ? ` · recarga ${(cost.cooldown / 30).toFixed(1)}s` : ''}`;
      const cd = el('div', 'cd');
      s.append(el('div', 'key', key), el('div', 'lbl', label), cd);
      ab.append(s);
      this.slots.push({ root: s, cd, actionId });
    }
    const extra: Array<[string, { action: string; label: string; description: string }]> = [
      [prettyKey(keymap.abil1[0] ?? 'Digit1'), cls.abilities.a1],
      [prettyKey(keymap.abil2[0] ?? 'Digit2'), cls.abilities.a2],
      [prettyKey(keymap.abil3[0] ?? 'Digit3'), cls.abilities.a3],
      [prettyKey(keymap.abil4[0] ?? 'Digit4'), cls.abilities.a4],
    ];
    if (cls.abilities.r) extra.push([prettyKey(keymap.ultimate[0] ?? 'KeyR'), cls.abilities.r]);
    for (const [key, ab2] of extra) {
      const s = el('div', 'slot');
      const cost = getAction(ab2.action);
      s.title = `${ab2.description}${cost.stamina ? ` · ${cost.stamina} stamina` : ''}${cost.mana ? ` · ${cost.mana} mana` : ''}${cost.cooldown ? ` · recarga ${(cost.cooldown / 30).toFixed(1)}s` : ''}`;
      const cd = el('div', 'cd');
      s.append(el('div', 'key', key), el('div', 'lbl', ab2.label), cd);
      ab.append(s);
      this.slots.push({ root: s, cd, actionId: ab2.action });
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
