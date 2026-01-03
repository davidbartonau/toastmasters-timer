import { generateClientId } from '../lib/firebase.ts';
import {
  roomExists,
  subscribeToRoom,
  sendCommand,
  updateControllerInfo,
} from '../lib/firestore.ts';
import { QRScanner, extractRoomFromUrl, getRoomFromCurrentUrl } from '../lib/qr.ts';
import { formatTime, getElapsedSeconds } from '../lib/timer.ts';
import { Room, RoomState, DEFAULT_PRESETS, SetPresetPayload } from '../lib/types.ts';

// DOM Elements - Scanner view
const scannerView = document.getElementById('scanner-view')!;
const scannerVideo = document.getElementById('scanner-video') as HTMLVideoElement;
const roomInput = document.getElementById('room-input') as HTMLInputElement;
const joinBtn = document.getElementById('join-btn')!;
const scannerError = document.getElementById('scanner-error')!;

// DOM Elements - Controller view
const controllerView = document.getElementById('controller-view')!;
const roomCodeDisplay = document.getElementById('room-code')!;
const statusIndicator = document.getElementById('status-indicator')!;
const statusText = document.getElementById('status-text')!;
const currentTimeDisplay = document.getElementById('current-time')!;
const presetsGrid = document.getElementById('presets-grid')!;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
const connectionIndicator = document.getElementById('connection-indicator')!;
const connectionText = document.getElementById('connection-text')!;

// DOM Elements - Error overlay
const errorOverlay = document.getElementById('error-overlay')!;
const errorMessage = document.getElementById('error-message')!;
const errorClose = document.getElementById('error-close')!;

// State
let roomId: string | null = null;
let clientId: string = generateClientId();
let currentRoom: Room | null = null;
let selectedPresetId: string | null = null;
let qrScanner: QRScanner | null = null;
let updateInterval: number | null = null;

// Initialize
async function init() {
  // Set up event listeners
  joinBtn.addEventListener('click', handleManualJoin);
  roomInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleManualJoin();
  });
  errorClose.addEventListener('click', hideError);

  // Generate preset buttons
  generatePresetButtons();

  // Set up control button listeners
  startBtn.addEventListener('click', handleStart);
  stopBtn.addEventListener('click', handleStop);
  resetBtn.addEventListener('click', handleReset);

  // Check if room is in URL
  roomId = getRoomFromCurrentUrl();

  if (roomId) {
    await connectToRoom(roomId);
  } else {
    showScannerView();
  }
}

function showScannerView() {
  scannerView.classList.remove('hidden');
  controllerView.classList.add('hidden');
  startQRScanner();
}

function showControllerView() {
  scannerView.classList.add('hidden');
  controllerView.classList.remove('hidden');
  stopQRScanner();

  if (roomId) {
    roomCodeDisplay.textContent = roomId;
  }

  // Start update interval for timer display
  startUpdateInterval();
}

function startQRScanner() {
  qrScanner = new QRScanner(
    scannerVideo,
    async (result) => {
      const scannedRoomId = extractRoomFromUrl(result);
      if (scannedRoomId) {
        await connectToRoom(scannedRoomId);
      } else {
        showScannerError('Invalid QR code');
        // Restart scanner
        startQRScanner();
      }
    },
    (error) => {
      console.error('Scanner error:', error);
      showScannerError('Camera access denied. Please enter room code manually.');
    }
  );

  qrScanner.start();
}

function stopQRScanner() {
  if (qrScanner) {
    qrScanner.stop();
    qrScanner = null;
  }
}

async function handleManualJoin() {
  const inputRoomId = roomInput.value.trim().toUpperCase();
  if (inputRoomId.length < 4) {
    showScannerError('Please enter a valid room code');
    return;
  }

  await connectToRoom(inputRoomId);
}

async function connectToRoom(id: string) {
  roomId = id;
  hideScannerError();

  // Check if room exists
  const exists = await roomExists(id);
  if (!exists) {
    showScannerError(`Room "${id}" not found`);
    roomId = null;
    return;
  }

  // Update URL
  const newUrl = `${window.location.pathname}?room=${id}`;
  window.history.replaceState({}, '', newUrl);

  // Show controller view
  showControllerView();

  // Subscribe to room
  subscribeToRoom(
    id,
    (room) => {
      if (room) {
        currentRoom = room;
        updateUI(room.state);
        setConnected(true);
      } else {
        showError('Room was deleted');
        setConnected(false);
      }
    },
    (error) => {
      console.error('Room subscription error:', error);
      setConnected(false);
    }
  );

  // Update controller presence
  try {
    await updateControllerInfo(id, clientId);
  } catch (error) {
    console.error('Failed to update controller info:', error);
  }
}

function generatePresetButtons() {
  presetsGrid.innerHTML = '';

  for (const preset of DEFAULT_PRESETS) {
    const button = document.createElement('button');
    button.className = 'preset-btn';
    button.textContent = preset.label;
    button.dataset.presetId = preset.id;
    button.addEventListener('click', () => handlePresetSelect(preset));
    presetsGrid.appendChild(button);
  }
}

