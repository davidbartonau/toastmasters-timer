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
│ - Creates room  │         │ - Joins room    │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │    Firestore Realtime     │
         └───────────┬───────────────┘
                     │
         ┌───────────▼───────────┐
         │      Firestore        │
         │                       │
         │ rooms/{roomId}        │
         │   └─ commands/        │
         └───────────────────────┘
```

### Data Flow

1. **Tablet creates room** → Generates roomId, writes to Firestore, shows QR
2. **Phone scans QR** → Extracts roomId, subscribes to room
3. **Phone sends command** → Writes to `commands` subcollection
4. **Tablet processes command** → Updates room state, deletes command
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
- **Types/Interfaces**: PascalCase (`RoomState`, `Command`)
- **Functions**: camelCase (`createRoom`, `sendCommand`)
- **Constants**: SCREAMING_SNAKE_CASE (`DEFAULT_PRESETS`)
- **CSS classes**: kebab-case (`timer-display`, `color-green`)

### Error Handling

- Wrap Firestore operations in try/catch
- Show user-friendly error messages
- Log errors to console with context
- Never silently fail

### State Management

- Room state is the single source of truth in Firestore
- Local state only for UI concerns (camera on/off, audio unlocked)
- Tablet is authoritative for timing - writes `startedAtMs`

### Commands

Commands are append-only with immediate deletion after processing:

```typescript
interface Command {
  type: 'SET_PRESET' | 'START' | 'STOP' | 'RESET';
  payload: Record<string, unknown>;
  sentAtMs: number;
  clientId: string;
}
```

Tablet processes commands in `sentAtMs` order and deletes after processing.

## Firestore Schema

### Room Document (`rooms/{roomId}`)

```typescript
interface Room {
  createdAt: number;          // Timestamp ms
  title: string;              // Room title (optional display)
  state: {
    status: 'idle' | 'armed' | 'running' | 'stopped';
    presetId: string | null;
    lowerSec: number;         // Green threshold
    midSec: number;           // Yellow threshold
    upperSec: number;         // Red threshold
    startedAtMs: number | null;
    beeped: boolean;
  };
  controller: {
    lastSeenAt: number | null;
    clientId: string | null;
  };
}
```

### Command Document (`rooms/{roomId}/commands/{commandId}`)

```typescript
interface Command {
  type: 'SET_PRESET' | 'START' | 'STOP' | 'RESET';
  payload: SetPresetPayload | Record<string, never>;
  sentAtMs: number;
  clientId: string;
}

interface SetPresetPayload {
  presetId: string;
  lowerSec: number;
  midSec: number;
  upperSec: number;
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

- Trigger beep when `elapsed >= upperSec + 30` AND `!state.beeped`
- Set `state.beeped = true` after playing
- Requires user interaction to unlock audio (mobile browser restriction)

## Default Presets

```typescript
const DEFAULT_PRESETS = [
  { id: 'p_1_2', label: '1-2 min', lower: 60, mid: 90, upper: 120 },
  { id: 'p_2_3', label: '2-3 min', lower: 120, mid: 150, upper: 180 },
  { id: 'p_4_5', label: '4-5 min', lower: 240, mid: 270, upper: 300 },
  { id: 'p_5_6', label: '5-6 min', lower: 300, mid: 330, upper: 360 },
  { id: 'p_5_7', label: '5-7 min', lower: 300, mid: 360, upper: 420 },
  { id: 'p_7_9', label: '7-9 min', lower: 420, mid: 480, upper: 540 },
];
```

## Security Model

- No authentication required (trusted club environment)
- Random roomId acts as shared secret
- Open Firestore rules for MVP (can add rate limiting later)

## Testing

### Manual Testing Checklist

1. Create room on tablet, verify QR displays
2. Scan QR on phone, verify connection
3. Select preset, verify tablet shows "armed"
4. Start timer, verify countdown and color changes
5. Stop timer, verify it pauses
6. Reset, verify return to idle
7. Reload tablet mid-timer, verify recovery
8. Test beep at overtime threshold

### Browser Testing

- Chrome/Android for BarcodeDetector API
- Safari/iOS for fallback QR scanner
- Test on actual devices for touch and camera access
