# Testing Guide

## Testing in Claude Code for Web

This project includes a SessionStart hook that automatically configures Firebase credentials from environment variables. This allows you to test the full application in Claude Code for Web sessions.

### Step 1: Get Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create one - see INSTALLATION.md)
3. Go to Project Settings (gear icon)
4. Scroll to "Your apps" section
5. Select your web app
6. Copy the configuration values

### Step 2: Configure Environment Variables

In Claude Code for Web, set these environment variables before starting a session:

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase API key | `AIzaSyB...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain | `myproject.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Project ID | `myproject-12345` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket | `myproject.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID | `123456789` |
| `VITE_FIREBASE_APP_ID` | App ID | `1:123456789:web:abc...` |

### Step 3: Start Session

When you start a new Claude Code for Web session, the SessionStart hook will automatically:

1. Create a `.env` file with your Firebase credentials
2. Install npm dependencies (if not already installed)
3. Run TypeScript type checking
4. Build the project

You'll see output like:

```
=== Toastmasters Timer Session Setup ===
Creating .env file from environment variables...
  Created: /home/user/toastmasters-timer/.env
  Dependencies already installed
Running TypeScript type check...
  TypeScript check passed
Building project...
  Build successful
=== Session Setup Complete ===
```

### Step 4: Run Tests

After the session starts, you can run the development server:

```bash
npm run dev
```

Then test the application at:
- Display (tablet): http://localhost:3000/display/
- Control (phone): http://localhost:3000/control/

## Manual Testing

If you're not using the SessionStart hook, manually create a `.env` file:

```bash
cat > .env << 'EOF'
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
EOF
```

Then run:

```bash
npm install
npm run dev
```

## Test Scenarios

### Basic Flow Test

1. Open `/display/` on one browser tab (simulating tablet)
2. Note the room code shown below the QR code
3. Open `/control/?room=ROOMCODE` in another tab (simulating phone)
4. On controller:
   - Select a preset (e.g., "2-3 min")
   - Press "Start"
5. On display:
   - Verify timer counts up
   - Verify color transitions at thresholds
   - Verify beep at 30s overtime (requires audio unlock)

### Preset Test

Test each preset to verify correct thresholds:

| Preset | Green | Amber | Red |
|--------|-------|-------|-----|
| 1-2 min | 1:00 | 1:30 | 2:00 |
| 2-3 min | 2:00 | 2:30 | 3:00 |
| 4-5 min | 4:00 | 4:30 | 5:00 |
| 5-6 min | 5:00 | 5:30 | 6:00 |
| 5-7 min | 5:00 | 6:00 | 7:00 |
| 7-9 min | 7:00 | 8:00 | 9:00 |

### Recovery Test

1. Start a timer
2. Reload the display page
3. Verify timer continues from correct elapsed time

### Multi-Controller Test

1. Open display on one tab
2. Open controller in two separate tabs with same room code
3. Verify both controllers can send commands
4. Verify display responds to both

## Build Verification

Run these commands to verify the build:

```bash
# Type check
npm run typecheck

# Build
npm run build

# Preview built version
npm run preview
```

## Firestore Rules Test

To verify Firestore rules are working:

1. Open browser developer tools → Console
2. Start the app and create a room
3. Check for any permission errors
4. Verify commands are being written and deleted

Expected console output when working:
```
Processing command: SET_PRESET {...}
Processing command: START {...}
```

## Troubleshooting

### "Firebase: No Firebase App" Error

The `.env` file wasn't created properly. Check:
- Environment variables are set correctly
- Run the session start hook manually: `bash .claude/hooks/session-start.sh`

### "Permission denied" Firestore Error

Check Firestore rules in Firebase Console. For testing, use:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### TypeScript Errors

```bash
npm run typecheck
```

Fix any reported type errors before testing.

### Build Errors

```bash
# Clean and rebuild
rm -rf node_modules dist
npm install
npm run build
```
