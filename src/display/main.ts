import { generateRoomId } from '../lib/firebase.ts';
import {
  createRoom,
  subscribeToRoom,
  subscribeToCommands,
  updateRoomState,
  deleteCommand,
} from '../lib/firestore.ts';
import { generateQRCode, getRoomFromCurrentUrl, buildControlUrl } from '../lib/qr.ts';
import {
  formatTime,
  getElapsedSeconds,
  getDisplayColorClass,
  getStatusText,
  shouldBeep,
  isOvertime,
} from '../lib/timer.ts';
import { unlockAudio, playOvertimeBeep, isAudioUnlocked } from '../lib/audio.ts';
import { Room, RoomState, CommandWithId, SetPresetPayload } from '../lib/types.ts';

// DOM Elements
const app = document.getElementById('app')!;
const audioUnlockOverlay = document.getElementById('audio-unlock')!;
const unlockBtn = document.getElementById('unlock-btn')!;
const timerTime = document.getElementById('timer-time')!;
const timerStatus = document.getElementById('timer-status')!;
const timerOvertime = document.getElementById('timer-overtime')!;
const qrCanvas = document.getElementById('qr-canvas') as HTMLCanvasElement;
const roomIdDisplay = document.getElementById('room-id')!;
const connectionStatus = document.getElementById('connection-status')!;
const errorDisplay = document.getElementById('error-display')!;
const errorMessage = document.getElementById('error-message')!;
const errorDismiss = document.getElementById('error-dismiss')!;

// State
let roomId: string | null = null;
let currentRoom: Room | null = null;
let processedCommandIds = new Set<string>();
let animationFrameId: number | null = null;

// Initialize the display
async function init() {
  console.log('[Display] init() started');

  // Set up audio unlock
  unlockBtn.addEventListener('click', handleAudioUnlock);
  errorDismiss.addEventListener('click', hideError);

  // Check if we already have a room from URL
  roomId = getRoomFromCurrentUrl();
  console.log('[Display] Room from URL:', roomId);

  if (roomId) {
    // Join existing room
    console.log('[Display] Joining existing room:', roomId);
    await joinRoom(roomId);
  } else {
    // Create new room
    roomId = generateRoomId();
    console.log('[Display] Creating new room:', roomId);
    await createNewRoom(roomId);
  }

  console.log('[Display] Room setup complete, roomId:', roomId);

  // Update URL without reload
  const newUrl = `${window.location.pathname}?room=${roomId}`;
  window.history.replaceState({}, '', newUrl);

  // Generate QR code for controller
  const controlUrl = buildControlUrl(roomId);
  console.log('[Display] Generating QR code for:', controlUrl);
  await generateQRCode(controlUrl, qrCanvas, { width: 150 });
  roomIdDisplay.textContent = roomId;

  // Start subscriptions
  console.log('[Display] Starting subscriptions...');
  startSubscriptions();

  // Start render loop
  console.log('[Display] Starting render loop');
  startRenderLoop();

  console.log('[Display] init() completed');
}

async function createNewRoom(id: string) {
  console.log('[Display] createNewRoom called with id:', id);
  setConnectionStatus('connecting', 'Creating room...');
  try {
    await createRoom(id);
    console.log('[Display] Room created successfully');
    setConnectionStatus('connected', 'Room created');
  } catch (error) {
    console.error('[Display] Failed to create room:', error);
    showError(`Failed to create room: ${error}`);
    setConnectionStatus('disconnected', 'Failed to create room');
  }
}

async function joinRoom(_id: string) {
  setConnectionStatus('connecting', 'Joining room...');
  // Room already exists, we'll subscribe to it via startSubscriptions
}

function startSubscriptions() {
  if (!roomId) return;

  // Subscribe to room state
  subscribeToRoom(
    roomId,
    (room) => {
      if (room) {
        currentRoom = room;
        setConnectionStatus('connected', 'Connected');
      } else {
        showError('Room not found');
        setConnectionStatus('disconnected', 'Room not found');
      }
    },
    (error) => {
      showError(`Connection error: ${error.message}`);
      setConnectionStatus('disconnected', 'Connection lost');
    }
  );

  // Subscribe to commands
  subscribeToCommands(
    roomId,
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
  if (!roomId || !currentRoom) return;

  console.log('Processing command:', command.type, command.payload);

  try {
    switch (command.type) {
      case 'SET_PRESET': {
        const payload = command.payload as SetPresetPayload;
        await updateRoomState(roomId, {
          status: 'armed',
          presetId: payload.presetId,
          lowerSec: payload.lowerSec,
          midSec: payload.midSec,
          upperSec: payload.upperSec,
          startedAtMs: null,
          beeped: false,
        });
        break;
      }

      case 'START': {
        if (currentRoom.state.status === 'armed' || currentRoom.state.status === 'stopped') {
          await updateRoomState(roomId, {
            status: 'running',
            startedAtMs: Date.now(),
            beeped: false,
          });
        }
        break;
      }

      case 'STOP': {
        if (currentRoom.state.status === 'running') {
          await updateRoomState(roomId, {
            status: 'stopped',
          });
        }
        break;
      }

      case 'RESET': {
        await updateRoomState(roomId, {
          status: 'idle',
          presetId: null,
          lowerSec: 0,
          midSec: 0,
          upperSec: 0,
          startedAtMs: null,
          beeped: false,
        });
        break;
      }
    }

    // Delete processed command
    await deleteCommand(roomId, command.id);
  } catch (error) {
    console.error('Failed to process command:', error);
  }
}

function startRenderLoop() {
  function render() {
    if (currentRoom) {
      updateDisplay(currentRoom.state);
    }
    animationFrameId = requestAnimationFrame(render);
  }
  render();
}

function updateDisplay(state: RoomState) {
  // Update background color
  const colorClass = getDisplayColorClass(state);
  app.className = `display-container ${colorClass}`;

  // Update timer
  let elapsed = 0;
  if (state.status === 'running' || state.status === 'stopped') {
    elapsed = getElapsedSeconds(state.startedAtMs);
  }
  timerTime.textContent = formatTime(elapsed);

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
    shouldBeep(elapsed, state.upperSec, state.beeped) &&
    isAudioUnlocked()
  ) {
    triggerBeep();
  }
}

async function triggerBeep() {
  if (!roomId) return;

  // Play beep sound
  playOvertimeBeep();

  // Update beeped flag in Firestore
  try {
    await updateRoomState(roomId, { beeped: true });
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
