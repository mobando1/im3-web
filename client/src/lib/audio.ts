// Simple sound synthesizer for UI interactions using Web Audio API
// Designed for "premium, subtle, clicky" sounds.

class AudioEngine {
  private ctx: AudioContext | null = null;
  private enabled: boolean = false;

  constructor() {
    // Lazy init
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
  }

  toggle(on: boolean) {
    this.enabled = on;
    if (on && !this.ctx) {
      this.init();
    }
    if (on && this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }

  isEnabled() {
    return this.enabled;
  }

  // Play a short, high-quality "tick" or "pop"
  play(type: 'click' | 'pop' | 'connect' | 'stabilize') {
    if (!this.enabled || !this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    if (type === 'click') {
      // Soft mechanical click
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.05);
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.start(t);
      osc.stop(t + 0.05);
    } else if (type === 'pop') {
      // Gentle bubble pop
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(800, t + 0.1);
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.start(t);
      osc.stop(t + 0.1);
    } else if (type === 'connect') {
      // Digital connection sound
      osc.type = 'square';
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.linearRampToValueAtTime(600, t + 0.05);
      
      // Filter to soften the square wave
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      osc.disconnect();
      osc.connect(filter);
      filter.connect(gain);

      gain.gain.setValueAtTime(0.03, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.start(t);
      osc.stop(t + 0.1);
    } else if (type === 'stabilize') {
      // Very low hum/chord for success
      const osc2 = this.ctx.createOscillator();
      osc.type = 'sine';
      osc2.type = 'sine';
      osc.frequency.setValueAtTime(220, t);
      osc2.frequency.setValueAtTime(330, t); // Perfect fifth

      const gain2 = this.ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.05, t + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);

      gain2.gain.setValueAtTime(0, t);
      gain2.gain.linearRampToValueAtTime(0.05, t + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 1.0);

      osc.start(t);
      osc2.start(t);
      osc.stop(t + 1.0);
      osc2.stop(t + 1.0);
    }
  }
}

export const audio = new AudioEngine();
