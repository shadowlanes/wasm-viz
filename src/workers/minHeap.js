// Binary min-heap with lex ordering on (cost, gTie).
// For Dijkstra: gTie is unused (always 0). For A*: cost = f, gTie = -g
// so equal-f nodes prefer higher g (closer to goal).
export class MinHeap {
  constructor() {
    this.cost = [];
    this.gTie = [];
    this.idx = [];
  }
  size() { return this.cost.length; }

  push(cost, idx, gTie = 0) {
    this.cost.push(cost);
    this.gTie.push(gTie);
    this.idx.push(idx);
    this._up(this.cost.length - 1);
  }

  pop() {
    const cost = this.cost[0];
    const gTie = this.gTie[0];
    const idx = this.idx[0];
    const lastC = this.cost.pop();
    const lastG = this.gTie.pop();
    const lastI = this.idx.pop();
    if (this.cost.length > 0) {
      this.cost[0] = lastC;
      this.gTie[0] = lastG;
      this.idx[0] = lastI;
      this._down(0);
    }
    return { cost, gTie, idx };
  }

  _less(a, b) {
    const c = this.cost;
    if (c[a] !== c[b]) return c[a] < c[b];
    return this.gTie[a] < this.gTie[b];
  }

  _swap(a, b) {
    const c = this.cost, g = this.gTie, x = this.idx;
    [c[a], c[b]] = [c[b], c[a]];
    [g[a], g[b]] = [g[b], g[a]];
    [x[a], x[b]] = [x[b], x[a]];
  }

  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this._less(i, p)) break;
      this._swap(p, i);
      i = p;
    }
  }

  _down(i) {
    const n = this.cost.length;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this._less(l, m)) m = l;
      if (r < n && this._less(r, m)) m = r;
      if (m === i) break;
      this._swap(m, i);
      i = m;
    }
  }
}
