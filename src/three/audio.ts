/**
 * Procedural Web Audio synthesizer featuring a multi-layered real car exhaust
 * (6-speed gear RPM curve, sub-bass rumble, harmonic sawtooth rasp, waveshaper
 * muffler saturation, filtered exhaust air rush, turbo spool & overrun pops),
 * plus crisp arcade SFX cues. Zero external audio assets.
 */
export class ProceduralEngineAudio {
  private ctx: AudioContext | null = null;

  // Real Car Exhaust Rig
  private oscSub: OscillatorNode | null = null;
  private oscGrowl: OscillatorNode | null = null;
  private oscHarmonic: OscillatorNode | null = null;
  private exhaustNoiseSource: AudioBufferSourceNode | null = null;
  private exhaustNoiseGain: GainNode | null = null;
  private exhaustNoiseFilter: BiquadFilterNode | null = null;
  private exhaustShaper: WaveShaperNode | null = null;
  private mufflerPeakFilter: BiquadFilterNode | null = null;
  private exhaustLowpass: BiquadFilterNode | null = null;
  private masterEngineGain: GainNode | null = null;

  // Ambient Rain Rig
  private rainSource: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;

  private enabled = false;
  private prevGear = 1;
  private wasBoosting = false;
  private lastPopTime = 0;

  public setEnabled(next: boolean): void {
    this.enabled = next;
    if (next) {
      this.ensureStarted();
      if (this.ctx?.state === 'suspended') {
        void this.ctx.resume();
      }
      if (this.masterEngineGain && this.ctx) {
        this.masterEngineGain.gain.setTargetAtTime(0.085, this.ctx.currentTime, 0.08);
      }
    } else {
      if (this.masterEngineGain && this.ctx) {
        this.masterEngineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
      }
      if (this.rainGain && this.ctx) {
        this.rainGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      }
    }
  }

  public update(speedKmh: number, boosting: boolean, braking = false, rainIntensity = 0): void {
    if (
      !this.enabled ||
      !this.ctx ||
      !this.oscSub ||
      !this.oscGrowl ||
      !this.oscHarmonic ||
      !this.exhaustLowpass ||
      !this.mufflerPeakFilter ||
      !this.masterEngineGain
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    const clampedSpeed = Math.max(0, Math.min(320, speedKmh));

    // Simulate a 6-speed performance gearbox for authentic exhaust pitch drops on upshift
    let gear = 1;
    let gearMin = 0;
    let gearMax = 58;
    if (clampedSpeed >= 250) {
      gear = 6;
      gearMin = 215;
      gearMax = 325;
    } else if (clampedSpeed >= 198) {
      gear = 5;
      gearMin = 165;
      gearMax = 262;
    } else if (clampedSpeed >= 146) {
      gear = 4;
      gearMin = 118;
      gearMax = 208;
    } else if (clampedSpeed >= 98) {
      gear = 3;
      gearMin = 74;
      gearMax = 156;
    } else if (clampedSpeed >= 52) {
      gear = 2;
      gearMin = 36;
      gearMax = 108;
    }

    const gearSpan = Math.max(1, gearMax - gearMin);
    const gearRatio = Math.max(0, Math.min(1, (clampedSpeed - gearMin) / gearSpan));

    // RPM curve: ~900 idle up to ~7400 redline
    const baseRpm =
      clampedSpeed < 3
        ? 900
        : 2350 + gearRatio * 4650 + (boosting ? 650 : 0) - (braking ? 700 : 0);
    const rpmClamped = Math.max(850, Math.min(7800, baseRpm));

    // 4-stroke V6/V8 firing fundamental (~30Hz idle -> ~115Hz redline)
    const firingHz = 26 + ((rpmClamped - 850) / 6950) * 86;

    // Trigger subtle exhaust pop/burble on off-throttle / boost release or downshift
    if (
      ((this.wasBoosting && !boosting) || (gear < this.prevGear && clampedSpeed > 40)) &&
      now - this.lastPopTime > 0.35
    ) {
      this.lastPopTime = now;
      this.playExhaustPop();
    }
    this.prevGear = gear;
    this.wasBoosting = boosting;

    const tau = 0.045;
    this.oscSub.frequency.setTargetAtTime(firingHz, now, tau);
    this.oscGrowl.frequency.setTargetAtTime(firingHz * 1.5, now, tau);
    this.oscHarmonic.frequency.setTargetAtTime(firingHz * 2.02, now, tau);

    // Exhaust muffler resonance & lowpass cutoff open wide under throttle & boost
    const loadNorm = (rpmClamped - 850) / 6950;
    const cutoff =
      210 + loadNorm * 980 + (boosting ? 560 : 0) - (braking ? 140 : 0);
    this.exhaustLowpass.frequency.setTargetAtTime(Math.max(160, cutoff), now, 0.06);
    this.mufflerPeakFilter.frequency.setTargetAtTime(115 + loadNorm * 145, now, 0.07);

    if (this.exhaustNoiseGain && this.exhaustNoiseFilter) {
      const rushGain =
        clampedSpeed < 3 ? 0.008 : 0.02 + loadNorm * 0.05 + (boosting ? 0.045 : 0);
      this.exhaustNoiseGain.gain.setTargetAtTime(
        braking ? rushGain * 0.45 : rushGain,
        now,
        0.07,
      );
      this.exhaustNoiseFilter.frequency.setTargetAtTime(
        260 + loadNorm * 620 + (boosting ? 450 : 0),
        now,
        0.08,
      );
    }

    const targetGain =
      clampedSpeed < 3
        ? 0.055
        : braking
          ? 0.065
          : 0.08 + loadNorm * 0.06 + (boosting ? 0.04 : 0);
    this.masterEngineGain.gain.setTargetAtTime(targetGain, now, 0.06);

    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(
        Math.max(0, Math.min(1, rainIntensity)) * 0.024,
        now,
        0.15,
      );
    }
  }

