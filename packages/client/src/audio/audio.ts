/**
 * Procedural WebAudio sound design (no external assets): every combat beat has a
 * synthesized cue, positioned in stereo and attenuated by distance from the listener.
 */
export type Sfx =
  | 'swing' | 'heavySwing' | 'hit' | 'hitFlesh' | 'block' | 'parry' | 'guardBreak' | 'dodge' | 'cast' | 'boltHit'
  | 'shockwave' | 'death' | 'playerDeath' | 'rest' | 'telegraph' | 'telegraphDanger' | 'stepGrass' | 'stepWater' | 'fail' | 'ui' | 'levelUp' | 'essence' | 'discover' | 'ice' | 'thunder' | 'seal' | 'zone' | 'buff' | 'heal' | 'portal' | 'skyThunder';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private fireGain: GainNode | null = null;
  private waterGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private rainHiss: GainNode | null = null;
  volume = 0.7;
  readonly music = new BonfireMusic();
  listenerX = 0;
  listenerY = 0;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const wind = this.loop(400, 0);
    this.windGain = wind.gain;
    this.windFilter = wind.filter;
    this.fireGain = this.loop(2500, 0, 'bandpass').gain;
    this.waterGain = this.loop(700, 0).gain;
    this.rainGain = this.loop(1400, 0, 'bandpass').gain;
    this.rainHiss = this.loop(5200, 0, 'highpass').gain;
    this.music.attach(ctx, this.master);
  }

  private loop(freq: number, gain: number, type: BiquadFilterType = 'lowpass'): { gain: GainNode | null; filter: BiquadFilterNode | null } {
    if (!this.ctx || !this.noise || !this.master) return { gain: null, filter: null };
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return { gain: g, filter: f };
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Continuous ambience levels (0..1) updated each frame. */
  ambience(wind: number, fire: number, water: number, rain = 0): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rainGain?.gain.setTargetAtTime(rain * 0.11, t, 0.8);
    this.rainHiss?.gain.setTargetAtTime(rain * 0.035, t, 0.8);
    this.windGain?.gain.setTargetAtTime(0.04 + wind * 0.1, t, 0.5);
    this.windFilter?.frequency.setTargetAtTime(250 + wind * 600, t, 0.5);
    this.fireGain?.gain.setTargetAtTime(fire * 0.06 * (0.6 + Math.random() * 0.8), t, 0.05);
    this.waterGain?.gain.setTargetAtTime(water * 0.07, t, 0.4);
    this.music.setLevel(fire);
  }

  play(name: Sfx, x = this.listenerX, y = this.listenerY, vol = 1): void {
    const ctx = this.ctx;
    const buf = this.noise;
    if (!ctx || !this.master || !buf) return;
    const dx = x - this.listenerX;
    const dy = y - this.listenerY;
    const dist = Math.hypot(dx, dy);
    if (dist > 30) return;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, dx / 12));
    const out = ctx.createGain();
    out.gain.value = vol / (1 + dist * 0.18);
    out.connect(pan).connect(this.master);
    const t = ctx.currentTime;

    const noise = (dur: number, freq: number, q: number, type: BiquadFilterType, gain: number, sweepTo?: number) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f).connect(g).connect(out);
      s.start(t, Math.random());
      s.stop(t + dur + 0.05);
    };
    const tone = (dur: number, f0: number, f1: number, type: OscillatorType, gain: number, delay = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + delay + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.setValueAtTime(gain, t + delay);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + delay + dur + 0.05);
    };

    switch (name) {
      case 'swing': noise(0.16, 900, 1.2, 'bandpass', 0.5, 2600); break;
      case 'heavySwing': noise(0.3, 400, 1, 'bandpass', 0.7, 1600); break;
      case 'hit': noise(0.12, 1800, 0.8, 'bandpass', 0.6); tone(0.18, 140, 50, 'sine', 0.8); break;
      case 'hitFlesh': noise(0.14, 700, 0.7, 'lowpass', 0.9); tone(0.2, 110, 45, 'sine', 0.9); break;
      case 'block': tone(0.25, 620, 540, 'square', 0.18); tone(0.3, 930, 880, 'triangle', 0.2); noise(0.08, 3000, 1, 'highpass', 0.4); break;
      case 'parry': tone(0.6, 1320, 1250, 'triangle', 0.35); tone(0.5, 1980, 1900, 'sine', 0.25); noise(0.1, 4000, 1, 'highpass', 0.5); break;
      case 'guardBreak': tone(0.4, 300, 90, 'sawtooth', 0.3); noise(0.3, 600, 0.6, 'lowpass', 0.6); break;
      case 'dodge': noise(0.22, 500, 0.8, 'lowpass', 0.45, 200); break;
      case 'cast': tone(0.35, 300, 900, 'sine', 0.25); tone(0.35, 450, 1350, 'triangle', 0.12); break;
      case 'boltHit': tone(0.3, 900, 200, 'sine', 0.3); noise(0.2, 2200, 1.5, 'bandpass', 0.4); break;
      case 'shockwave': tone(0.7, 90, 30, 'sine', 1.0); noise(0.6, 300, 0.5, 'lowpass', 1.0, 80); break;
      case 'death': tone(0.8, 220, 60, 'sawtooth', 0.2); noise(0.5, 400, 0.6, 'lowpass', 0.4); break;
      case 'playerDeath': tone(2.2, 160, 40, 'sawtooth', 0.25); tone(2.2, 240, 60, 'sine', 0.2); break;
      case 'rest': tone(1.2, 220, 440, 'sine', 0.2); tone(1.2, 330, 660, 'sine', 0.15, 0.15); break;
      case 'telegraph': tone(0.25, 180, 140, 'sawtooth', 0.12); break;
      case 'telegraphDanger': tone(0.5, 110, 70, 'sawtooth', 0.3); tone(0.5, 165, 100, 'square', 0.12); break;
      case 'stepGrass': noise(0.06, 1200, 0.7, 'bandpass', 0.12); break;
      case 'stepWater': noise(0.12, 900, 1.2, 'bandpass', 0.25, 400); break;
      case 'fail': tone(0.12, 200, 160, 'square', 0.08); break;
      case 'ui': tone(0.08, 880, 880, 'sine', 0.1); break;
      case 'levelUp': tone(0.9, 293.7, 293.7, 'triangle', 0.22); tone(0.9, 349.2, 349.2, 'triangle', 0.18, 0.12); tone(1.4, 440, 440, 'triangle', 0.2, 0.24); tone(1.6, 587.3, 587.3, 'sine', 0.16, 0.36); break;
      case 'essence': tone(0.8, 660, 990, 'sine', 0.18); tone(0.8, 990, 1320, 'sine', 0.1, 0.1); noise(0.5, 5000, 1, 'highpass', 0.15); break;
      case 'ice': noise(0.35, 4200, 2, 'bandpass', 0.35, 1800); tone(0.3, 1400, 700, 'triangle', 0.08); break;
      case 'thunder': noise(1.4, 1800, 0.5, 'lowpass', 1.2, 60); tone(0.25, 2400, 300, 'sawtooth', 0.12); noise(0.08, 6000, 1, 'highpass', 0.6); break;
      case 'seal': tone(0.6, 523.3, 523.3, 'sine', 0.18); tone(0.6, 784, 784, 'sine', 0.12, 0.05); noise(0.3, 3000, 3, 'bandpass', 0.15); break;
      case 'zone': tone(1.0, 110, 82, 'sawtooth', 0.12); noise(0.8, 500, 1, 'bandpass', 0.2); break;
      case 'heal': tone(0.7, 523, 784, 'sine', 0.14); tone(0.7, 659, 988, 'sine', 0.1, 0.08); tone(0.8, 784, 1175, 'triangle', 0.06, 0.16); break;
      case 'portal': tone(1.1, 110, 440, 'sine', 0.3); tone(1.1, 165, 660, 'triangle', 0.12); noise(0.9, 800, 2, 'bandpass', 0.3, 3000); break;
      case 'skyThunder': noise(2.6, 900, 0.4, 'lowpass', 1.0, 50); noise(0.15, 5000, 1, 'highpass', 0.5); tone(1.6, 60, 30, 'sine', 0.6, 0.05); break;
      case 'buff': tone(0.5, 330, 660, 'triangle', 0.18); tone(0.5, 495, 990, 'sine', 0.1, 0.06); break;
      case 'discover': tone(1.2, 220, 220, 'sine', 0.18); tone(1.4, 329.6, 329.6, 'sine', 0.14, 0.3); break;
    }
  }
}

