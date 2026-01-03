// Room state types
export type RoomStatus = 'idle' | 'armed' | 'running' | 'stopped';

export interface RoomState {
  status: RoomStatus;
  presetId: string | null;
  lowerSec: number;
  midSec: number;
  upperSec: number;
  startedAtMs: number | null;
  beeped: boolean;
}

export interface ControllerInfo {
  lastSeenAt: number | null;
  clientId: string | null;
}

export interface Room {
  createdAt: number;
  title: string;
  state: RoomState;
  controller: ControllerInfo;
}

// Command types
export type CommandType = 'SET_PRESET' | 'START' | 'STOP' | 'RESET';

export interface SetPresetPayload {
  presetId: string;
  lowerSec: number;
  midSec: number;
  upperSec: number;
}

export interface Command {
  type: CommandType;
  payload: SetPresetPayload | Record<string, never>;
  sentAtMs: number;
  clientId: string;
}

export interface CommandWithId extends Command {
  id: string;
}

// Preset configuration
export interface Preset {
  id: string;
  label: string;
  lower: number;
  mid: number;
  upper: number;
}

// Color zones
export type ColorZone = 'neutral' | 'green' | 'amber' | 'red';

// Default presets
export const DEFAULT_PRESETS: Preset[] = [
  { id: 'p_1_2', label: '1-2 min', lower: 60, mid: 90, upper: 120 },
  { id: 'p_2_3', label: '2-3 min', lower: 120, mid: 150, upper: 180 },
  { id: 'p_4_5', label: '4-5 min', lower: 240, mid: 270, upper: 300 },
  { id: 'p_5_6', label: '5-6 min', lower: 300, mid: 330, upper: 360 },
  { id: 'p_5_7', label: '5-7 min', lower: 300, mid: 360, upper: 420 },
  { id: 'p_7_9', label: '7-9 min', lower: 420, mid: 480, upper: 540 },
];

// Initial room state
export const INITIAL_ROOM_STATE: RoomState = {
  status: 'idle',
  presetId: null,
  lowerSec: 0,
  midSec: 0,
  upperSec: 0,
  startedAtMs: null,
  beeped: false,
};
