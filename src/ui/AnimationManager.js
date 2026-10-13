export class AnimationManager {
  constructor(settings) {
    this.settings = settings;
    this.running = new Set();
    this.generation = 0;
  }
  duration(ms) {
    return this.settings.speed === "minimal" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : ms / (this.settings.speed === "fast" ? 2 : 1);
  }
  async animate(el, frames, ms = 300, options = {}) {
    if (!el || !this.duration(ms)) return;
    const a = el.animate(frames, {
      duration: this.duration(ms),
      easing: "cubic-bezier(.2,.8,.2,1)",
      ...options,
    });
    this.running.add(a);
    try {
      await a.finished;
    } catch {
    } finally {
      this.running.delete(a);
    }
  }
  async delay(ms) {
    const el = document.createElement("i");
    await this.animate(el, [{ opacity: 0 }, { opacity: 1 }], ms);
  }
  cancel() {
    this.generation++;
    for (const a of this.running) a.cancel();
    this.running.clear();
    document
      .querySelectorAll(".flying-card,.score-overlay,.path-overlay")
      .forEach((e) => e.remove());
  }
  capture() {
    return new Map(
      [...document.querySelectorAll("[data-tile-id]")].map((el) => [
        el.dataset.tileId,
        el.getBoundingClientRect(),
      ]),
    );
  }
  async move(previous) {
    const jobs = [];
    for (const el of document.querySelectorAll("[data-tile-id]")) {
      const p = previous.get(el.dataset.tileId);
      if (!p) continue;
      const r = el.getBoundingClientRect();
      if (p.x !== r.x || p.y !== r.y)
        jobs.push(
          this.animate(
            el,
            [
              { transform: `translate(${p.x - r.x}px,${p.y - r.y}px)` },
              { transform: "translate(0,0)" },
            ],
            280,
          ),
        );
    }
    await Promise.all(jobs);
  }
}
