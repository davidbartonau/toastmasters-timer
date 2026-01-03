// Audio context for beep generation
let audioContext: AudioContext | null = null;
let audioUnlocked = false;

// Initialize audio context
export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioContext;
}

// Check if audio is unlocked
export function isAudioUnlocked(): boolean {
  return audioUnlocked;
}

// Unlock audio (must be called from user interaction)
export async function unlockAudio(): Promise<boolean> {
  try {
    const ctx = getAudioContext();

    // Resume context if suspended
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Play a silent sound to unlock
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    gainNode.gain.value = 0; // Silent
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(0);
    oscillator.stop(0.001);

    audioUnlocked = true;
    console.log('Audio unlocked successfully');
    return true;
  } catch (error) {
    console.error('Failed to unlock audio:', error);
    return false;
  }
}

// Play a beep sound
export function playBeep(frequency: number = 800, duration: number = 0.3): void {
  if (!audioUnlocked) {
    console.warn('Audio not unlocked, beep will not play');
    return;
  }

  try {
    const ctx = getAudioContext();

    // Create oscillator
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    // Envelope: quick attack, hold, quick release
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.01); // Attack
    gainNode.gain.setValueAtTime(0.5, ctx.currentTime + duration - 0.05); // Hold
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration); // Release

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (error) {
    console.error('Failed to play beep:', error);
  }
}

// Play the overtime beep sequence (three short beeps)
export function playOvertimeBeep(): void {
  playBeep(800, 0.2);
  setTimeout(() => playBeep(800, 0.2), 300);
  setTimeout(() => playBeep(800, 0.2), 600);
}
