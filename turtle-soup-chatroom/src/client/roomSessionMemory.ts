export interface StoredRoomSession {
  roomId: string;
  playerId: string;
  puzzleTitle?: string;
  updatedAt: string;
}

const SESSION_LIST_KEY = "turtle-room-sessions";
const MAX_SESSIONS = 5;

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function isStoredRoomSession(value: unknown): value is StoredRoomSession {
  const item = value as StoredRoomSession;
  return Boolean(item?.roomId && item?.playerId && item?.updatedAt);
}

function parseSessions(raw: string | null): StoredRoomSession[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredRoomSession);
  } catch {
    return [];
  }
}

function writeSessions(sessions: StoredRoomSession[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(SESSION_LIST_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
}

export function listRoomSessions(): StoredRoomSession[] {
  if (!canUseStorage()) return [];
  return parseSessions(window.localStorage.getItem(SESSION_LIST_KEY)).sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  );
}

export function storeRoomSession(session: Omit<StoredRoomSession, "updatedAt">): StoredRoomSession {
  const nextSession: StoredRoomSession = {
    ...session,
    updatedAt: new Date().toISOString()
  };
  const nextSessions = [
    nextSession,
    ...listRoomSessions().filter((item) => item.roomId !== session.roomId)
  ];
  writeSessions(nextSessions);
  return nextSession;
}

export function readRoomSession(roomId: string): StoredRoomSession | null {
  return listRoomSessions().find((session) => session.roomId === roomId) ?? null;
}

export function removeRoomSession(roomId: string) {
  writeSessions(listRoomSessions().filter((session) => session.roomId !== roomId));
}

export function mostRecentRoomSession(): StoredRoomSession | null {
  return listRoomSessions()[0] ?? null;
}
