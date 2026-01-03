import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  Unsubscribe,
  DocumentReference,
} from 'firebase/firestore';
import { getDb } from './firebase.ts';
import {
  Club,
  ClubState,
  ClubConfig,
  Command,
  CommandWithId,
  INITIAL_CLUB_STATE,
  DEFAULT_CONFIG,
} from './types.ts';

// Create a new club or load existing
export async function createClub(clubId: string): Promise<void> {
  console.log('[Firestore] createClub called with clubId:', clubId);
  const db = getDb();
  const clubRef = doc(db, 'clubs', clubId);

  const club: Club = {
    config: DEFAULT_CONFIG,
    state: INITIAL_CLUB_STATE,
    updatedAt: Date.now(),
  };

  console.log('[Firestore] Attempting setDoc with club data:', JSON.stringify(club, null, 2));
  try {
    await setDoc(clubRef, club);
    console.log('[Firestore] setDoc completed successfully');
  } catch (error) {
    console.error('[Firestore] setDoc FAILED:', error);
    throw error;
  }
}

// Get a club by ID
export async function getClub(clubId: string): Promise<Club | null> {
  const db = getDb();
  const clubRef = doc(db, 'clubs', clubId);
  const snapshot = await getDoc(clubRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as Club;
}

// Check if a club exists
export async function clubExists(clubId: string): Promise<boolean> {
  const club = await getClub(clubId);
  return club !== null;
}

// Subscribe to club changes
export function subscribeToClub(
  clubId: string,
  onUpdate: (club: Club | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  console.log('[Firestore] subscribeToClub called for clubId:', clubId);
  const db = getDb();
  const clubRef = doc(db, 'clubs', clubId);

  return onSnapshot(
    clubRef,
    (snapshot) => {
      console.log('[Firestore] Club snapshot received, exists:', snapshot.exists());
      if (snapshot.exists()) {
        console.log('[Firestore] Club data:', JSON.stringify(snapshot.data(), null, 2));
        onUpdate(snapshot.data() as Club);
      } else {
        console.log('[Firestore] Club does not exist');
        onUpdate(null);
      }
    },
    (error) => {
      console.error('[Firestore] Club subscription error:', error);
      onError?.(error);
    }
  );
}

// Update club state
export async function updateClubState(clubId: string, state: Partial<ClubState>): Promise<void> {
  const db = getDb();
  const clubRef = doc(db, 'clubs', clubId);

  // Build update object with dot notation for nested fields
  const updates: Record<string, unknown> = {
    updatedAt: Date.now(),
  };
  for (const [key, value] of Object.entries(state)) {
    updates[`state.${key}`] = value;
  }

  await updateDoc(clubRef, updates);
}

// Update club config
export async function updateClubConfig(clubId: string, config: Partial<ClubConfig>): Promise<void> {
  const db = getDb();
  const clubRef = doc(db, 'clubs', clubId);

  // Build update object with dot notation for nested fields
  const updates: Record<string, unknown> = {
    updatedAt: Date.now(),
  };
  for (const [key, value] of Object.entries(config)) {
    updates[`config.${key}`] = value;
  }

  await updateDoc(clubRef, updates);
}

// Send a command to the club
export async function sendCommand(
  clubId: string,
  command: Omit<Command, 'sentAtMs'>
): Promise<DocumentReference> {
  const db = getDb();
  const commandsRef = collection(db, 'clubs', clubId, 'commands');

  const fullCommand: Command = {
    ...command,
    sentAtMs: Date.now(),
  };

  return addDoc(commandsRef, fullCommand);
}

// Subscribe to commands (for display/tablet)
export function subscribeToCommands(
  clubId: string,
  onCommand: (commands: CommandWithId[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const db = getDb();
  const commandsRef = collection(db, 'clubs', clubId, 'commands');
  const q = query(commandsRef, orderBy('sentAtMs', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const commands: CommandWithId[] = [];
      snapshot.forEach((doc) => {
        commands.push({
          id: doc.id,
          ...(doc.data() as Command),
        });
      });
      onCommand(commands);
    },
    (error) => {
      console.error('Commands subscription error:', error);
      onError?.(error);
    }
  );
}

// Delete a processed command
export async function deleteCommand(clubId: string, commandId: string): Promise<void> {
  const db = getDb();
  const commandRef = doc(db, 'clubs', clubId, 'commands', commandId);
  await deleteDoc(commandRef);
}
