import {
  BAG_SIZE, CLASSES, ITEM_BASES, ITEM_SLOTS, RARITY_INFO, canEquip, describeItem, itemGlyph, itemName, itemSlot, isRune, type EntitySnap, type Item, type ItemSlot,
} from '@etherfall/shared';

/**
 * Inventory (I): equipment on the left (click to unequip), the bag on the right
 * (click to equip, right-click or Shift+click to drop, runes imbue the weapon at a bonfire).
 * Purely a view: every action is a request the server validates.
 */
export type ItemOp = { op: 'equip' | 'drop' | 'imbue'; uid: string } | { op: 'unequip'; slot: ItemSlot };

const SLOT_NAMES: Record<ItemSlot, string> = {
  weapon: 'Arma', offhand: 'Mão secundária', head: 'Cabeça', chest: 'Peito', hands: 'Mãos', legs: 'Pernas', feet: 'Pés', ring: 'Anel', amulet: 'Amuleto',
};

export const rarityCss = (c: readonly [number, number, number]) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

export class InventoryPanel {
  readonly root = h('div', 'inventory panel hidden');
  open = false;
  private key = '';
  private tip = h('div', 'inv-tip hidden');
  private me: EntitySnap | null = null;

  constructor(parent: HTMLElement, private onItem: (op: ItemOp) => void) {
    parent.append(this.root, this.tip);
  }

  toggle(me: EntitySnap | null): void {
    this.open = !this.open;
    this.root.classList.toggle('hidden', !this.open);
    if (!this.open) this.tip.classList.add('hidden');
    this.key = '';
    this.update(me);
  }

  /** Re-render only when the items or the numbers they change differ (called every frame while open). */
  update(me: EntitySnap | null): void {
    if (!this.open || !me) return;
    this.me = me;
    const key = JSON.stringify([me.inventory, me.equipment, me.level, me.action === 'sit', me.maxHp, me.maxStamina, me.maxMana]);
    if (key === this.key) return;
    this.key = key;
    this.tip.classList.add('hidden');
    this.render(me);
  }

  private render(me: EntitySnap): void {
    const eq = me.equipment ?? {};
    const bag = me.inventory ?? [];
    const seated = me.action === 'sit';
    const left = h('div', 'inv-equip');
    left.append(h('div', 'menu-title', 'Equipamento'));
    for (const slot of ITEM_SLOTS) {
      const it = eq[slot];
      const row = h('button', `inv-slot${it ? ' full' : ''}`);
      row.dataset.slot = slot;
      const g = h('span', 'inv-glyph', it ? itemGlyph(it) : '·');
      const t = h('span', 'inv-slot-text');
      const n = h('span', 'inv-item-name', it ? itemName(it) : '— vazio —');
      if (it) g.style.color = n.style.color = rarityCss(RARITY_INFO[it.rarity].color);
      t.append(h('span', 'inv-slot-name', SLOT_NAMES[slot]), n);
      row.append(g, t);
      if (it) {
        row.addEventListener('click', () => this.onItem({ op: 'unequip', slot }));
        this.hover(row, it, 'Clique para desequipar');
      }
      left.append(row);
    }
    left.append(h('div', 'inv-stats', `Vida ${me.maxHp} · Vigor ${me.maxStamina} · Mana ${me.maxMana}`));

    const right = h('div', 'inv-bag');
    right.append(h('div', 'menu-title', `Mochila ${bag.length}/${BAG_SIZE}`));
    const grid = h('div', 'inv-grid');
    for (let i = 0; i < BAG_SIZE; i++) {
      const it = bag[i];
      const cell = h('button', `inv-cell${it ? ` r-${it.rarity}` : ''}`);
      if (it) {
        cell.dataset.uid = it.uid;
        const g = h('span', 'inv-glyph', itemGlyph(it));
        g.style.color = rarityCss(RARITY_INFO[it.rarity].color);
        cell.append(g, h('span', 'inv-lvl', isRune(it) ? '' : String(it.level)));
        const usable = isRune(it) || canEquip(me, it);
        if (!usable) cell.classList.add('unusable');
        cell.addEventListener('click', (ev) => {
          if (ev.shiftKey) this.onItem({ op: 'drop', uid: it.uid });
          else this.onItem({ op: isRune(it) ? 'imbue' : 'equip', uid: it.uid });
        });
        cell.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          this.onItem({ op: 'drop', uid: it.uid });
        });
        const hint = isRune(it)
          ? seated ? 'Clique: imbuir a arma equipada' : 'Sente-se numa fogueira para imbuir a arma'
          : usable ? 'Clique: equipar' : this.whyNot(me, it);
        this.hover(cell, it, `${hint} · Botão direito ou Shift+clique: largar`);
      }
      grid.append(cell);
    }
    right.append(grid, h('p', 'hint', 'Ande sobre os itens no chão para pegá-los · [F] abre baús · runas imbuem a arma numa fogueira.'));
    this.root.replaceChildren(left, right);
  }

  private whyNot(me: EntitySnap, it: Item): string {
    const b = ITEM_BASES[it.base];
    if (b?.classes && me.classId && !b.classes.includes(me.classId)) return `Só para ${b.classes.map((c) => CLASSES[c].name).join(' / ')}`;
    return `Requer nível ${it.level - 5}`;
  }

  private hover(el: HTMLElement, it: Item, hint: string): void {
    el.addEventListener('pointerenter', (ev) => this.showTip(ev, it, hint));
    el.addEventListener('pointermove', (ev) => this.placeTip(ev));
    el.addEventListener('pointerleave', () => this.tip.classList.add('hidden'));
  }

  private showTip(ev: PointerEvent, it: Item, hint: string): void {
    const info = RARITY_INFO[it.rarity];
    const slot = itemSlot(it);
    const name = h('div', 'inv-tip-name', itemName(it));
    name.style.color = rarityCss(info.color);
    this.tip.replaceChildren(name, h('div', 'hint', `${info.name}${slot ? ` · ${SLOT_NAMES[slot]}` : ' · Runa'} · nível ${it.level}`));
    for (const line of describeItem(it)) this.tip.append(h('div', line.startsWith('“') ? 'inv-lore' : 'inv-line', line));
    const cur = slot ? this.me?.equipment?.[slot] : undefined;
    if (cur && cur.uid !== it.uid) this.tip.append(h('div', 'hint', `Equipado agora: ${itemName(cur)}`));
    this.tip.append(h('div', 'inv-hint', hint));
    this.tip.classList.remove('hidden');
    this.placeTip(ev);
  }

  private placeTip(ev: PointerEvent): void {
    const x = Math.min(window.innerWidth - this.tip.offsetWidth - 8, ev.clientX + 16);
    this.tip.style.left = `${Math.max(8, x)}px`;
    this.tip.style.top = `${Math.max(8, Math.min(window.innerHeight - this.tip.offsetHeight - 8, ev.clientY + 12))}px`;
  }
}
