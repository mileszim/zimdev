// Synthesized mechanical foley — no audio assets, just oscillators and
// filtered noise. Every sound is a tiny percussive gesture.
export class Foley {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  /** Create/resume the context. Must be called from a user gesture. */
  ensure() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }

  /** Filtered noise burst — the basis of every click and clack. */
  private burst(freq: number, q: number, dur: number, vol: number, delay = 0) {
    if (!this.ctx || !this.noise || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(g).connect(this.ctx.destination);
    src.start(t, Math.random() * 0.25, dur + 0.05);
  }

  /** Pitched thump — mirror slap, dial seat. */
  private thump(f0: number, f1: number, dur: number, vol: number, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Detent click — dials and rings. */
  click() {
    this.burst(2600, 2, 0.018, 0.22);
    this.thump(420, 180, 0.025, 0.08);
  }

  /** Shutter curtain + mirror slap. */
  shutterOpen() {
    this.thump(150, 52, 0.09, 0.55);
    this.burst(1200, 1.4, 0.045, 0.4);
    this.burst(3200, 3, 0.02, 0.18, 0.012);
  }

  /** Second curtain on slow exposures. */
  shutterClose() {
    this.thump(120, 48, 0.07, 0.4);
    this.burst(900, 1.6, 0.04, 0.3);
  }

  /** Film advance — a run of ratchet teeth. */
  ratchet() {
    for (let i = 0; i < 5; i++) {
      this.burst(1900 + i * 120, 2.5, 0.016, 0.16, i * 0.052);
    }
    this.thump(300, 140, 0.04, 0.12, 0.28);
  }

  /** Rewind sprocket tick. */
  tick() {
    this.burst(2300, 3, 0.012, 0.12);
  }

  /** Refused action — soft dud press. */
  dud() {
    this.burst(520, 1.2, 0.035, 0.18);
  }
}