  private playExhaustPop(): void {
    if (!this.enabled || !this.ctx || !this.exhaustLowpass) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(115 + Math.random() * 35, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.09);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(this.exhaustLowpass);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playBump(): void {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.16);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playCoinCollect(streak = 0): void {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const pitchBoost = Math.min(streak, 8) * 38;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880 + pitchBoost, now);
    osc.frequency.setValueAtTime(1318.5 + pitchBoost * 1.15, now + 0.055);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.23);
  }

  public playDiamondCollect(multiplier = 1): void {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const base = 1046.5 + Math.min(multiplier, 5) * 70;
    const freqs = [base, base * 1.25, base * 1.5];

    freqs.forEach((f, idx) => {
      if (!this.ctx) return;
      const t = now + idx * 0.045;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.085, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  public playPetrolCollect(): void {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const freqs = [349.23, 440, 587.33];

    freqs.forEach((f, idx) => {
      if (!this.ctx) return;
      const t = now + idx * 0.06;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 1.12, t + 0.09);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.095, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  }

  public playBoosterCollect(): void {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.28);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  public playBoostPad(): void {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(220, now);
    osc1.frequency.exponentialRampToValueAtTime(980, now + 0.26);
    osc2.frequency.setValueAtTime(440, now);
    osc2.frequency.exponentialRampToValueAtTime(1420, now + 0.24);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1100, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.095, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.32);
    osc2.stop(now + 0.32);
  }

  public playOvertake(nearMiss = false): void {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(nearMiss ? 660 : 520, now);
    osc.frequency.exponentialRampToValueAtTime(nearMiss ? 990 : 740, now + 0.14);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(nearMiss ? 0.085 : 0.06, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playAchievement(): void {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [587.33, 739.99, 880, 1174.66];

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const start = now + idx * 0.065;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.095, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.44);
    });
  }

  public playLevelUp(): void {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const start = now + idx * 0.075;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.085, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.34);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.36);
    });
  }

  public playTimerTick(): void {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.065);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playTimeUp(): void {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [440, 293.66];

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const start = now + idx * 0.14;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.88, start + 0.16);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.11, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  }

  private ensureStarted(): void {
    if (this.ctx) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();

    // Warm asymmetric muffler saturation curve
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i * 2) / 1024 - 1;
      curve[i] = Math.tanh(x * 2.4 + x * x * 0.35);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';

    // Muffler body resonance peaking EQ (~140-260Hz)
    const mufflerPeak = ctx.createBiquadFilter();
    mufflerPeak.type = 'peaking';
    mufflerPeak.frequency.value = 140;
    mufflerPeak.Q.value = 2.2;
    mufflerPeak.gain.value = 6.5;

    // Exhaust tailpipe lowpass filter
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 260;
    lowpass.Q.value = 2.4;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0;

    // Sub-bass exhaust fundamental
    const oscSub = ctx.createOscillator();
    oscSub.type = 'triangle';
    oscSub.frequency.value = 34;

    // Midrange cylinder growl
    const oscGrowl = ctx.createOscillator();
    oscGrowl.type = 'sawtooth';
    oscGrowl.frequency.value = 51;

    // Upper exhaust rasp harmonic
    const oscHarmonic = ctx.createOscillator();
    oscHarmonic.type = 'sawtooth';
    oscHarmonic.frequency.value = 68.5;

    const subGain = ctx.createGain();
    subGain.gain.value = 0.72;
    const growlGain = ctx.createGain();
    growlGain.gain.value = 0.42;
    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.24;

    oscSub.connect(subGain);
    oscGrowl.connect(growlGain);
    oscHarmonic.connect(harmGain);

    subGain.connect(shaper);
    growlGain.connect(shaper);
    harmGain.connect(shaper);

    shaper.connect(mufflerPeak);
    mufflerPeak.connect(lowpass);
    lowpass.connect(masterGain);
    masterGain.connect(ctx.destination);

    oscSub.start();
    oscGrowl.start();
    oscHarmonic.start();

    // Shared 2-second white noise buffer for exhaust air rush + rain ambience
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const exhaustNoise = ctx.createBufferSource();
    exhaustNoise.buffer = noiseBuf;
    exhaustNoise.loop = true;

    const exhaustNoiseFilter = ctx.createBiquadFilter();
    exhaustNoiseFilter.type = 'bandpass';
    exhaustNoiseFilter.frequency.value = 320;
    exhaustNoiseFilter.Q.value = 0.9;

    const exhaustNoiseGain = ctx.createGain();
    exhaustNoiseGain.gain.value = 0.01;

    exhaustNoise.connect(exhaustNoiseFilter);
    exhaustNoiseFilter.connect(exhaustNoiseGain);
    exhaustNoiseGain.connect(lowpass);
    exhaustNoise.start();

    // Soft filtered noise loop for Rain / Storm weather ambience
    const rainSource = ctx.createBufferSource();
    rainSource.buffer = noiseBuf;
    rainSource.loop = true;

    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1100;
    rainFilter.Q.value = 0.7;

    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;

    rainSource.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(ctx.destination);
    rainSource.start();

    this.ctx = ctx;
    this.oscSub = oscSub;
    this.oscGrowl = oscGrowl;
    this.oscHarmonic = oscHarmonic;
    this.exhaustNoiseSource = exhaustNoise;
    this.exhaustNoiseFilter = exhaustNoiseFilter;
    this.exhaustNoiseGain = exhaustNoiseGain;
    this.exhaustShaper = shaper;
    this.mufflerPeakFilter = mufflerPeak;
    this.exhaustLowpass = lowpass;
    this.masterEngineGain = masterGain;
    this.rainSource = rainSource;
    this.rainGain = rainGain;
  }

  public dispose(): void {
    const stopOsc = (node: OscillatorNode | AudioBufferSourceNode | null) => {
      if (!node) return;
      try {
        node.stop();
      } catch {
        // ignore if already stopped
      }
      node.disconnect();
    };
    stopOsc(this.oscSub);
    stopOsc(this.oscGrowl);
    stopOsc(this.oscHarmonic);
    stopOsc(this.exhaustNoiseSource);
    stopOsc(this.rainSource);

    this.exhaustNoiseFilter?.disconnect();
    this.exhaustNoiseGain?.disconnect();
    this.exhaustShaper?.disconnect();
    this.mufflerPeakFilter?.disconnect();
    this.exhaustLowpass?.disconnect();
    this.masterEngineGain?.disconnect();
    this.rainGain?.disconnect();

    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close();
    }
    this.ctx = null;
  }
}
