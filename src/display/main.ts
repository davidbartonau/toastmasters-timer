import { generateRoomId } from '../lib/firebase.ts';
import {
  createClub,
  getClub,
  subscribeToClub,
  subscribeToCommands,
  updateClubState,
  updateClubConfig,
  deleteCommand,
} from '../lib/firestore.ts';
import { generateQRCode, getClubFromCurrentUrl, buildControlUrl } from '../lib/qr.ts';
import {
  formatTime,
  getElapsedSeconds,
  getDisplayColorClass,
  getStatusText,
  shouldBeep,
  isOvertime,
} from '../lib/timer.ts';
import { unlockAudio, playOvertimeBeep, isAudioUnlocked } from '../lib/audio.ts';
import { Club, CommandWithId, SetPresetPayload, UpdateConfigPayload } from '../lib/types.ts';

// DOM Elements - Club Setup
const clubSetup = document.getElementById('club-setup')!;
const clubInput = document.getElementById('club-input') as HTMLInputElement;
const joinClubBtn = document.getElementById('join-club-btn')!;
const createClubBtn = document.getElementById('create-club-btn')!;
const setupError = document.getElementById('setup-error')!;

// DOM Elements - Timer Display
const app = document.getElementById('app')!;
const audioUnlockOverlay = document.getElementById('audio-unlock')!;
const unlockBtn = document.getElementById('unlock-btn')!;
const timerDisplay = document.getElementById('timer-display')!;
const timerTime = document.getElementById('timer-time')!;
const timerStatus = document.getElementById('timer-status')!;
const timerOvertime = document.getElementById('timer-overtime')!;
const qrSection = document.getElementById('qr-section')!;
const qrCanvas = document.getElementById('qr-canvas') as HTMLCanvasElement;
const clubIdDisplay = document.getElementById('club-id-display')!;
const connectionStatus = document.getElementById('connection-status')!;
const errorDisplay = document.getElementById('error-display')!;
const errorMessage = document.getElementById('error-message')!;
const errorDismiss = document.getElementById('error-dismiss')!;

// State
let clubId: string | null = null;
let currentClub: Club | null = null;
let processedCommandIds = new Set<string>();
let animationFrameId: number | null = null;

// Initialize the display
async function init() {
  console.log('[Display] init() started');

  // Set up event listeners
  unlockBtn.addEventListener('click', handleAudioUnlock);
  errorDismiss.addEventListener('click', hideError);
  joinClubBtn.addEventListener('click', handleJoinClub);
  createClubBtn.addEventListener('click', handleCreateClub);
  clubInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleJoinClub();
  });

  // Check if club is in URL
  clubId = getClubFromCurrentUrl();
  console.log('[Display] Club from URL:', clubId);

  if (clubId) {
    // Try to load existing club
    await loadClub(clubId);
  } else {
    // Check localStorage for saved club
    const savedClubId = localStorage.getItem('toastmasters-club-id');
    if (savedClubId) {
      clubInput.value = savedClubId;
    }
    // Show setup view
    showSetupView();
  }

  console.log('[Display] init() completed');
}

function showSetupView() {
  clubSetup.classList.remove('hidden');
  timerDisplay.classList.add('hidden');
  qrSection.classList.add('hidden');
  connectionStatus.classList.add('hidden');
  audioUnlockOverlay.classList.add('hidden');
}

function showTimerView() {
  clubSetup.classList.add('hidden');
  timerDisplay.classList.remove('hidden');
  qrSection.classList.remove('hidden');
  connectionStatus.classList.remove('hidden');
  audioUnlockOverlay.classList.remove('hidden');
}

function showSetupError(message: string) {
  setupError.textContent = message;
  setupError.classList.remove('hidden');
}

function hideSetupError() {
  setupError.classList.add('hidden');
}

// Generate a URL-friendly club ID
function generateClubId(): string {
  // Generate a random 6-character alphanumeric ID
  return generateRoomId().toLowerCase();
}

