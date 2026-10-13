export class ParticleManager {
  constructor(settings) {
    this.canvas = document.querySelector("#particles");
    this.ctx = this.canvas.getContext("2d");
    this.settings = settings;
    this.items = [];
    this.active = false;
    this.resize = () => {
      this.canvas.width = innerWidth;
      this.canvas.height = innerHeight;
    };
    this.resize();
    window.addEventListener("resize", this.resize);
  }
  burst(x, y, color = "#e7c37e", amount = 24) {
    if (
      this.settings.speed === "minimal" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2,
        speed = 1 + Math.random() * 4;
      this.items.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        size: 1 + Math.random() * 3,
        color,
      });
    }
    if (!this.active) {
      this.active = true;
      requestAnimationFrame(() => this.frame());
    }
  }
  frame() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.items = this.items.filter((p) => p.life > 0);
    for (const p of this.items) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.035;
      p.life -= 0.022;
      this.ctx.globalAlpha = Math.max(0, p.life);
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    if (this.items.length) requestAnimationFrame(() => this.frame());
    else this.active = false;
  }
}
