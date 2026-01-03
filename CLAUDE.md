# Toastmasters Timer - Development Guide

## Overview

A real-time timer application for Toastmasters meetings with two views:
- **Display** (tablet): Shows countdown timer with color-coded feedback
- **Control** (phone): Remote control via QR code pairing

## Architecture

### System Components

```
┌─────────────────┐         ┌─────────────────┐
│  Display Page   │         │  Control Page   │
│    (Tablet)     │         │    (Phone)      │
│                 │         │                 │
│ - Shows timer   │         │ - Preset btns   │
│ - Color zones   │         │ - Start/Stop    │
│ - Beep logic    │         │ - QR scanner    │
│ - Creates club  │         │ - Joins club    │
│ - Club setup    │         │ - Settings      │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │    Firestore Realtime     │
         └───────────┬───────────────┘
                     │
         ┌───────────▼───────────┐
         │      Firestore        │
         │                       │
         │ clubs/{clubId}        │
         │   └─ commands/        │
         └───────────────────────┘
```

### Data Flow

1. **Tablet sets up club** → Prompts for club ID or generates new, writes to Firestore, shows QR
2. **Phone scans QR** → Extracts clubId, subscribes to club
3. **Phone sends command** → Writes to `commands` subcollection
4. **Tablet processes command** → Updates club state/config, deletes command
5. **Both devices sync** → Real-time listeners update UI

### State Machine

```
     ┌──────────────────────────────────────┐
     │                                      │
     ▼                                      │
  ┌──────┐  SET_PRESET  ┌───────┐   START  ┌─────────┐
  │ idle │ ──────────▶  │ armed │ ───────▶ │ running │
  └──────┘              └───────┘          └────┬────┘
     ▲                      ▲                   │
     │         RESET        │      STOP         │
     └──────────────────────┴───────────────────┘
                            │
                            ▼
                       ┌─────────┐
                       │ stopped │
                       └─────────┘
```

Valid transitions:
- `idle` → `armed` (via SET_PRESET)
- `armed` → `running` (via START)
- `armed` → `idle` (via RESET)
- `running` → `stopped` (via STOP)
- `running` → `idle` (via RESET)
- `stopped` → `running` (via START, resumes timer)
- `stopped` → `idle` (via RESET)

## Tech Stack

- **TypeScript** - Type safety throughout
- **Vite** - Fast build and dev server
- **Firebase/Firestore** - Real-time database
- **Vanilla JS** - No framework needed for this simplicity
- **qrcode** - QR code generation
- **jsQR** - QR code scanning (fallback for BarcodeDetector)

## Project Structure

```
/
├── src/
│   ├── lib/
│   │   ├── firebase.ts      # Firebase initialization
│   │   ├── firestore.ts     # Firestore operations
│   │   ├── types.ts         # TypeScript types
│   │   ├── timer.ts         # Timer logic utilities
│   │   ├── audio.ts         # Beep audio handling
│   │   └── qr.ts            # QR generate/scan utilities
│   ├── display/
│   │   ├── index.html       # Display page HTML
│   │   ├── main.ts          # Display page logic
│   │   └── styles.css       # Display page styles
│   └── control/
│       ├── index.html       # Control page HTML
│       ├── main.ts          # Control page logic
│       └── styles.css       # Control page styles
├── public/                   # Static assets
├── CLAUDE.md                 # This file
├── INSTALLATION.md           # Setup instructions
├── package.json
├── tsconfig.json
├── vite.config.ts
└── firebase.json             # Firebase hosting config
```

## Coding Standards

### TypeScript

- Use strict mode
- Define explicit types for all Firestore documents
- Use `interface` for object shapes, `type` for unions/aliases
- Prefer `const` over `let`
- Use async/await over raw promises

### Naming Conventions

- **Files**: kebab-case (`firebase-config.ts`)
- **Types/Interfaces**: PascalCase (`ClubState`, `Command`)
- **Functions**: camelCase (`createClub`, `sendCommand`)
- **Constants**: SCREAMING_SNAKE_CASE (`DEFAULT_PRESETS`)
- **CSS classes**: kebab-case (`timer-display`, `color-green`)

### Error Handling

- Wrap Firestore operations in try/catch
- Show user-friendly error messages
- Log errors to console with context
- Never silently fail

### State Management

- Club state is the single source of truth in Firestore
- Local state only for UI concerns (camera on/off, audio unlocked)
- Tablet is authoritative for timing - writes `startedAtMs`

### Commands

Commands are append-only with immediate deletion after processing:

