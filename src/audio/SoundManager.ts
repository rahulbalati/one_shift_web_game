// ─── Procedural Web Audio Sound Manager ─────────────────────────────────────
// Zero-dependency, lightweight, 100% synthesized SFX & Lo-Fi ambient BGM for ONE SHIFT
// Zero external audio files / 0 copyright risk

export function triggerHaptic(pattern: number | number[] = 15) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignored if not supported or disabled by browser
  }
}

// 4-chord lo-fi ambient pad cycle: Fmaj7 -> Em7 -> Dm7 -> Cmaj7
const BGM_CHORDS = [
  [174.61, 220.00, 261.63, 329.63], // Fmaj7 (F3, A3, C4, E4)
  [164.81, 196.00, 246.94, 293.66], // Em7 (E3, G3, B3, D4)
  [146.83, 174.61, 220.00, 261.63], // Dm7 (D3, F3, A3, C4)
  [130.81, 164.81, 196.00, 246.94], // Cmaj7 (C3, E3, G3, B3)
];

const CHORD_DURATION = 3.6; // seconds per chord

class SoundManager {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private sdkMuted: boolean = false;
  private bgmPlaying: boolean = false;
  private bgmChordStep: number = 0;
  private bgmTimeoutId: number | null = null;
  private activeBgmNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

  constructor() {
    this.muted = localStorage.getItem('oneshift_muted') === 'true';
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  resume() {
    this.initCtx();
    if (!this.isMuted() && !this.bgmPlaying) {
      this.startBGM();
    }
  }

  setSdkMute(muted: boolean) {
    this.sdkMuted = muted;
    if (this.sdkMuted) {
      this.stopBGM();
    } else if (!this.muted && !this.bgmPlaying) {
      this.startBGM();
    }
  }

  isMuted(): boolean {
    return this.muted || this.sdkMuted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem('oneshift_muted', String(this.muted));
    if (!this.isMuted()) {
      this.initCtx();
      this.playClick();
      this.startBGM();
    } else {
      this.stopBGM();
    }
    return this.isMuted();
  }

  // ─── Procedural Lo-Fi Ambient BGM ───────────────────────────────────────────
  startBGM() {
    if (this.isMuted() || this.bgmPlaying) return;
    this.initCtx();
    if (!this.ctx) return;

    this.bgmPlaying = true;
    this.bgmChordStep = 0;
    this.scheduleChord();
  }

  stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmTimeoutId !== null) {
      window.clearTimeout(this.bgmTimeoutId);
      this.bgmTimeoutId = null;
    }
    if (this.ctx) {
      const now = this.ctx.currentTime;
      for (const node of this.activeBgmNodes) {
        try {
          node.gain.gain.cancelScheduledValues(now);
          node.gain.gain.setValueAtTime(node.gain.gain.value, now);
          node.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
          node.osc.stop(now + 0.35);
        } catch (_) {}
      }
    }
    this.activeBgmNodes = [];
  }

  private scheduleChord() {
    if (!this.bgmPlaying || this.muted || !this.ctx) return;

    const chord = BGM_CHORDS[this.bgmChordStep % BGM_CHORDS.length];
    this.bgmChordStep++;
    const now = this.ctx.currentTime;

    // Filter to give that warm, mellow lo-fi aesthetic
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(540, now);
    filter.Q.setValueAtTime(0.7, now);
    filter.connect(this.ctx.destination);

    const newNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

    // Synthesize gentle ambient sine waves with soft attack/decay
    for (const freq of chord) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      // Micro detune for lush chorus warmth
      osc.detune.setValueAtTime((Math.random() - 0.5) * 8, now);

      // Smooth attack -> sustain -> release envelope
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.028, now + 1.2); // Gentle fade in
      gain.gain.setValueAtTime(0.028, now + CHORD_DURATION - 1.2);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + CHORD_DURATION); // Gentle fade out

      osc.connect(gain);
      gain.connect(filter);

      osc.start(now);
      osc.stop(now + CHORD_DURATION + 0.1);

      newNodes.push({ osc, gain });
    }

    this.activeBgmNodes = newNodes;

    // Schedule next chord with slight overlap
    this.bgmTimeoutId = window.setTimeout(() => {
      this.scheduleChord();
    }, (CHORD_DURATION - 0.4) * 1000);
  }

  // ─── SFX: Button Click ──────────────────────────────────────────────────────
  playClick() {
    if (this.isMuted()) return;
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.04);
  }

  // ─── SFX: Tile Shift Whoosh ─────────────────────────────────────────────────
  playSlide() {
    if (this.isMuted()) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(now + 0.12);
  }

  // ─── SFX: Tile Solved Chime ─────────────────────────────────────────────────
  playTileSolved() {
    if (this.isMuted()) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now); // A5 note
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08); // E6 note

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(now + 0.18);
  }

  // ─── SFX: Victory Fanfare Chord ─────────────────────────────────────────────
  playVictory() {
    if (this.isMuted()) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // C5, E5, G5, C6 triumphant chord
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const delay = idx * 0.08;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0.001, now + delay);
      gain.gain.linearRampToValueAtTime(0.2, now + delay + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.55);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

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

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(now + 0.05);
  }

  // ─── SFX: Time's Up Buzzer ──────────────────────────────────────────────────
  playTimeUp() {
    if (this.isMuted()) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [349.23, 293.66, 233.08];
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const delay = idx * 0.12;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0.14, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(now + delay);
      osc.stop(now + delay + 0.35);
    });
  }
}

export const sounds = new SoundManager();