// Normalize club ID for consistency
function normalizeClubId(id: string): string {
  // Remove leading/trailing whitespace, convert to lowercase, replace spaces with dashes
  return id.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function handleJoinClub() {
  hideSetupError();

  const inputId = normalizeClubId(clubInput.value);
  if (!inputId || inputId.length < 2) {
    showSetupError('Please enter a valid club ID');
    return;
  }

  await loadClub(inputId);
}

async function handleCreateClub() {
  hideSetupError();

  let newClubId: string;

  // Use the input value if provided, otherwise generate one
  const inputId = normalizeClubId(clubInput.value);
  if (inputId && inputId.length >= 2) {
    newClubId = inputId;
  } else {
    newClubId = generateClubId();
  }

  // Check if club already exists
  const existingClub = await getClub(newClubId);
  if (existingClub) {
    showSetupError(`Club "${newClubId}" already exists. Use "Join Club" instead.`);
    clubInput.value = newClubId;
    return;
  }

  // Create new club
  try {
    await createClub(newClubId);
    console.log('[Display] Created new club:', newClubId);
    await loadClub(newClubId);
  } catch (error) {
    console.error('[Display] Failed to create club:', error);
    showSetupError(`Failed to create club: ${error}`);
  }
}

async function loadClub(id: string) {
  clubId = id;
  hideSetupError();

  console.log('[Display] Loading club:', id);
  setConnectionStatus('connecting', 'Connecting...');

  // Check if club exists
  const club = await getClub(id);
  if (!club) {
    showSetupError(`Club "${id}" not found. Create it first.`);
    clubId = null;
    showSetupView();
    return;
  }

  // Save to localStorage
  localStorage.setItem('toastmasters-club-id', id);

  // Update URL
  const newUrl = `${window.location.pathname}?club=${id}`;
  window.history.replaceState({}, '', newUrl);

  // Show timer view
  showTimerView();

  // Generate QR code
  const controlUrl = buildControlUrl(id);
  console.log('[Display] Generating QR code for:', controlUrl);
  await generateQRCode(controlUrl, qrCanvas, { width: 150 });
  clubIdDisplay.textContent = id;

  // Start subscriptions
  startSubscriptions();

  // Start render loop
  startRenderLoop();

  setConnectionStatus('connected', 'Connected');
}

function startSubscriptions() {
  if (!clubId) return;

  // Subscribe to club state
  subscribeToClub(
    clubId,
    (club) => {
      if (club) {
        currentClub = club;
        setConnectionStatus('connected', 'Connected');
      } else {
        showError('Club not found');
        setConnectionStatus('disconnected', 'Club not found');
      }
    },
    (error) => {
      showError(`Connection error: ${error.message}`);
      setConnectionStatus('disconnected', 'Connection lost');
    }
  );

  // Subscribe to commands
  subscribeToCommands(
    clubId,
    async (commands) => {
      for (const command of commands) {
        if (!processedCommandIds.has(command.id)) {
          await processCommand(command);
          processedCommandIds.add(command.id);
        }
      }
    },
    (error) => {
      console.error('Commands subscription error:', error);
    }
  );
}

async function processCommand(command: CommandWithId) {
  if (!clubId || !currentClub) return;

  console.log('Processing command:', command.type, command.payload);

  try {
    switch (command.type) {
      case 'SET_PRESET': {
        const payload = command.payload as SetPresetPayload;
        await updateClubState(clubId, {
          status: 'armed',
          presetId: payload.presetId,
          lowerSec: payload.lowerSec,
          midSec: payload.midSec,
          upperSec: payload.upperSec,
          startedAtMs: null,
          beeped: false,
          beepCount: 0,
        });
        break;
      }

      case 'START': {
        if (currentClub.state.status === 'armed' || currentClub.state.status === 'stopped') {
          await updateClubState(clubId, {
            status: 'running',
            startedAtMs: Date.now(),
            beeped: false,
            beepCount: 0,
          });
        }
        break;
      }

      case 'STOP': {
        if (currentClub.state.status === 'running') {
          await updateClubState(clubId, {
            status: 'stopped',
          });
        }
        break;
      }

      case 'RESET': {
        await updateClubState(clubId, {
          status: 'idle',
          presetId: null,
          lowerSec: 0,
          midSec: 0,
          upperSec: 0,
          startedAtMs: null,
          beeped: false,
          beepCount: 0,
        });
        break;
      }

      case 'UPDATE_CONFIG': {
        const payload = command.payload as UpdateConfigPayload;
        await updateClubConfig(clubId, payload);
        break;
      }
    }

    // Delete processed command
    await deleteCommand(clubId, command.id);
  } catch (error) {
    console.error('Failed to process command:', error);
  }
}

function startRenderLoop() {
  function render() {
    if (currentClub) {
      updateDisplay(currentClub);
    }
    animationFrameId = requestAnimationFrame(render);
  }
  render();
}

function updateDisplay(club: Club) {
  const { state, config } = club;

  // Update background color
  const colorClass = getDisplayColorClass(state);
  app.className = `display-container ${colorClass}`;

  // Update timer (only if showTimer is enabled in config)
  let elapsed = 0;
  if (state.status === 'running' || state.status === 'stopped') {
    elapsed = getElapsedSeconds(state.startedAtMs);
  }

  if (config.showTimer) {
    timerTime.textContent = formatTime(elapsed);
    timerTime.classList.remove('hidden');
  } else {
    timerTime.classList.add('hidden');
  }

  // Update status
  timerStatus.textContent = getStatusText(state);

  // Update overtime indicator
  if (state.status === 'running' && isOvertime(elapsed, state.upperSec)) {
    const overtime = elapsed - state.upperSec;
    timerOvertime.textContent = `+${formatTime(overtime)} overtime`;
    timerOvertime.classList.add('visible');
  } else {
    timerOvertime.classList.remove('visible');
  }

  // Check for beep
  if (
    state.status === 'running' &&
    shouldBeep(elapsed, state.upperSec, state.beeped, state.beepCount, config.overtimeMode) &&
    isAudioUnlocked()
  ) {
    triggerBeep();
  }
}

async function triggerBeep() {
  if (!clubId || !currentClub) return;

  // Play beep sound
  playOvertimeBeep();

  // Update beep state in Firestore
  try {
    const newBeepCount = currentClub.state.beepCount + 1;
    await updateClubState(clubId, {
      beeped: true,
      beepCount: newBeepCount,
    });
  } catch (error) {
    console.error('Failed to update beeped state:', error);
  }
}

async function handleAudioUnlock() {
  const success = await unlockAudio();
  if (success) {
    audioUnlockOverlay.classList.add('hidden');
  }
}

function setConnectionStatus(
  status: 'connecting' | 'connected' | 'disconnected',
  text: string
) {
  connectionStatus.className = `connection-status ${status}`;
  connectionStatus.querySelector('.status-text')!.textContent = text;
}

function showError(message: string) {
  errorMessage.textContent = message;
  errorDisplay.classList.remove('hidden');
}

function hideError() {
  errorDisplay.classList.add('hidden');
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
});

// Start the app
init().catch((error) => {
  console.error('Failed to initialize:', error);
  showError(`Failed to initialize: ${error}`);
});