async function handlePresetSelect(preset: (typeof DEFAULT_PRESETS)[number]) {
  if (!roomId) return;

  selectedPresetId = preset.id;

  // Update UI immediately
  updatePresetSelection();

  // Send command
  const payload: SetPresetPayload = {
    presetId: preset.id,
    lowerSec: preset.lower,
    midSec: preset.mid,
    upperSec: preset.upper,
  };

  try {
    await sendCommand(roomId, {
      type: 'SET_PRESET',
      payload,
      clientId,
    });
  } catch (error) {
    console.error('Failed to send SET_PRESET command:', error);
    showError('Failed to set preset');
  }
}

function updatePresetSelection() {
  const buttons = presetsGrid.querySelectorAll('.preset-btn');
  buttons.forEach((btn) => {
    const button = btn as HTMLButtonElement;
    if (button.dataset.presetId === selectedPresetId) {
      button.classList.add('selected');
    } else {
      button.classList.remove('selected');
    }
  });
}

async function handleStart() {
  if (!roomId) return;

  try {
    await sendCommand(roomId, {
      type: 'START',
      payload: {},
      clientId,
    });
  } catch (error) {
    console.error('Failed to send START command:', error);
    showError('Failed to start timer');
  }
}

async function handleStop() {
  if (!roomId) return;

  try {
    await sendCommand(roomId, {
      type: 'STOP',
      payload: {},
      clientId,
    });
  } catch (error) {
    console.error('Failed to send STOP command:', error);
    showError('Failed to stop timer');
  }
}

async function handleReset() {
  if (!roomId) return;

  selectedPresetId = null;
  updatePresetSelection();

  try {
    await sendCommand(roomId, {
      type: 'RESET',
      payload: {},
      clientId,
    });
  } catch (error) {
    console.error('Failed to send RESET command:', error);
    showError('Failed to reset timer');
  }
}

function updateUI(state: RoomState) {
  // Update status indicator
  statusIndicator.className = `status-indicator ${state.status}`;

  // Update status text
  switch (state.status) {
    case 'idle':
      statusText.textContent = 'Ready';
      break;
    case 'armed':
      statusText.textContent = 'Preset set';
      break;
    case 'running':
      statusText.textContent = 'Running';
      break;
    case 'stopped':
      statusText.textContent = 'Stopped';
      break;
  }

  // Update selected preset from room state
  if (state.presetId && state.presetId !== selectedPresetId) {
    selectedPresetId = state.presetId;
    updatePresetSelection();
  }

  // Update button states
  updateButtonStates(state);
}

function updateButtonStates(state: RoomState) {
  switch (state.status) {
    case 'idle':
      startBtn.disabled = true;
      stopBtn.disabled = true;
      resetBtn.disabled = true;
      break;
    case 'armed':
      startBtn.disabled = false;
      stopBtn.disabled = true;
      resetBtn.disabled = false;
      break;
    case 'running':
      startBtn.disabled = true;
      stopBtn.disabled = false;
      resetBtn.disabled = false;
      break;
    case 'stopped':
      startBtn.disabled = false;
      stopBtn.disabled = true;
      resetBtn.disabled = false;
      break;
  }

  // Disable presets while running
  const presetButtons = presetsGrid.querySelectorAll('.preset-btn') as NodeListOf<HTMLButtonElement>;
  presetButtons.forEach((btn) => {
    btn.disabled = state.status === 'running';
  });
}

function startUpdateInterval() {
  // Update timer display every 250ms
  updateInterval = window.setInterval(() => {
    if (currentRoom && currentRoom.state.status === 'running') {
      const elapsed = getElapsedSeconds(currentRoom.state.startedAtMs);
      currentTimeDisplay.textContent = formatTime(elapsed);
    } else if (currentRoom && currentRoom.state.status === 'stopped') {
      const elapsed = getElapsedSeconds(currentRoom.state.startedAtMs);
      currentTimeDisplay.textContent = formatTime(elapsed);
    } else {
      currentTimeDisplay.textContent = '--:--';
    }
  }, 250);
}

function setConnected(connected: boolean) {
  if (connected) {
    connectionIndicator.classList.remove('disconnected');
    connectionText.textContent = 'Connected';
  } else {
    connectionIndicator.classList.add('disconnected');
    connectionText.textContent = 'Disconnected';
  }
}

function showScannerError(message: string) {
  scannerError.textContent = message;
  scannerError.classList.remove('hidden');
}

function hideScannerError() {
  scannerError.classList.add('hidden');
}

function showError(message: string) {
  errorMessage.textContent = message;
  errorOverlay.classList.remove('hidden');
}

function hideError() {
  errorOverlay.classList.add('hidden');
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  stopQRScanner();
  if (updateInterval) {
    clearInterval(updateInterval);
  }
});

// Start the app
init().catch((error) => {
  console.error('Failed to initialize:', error);
  showError(`Failed to initialize: ${error}`);
});
