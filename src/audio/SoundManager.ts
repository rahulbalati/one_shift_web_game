// ─── Procedural Web Audio Sound Manager ─────────────────────────────────────
// Zero-dependency, lightweight, 100% synthesized SFX & Lo-Fi ambient BGM for ONE SHIFT
// Zero external audio files / 0 copyright risk

// Vibration only on touch screens, and only after the player has interacted with the
// page: Chrome logs a console error for every vibrate() before a user gesture (e.g. a
// desktop keyboard player), and desktops cannot vibrate anyway.
const canVibrate = (() => {
  try {
    return typeof navigator !== 'undefined' && 'vibrate' in navigator &&
      window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
})();

export function triggerHaptic(pattern: number | number[] = 15) {
  if (!canVibrate) return;
  try {
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (activation && !activation.hasBeenActive) return;
    navigator.vibrate(pattern);
  } catch {
    // Ignored if not supported or disabled by browser
  }
}

// ─── Background music ─────────────────────────────────────────────────────────
// A light, looping "workshop" groove (I–vi–IV–V in C, 96 BPM): soft chord pad,
// round bass and a mellow plucked arpeggio, all through a gentle low-pass. Notes
// are scheduled a little ahead on the audio clock; if the page stalls, missed notes
// are dropped rather than played late in a burst.
const BPM = 96;
const STEP = 60 / BPM / 4;                    // one 16th note, seconds
const CHORDS: number[][] = [                  // MIDI notes per bar
  [60, 64, 67],   // C
  [57, 60, 64],   // Am
  [53, 57, 60],   // F
  [55, 59, 62],   // G
];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];         // chord-tone index per 8th note (-1 = rest)
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private muted = false;          // player's sound-effects switch
  private musicMuted = false;     // player's music switch
  private platformMuted = false;  // platform-wide mute (e.g. CrazyGames setting): overrides both
  private bgmPlaying = false;
  private musicBus: GainNode | null = null;
  private nextNoteTime = 0;
  private step16 = 0;
  private schedTimer: number | null = null;

  /** Persist the player's switches (wired to the save system in main.ts). */
  onUserMuteChange: ((muted: boolean) => void) | null = null;
  onMusicChange: ((muted: boolean) => void) | null = null;

  constructor() {
    this.setupLifecycleListeners();
    this.setupAudioUnlock();
  }

  private setupAudioUnlock() {
    if (typeof window === 'undefined') return;
    let primed = false;
    const unlock = () => {
      this.initCtx();
      if (!primed && this.ctx && this.ctx.state === 'running') {
        primed = true;
        try {
          const buffer = this.ctx.createBuffer(1, 1, 22050);
          const src = this.ctx.createBufferSource();
          src.buffer = buffer;
          src.connect(this.ctx.destination);
          src.start(0);
        } catch (_) {}
      }
    };
    // Kept for the whole session: iOS can suspend/interrupt the context after
    // backgrounding, and it may only be resumed inside a user gesture.
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('touchend', unlock, true);
    window.addEventListener('click', unlock, true);
  }

  private setupLifecycleListeners() {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.handleAppBackground();
      else this.handleAppForeground();
    });
    window.addEventListener('pagehide', () => this.handleAppBackground());
    window.addEventListener('blur', () => { if (document.hidden) this.handleAppBackground(); });
    window.addEventListener('focus', () => this.handleAppForeground());
  }

  private handleAppBackground() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.masterGain) {
      try {
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.015);
      } catch (_) {}
    }
    this.stopBGM();
    try {
      if (this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
    } catch (_) {}
  }

  private handleAppForeground() {
    if (!this.ctx) return;
    const restore = () => {
      if (!this.ctx || !this.masterGain || this.platformMuted) return;
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(0.0001, now);
      this.masterGain.gain.linearRampToValueAtTime(1, now + 0.05);
      if (this.musicOn() && !this.bgmPlaying) this.startBGM();
    };
    if (this.ctx.state === 'suspended') this.ctx.resume().then(restore).catch(() => {});
    else restore();
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.platformMuted ? 0 : 1, this.ctx.currentTime);
        // Keeps the mix under 0 dB during fast tapping
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-10, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.005, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);
        // Brick-wall limiter last in the chain: stacked effects can never clip
        const limiter = this.ctx.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(-3, this.ctx.currentTime);
        limiter.knee.setValueAtTime(0, this.ctx.currentTime);
        limiter.ratio.setValueAtTime(20, this.ctx.currentTime);
        limiter.attack.setValueAtTime(0.001, this.ctx.currentTime);
        limiter.release.setValueAtTime(0.1, this.ctx.currentTime);
        this.masterGain.connect(this.compressor);
        this.compressor.connect(limiter);
        limiter.connect(this.ctx.destination);
      }
    }
    // iOS also reports a non-standard 'interrupted' state
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') {
      this.ctx.resume().catch(() => {});
    }
  }

  resume() {
    this.initCtx();
    if (this.masterGain && this.ctx) this.masterGain.gain.setValueAtTime(this.platformMuted ? 0 : 1, this.ctx.currentTime);
    if (this.musicOn() && !this.bgmPlaying) this.startBGM();
  }

  /** Platform mute (e.g. CrazyGames muteAudio): silences everything and wins over the in-game switches. */
  setPlatformMute(muted: boolean) {
    this.platformMuted = muted;
    if (this.masterGain && this.ctx) this.masterGain.gain.setValueAtTime(muted ? 0 : 1, this.ctx.currentTime);
    if (!this.musicOn()) this.stopBGM();
    else if (!this.bgmPlaying) this.startBGM();
  }

  /** Sound effects are off (player switch or platform mute). */
  isMuted(): boolean {
    return this.muted || this.platformMuted;
  }

  musicOn(): boolean {
    return !this.musicMuted && !this.platformMuted;
  }

  /** Restores saved switches at boot (no sound, no save). */
  setUserMuted(muted: boolean) {
    this.muted = muted;
  }

  setMusicMuted(muted: boolean) {
    this.musicMuted = muted;
    if (!this.musicOn()) this.stopBGM();
  }

  /** Sound-effects switch. Returns true when effects are now off. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    this.onUserMuteChange?.(this.muted);
    if (!this.isMuted()) this.playClick();
    return this.isMuted();
  }

  /** Music switch. Returns true when music is now off. */
  toggleMusic(): boolean {
    this.musicMuted = !this.musicMuted;
    this.onMusicChange?.(this.musicMuted);
    if (this.musicOn()) { this.initCtx(); this.startBGM(); } else this.stopBGM();
    return !this.musicOn();
  }

  // The same effect fired several times in one instant (multi-tile drags, fast taps)
  // stacks into a loud crackle; allow each effect at most once per `ms`.
  private lastSfx: Record<string, number> = {};

  private allow(name: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.lastSfx[name] ?? -1e9) < ms) return false;
    this.lastSfx[name] = now;
    return true;
  }

  // ─── Music sequencer ─────────────────────────────────────────────────────────
  startBGM() {
    if (!this.musicOn() || this.bgmPlaying) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;
    this.bgmPlaying = true;
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.musicBus.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 1.5);
    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(3200, this.ctx.currentTime);
    this.musicBus.connect(tone);
    tone.connect(this.masterGain);
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.step16 = 0;
    this.schedule();
  }

  stopBGM() {
    this.bgmPlaying = false;
    if (this.schedTimer !== null) {
      window.clearTimeout(this.schedTimer);
      this.schedTimer = null;
    }
    const bus = this.musicBus;
    this.musicBus = null;
    if (bus && this.ctx) {
      const now = this.ctx.currentTime;
      try {
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(bus.gain.value, now);
        bus.gain.linearRampToValueAtTime(0.0001, now + 0.08);
      } catch (_) {}
      window.setTimeout(() => { try { bus.disconnect(); } catch (_) {} }, 300);
    }
  }

  private schedule() {
    if (!this.bgmPlaying || !this.ctx || !this.musicBus) return;
    const now = this.ctx.currentTime;
    // After a stall (busy main thread, background tab) skip the missed notes so they
    // are not all started at once.
    while (this.nextNoteTime < now + 0.01) {
      this.nextNoteTime += STEP;
      this.step16 = (this.step16 + 1) % (16 * CHORDS.length);
    }
    const ahead = now + 0.3;
    while (this.nextNoteTime < ahead) {
      this.playStep(this.step16, this.nextNoteTime);
      this.nextNoteTime += STEP;
      this.step16 = (this.step16 + 1) % (16 * CHORDS.length);
    }
    this.schedTimer = window.setTimeout(() => this.schedule(), 100);
  }

  private voice(type: OscillatorType, freq: number, t: number, dur: number, vol: number, attack = 0.005, cutoff = 0) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(cutoff, t);
      g.connect(f);
      f.connect(this.musicBus!);
    } else {
      g.connect(this.musicBus!);
    }
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private playStep(step: number, t: number) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = CHORDS[bar];
    // Pad: whole-bar chord, soft and filtered
    if (s === 0) for (const n of chord) this.voice('triangle', midi(n), t, STEP * 16, 0.018, 0.35, 900);
    // Bass: root on beats 1 and 3, a fifth on the "and" of 4
    if (s === 0 || s === 8) this.voice('sine', midi(chord[0] - 24), t, STEP * 6, 0.07, 0.01);
    if (s === 14) this.voice('sine', midi(chord[2] - 24), t, STEP * 2, 0.05, 0.01);
    // Mellow plucked arpeggio on 8th notes
    if (s % 2 === 0) {
      const idx = ARP[(s / 2) % ARP.length];
      if (idx >= 0) this.voice('sine', midi(chord[idx]), t, STEP * 3, 0.03, 0.015);
    }
  }

  // ─── SFX: Button Click ──────────────────────────────────────────────────────
  playClick() {
    if (this.isMuted() || !this.allow('click', 40)) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(560, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.055);

    // Micro-attack (2ms) prevents DAC pop/crack on zero-crossing
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

    const out = this.masterGain || this.ctx.destination;
    osc.connect(gain);
    gain.connect(out);

    osc.start(now);
    osc.stop(now + 0.06);
  }

  // ─── SFX: Tile Shift Whoosh ─────────────────────────────────────────────────
  playSlide() {
    if (this.isMuted() || !this.allow('slide', 50)) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(130, now + 0.11);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    const out = this.masterGain || this.ctx.destination;
    osc.connect(gain);
    gain.connect(out);

    osc.start(now);
    osc.stop(now + 0.115);
  }

  // ─── SFX: Tile Solved Chime ─────────────────────────────────────────────────
  playTileSolved() {
    if (this.isMuted() || !this.allow('solved', 60)) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now); // A5 note
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08); // E6 note

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    const out = this.masterGain || this.ctx.destination;
    osc.connect(gain);
    gain.connect(out);

    osc.start(now);
    osc.stop(now + 0.165);
  }

  // ─── SFX: Short tone helper ─────────────────────────────────────────────────
  private tone(freq: number, endFreq: number, dur: number, vol: number, type: OscillatorType, delay = 0) {
    if (this.isMuted()) return;
    this.initCtx();
    if (!this.ctx) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(this.masterGain || this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  // ─── SFX: Combo (several tiles locked in by one shift) ──────────────────────
  playCombo(count: number) {
    const base = [660, 784, 988, 1175];
    const n = Math.min(count, 4);
    for (let i = 0; i < n; i++) this.tone(base[i], base[i] * 1.5, 0.14, 0.12, 'sine', i * 0.05);
  }

  // ─── SFX: Blocked move (locked / wrong-way line) ────────────────────────────
  playBlocked() {
    if (!this.allow('blocked', 80)) return;
    this.tone(180, 120, 0.09, 0.12, 'triangle');
  }

  // ─── SFX: Star pop on the win panel ─────────────────────────────────────────
  playStar(i: number) {
    const f = [880, 1109, 1319][Math.min(i, 2)];
    this.tone(f, f * 1.25, 0.18, 0.13, 'sine');
  }

  // ─── SFX: Rush time bonus ───────────────────────────────────────────────────
  playBonus() {
    this.tone(990, 1480, 0.14, 0.09, 'triangle');
  }

  // ─── SFX: Victory Fanfare Chord ─────────────────────────────────────────────
  playVictory() {
    if (this.isMuted()) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // C5, E5, G5, C6 triumphant chord
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const out = this.masterGain || this.ctx.destination;

    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const delay = idx * 0.08;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.linearRampToValueAtTime(0.18, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.55);

      osc.connect(gain);
      gain.connect(out);

      osc.start(now + delay);
      osc.stop(now + delay + 0.55);
    });
  }

  // ─── SFX: Low Time Ticking ──────────────────────────────────────────────────
  playTimeWarning() {
    if (this.isMuted()) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.05);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    const out = this.masterGain || this.ctx.destination;
    osc.connect(gain);
    gain.connect(out);

    osc.start(now);
    osc.stop(now + 0.055);
  }

  // ─── SFX: Time's Up Buzzer ──────────────────────────────────────────────────
  playTimeUp() {
    if (this.isMuted()) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [349.23, 293.66, 233.08];
    const out = this.masterGain || this.ctx.destination;

    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const delay = idx * 0.12;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.linearRampToValueAtTime(0.14, now + delay + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.35);

      osc.connect(gain);
      gain.connect(out);

      osc.start(now + delay);
      osc.stop(now + delay + 0.35);
    });
  }
}

export const sounds = new SoundManager();
