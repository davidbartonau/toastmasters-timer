import { generateClientId } from '../lib/firebase.ts';
import {
  clubExists,
  subscribeToClub,
  sendCommand,
} from '../lib/firestore.ts';
import { QRScanner, extractClubFromUrl, getClubFromCurrentUrl } from '../lib/qr.ts';
import { formatTime, getElapsedSeconds } from '../lib/timer.ts';
import {
  Club,
  ClubState,
  ClubConfig,
  Preset,
  SetPresetPayload,
  UpdateConfigPayload,
  OvertimeMode,
} from '../lib/types.ts';

// DOM Elements - Scanner view
const scannerView = document.getElementById('scanner-view')!;
const scannerVideo = document.getElementById('scanner-video') as HTMLVideoElement;
const clubInput = document.getElementById('club-input') as HTMLInputElement;
const joinBtn = document.getElementById('join-btn')!;
const scannerError = document.getElementById('scanner-error')!;

// DOM Elements - Controller view
const controllerView = document.getElementById('controller-view')!;
const clubCodeDisplay = document.getElementById('club-code')!;
const statusIndicator = document.getElementById('status-indicator')!;
const statusText = document.getElementById('status-text')!;
const currentTimeDisplay = document.getElementById('current-time')!;
const presetsGrid = document.getElementById('presets-grid')!;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
const connectionIndicator = document.getElementById('connection-indicator')!;
const connectionText = document.getElementById('connection-text')!;

// DOM Elements - Settings
const settingsToggle = document.getElementById('settings-toggle')!;
const settingsPanel = document.getElementById('settings-panel')!;
const showTimerToggle = document.getElementById('show-timer-toggle') as HTMLInputElement;
const overtimeModeRadios = document.querySelectorAll('input[name="overtime-mode"]') as NodeListOf<HTMLInputElement>;

// DOM Elements - Error overlay
const errorOverlay = document.getElementById('error-overlay')!;
const errorMessage = document.getElementById('error-message')!;
const errorClose = document.getElementById('error-close')!;

// State
let clubId: string | null = null;
let clientId: string = generateClientId();
let currentClub: Club | null = null;
let selectedPresetId: string | null = null;
let qrScanner: QRScanner | null = null;
let updateInterval: number | null = null;
let settingsOpen = false;

// Initialize
async function init() {
  // Set up event listeners
  joinBtn.addEventListener('click', handleManualJoin);
  clubInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleManualJoin();
  });
  errorClose.addEventListener('click', hideError);

  // Settings toggle
  settingsToggle.addEventListener('click', toggleSettings);

  // Settings change handlers
  showTimerToggle.addEventListener('change', handleShowTimerChange);
  overtimeModeRadios.forEach(radio => {
    radio.addEventListener('change', handleOvertimeModeChange);
  });

  // Set up control button listeners
  startBtn.addEventListener('click', handleStart);
  stopBtn.addEventListener('click', handleStop);
  resetBtn.addEventListener('click', handleReset);

  // Check if club is in URL
  clubId = getClubFromCurrentUrl();

  if (clubId) {
    await connectToClub(clubId);
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

  if (clubId) {
    clubCodeDisplay.textContent = clubId;
  }

  // Start update interval for timer display
  startUpdateInterval();
}

function toggleSettings() {
  settingsOpen = !settingsOpen;
  if (settingsOpen) {
    settingsPanel.classList.remove('hidden');
    settingsToggle.classList.add('active');
  } else {
    settingsPanel.classList.add('hidden');
    settingsToggle.classList.remove('active');
  }
}

