export class SeededRandom {
  constructor(seed, state) {
    this.seed = String(seed);
    let h = 2166136261;
    for (const c of this.seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    this.state = state ?? h >>> 0;
  }
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) {
    if (!Number.isInteger(n) || n < 1) throw Error("Invalid RNG bound");
    return Math.floor(this.next() * n);
  }
  pick(a) {
    return a[this.int(a.length)];
  }
  shuffle(a) {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  }
  weighted(items, weight = (x) => x.weight) {
    let n = this.next() * items.reduce((s, x) => s + weight(x), 0);
    for (const x of items) {
      n -= weight(x);
      if (n < 0) return x;
    }
    return items.at(-1);
  }
}
