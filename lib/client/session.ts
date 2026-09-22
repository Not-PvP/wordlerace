export interface RoomSession {
  roomId: string;
  roomCode: string;
  playerId: string;
  token: string;
  displayName: string;
}

const keyFor = (roomCode: string) => `wordle-race:session:${roomCode.toUpperCase()}`;

export function saveSession(session: RoomSession) {
  try {
    localStorage.setItem(keyFor(session.roomCode), JSON.stringify(session));
  } catch {
    // Storage unavailable (private mode, etc.) — game still works, just
    // won't survive a refresh.
  }
}

export function loadSession(roomCode: string): RoomSession | null {
  try {
    const raw = localStorage.getItem(keyFor(roomCode));
    return raw ? (JSON.parse(raw) as RoomSession) : null;
  } catch {
    return null;
  }
}

export function clearSession(roomCode: string) {
  try {
    localStorage.removeItem(keyFor(roomCode));
  } catch {
    // ignore
  }
}