function startQRScanner() {
  qrScanner = new QRScanner(
    scannerVideo,
    async (result) => {
      const scannedClubId = extractClubFromUrl(result);
      if (scannedClubId) {
        await connectToClub(scannedClubId);
      } else {
        showScannerError('Invalid QR code');
        // Restart scanner
        startQRScanner();
      }
    },
    (error) => {
      console.error('Scanner error:', error);
      showScannerError('Camera access denied. Please enter club ID manually.');
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
  const inputClubId = clubInput.value.trim().toLowerCase();
  if (inputClubId.length < 2) {
    showScannerError('Please enter a valid club ID');
    return;
  }

  await connectToClub(inputClubId);
}

async function connectToClub(id: string) {
  clubId = id;
  hideScannerError();

  // Check if club exists
  const exists = await clubExists(id);
  if (!exists) {
    showScannerError(`Club "${id}" not found`);
    clubId = null;
    return;
  }

  // Update URL
  const newUrl = `${window.location.pathname}?club=${id}`;
  window.history.replaceState({}, '', newUrl);

  // Show controller view
  showControllerView();

  // Subscribe to club
  subscribeToClub(
    id,
    (club) => {
      if (club) {
        const isFirstLoad = currentClub === null;
        currentClub = club;
        updateUI(club.state);
        updateSettingsUI(club.config);
        if (isFirstLoad) {
          generatePresetButtons(club.config.presets);
        }
        setConnected(true);
      } else {
        showError('Club was deleted');
        setConnected(false);
      }
    },
    (error) => {
      console.error('Club subscription error:', error);
      setConnected(false);
    }
  );
}

function generatePresetButtons(presets: Preset[]) {
  presetsGrid.innerHTML = '';

  for (const preset of presets) {
    const button = document.createElement('button');
    button.className = 'preset-btn';
    button.textContent = preset.label;
    button.dataset.presetId = preset.id;
    button.addEventListener('click', () => handlePresetSelect(preset));
    presetsGrid.appendChild(button);
  }
}

function updateSettingsUI(config: ClubConfig) {
  // Update show timer toggle
  showTimerToggle.checked = config.showTimer;

  // Update overtime mode radio
  overtimeModeRadios.forEach(radio => {
    radio.checked = radio.value === config.overtimeMode;
  });
}

async function handleShowTimerChange() {
  if (!clubId) return;

  const payload: UpdateConfigPayload = {
    showTimer: showTimerToggle.checked,
  };

  try {
    await sendCommand(clubId, {
      type: 'UPDATE_CONFIG',
      payload,
      clientId,
    });
  } catch (error) {
    console.error('Failed to update showTimer:', error);
    showError('Failed to update settings');
  }
}

async function handleOvertimeModeChange() {
  if (!clubId) return;

  const selectedRadio = document.querySelector('input[name="overtime-mode"]:checked') as HTMLInputElement;
  if (!selectedRadio) return;

  const payload: UpdateConfigPayload = {
    overtimeMode: selectedRadio.value as OvertimeMode,
  };

  try {
    await sendCommand(clubId, {
      type: 'UPDATE_CONFIG',
      payload,
      clientId,
    });
  } catch (error) {
    console.error('Failed to update overtimeMode:', error);
    showError('Failed to update settings');
  }
}

async function handlePresetSelect(preset: Preset) {
  if (!clubId) return;

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
    await sendCommand(clubId, {
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
  if (!clubId) return;

  try {
    await sendCommand(clubId, {
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
  if (!clubId) return;

  try {
    await sendCommand(clubId, {
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
  if (!clubId) return;

  selectedPresetId = null;
  updatePresetSelection();

  try {
    await sendCommand(clubId, {
      type: 'RESET',
      payload: {},
      clientId,
    });
  } catch (error) {
    console.error('Failed to send RESET command:', error);
    showError('Failed to reset timer');
  }
}

function updateUI(state: ClubState) {
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

  // Update selected preset from club state
  if (state.presetId && state.presetId !== selectedPresetId) {
    selectedPresetId = state.presetId;
    updatePresetSelection();
  }

  // Update button states
  updateButtonStates(state);
}

function updateButtonStates(state: ClubState) {
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
    if (currentClub && currentClub.state.status === 'running') {
      const elapsed = getElapsedSeconds(currentClub.state.startedAtMs);
      currentTimeDisplay.textContent = formatTime(elapsed);
    } else if (currentClub && currentClub.state.status === 'stopped') {
      const elapsed = getElapsedSeconds(currentClub.state.startedAtMs);
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
