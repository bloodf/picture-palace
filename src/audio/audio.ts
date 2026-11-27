/** Everything you hear is synthesised: no samples to load. A small lobby trio, a crowd, the booth, and the till. */
export class AudioEngine {
  private ctx: AudioContext | null = null; private master!: GainNode; private music!: GainNode; private amb!: GainNode; private sfx!: GainNode; private crowd!: GainNode; private rumble!: GainNode; private rain!: GainNode; private noise!: AudioBuffer; private timer = 0; private step = 0; private style = 'jazz'; private nextT = 0; private lpf!: BiquadFilterNode;
  vol = { master: 0.7, music: 0.5, sfx: 0.8 };
  enabled = true;
  start(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const A = window.AudioContext; if (!A) return;
    const c = (this.ctx = new A());
    this.master = c.createGain(); const comp = c.createDynamicsCompressor(); this.master.connect(comp); comp.connect(c.destination);
    this.music = c.createGain(); this.lpf = c.createBiquadFilter(); this.lpf.type = 'lowpass'; this.lpf.frequency.value = 5200; this.music.connect(this.lpf); this.lpf.connect(this.master);
    this.amb = c.createGain(); this.amb.connect(this.master); this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.noise = c.createBuffer(1, c.sampleRate * 3, c.sampleRate); const d = this.noise.getChannelData(0); let b0 = 0, b1 = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.985 * b0 + w * 0.1; b1 = 0.9 * b1 + w * 0.2; d[i] = (b0 + b1 * 0.5) * 0.6; }
    const bed = (f: number, q: number, type: BiquadFilterType) => { const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.amb); s.start(); return g; };
    this.crowd = bed(480, 0.7, 'bandpass'); this.rumble = bed(70, 0.9, 'lowpass'); this.rain = bed(3800, 0.4, 'highpass');
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.37; lg.gain.value = 0.012; lfo.connect(lg); lg.connect(this.crowd.gain); lfo.start();
    this.apply(); this.nextT = c.currentTime + 0.1; this.timer = window.setInterval(() => this.schedule(), 120);
  }
  apply(): void { if (!this.ctx) return; const t = this.ctx.currentTime; this.master.gain.setTargetAtTime(this.enabled ? this.vol.master : 0, t, 0.05); this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05); }
  /** Called a few times a second with what is going on around the listener. */
  mood(o: { crowd: number; film: number; style: string; volume: number; inAud: boolean; rain: boolean; power: boolean; outside: boolean }): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime; this.style = o.style;
    this.crowd.gain.setTargetAtTime(Math.min(0.16, o.crowd * 0.0022) * (o.inAud ? 0.25 : 1), t, 0.6); this.rumble.gain.setTargetAtTime(o.film * 0.5, t, 0.4); this.rain.gain.setTargetAtTime(o.rain ? (o.outside ? 0.05 : 0.012) : 0, t, 0.8);
    this.music.gain.setTargetAtTime(o.power && o.style !== 'off' ? (o.volume / 100) * this.vol.music * (o.inAud ? 0.06 : o.outside ? 0.3 : 0.8) : 0, t, 0.5); this.lpf.frequency.setTargetAtTime(o.inAud || o.outside ? 700 : 5200, t, 0.4);
  }
  private env(g: GainNode, t: number, a: number, d: number, v: number): void { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  private tone(f: number, t: number, d: number, v: number, type: OscillatorType, out: AudioNode, cut = 0, a = 0.008): void { const c = this.ctx!, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; this.env(g, t, a, d, v); if (cut) { const l = c.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = cut; o.connect(l); l.connect(g); } else o.connect(g); g.connect(out); o.start(t); o.stop(t + a + d + 0.05); }
  private hiss(t: number, d: number, v: number, f: number, out: AudioNode, type: BiquadFilterType = 'highpass', q = 0.7): void { const c = this.ctx!, s = c.createBufferSource(); s.buffer = this.noise; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); this.env(g, t, 0.004, d, v); s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * 2); s.stop(t + d + 0.1); }
  // ---- a generative lobby trio
  private schedule(): void {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const S: Record<string, { bpm: number; prog: number[][]; root: number }> = { jazz: { bpm: 116, root: 36, prog: [[0, 3, 7, 10], [5, 9, 12, 15], [10, 14, 17, 20], [3, 7, 10, 14], [8, 12, 15, 18], [2, 5, 8, 12], [7, 11, 14, 17], [0, 3, 7, 10]] }, scores: { bpm: 78, root: 33, prog: [[0, 7, 12, 16], [5, 9, 12, 17], [9, 12, 16, 21], [7, 11, 14, 19]] }, pop: { bpm: 112, root: 36, prog: [[0, 4, 7, 12], [7, 11, 14, 19], [9, 12, 16, 21], [5, 9, 12, 17]] }, synth: { bpm: 96, root: 33, prog: [[0, 3, 7, 12], [8, 12, 15, 20], [3, 7, 10, 15], [10, 14, 17, 22]] } };
    const st = S[this.style] ?? S.jazz!, beat = 60 / st.bpm / 2, hz = (n: number) => 440 * 2 ** ((n - 69) / 12);
    while (this.nextT < c.currentTime + 0.35) {
      const i = this.step++, bar = Math.floor(i / 8), k = i % 8, ch = st.prog[bar % st.prog.length]!, t = this.nextT + (this.style === 'jazz' && k % 2 ? beat * 0.3 : 0);
      this.nextT += beat;
      if (this.style === 'off') continue;
      if (this.style === 'jazz') {
        if (k % 2 === 0) { const next = st.prog[(bar + 1) % st.prog.length]!, n = k === 6 ? next[0]! + (Math.random() < 0.5 ? 1 : -1) : ch[[0, 1, 2][k / 2 % 3]!]!; this.tone(hz(st.root + n), t, 0.42, 0.32, 'triangle', this.music, 420); }
        if (k % 2 === 0 || k === 3 || k === 7) this.hiss(t, k % 4 === 2 ? 0.14 : 0.06, 0.05, 6500, this.music); if (k === 2 || k === 6) this.hiss(t, 0.09, 0.045, 1800, this.music, 'bandpass');
        if ((k === 1 && Math.random() < 0.8) || (k === 4 && Math.random() < 0.5)) for (const n of ch.slice(1)) this.tone(hz(st.root + 24 + n), t, 0.5, 0.045, 'sine', this.music);
        if (Math.random() < 0.3) { const sc = [0, 3, 5, 7, 10, 12, 14, 15]; this.tone(hz(st.root + 36 + ch[0]! % 12 + sc[Math.floor(Math.random() * 8)]!), t, 0.34, 0.05, 'triangle', this.music, 2400, 0.02); }
      } else if (this.style === 'scores') { if (k === 0) for (const n of ch) { this.tone(hz(st.root + 12 + n), t, beat * 8, 0.05, 'sawtooth', this.music, 900, 0.7); this.tone(hz(st.root + n), t, beat * 8, 0.08, 'triangle', this.music, 500, 0.5); } if (k % 2 === 0 && Math.random() < 0.6) this.tone(hz(st.root + 36 + ch[Math.floor(Math.random() * 4)]!), t, 0.9, 0.05, 'sine', this.music); }
      else { if (k % 4 === 0) this.tone(52, t, 0.16, 0.4, 'sine', this.music); if (k % 4 === 2) this.hiss(t, 0.12, 0.09, 1500, this.music, 'bandpass'); this.hiss(t, 0.03, 0.03, 8000, this.music); this.tone(hz(st.root + ch[0]! + (k % 2 ? 12 : 0)), t, 0.2, 0.16, 'sawtooth', this.music, 500); this.tone(hz(st.root + 24 + ch[k % 4]!), t, 0.22, 0.05, this.style === 'synth' ? 'sawtooth' : 'square', this.music, this.style === 'synth' ? 1400 : 2200); }
    }
  }
  play(id: string, gain = 1): void {
    const c = this.ctx; if (!c || c.state !== 'running' || gain < 0.03) return;
    const t = c.currentTime, g = c.createGain(); g.gain.value = gain; g.connect(this.sfx); const o = g;
    switch (id) {
      case 'click': this.tone(1900, t, 0.03, 0.08, 'square', o, 3000, 0.002); this.hiss(t, 0.02, 0.08, 3000, o); break;
      case 'open': this.hiss(t, 0.14, 0.1, 900, o, 'bandpass', 0.6); this.tone(220, t, 0.08, 0.06, 'triangle', o); break;
      case 'register': this.hiss(t, 0.05, 0.12, 2500, o); this.tone(2093, t + 0.06, 0.5, 0.06, 'sine', o); this.tone(2637, t + 0.06, 0.6, 0.04, 'sine', o); break;
      case 'stamp': this.tone(90, t, 0.16, 0.5, 'sine', o); this.hiss(t, 0.08, 0.3, 600, o, 'lowpass'); break;
      case 'place': this.tone(120, t, 0.14, 0.35, 'sine', o); this.hiss(t, 0.06, 0.14, 1200, o, 'bandpass'); break;
      case 'done': [659, 880].forEach((f, i) => this.tone(f, t + i * 0.09, 0.25, 0.09, 'triangle', o)); break;
      case 'bad': this.tone(196, t, 0.22, 0.1, 'sawtooth', o, 800); this.tone(155, t + 0.12, 0.3, 0.1, 'sawtooth', o, 700); break;
      case 'event': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.07, 0.3, 0.07, 'sine', o)); break;
      case 'doors': this.hiss(t, 0.5, 0.14, 400, o, 'lowpass'); [392, 494, 587].forEach((f, i) => this.tone(f, t + 0.1 + i * 0.13, 0.6, 0.06, 'sine', o)); break;
      case 'fanfare': [392, 523, 659, 784, 1046].forEach((f, i) => { this.tone(f, t + i * 0.11, 0.5, 0.08, 'sawtooth', o, 2600); this.tone(f / 2, t + i * 0.11, 0.5, 0.06, 'triangle', o); }); break;
      case 'fault': this.hiss(t, 0.7, 0.22, 1500, o, 'bandpass'); this.tone(110, t, 0.6, 0.14, 'sawtooth', o, 500); break;
      case 'alarm': for (let i = 0; i < 6; i++) this.tone(i % 2 ? 880 : 660, t + i * 0.22, 0.18, 0.09, 'square', o, 2400); break;
      case 'poweroff': { const q = c.createOscillator(), k = c.createGain(); q.type = 'sawtooth'; q.frequency.setValueAtTime(180, t); q.frequency.exponentialRampToValueAtTime(28, t + 1.1); this.env(k, t, 0.01, 1.2, 0.2); q.connect(k); k.connect(o); q.start(t); q.stop(t + 1.4); break; }
      case 'poweron': { const q = c.createOscillator(), k = c.createGain(); q.type = 'triangle'; q.frequency.setValueAtTime(50, t); q.frequency.exponentialRampToValueAtTime(220, t + 0.6); this.env(k, t, 0.02, 0.8, 0.2); q.connect(k); k.connect(o); q.start(t); q.stop(t + 1); break; }
      case 'applause': for (let i = 0; i < 46; i++) this.hiss(t + Math.random() * 1.9, 0.03, 0.07 * (1 - i / 80), 1400 + Math.random() * 1800, o, 'bandpass', 1.2); break;
      case 'filmstart': this.tone(55, t, 1.6, 0.2, 'sine', o); this.hiss(t, 1.2, 0.06, 300, o, 'lowpass'); break;
      case 'pop': for (let i = 0; i < 5; i++) this.hiss(t + Math.random() * 0.4, 0.02, 0.16, 2200, o, 'bandpass', 2); break;
      case 'step': this.hiss(t, 0.05, 0.06, 500, o, 'lowpass'); break;
      case 'punch': this.hiss(t, 0.04, 0.25, 2000, o); this.tone(320, t, 0.06, 0.12, 'square', o, 1200); break;
    }
  }
}
export const audio = new AudioEngine();
