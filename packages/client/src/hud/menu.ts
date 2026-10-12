import { CLASSES, MAX_LEVEL, deriveStats, xpToNext, type AttrKey, type ClassId, type EntitySnap } from '@etherfall/shared';
import { ACTION_LABELS, DEFAULT_KEYMAP, prettyKey, saveKeymap, type InputAction, type KeyMap } from '../input/keymap';
import type { InputManager } from '../input/input';
import { PRESETS, SETTING_RANGES, saveSettings, type PresetId, type RenderSettings } from '../render/settings';

const h = (tag: string, cls?: string, text?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export interface MenuHooks {
  settings: RenderSettings;
  onSettings: (s: RenderSettings) => void;
  input: InputManager;
  onVolume: (v: number) => void;
  volume: number;
  onMusic: (v: number) => void;
  music: number;
  dayOffset: number;
  onDayOffset: (v: number) => void;
}

/** Esc menu: graphics presets and every render knob, key remapping, audio and world time. */
export class Menu {
  readonly root = h('div', 'menu hidden');
  private body = h('div', 'menu-body');
  private tabs = h('div', 'menu-tabs');
  open = false;

  constructor(
    parent: HTMLElement,
    private hooks: MenuHooks,
  ) {
    const box = h('div', 'menu-box panel');
    const title = h('div', 'menu-title', 'ETHERFALL — Menu');
    const close = h('button', 'btn close', 'Fechar (Esc)');
    close.addEventListener('click', () => this.toggle(false));
    box.append(title, this.tabs, this.body, close);
    this.root.append(box);
    parent.append(this.root);
    const tabs: Array<[string, () => void]> = [
      ['Gráficos', () => this.graphics()],
      ['Controles', () => this.controls()],
      ['Áudio & Mundo', () => this.misc()],
      ['Ajuda', () => this.help()],
    ];
    for (const [label, fn] of tabs) {
      const b = h('button', 'tab', label);
      b.addEventListener('click', () => {
        this.tabs.querySelectorAll('.tab').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        fn();
      });
      this.tabs.append(b);
    }
    (this.tabs.firstElementChild as HTMLElement).classList.add('on');
    this.graphics();
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.root.classList.toggle('hidden', !this.open);
    this.hooks.input.enabled = !this.open;
  }

  private graphics(): void {
    this.body.replaceChildren();
    const s = this.hooks.settings;
    const row = h('div', 'row');
    row.append(h('label', '', 'Preset visual'));
    const sel = document.createElement('select');
    sel.append(new Option('— personalizado —', ''));
    for (const [id, p] of Object.entries(PRESETS)) sel.append(new Option(p.label, id));
    sel.addEventListener('change', () => {
      const p = PRESETS[sel.value as PresetId];
      if (!p) return;
      Object.assign(s, p.s);
      this.apply();
      this.graphics();
    });
    row.append(sel);
    this.body.append(row);
    for (const k of Object.keys(SETTING_RANGES) as (keyof RenderSettings)[]) {
      const r = SETTING_RANGES[k];
      const line = h('div', 'row');
      const val = h('span', 'val', String(s[k]));
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.min = String(r.min);
      inp.max = String(r.max);
      inp.step = String(r.step);
      inp.value = String(s[k]);
      inp.addEventListener('input', () => {
        s[k] = Number(inp.value);
        val.textContent = inp.value;
        sel.value = '';
        this.apply();
      });
      line.append(h('label', '', r.label), inp, val);
      this.body.append(line);
    }
  }

  private apply(): void {
    saveSettings(this.hooks.settings);
    this.hooks.onSettings(this.hooks.settings);
  }

  private controls(): void {
    this.body.replaceChildren();
    const km: KeyMap = this.hooks.input.keymap;
    this.body.append(h('div', 'hint', 'Clique em uma tecla e pressione a nova tecla ou botão do mouse. Controle (gamepad padrão) também é suportado.'));
    for (const a of Object.keys(ACTION_LABELS) as InputAction[]) {
      const line = h('div', 'row');
      const btn = h('button', 'btn key', km[a].map(prettyKey).join(' / ') || '—');
      btn.addEventListener('click', () => {
        btn.textContent = '…pressione…';
        this.hooks.input.captureNext = (code) => {
          if (code !== 'Escape') {
            km[a] = [code];
            saveKeymap(km);
          }
          this.controls();
        };
      });
      line.append(h('label', '', ACTION_LABELS[a]), btn);
      this.body.append(line);
    }
    const reset = h('button', 'btn', 'Restaurar padrão');
    reset.addEventListener('click', () => {
      Object.assign(km, structuredClone(DEFAULT_KEYMAP));
      saveKeymap(km);
      this.controls();
    });
    this.body.append(reset);
  }

  private misc(): void {
    this.body.replaceChildren();
    const vol = document.createElement('input');
    vol.type = 'range';
    vol.min = '0';
    vol.max = '1';
    vol.step = '0.05';
    vol.value = String(this.hooks.volume);
    vol.addEventListener('input', () => {
      this.hooks.volume = Number(vol.value);
      this.hooks.onVolume(this.hooks.volume);
    });
    const r1 = h('div', 'row');
    r1.append(h('label', '', 'Volume geral'), vol);
    const mus = document.createElement('input');
    mus.type = 'range';
    mus.min = '0';
    mus.max = '1';
    mus.step = '0.05';
    mus.value = String(this.hooks.music);
    mus.id = 'music-volume';
    mus.addEventListener('input', () => {
      this.hooks.music = Number(mus.value);
      this.hooks.onMusic(this.hooks.music);
    });
    const rm = h('div', 'row');
    rm.append(h('label', '', 'Música (perto das fogueiras)'), mus);
    const day = document.createElement('input');
    day.type = 'range';
    day.min = '0';
    day.max = '1';
    day.step = '0.01';
    day.value = String(this.hooks.dayOffset);
    day.addEventListener('input', () => {
      this.hooks.dayOffset = Number(day.value);
      this.hooks.onDayOffset(this.hooks.dayOffset);
    });
    const r2 = h('div', 'row');
    r2.append(h('label', '', 'Deslocar hora do dia (ferramenta de dev, só local)'), day);
    this.body.append(r1, rm, r2);
  }

  private help(): void {
    this.body.replaceChildren();
    const lines = [
      'WASD move · Mouse mira · Botão esq. ataque leve · Botão do meio / V ataque pesado (segure para carregar)',
      'Botão dir. bloqueia — erguer a guarda no instante do golpe APARA e deixa o inimigo vulnerável a um contra-ataque crítico',
      'Espaço esquiva (i-frames) · Shift corre (gasta stamina) · Q/E habilidades da classe · F descansa na fogueira',
      'C ficha do personagem · M mapa · Roda do mouse zoom · F3 depuração · Esc menu',
      'Inimigos anunciam golpes: círculos laranja = golpe normal, vermelho pulsante = golpe perigoso.',
      'Atacar pelas costas causa dano extra. Stamina zerada impede ações — gerencie o ritmo.',
    ];
    for (const l of lines) this.body.append(h('p', '', l));
  }
}

/** Character sheet (C): live attributes from the server, with point allocation sent as protocol messages. */
export class CharacterSheet {
  readonly root = h('div', 'sheet panel hidden');
  open = false;
  private key = '';

  constructor(
    parent: HTMLElement,
    private classId: ClassId,
    private onAllocate: (attr: AttrKey) => void,
  ) {
    parent.append(this.root);
  }

  toggle(me: EntitySnap | null): void {
    this.open = !this.open;
    this.root.classList.toggle('hidden', !this.open);
    this.key = '';
    this.update(me);
  }

  /** Re-render only when the underlying numbers change (called every frame while open). */
  update(me: EntitySnap | null): void {
    if (!this.open || !me) return;
    const key = JSON.stringify([me.level, me.xp, me.unspent, me.attrs, me.maxHp, me.maxStamina, me.maxMana]);
    if (key === this.key) return;
    this.key = key;
    const cls = CLASSES[this.classId];
    const a = (me.attrs ?? cls.baseAttributes) as Record<AttrKey, number>;
    const d = deriveStats(a, me.level, cls.poiseBonus);
    const pts = me.unspent ?? 0;
    this.root.replaceChildren(
      h('div', 'menu-title', `${me.name} — ${cls.name} · Nível ${me.level}`),
      h('p', 'hint', cls.fantasy),
      h('p', '', `Arma: ${cls.weaponName}`),
      h('p', '', me.level >= MAX_LEVEL ? 'Nível máximo alcançado.' : `XP ${me.xp ?? 0} / ${xpToNext(me.level)} para o nível ${me.level + 1}`),
      h('p', pts > 0 ? 'points' : 'hint', pts > 0 ? `${pts} ponto(s) para distribuir` : 'Sem pontos livres: suba de nível para ganhar 3 pontos.'),
    );
    const names: Record<AttrKey, [string, string]> = {
      str: ['Força', 'dano e eficiência de armas pesadas'],
      dex: ['Destreza', 'armas ágeis e precisão'],
      vit: ['Vitalidade', 'vida máxima e equilíbrio'],
      end: ['Resistência', 'stamina e defesa'],
      int: ['Inteligência', 'dano e eficiência arcana'],
      wil: ['Vontade', 'mana e resistência mágica'],
      lck: ['Sorte', 'descoberta de recursos (Etapa 4)'],
    };
    const list = h('div', 'attrs');
    for (const k of Object.keys(names) as AttrKey[]) {
      const row = h('div', 'attr-row');
      const label = h('span', '', names[k][0]);
      label.title = names[k][1];
      const plus = document.createElement('button');
      plus.className = 'btn';
      plus.id = `alloc-${k}`;
      plus.textContent = '+';
      plus.disabled = pts <= 0;
      plus.title = `Aumentar ${names[k][0]}`;
      plus.addEventListener('click', () => this.onAllocate(k));
      row.append(label, h('b', '', String(a[k])), plus);
      list.append(row);
    }
    const tbl = h('div', 'grid2');
    tbl.append(h('span', '', 'Vida máx.'), h('b', '', String(d.maxHp)));
    tbl.append(h('span', '', 'Stamina máx.'), h('b', '', String(d.maxStamina)));
    tbl.append(h('span', '', 'Mana máx.'), h('b', '', String(d.maxMana)));
    tbl.append(h('span', '', 'Equilíbrio (poise)'), h('b', '', String(d.maxPoise)));
    tbl.append(h('span', '', 'Absorção ao bloquear'), h('b', '', `${Math.round(cls.guardAbsorb * 100)}%`));
    this.root.append(list, tbl, h('p', 'hint', 'Ganhos acima de 20 e 40 pontos rendem menos (limite suave). Pressione C para fechar.'));
  }
}
