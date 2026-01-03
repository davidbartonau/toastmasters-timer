import { ColorZone, ClubState, OvertimeMode, OVERTIME_BEEP_SCHEDULE } from './types.ts';

// Format seconds as mm:ss
export function formatTime(seconds: number): string {
  const mins = Math.floor(Math.abs(seconds) / 60);
  const secs = Math.floor(Math.abs(seconds) % 60);
  const sign = seconds < 0 ? '-' : '';
  return `${sign}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Calculate elapsed seconds from start time
export function getElapsedSeconds(startedAtMs: number | null): number {
  if (startedAtMs === null) {
    return 0;
  }
  return Math.floor((Date.now() - startedAtMs) / 1000);
}

// Determine the color zone based on elapsed time and thresholds
export function getColorZone(
  elapsed: number,
  lowerSec: number,
  midSec: number,
  upperSec: number
): ColorZone {
  if (elapsed < lowerSec) {
    return 'neutral';
  }
  if (elapsed < midSec) {
    return 'green';
  }
  if (elapsed < upperSec) {
    return 'amber';
  }
  return 'red';
}

// Check if we should trigger the beep based on overtime mode
export function shouldBeep(
  elapsed: number,
  upperSec: number,
  beeped: boolean,
  beepCount: number,
  overtimeMode: OvertimeMode
): boolean {
  if (overtimeMode === 'none') {
    return false;
  }

  const overtime = elapsed - upperSec;

  if (overtime < 30) {
    return false; // Always wait 30 seconds before first beep
  }

  if (overtimeMode === 'once') {
    return !beeped;
  }

  // 'repeatedly' mode - check against schedule
  // Schedule: 30s, 60s, 120s, 180s after upper threshold
  if (beepCount >= OVERTIME_BEEP_SCHEDULE.length) {
    return false; // Already beeped all scheduled times
  }

  const nextBeepAt = OVERTIME_BEEP_SCHEDULE[beepCount];
  return overtime >= nextBeepAt;
}

// Get display color class based on club state
export function getDisplayColorClass(state: ClubState): string {
  const { status, startedAtMs, lowerSec, midSec, upperSec } = state;

  if (status === 'idle' || status === 'armed') {
    return 'color-neutral';
  }

  if (status === 'stopped') {
    // Keep the last color when stopped
    const elapsed = getElapsedSeconds(startedAtMs);
    const zone = getColorZone(elapsed, lowerSec, midSec, upperSec);
    return `color-${zone}`;
  }

  if (status === 'running') {
    const elapsed = getElapsedSeconds(startedAtMs);
    const zone = getColorZone(elapsed, lowerSec, midSec, upperSec);
    return `color-${zone}`;
  }

  return 'color-neutral';
}

// Get status text for display
export function getStatusText(state: ClubState): string {
  switch (state.status) {
    case 'idle':
      return 'Ready';
    case 'armed':
      return `Set: ${formatPresetRange(state.lowerSec, state.upperSec)}`;
    case 'running':
      return 'Running';
    case 'stopped':
      return 'Stopped';
    default:
      return '';
  }
}

// Format preset range for display (e.g., "5-7 min")
export function formatPresetRange(lowerSec: number, upperSec: number): string {
  const lowerMin = Math.floor(lowerSec / 60);
  const upperMin = Math.floor(upperSec / 60);
  return `${lowerMin}-${upperMin} min`;
}

// Check if timer is in overtime
export function isOvertime(elapsed: number, upperSec: number): boolean {
  return elapsed >= upperSec;
}
