import { SUBCLASSES, SUBCLASS_LEVEL, TALENT_TREES, type ClassId, type EntitySnap } from '@etherfall/shared';

const h = (tag: string, cls?: string, text?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * Talent tree (K): three branches per class, one point per level, plus the subclass choice
 * at SUBCLASS_LEVEL. Purely a view: every click is a request the server validates.
 */
export class TalentPanel {
  readonly root = h('div', 'talents panel hidden');
  open = false;
  private key = '';

  constructor(
    parent: HTMLElement,
    private classId: ClassId,
    private onTalent: (node: string) => void,
    private onSubclass: (id: string) => void,
    private onRespec: () => void,
  ) {
    parent.append(this.root);
  }

  toggle(me: EntitySnap | null): void {
    this.open = !this.open;
    this.root.classList.toggle('hidden', !this.open);
    this.key = '';
    this.update(me);
  }

  /** Re-renders only when ranks, points, level or subclass change (called every frame while open). */
  update(me: EntitySnap | null): void {
    if (!this.open || !me) return;
    const ranks = me.talents ?? {};
    const pts = me.talentPoints ?? 0;
    const key = JSON.stringify([me.level, pts, ranks, me.subclass ?? null, me.action === 'sit']);
    if (key === this.key) return;
    this.key = key;
    const tree = TALENT_TREES[this.classId];

    const head = h('div', 'talent-head');
    head.append(
      h('div', 'menu-title', 'Árvore de Talentos'),
      h('div', pts > 0 ? 'points' : 'hint', pts > 0 ? `${pts} ponto(s) de talento` : 'Sem pontos: ganhe 1 a cada nível.'),
    );

    // subclass
    const sub = h('div', 'subclass');
    const chosen = SUBCLASSES[this.classId].find((s) => s.id === me.subclass);
    if (chosen) {
      sub.append(h('div', 'sub-title', `Subclasse: ${chosen.name}`), h('p', 'hint', chosen.description));
    } else {
      sub.append(h('div', 'sub-title', me.level >= SUBCLASS_LEVEL ? 'Escolha sua subclasse (definitiva)' : `Subclasse — disponível no nível ${SUBCLASS_LEVEL}`));
      const cards = h('div', 'sub-cards');
      for (const s of SUBCLASSES[this.classId]) {
        const card = h('div', 'sub-card');
        const b = document.createElement('button');
        b.className = 'btn primary';
        b.id = `subclass-${s.id}`;
        b.textContent = 'Escolher';
        b.disabled = me.level < SUBCLASS_LEVEL;
        b.addEventListener('click', () => this.onSubclass(s.id));
        card.append(h('b', '', s.name), h('p', 'hint', s.description), b);
        cards.append(card);
      }
      sub.append(cards);
    }

    // branches
    const cols = h('div', 'branches');
    for (const br of tree.branches) {
      const col = h('div', 'branch');
      const spent = br.nodes.reduce((a, n) => a + (ranks[n.id] ?? 0), 0);
      col.append(h('div', 'branch-name', `${br.name} · ${spent}`), h('div', 'hint', br.theme));
      for (const n of br.nodes) {
        const r = ranks[n.id] ?? 0;
        const locked = !!n.requires && (ranks[n.requires] ?? 0) <= 0;
        const row = h('div', `talent${r > 0 ? ' owned' : ''}${locked ? ' locked' : ''}${r >= n.maxRank ? ' maxed' : ''}`);
        const txt = h('div', 'talent-text');
        txt.append(h('b', '', n.name), h('span', 'rank', ` ${r}/${n.maxRank}`), h('div', 'desc', n.description));
        const plus = document.createElement('button');
        plus.className = 'btn';
        plus.id = `talent-${n.id}`;
        plus.textContent = '+';
        plus.disabled = pts <= 0 || locked || r >= n.maxRank;
        plus.title = locked ? 'Requer o talento anterior do ramo' : `Investir em ${n.name}`;
        plus.addEventListener('click', () => this.onTalent(n.id));
        row.append(txt, plus);
        col.append(row);
      }
      cols.append(col);
    }
    const respec = document.createElement('button');
    respec.className = 'btn';
    respec.id = 'respec';
    respec.textContent = 'Redistribuir pontos';
    respec.title = 'Devolve todos os pontos de atributo e de talento. Só funciona sentado numa fogueira. A subclasse não muda.';
    respec.disabled = me.action !== 'sit';
    respec.addEventListener('click', () => this.onRespec());
    const foot = h('div', 'talent-foot');
    foot.append(h('p', 'hint', me.action === 'sit' ? 'Sentado na fogueira: você pode redistribuir todos os pontos.' : 'K fecha · sente-se numa fogueira (F) para redistribuir pontos'), respec);
    this.root.replaceChildren(head, sub, cols, foot);
  }
}
