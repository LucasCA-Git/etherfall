/** Uniform-grid broadphase for circle-shaped items (static props, entities). */
export interface HashItem {
  x: number;
  y: number;
  r: number;
}

export class SpatialHash<T extends HashItem> {
  private cells = new Map<number, T[]>();
  constructor(private readonly cellSize: number) {}

  private key(cx: number, cy: number): number {
    // 16-bit packing is enough for worlds up to 65k cells per axis.
    return ((cx + 32768) << 16) | ((cy + 32768) & 0xffff);
  }

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const cs = this.cellSize;
    const x0 = Math.floor((item.x - item.r) / cs);
    const x1 = Math.floor((item.x + item.r) / cs);
    const y0 = Math.floor((item.y - item.r) / cs);
    const y1 = Math.floor((item.y + item.r) / cs);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = this.key(cx, cy);
        let arr = this.cells.get(k);
        if (!arr) this.cells.set(k, (arr = []));
        arr.push(item);
      }
    }
  }

  /** Items whose circle overlaps the query circle. Order is deterministic (insertion order per cell). */
  query(x: number, y: number, r: number, out: T[] = []): T[] {
    const cs = this.cellSize;
    const x0 = Math.floor((x - r) / cs);
    const x1 = Math.floor((x + r) / cs);
    const y0 = Math.floor((y - r) / cs);
    const y1 = Math.floor((y + r) / cs);
    const multiCell = x0 !== x1 || y0 !== y1;
    const seen = multiCell ? new Set<T>() : null;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (const it of arr) {
          if (seen) {
            if (seen.has(it)) continue;
            seen.add(it);
          }
          const rr = r + it.r;
          if ((it.x - x) ** 2 + (it.y - y) ** 2 <= rr * rr) out.push(it);
        }
      }
    }
    return out;
  }
}
