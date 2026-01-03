// Club state types
export type ClubStatus = 'idle' | 'armed' | 'running' | 'stopped';

// Overtime beep mode
export type OvertimeMode = 'none' | 'once' | 'repeatedly';

// Preset configuration
export interface Preset {
  id: string;
  label: string;
  lower: number;  // seconds
  mid: number;    // seconds
  upper: number;  // seconds
}

// Club configuration (editable from phone)
export interface ClubConfig {
  presets: Preset[];
  showTimer: boolean;
  overtimeMode: OvertimeMode;
}

// Club timer state
export interface ClubState {
  status: ClubStatus;
  presetId: string | null;
  lowerSec: number;
  midSec: number;
  upperSec: number;
  startedAtMs: number | null;
  beeped: boolean;
  beepCount: number;  // For repeated beeps tracking
  seq: number;        // Sequence number for optimistic updates
}

// Full club document
export interface Club {
  config: ClubConfig;
  state: ClubState;
  updatedAt: number;
}

// Command types
export type CommandType = 'SET_PRESET' | 'START' | 'STOP' | 'RESET' | 'UPDATE_CONFIG';

export interface SetPresetPayload {
  presetId: string;
  lowerSec: number;
  midSec: number;
  upperSec: number;
}

export interface UpdateConfigPayload {
  showTimer?: boolean;
  overtimeMode?: OvertimeMode;
  presets?: Preset[];
}

export interface Command {
  type: CommandType;
  payload: SetPresetPayload | UpdateConfigPayload | Record<string, never>;
  sentAtMs: number;
  clientId: string;
}

export interface CommandWithId extends Command {
  id: string;
}

// Color zones
export type ColorZone = 'neutral' | 'green' | 'amber' | 'red';

// Default presets (matching user's request: 1-2, 2-3, 3-5, 4-6, 5-7)
export const DEFAULT_PRESETS: Preset[] = [
  { id: 'p_1_2', label: '1-2 min', lower: 60, mid: 90, upper: 120 },
  { id: 'p_2_3', label: '2-3 min', lower: 120, mid: 150, upper: 180 },
  { id: 'p_3_5', label: '3-5 min', lower: 180, mid: 240, upper: 300 },
  { id: 'p_4_6', label: '4-6 min', lower: 240, mid: 300, upper: 360 },
  { id: 'p_5_7', label: '5-7 min', lower: 300, mid: 360, upper: 420 },
];

// Default club config
export const DEFAULT_CONFIG: ClubConfig = {
  presets: DEFAULT_PRESETS,
  showTimer: true,
  overtimeMode: 'once',
};

// Initial club state
export const INITIAL_CLUB_STATE: ClubState = {
  status: 'idle',
  presetId: null,
  lowerSec: 0,
  midSec: 0,
  upperSec: 0,
  startedAtMs: null,
  beeped: false,
  beepCount: 0,
  seq: 0,
};

// Overtime beep schedule for 'repeatedly' mode (seconds after upper threshold)
export const OVERTIME_BEEP_SCHEDULE = [30, 60, 120, 180]; // 30s, 1m, 2m, 3m after overtime
