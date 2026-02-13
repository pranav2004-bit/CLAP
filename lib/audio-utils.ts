// Audio utilities for the listening test
export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private isPlaying = false;
  private startTime = 0;
  private currentTime = 0;
  private duration = 0;
  private onTimeUpdate?: (currentTime: number, duration: number) => void;
  private onEnded?: () => void;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.setupNodes();
    }
  }

  private setupNodes() {
    if (!this.audioContext) return;
    
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
    this.gainNode.gain.value = 0.3; // Lower volume
  }

  // Generate synthetic speech-like audio
  private generateSpeech(duration: number): void {
    if (!this.audioContext || !this.gainNode) return;

    // Create multiple oscillators for speech-like sound
    const frequencies = [100, 150, 200, 250, 300]; // Formant frequencies
    
    frequencies.forEach((freq, index) => {
      const osc = this.audioContext!.createOscillator();
      const envelope = this.audioContext!.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq + Math.sin(Date.now() * 0.001) * 20, this.audioContext!.currentTime);
      
      envelope.gain.setValueAtTime(0, this.audioContext!.currentTime);
      envelope.gain.linearRampToValueAtTime(0.1 / (index + 1), this.audioContext!.currentTime + 0.1);
      envelope.gain.exponentialRampToValueAtTime(0.01 / (index + 1), this.audioContext!.currentTime + duration - 0.2);
      envelope.gain.linearRampToValueAtTime(0, this.audioContext!.currentTime + duration);
      
      osc.connect(envelope);
      envelope.connect(this.gainNode!);
      
      osc.start(this.audioContext!.currentTime);
      osc.stop(this.audioContext!.currentTime + duration);
    });
  }

  // Play audio clip
  play(duration: number = 225): Promise<void> {
    return new Promise((resolve) => {
      if (this.isPlaying || !this.audioContext) {
        resolve();
        return;
      }

      this.isPlaying = true;
      this.duration = duration;
      this.startTime = this.audioContext.currentTime;
      this.currentTime = 0;

      this.generateSpeech(duration / 1000); // Convert to seconds

      // Update time callback
      const updateTime = () => {
        if (this.isPlaying && this.audioContext) {
          this.currentTime = (this.audioContext.currentTime - this.startTime) * 1000;
          if (this.onTimeUpdate) {
            this.onTimeUpdate(this.currentTime, this.duration);
          }
          
          if (this.currentTime >= this.duration) {
            this.stop();
            if (this.onEnded) this.onEnded();
            resolve();
          } else {
            requestAnimationFrame(updateTime);
          }
        }
      };

      updateTime();
    });
  }

  stop(): void {
    this.isPlaying = false;
    this.currentTime = 0;
  }

  pause(): void {
    this.isPlaying = false;
  }

  resume(): void {
    if (!this.isPlaying && this.audioContext) {
      this.isPlaying = true;
      this.startTime = this.audioContext.currentTime - (this.currentTime / 1000);
    }
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  getDuration(): number {
    return this.duration;
  }

  isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }

  setOnTimeUpdate(callback: (currentTime: number, duration: number) => void): void {
    this.onTimeUpdate = callback;
  }

  setOnEnded(callback: () => void): void {
    this.onEnded = callback;
  }

  // Cleanup
  destroy(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// Format time for display
export function formatAudioTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Generate realistic conversation audio
export function generateConversationScript(): string[] {
  return [
    "Welcome to our university orientation program. Today we'll discuss the admission process and what you need to know to apply successfully.",
    "First, let's talk about the most important quality for success in our program. Based on our experience with thousands of students, we've found that persistence and dedication are far more valuable than technical skills alone.",
    "Our program has been running for exactly ten years now, and we've helped over five thousand students achieve their academic goals.",
    "When you're ready to apply, the first step is to attend one of our orientation sessions. This will give you a complete overview of what to expect and help you prepare your application materials properly.",
    "The deadline for fall semester applications is at the end of this month. We recommend submitting your application at least two weeks before the deadline to allow time for any required corrections or additional documentation."
  ];
}