const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * Procedural dark-fantasy bonfire theme: D minor, i–VI–iv–V (Dm–B♭–Gm–A) at ~62 BPM.
 * Soft detuned string pad, plucked harp/lute arpeggio, an occasional melody note,
 * all through a long generated reverb. Its level follows the distance to a bonfire,
 * so it swells when you approach a fire and fades out in the wilds.
 */
export class BonfireMusic {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private level = 0;
  private target = 0;
  userVolume = 0.6;
  private nextBar = 0;
  private bar = 0;
  private timer: number | null = null;
  private static readonly BEAT = 60 / 62;
  private static readonly CHORDS = [
    [50, 53, 57], // Dm
    [46, 50, 53], // B♭
    [43, 46, 50], // Gm
    [45, 49, 52], // A (major V: the harmonic-minor pull back home)
  ];
  private static readonly SCALE = [62, 64, 65, 67, 69, 70, 72, 74]; // D natural minor, upper octave

  attach(ctx: AudioContext, master: GainNode): void {
    this.ctx = ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(ctx, 3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    const dry = ctx.createGain();
    dry.gain.value = 0.6;
    bus.connect(dry).connect(master);
    bus.connect(reverb).connect(wet).connect(master);
    this.bus = bus;
    this.nextBar = ctx.currentTime + 0.2;
    // Look-ahead scheduler: robust to frame hitches, cheap when silent.
    this.timer = window.setInterval(() => this.schedule(), 120);
  }

  setLevel(fire: number): void {
    this.target = Math.min(1, Math.max(0, (fire - 0.15) / 0.55));
  }

  setVolume(v: number): void {
    this.userVolume = v;
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private impulse(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  private schedule(): void {
    const ctx = this.ctx;
    const bus = this.bus;
    if (!ctx || !bus) return;
    this.level += (this.target - this.level) * 0.08;
    bus.gain.setTargetAtTime(this.level * this.userVolume * 0.32, ctx.currentTime, 0.4);
    const barLen = BonfireMusic.BEAT * 4;
    while (this.nextBar < ctx.currentTime + 0.6) {
      if (this.level > 0.02) this.playBar(this.nextBar, this.bar);
      this.nextBar += barLen;
      this.bar++;
    }
  }

  private playBar(t0: number, bar: number): void {
    const chord = BonfireMusic.CHORDS[bar % 4]!;
    const beat = BonfireMusic.BEAT;
    // pad: root an octave down + triad, slowly swelling
    for (const n of [chord[0]! - 12, ...chord]) this.pad(hz(n), t0, beat * 4.4);
    // plucked arpeggio on eighth notes, with rests so it breathes
    const arp = [chord[0]! + 12, chord[1]! + 12, chord[2]! + 12, chord[1]! + 24, chord[2]! + 12, chord[1]! + 12, chord[0]! + 24, chord[2]! + 12];
    arp.forEach((n, i) => {
      if (i === 3 && bar % 2 === 1) return;
      if (Math.random() < 0.12) return;
      this.pluck(hz(n), t0 + i * beat * 0.5, 0.11 - (i % 2) * 0.03);
    });
    // a lonely melody note every other bar
    if (bar % 2 === 0) {
      const s = BonfireMusic.SCALE;
      const n = s[Math.floor(Math.random() * s.length)]!;
      this.pluck(hz(n + 12), t0 + beat * (2 + Math.floor(Math.random() * 2)), 0.07, 3.2);
    }
  }

  private pad(f: number, t: number, dur: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 1.4);
    g.gain.setValueAtTime(0.05, t + dur - 1.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.8);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    g.connect(lp).connect(this.bus!);
    for (const det of [-7, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 1);
    }
  }

  private pluck(f: number, t: number, gain: number, decay = 1.6): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + decay * 0.6);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(lp).connect(this.bus!);
    o.start(t);
    o2.start(t);
    o.stop(t + decay + 0.1);
    o2.stop(t + decay + 0.1);
  }
}
