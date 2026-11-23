// Synthesized WebAudio blips. No audio files.
export class AudioFX {
  constructor() { this.ctx = null; this.master = null; this.muted = false; }

  unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /**
   * @param {number} freq start frequency (Hz)
   * @param {number} dur seconds
   * @param {{type?: OscillatorType, to?: ?number, vol?: number, delay?: number}} [opts]
   */
  tone(freq, dur, { type = 'square', to = null, vol = 1, delay = 0 } = {}) {
    const c = this.ctx;
    if (!c || this.muted || c.state !== 'running') return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  handle(events) {
    for (const e of events) {
      switch (e.type) {
        case 'countdown': this.tone(440, 0.12, { vol: 0.6 }); break;
        case 'go': this.tone(880, 0.25, { vol: 0.8 }); this.tone(1320, 0.25, { vol: 0.4, delay: 0.05 }); break;
        case 'hit':
          if (e.head) { this.tone(1200, 0.09, { to: 2400, vol: 0.9 }); this.tone(2400, 0.12, { type: 'triangle', vol: 0.5, delay: 0.05 }); }
          else this.tone(700, 0.12, { to: 1100, vol: 0.8 });
          break;
        case 'miss': this.tone(160, 0.14, { type: 'sawtooth', to: 90, vol: 0.5 }); break;
        case 'fake': this.tone(220, 0.35, { type: 'sawtooth', to: 110, vol: 0.8 }); this.tone(233, 0.35, { type: 'square', vol: 0.3 }); break;
        case 'dodge': this.tone(660, 0.08, { type: 'triangle', vol: 0.5 }); this.tone(990, 0.1, { type: 'triangle', vol: 0.4, delay: 0.07 }); break;
        case 'cue': this.tone(1800, 0.03, { type: 'sine', vol: 0.12 }); break;
        case 'end': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.6, delay: i * 0.1 })); break;
        case 'tick': this.tone(1500, 0.03, { type: 'square', vol: 0.25 }); break;
        case 'submit': this.tone(784, 0.12, { type: 'triangle', vol: 0.6 }); this.tone(1175, 0.2, { type: 'triangle', vol: 0.6, delay: 0.1 }); break;
        default: break;
      }
    }
  }
}