```typescript
interface Command {
  type: 'SET_PRESET' | 'START' | 'STOP' | 'RESET' | 'UPDATE_CONFIG';
  payload: Record<string, unknown>;
  sentAtMs: number;
  clientId: string;
}
```

Tablet processes commands in `sentAtMs` order and deletes after processing.

## Firestore Schema

### Club Document (`clubs/{clubId}`)

```typescript
interface Club {
  config: ClubConfig;
  state: ClubState;
  updatedAt: number;
}

interface ClubConfig {
  presets: Preset[];           // Available time presets
  showTimer: boolean;          // Whether to show timer digits on display
  overtimeMode: OvertimeMode;  // 'none' | 'once' | 'repeatedly'
}

interface ClubState {
  status: 'idle' | 'armed' | 'running' | 'stopped';
  presetId: string | null;
  lowerSec: number;            // Green threshold
  midSec: number;              // Yellow threshold
  upperSec: number;            // Red threshold
  startedAtMs: number | null;
  beeped: boolean;
  beepCount: number;           // For repeated beeps tracking
  seq: number;                 // Sequence number for updates
}
```

### Command Document (`clubs/{clubId}/commands/{commandId}`)

```typescript
interface Command {
  type: 'SET_PRESET' | 'START' | 'STOP' | 'RESET' | 'UPDATE_CONFIG';
  payload: SetPresetPayload | UpdateConfigPayload | Record<string, never>;
  sentAtMs: number;
  clientId: string;
}

interface SetPresetPayload {
  presetId: string;
  lowerSec: number;
  midSec: number;
  upperSec: number;
}

interface UpdateConfigPayload {
  showTimer?: boolean;
  overtimeMode?: OvertimeMode;
  presets?: Preset[];
}
```

## Timer Color Rules

Given elapsed seconds `t`:

| Status  | Condition            | Color   |
|---------|----------------------|---------|
| idle    | -                    | neutral |
| armed   | -                    | neutral |
| running | t < lower            | neutral |
| running | lower <= t < mid     | green   |
| running | mid <= t < upper     | amber   |
| running | t >= upper           | red     |
| stopped | -                    | frozen  |

## Beep Logic

Overtime alerts are controlled by `config.overtimeMode`:

- **none**: No beep triggered
- **once**: Trigger beep when `elapsed >= upperSec + 30` AND `!state.beeped`
- **repeatedly**: Beep at 30s, 60s, 120s, 180s after upper threshold (controlled by `beepCount`)

Requires user interaction to unlock audio (mobile browser restriction).

## Default Presets

```typescript
const DEFAULT_PRESETS: Preset[] = [
  { id: 'p_1_2', label: '1-2 min', lower: 60, mid: 90, upper: 120 },
  { id: 'p_2_3', label: '2-3 min', lower: 120, mid: 150, upper: 180 },
  { id: 'p_3_5', label: '3-5 min', lower: 180, mid: 240, upper: 300 },
  { id: 'p_4_6', label: '4-6 min', lower: 240, mid: 300, upper: 360 },
  { id: 'p_5_7', label: '5-7 min', lower: 300, mid: 360, upper: 420 },
];
```

## Club Setup Flow

### Display (Tablet)
1. On load, check URL for `?club=` parameter
2. If not found, check localStorage for saved club ID
3. Show club setup view: enter existing ID or create new
4. Once club is set, save to localStorage and show timer + QR code

### Control (Phone)
1. Scan QR code which contains `/control/?club={clubId}`
2. Or manually enter club ID
3. Connect to club and show controller with settings

## Settings (Phone Controller)

- **Show Timer**: Toggle timer digits visibility on display (default: true)
- **Play Overtime Alert**:
  - No: No audio alerts
  - Once: Single beep 30s after overtime (default)
  - Repeatedly: Beeps at 30s, 1m, 2m, 3m after overtime

Settings are saved to club config and synced to display in real-time.

## Security Model

- No authentication required (trusted club environment)
- Club ID acts as shared secret (user-chosen or random)
- Open Firestore rules for MVP (can add rate limiting later)
- Club IDs persist in localStorage for convenience

## Testing

### Manual Testing Checklist

1. Open display on tablet, enter club name or generate new
2. Verify QR displays with club ID
3. Scan QR on phone, verify connection
4. Toggle settings (show timer, overtime mode)
5. Select preset, verify tablet shows "armed"
6. Start timer, verify countdown and color changes
7. Stop timer, verify it pauses
8. Reset, verify return to idle
9. Reload tablet mid-timer, verify recovery
10. Test beep at overtime threshold with each mode

### Browser Testing

- Chrome/Android for BarcodeDetector API
- Safari/iOS for fallback QR scanner
- Test on actual devices for touch and camera access
