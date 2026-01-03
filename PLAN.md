# Implementation Plan

## Phase 1: Project Setup

### 1.1 Initialize Node.js project
- Create `package.json` with project metadata
- Add dependencies: firebase, vite, typescript, qrcode, jsqr
- Add dev dependencies: @types packages, vite plugins

### 1.2 Configure TypeScript
- Create `tsconfig.json` with strict settings
- Configure module resolution for ES modules
- Set up path aliases if needed

### 1.3 Configure Vite
- Create `vite.config.ts` for multi-page app
- Configure input entries for `/display` and `/control`
- Set up development server

### 1.4 Create directory structure
```
src/
├── lib/
├── display/
└── control/
```

## Phase 2: Core Library

### 2.1 Types (`src/lib/types.ts`)
- Define `RoomState` interface
- Define `Room` document interface
- Define `Command` interfaces for each type
- Define `Preset` interface

### 2.2 Firebase Setup (`src/lib/firebase.ts`)
- Initialize Firebase app
- Export Firestore instance
- Handle environment config (placeholder for now)

### 2.3 Firestore Operations (`src/lib/firestore.ts`)
- `createRoom(roomId)` - Create new room document
- `getRoom(roomId)` - Fetch room once
- `subscribeToRoom(roomId, callback)` - Real-time listener
- `updateRoomState(roomId, state)` - Update state
- `sendCommand(roomId, command)` - Write to commands subcollection
- `subscribeToCommands(roomId, callback)` - Listen for new commands
- `deleteCommand(roomId, commandId)` - Remove processed command

### 2.4 Timer Utilities (`src/lib/timer.ts`)
- `formatTime(seconds)` - Format as mm:ss
- `getElapsedSeconds(startedAtMs)` - Calculate elapsed
- `getColorZone(elapsed, thresholds)` - Determine current color
- `shouldBeep(elapsed, upperSec, beeped)` - Check beep condition

### 2.5 Audio Module (`src/lib/audio.ts`)
- `createAudioContext()` - Initialize Web Audio API
- `playBeep()` - Generate and play beep tone
- `unlockAudio()` - Handle mobile audio unlock

### 2.6 QR Utilities (`src/lib/qr.ts`)
- `generateQRCode(url, element)` - Create QR code image
- `initQRScanner(videoElement, onScan)` - Start camera scanning
- `extractRoomFromUrl(url)` - Parse roomId from URL

## Phase 3: Display Page (Tablet)

### 3.1 HTML Structure (`src/display/index.html`)
- Full-screen container
- Timer display (large digits)
- Status indicators
- QR code area (for room creation)
- Audio unlock overlay

### 3.2 Styles (`src/display/styles.css`)
- Full-viewport layout
- Large, readable timer font
- Color classes: neutral, green, amber, red
- Smooth color transitions
- QR code positioning

### 3.3 Display Logic (`src/display/main.ts`)
- Room creation flow:
  1. Check URL for `?room=` parameter
  2. If none, generate roomId and create room
  3. Display QR code with control URL
- Real-time subscriptions:
  1. Subscribe to room state
  2. Subscribe to commands subcollection
- Command processing:
  1. Listen for new commands
  2. Apply state transitions
  3. Delete processed commands
- Timer render loop:
  1. Calculate elapsed from `startedAtMs`
  2. Update display digits
  3. Update background color
  4. Check and trigger beep
- Audio unlock handling

## Phase 4: Control Page (Phone)

### 4.1 HTML Structure (`src/control/index.html`)
- QR scanner view (initial)
- Control panel view:
  - Preset buttons grid
  - Start button
  - Stop button
  - Reset button
- Status display (current state from room)

### 4.2 Styles (`src/control/styles.css`)
- Mobile-first layout
- Large touch-friendly buttons
- Preset button grid
- Active state indicators
- Camera viewfinder styling

### 4.3 Control Logic (`src/control/main.ts`)
- QR scanning flow:
  1. Check URL for `?room=` parameter
  2. If none, show QR scanner
  3. On scan, extract roomId and navigate
- Room connection:
  1. Subscribe to room state
  2. Show connection status
- Command sending:
  1. Preset buttons → `SET_PRESET` command
  2. Start button → `START` command
  3. Stop button → `STOP` command
  4. Reset button → `RESET` command
- UI state sync:
  1. Highlight selected preset
  2. Disable Start if no preset
  3. Show current timer status

## Phase 5: QR Code Integration

### 5.1 QR Generation (Display page)
- Use `qrcode` library
- Generate URL: `https://{host}/control?room={roomId}`
- Render as canvas or img element
- Update room ID display for manual entry fallback

### 5.2 QR Scanning (Control page)
- Try BarcodeDetector API first (Chrome/Android)
- Fall back to jsQR for other browsers
- Request camera permission
- Process video frames
- Extract URL and parse roomId

## Phase 6: Testing & Polish

### 6.1 Local Testing
- Run `npm run dev` for local server
- Test display page room creation
- Test control page QR scanning
- Test full command flow

### 6.2 Edge Cases
- Room not found handling
- Network disconnection recovery
- Timer reload recovery
- Multiple controller handling

### 6.3 UX Polish
- Loading states
- Error messages
- Connection indicators
- Haptic feedback on buttons (if available)

## Phase 7: Documentation

### 7.1 INSTALLATION.md
- Firebase project setup
- Firestore rules configuration
- Environment variables
- Deployment options (Firebase Hosting, Vercel, etc.)
- Local development instructions

### 7.2 Update README.md
- Project overview
- Quick start
- Usage instructions
- Contributing guidelines

## Commit Strategy

Each phase will be committed separately:
1. `feat: initial project setup with Vite and TypeScript`
2. `feat: add core library types and Firebase utilities`
3. `feat: implement display page for tablet`
4. `feat: implement control page for phone`
5. `feat: add QR code generation and scanning`
6. `feat: add timer logic and color transitions`
7. `feat: add audio beep functionality`
8. `docs: add INSTALLATION.md`
9. `docs: update README with usage instructions`

## Dependencies Summary

### Production
- `firebase` - Firestore SDK
- `qrcode` - QR code generation
- `jsqr` - QR code scanning fallback

### Development
- `vite` - Build tool
- `typescript` - Type safety
- `@types/qrcode` - Type definitions
