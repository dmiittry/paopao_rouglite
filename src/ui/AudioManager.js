const TONES = {
  select: [520],
  pair: [440, 660, 880],
  banish: [220, 130],
  move: [300, 360],
  shuffle: [240, 320, 400],
  hint: [740, 880],
  collect: [550, 720],
  score: [330, 440, 660],
  chips: [780],
  mult: [880, 1100],
  joker: [620, 930],
  shop: [330, 440, 550],
  purchase: [660, 880],
  chest: [392, 494, 587, 784],
  boss: [160, 190, 240],
  win: [523, 659, 784, 1047],
  lose: [330, 277, 220],
  ritual: [440, 880, 660],
};
export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.musicNodes = [];
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.stopMusic();
        this.ctx?.suspend();
      } else if (this.ctx) {
        this.ctx.resume();
        this.updateMusic();
      }
    });
    window.addEventListener("blur", () => {
      this.stopMusic();
      this.ctx?.suspend();
    });
    window.addEventListener("focus", () => {
      if (this.ctx) {
        this.ctx.resume();
        this.updateMusic();
      }
    });
  }
  unlock() {
    try {
      this.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
      this.updateMusic();
    } catch {}
  }
  play(name) {
    if (!this.settings.sound || document.hidden || !this.ctx) return;
    const seq = TONES[name] || TONES.select;
    for (let i = 0; i < seq.length; i++) {
      const osc = this.ctx.createOscillator(),
        gain = this.ctx.createGain(),
        t = this.ctx.currentTime + i * 0.055;
      osc.type = name === "banish" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(seq[i], t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(this.settings.volume * 0.11, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.21);
    }
  }
  updateMusic() {
    if (!this.ctx) return;
    if (!this.settings.music || document.hidden || !document.hasFocus()) {
      this.stopMusic();
      return;
    }
    if (this.musicNodes.length) return;
    for (const f of [130.81, 196, 261.63]) {
      const o = this.ctx.createOscillator(),
        g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.value = 0.008 * this.settings.volume;
      o.connect(g).connect(this.ctx.destination);
      o.start();
      this.musicNodes.push(o);
    }
  }
  stopMusic() {
    for (const o of this.musicNodes) o.stop();
    this.musicNodes = [];
  }
}
