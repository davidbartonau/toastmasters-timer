# Toastmasters Timer

A real-time timer application for Toastmasters meetings with two synchronized views:

- **Display (Tablet)**: Full-screen timer with color-coded feedback
- **Control (Phone)**: Remote control via QR code pairing

## Features

- QR code pairing between display and controller
- Color transitions: neutral → green → amber → red
- Preset durations: 1-2, 2-3, 4-5, 5-6, 5-7, 7-9 minutes
- Overtime beep alert (30 seconds after upper limit)
- Real-time sync via Firebase Firestore
- Timer recovery on page reload
- No authentication required (trusted club environment)

## Quick Start

```bash
# Install dependencies
npm install

# Configure Firebase (see INSTALLATION.md)
# Create .env with your Firebase config

# Start development server
npm run dev
```

Open http://localhost:3000/display/ on your tablet, then scan the QR code with your phone.

## How It Works

1. **Tablet** opens `/display` and creates a room
2. **Tablet** shows QR code with room link
3. **Phone** scans QR and opens `/control?room=ABC123`
4. **Phone** sends commands (SET_PRESET, START, STOP, RESET)
5. **Tablet** processes commands and runs the timer locally
6. Both devices stay synced via Firestore real-time listeners

## Tech Stack

- TypeScript
- Vite (build tool)
- Firebase Firestore (real-time database)
- Web Audio API (beep sounds)
- BarcodeDetector API / jsQR (QR scanning)

## Documentation

- [INSTALLATION.md](./INSTALLATION.md) - Setup and deployment guide
- [CLAUDE.md](./CLAUDE.md) - Architecture and coding standards
- [PLAN.md](./PLAN.md) - Implementation plan

## Project Structure

```
src/
├── lib/              # Shared utilities
│   ├── types.ts      # TypeScript types
│   ├── firebase.ts   # Firebase initialization
│   ├── firestore.ts  # Database operations
│   ├── timer.ts      # Timer logic
│   ├── audio.ts      # Beep sounds
│   └── qr.ts         # QR code utilities
├── display/          # Tablet display page
│   ├── index.html
│   ├── main.ts
│   └── styles.css
└── control/          # Phone control page
    ├── index.html
    ├── main.ts
    └── styles.css
```

## Scripts

```bash
npm run dev       # Start development server
npm run build     # Build for production
npm run preview   # Preview production build
npm run typecheck # Run TypeScript type check
```

## License

MIT
