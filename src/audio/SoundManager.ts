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
  private masterGain: GainNode | null = null;
  private muted: boolean = false;
  private sdkMuted: boolean = false;
  private bgmPlaying: boolean = false;
  private bgmChordStep: number = 0;
  private bgmTimeoutId: number | null = null;
  private activeBgmNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
  private currentFilter: BiquadFilterNode | null = null;

  private compressor: DynamicsCompressorNode | null = null;

  constructor() {
    try {
      this.muted = typeof localStorage !== 'undefined' && localStorage.getItem('oneshift_muted') === 'true';
    } catch (_) {
      this.muted = false;
    }
    this.setupLifecycleListeners();
    this.setupAudioUnlock();
  }

  private setupAudioUnlock() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.initCtx();
      if (this.ctx && this.ctx.state === 'running') {
        try {
          const buffer = this.ctx.createBuffer(1, 1, 22050);
          const src = this.ctx.createBufferSource();
          src.buffer = buffer;
          src.connect(this.ctx.destination);
          src.start(0);
        } catch (_) {}
      }
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('touchend', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('touchend', unlock, true);
  }

  private setupLifecycleListeners() {
    if (typeof document === 'undefined') return;

    const onHidden = () => {
      this.handleAppBackground();
    };

    const onVisible = () => {
      this.handleAppForeground();
    };

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) onHidden();
      else onVisible();
    });

    window.addEventListener('pagehide', onHidden);
    window.addEventListener('blur', () => {
      // Gentle pause on blur if mobile tab lost focus
      if (document.hidden) onHidden();
    });
    window.addEventListener('focus', onVisible);
  }

  private handleAppBackground() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Instant micro-fade to silence on master gain (15ms) prevents audio buffer pop/burst
    if (this.masterGain) {
      try {
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.015);
      } catch (_) {}
    }

    this.stopBGM();

    // Cleanly suspend hardware audio context to release OS hardware thread
    try {
      if (this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    } catch (_) {}
  }

  private handleAppForeground() {
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        if (!this.isMuted() && this.masterGain) {
          const now = this.ctx!.currentTime;
          this.masterGain.gain.cancelScheduledValues(now);
          this.masterGain.gain.setValueAtTime(0.0001, now);
          this.masterGain.gain.linearRampToValueAtTime(1, now + 0.05);
          if (!this.bgmPlaying) {
            this.startBGM();
          }
        }
      }).catch(() => {});
    } else if (!this.isMuted() && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(0.0001, now);
      this.masterGain.gain.linearRampToValueAtTime(1, now + 0.05);
      if (!this.bgmPlaying) {
        this.startBGM();
      }
    }
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted() ? 0 : 1, this.ctx.currentTime);

        // Dynamics Compressor: keeps audio within 0dB, preventing clipping/distortion during fast tapping
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

        this.masterGain.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  resume() {
    this.initCtx();
    if (!this.isMuted()) {
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(1, this.ctx.currentTime);
      }
      if (!this.bgmPlaying) {
        this.startBGM();
      }
    }
  }

  setSdkMute(muted: boolean) {
    this.sdkMuted = muted;
    if (this.isMuted()) {
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
      this.stopBGM();
    } else {
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(1, this.ctx.currentTime);
      }
      if (!this.bgmPlaying) {
        this.startBGM();
      }
    }
  }

  isMuted(): boolean {
    return this.muted || this.sdkMuted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('oneshift_muted', String(this.muted));
      }
    } catch (_) {}
    if (this.isMuted()) {
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
      this.stopBGM();
    } else {
      this.initCtx();
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(1, this.ctx.currentTime);
      }
      this.playClick();
      this.startBGM();
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
          node.gain.gain.linearRampToValueAtTime(0.0001, now + 0.04);
          node.osc.stop(now + 0.05);
        } catch (_) {}
      }
    }
    this.activeBgmNodes = [];
    if (this.currentFilter) {
      try {
        this.currentFilter.disconnect();
      } catch (_) {}
      this.currentFilter = null;
    }
  }

  private scheduleChord() {
    if (!this.bgmPlaying || this.isMuted() || !this.ctx || !this.masterGain) return;

    const chord = BGM_CHORDS[this.bgmChordStep % BGM_CHORDS.length];
    this.bgmChordStep++;
    const now = this.ctx.currentTime;

    // Disconnect previous filter to prevent node leaks
    if (this.currentFilter) {
      try { this.currentFilter.disconnect(); } catch (_) {}
    }

    // Filter to give that warm, mellow lo-fi aesthetic
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(540, now);
    filter.Q.setValueAtTime(0.7, now);
    filter.connect(this.masterGain);
    this.currentFilter = filter;

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
      gain.gain.linearRampToValueAtTime(0.026, now + 1.2); // Gentle fade in
      gain.gain.setValueAtTime(0.026, now + CHORD_DURATION - 1.2);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + CHORD_DURATION); // Gentle fade out

      osc.connect(gain);
      gain.connect(filter);

      osc.start(now);
      osc.stop(now + CHORD_DURATION + 0.05);

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
    if (this.isMuted()) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(130, now + 0.11);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    const out = this.masterGain || this.ctx.destination;
    osc.connect(gain);
    gain.connect(out);

    osc.start(now);
    osc.stop(now + 0.115);
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

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    const out = this.masterGain || this.ctx.destination;
    osc.connect(gain);
    gain.connect(out);

    osc.start(now);
    osc.stop(now + 0.165);
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
