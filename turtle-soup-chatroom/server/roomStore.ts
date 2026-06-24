import type {
  CaseNote,
  ChatMessage,
  HostAnswer,
  Player,
  Puzzle,
  RoomSettlement,
  RoomSession,
  RoomState
} from "../src/shared/types";
import { parseSolutionPointDefinitions } from "./puzzleImporter";

const rooms = new Map<string, RoomState>();
const ANSWER_UNLOCK_PROGRESS = 95;

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function now() {
  return new Date().toISOString();
}

function requireRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) {
    throw new Error("房间不存在");
  }
  return room;
}

function requirePlayer(room: RoomState, playerId: string) {
  const player = room.players.find((item) => item.id === playerId);
  if (!player) {
    throw new Error("玩家不在房间内");
  }
  return player;
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizePlayer(player: Player): Player {
  return {
    ...player,
    score: player.score ?? 0,
    hits: player.hits ?? 0,
    bestDelta: player.bestDelta ?? 0
  };
}

function normalizePuzzle(puzzle: Puzzle): Puzzle {
  return {
    ...puzzle,
    solutionPoints: puzzle.solutionPoints ?? []
  };
}

function normalizeHostAnswer(answer: HostAnswer): HostAnswer {
  return {
    ...answer,
    progress: answer.progress ?? 0,
    progressDelta: answer.progressDelta ?? 0,
    contributionScore: answer.contributionScore ?? 0,
    isBreakthrough: answer.isBreakthrough ?? false
  };
}

function normalizeRoom(room: RoomState): RoomState {
  return {
    ...room,
    puzzle: normalizePuzzle(room.puzzle),
    players: room.players.map(normalizePlayer),
    hostLog: room.hostLog.map(normalizeHostAnswer),
    progress: room.progress ?? 0,
    answerUnlocked: room.answerUnlocked ?? room.status === "solved",
    truthRevealed: room.truthRevealed ?? false
  };
}

function contributionScore(progressDelta: number, crossedUnlock: boolean) {
  return progressDelta * 10 + (progressDelta >= 20 ? 50 : 0) + (crossedUnlock ? 80 : 0);
}

function progressFromCoveredPoints(puzzle: Puzzle, coveredPointIds?: string[]) {
  if (!coveredPointIds || coveredPointIds.length === 0) return undefined;
  const definitions = parseSolutionPointDefinitions(puzzle.solutionPoints);
  const totalWeight = definitions.reduce((sum, point) => sum + Math.max(point.weight, 0), 0);
  if (totalWeight <= 0) return undefined;
  const covered = new Set(coveredPointIds);
  const coveredWeight = definitions
    .filter((point) => covered.has(point.id))
    .reduce((sum, point) => sum + Math.max(point.weight, 0), 0);
  return clampProgress((coveredWeight / totalWeight) * 100);
}

function calculateSettlement(room: RoomState, unlockingPlayerId?: string): RoomSettlement {
  const mvp = [...room.players].sort((a, b) => b.score - a.score)[0];
  const bestAnswer = [...room.hostLog].sort((a, b) => b.progressDelta - a.progressDelta)[0];

  return {
    mvpPlayerId: mvp?.id,
    bestAnswerId: bestAnswer?.id,
    unlockingPlayerId: room.settlement?.unlockingPlayerId ?? unlockingPlayerId
  };
}

export function resetRooms() {
  rooms.clear();
}

export function listRooms() {
  return Array.from(rooms.values());
}

export function exportRoomsSnapshot() {
  return listRooms();
}

export function importRoomsSnapshot(nextRooms: RoomState[]) {
  rooms.clear();
  for (const room of nextRooms) {
    const normalized = normalizeRoom(room);
    rooms.set(normalized.id, normalized);
  }
}

export function getRoom(roomId: string) {
  const room = rooms.get(roomId);
  return room ? normalizeRoom(room) : undefined;
}

export function createRoom(puzzle: Puzzle, hostName: string): RoomSession {
  const host: Player = {
    id: id("player"),
    name: hostName.trim() || "访客",
    isHost: true,
    joinedAt: now(),
    score: 0,
    hits: 0,
    bestDelta: 0
  };

  const room: RoomState = {
    id: id("room"),
    puzzle,
    status: "playing",
    players: [host],
    hostLog: [],
    chatMessages: [],
    caseNotes: [],
    questionLimit: 20,
    questionsUsed: 0,
    progress: 0,
    answerUnlocked: false,
    truthRevealed: false,
    createdAt: now()
  };

  rooms.set(room.id, room);
  return { room, playerId: host.id };
}

export function joinRoom(roomId: string, playerName: string): RoomSession {
  const room = requireRoom(roomId);
  if (room.players.length >= 10) {
    throw new Error("房间已满");
  }

  const player: Player = {
    id: id("player"),
    name: playerName.trim() || "访客",
    isHost: false,
    joinedAt: now(),
    score: 0,
    hits: 0,
    bestDelta: 0
  };

  room.players.push(player);
  return { room, playerId: player.id };
}

export function rejoinRoom(roomId: string, playerId: string): RoomSession {
  const room = requireRoom(roomId);
  requirePlayer(room, playerId);
  return { room, playerId };
}

export function removePlayer(roomId: string, playerId: string): RoomState {
  const room = requireRoom(roomId);
  room.players = room.players.filter((player) => player.id !== playerId);
  if (room.players.length === 0) {
    rooms.delete(roomId);
  }
  return room;
}

export function addChatMessage(roomId: string, playerId: string, body: string): ChatMessage {
  const room = requireRoom(roomId);
  const player = requirePlayer(room, playerId);
  const message: ChatMessage = {
    id: id("chat"),
    playerId,
    playerName: player.name,
    body: body.slice(0, 500),
    createdAt: now()
  };
  room.chatMessages.push(message);
  return message;
}

export function addHostAnswer(
  roomId: string,
  answer: Omit<HostAnswer, "id" | "createdAt" | "pinned" | "progressDelta" | "contributionScore" | "isBreakthrough">
): HostAnswer {
  const room = requireRoom(roomId);
  const player = requirePlayer(room, answer.playerId);
  if (room.status === "solved") {
    throw new Error("本局已结束");
  }
  if (room.questionsUsed >= room.questionLimit && answer.answerType !== "solved" && answer.answerType !== "unsolved") {
    throw new Error("提问次数已用完");
  }

  const previousProgress = room.progress;
  const structuredProgress = progressFromCoveredPoints(room.puzzle, answer.coveredPointIds);
  const reportedProgress = structuredProgress ?? answer.progress;
  const nextProgress = Math.max(previousProgress, clampProgress(reportedProgress));
  const progressDelta = nextProgress - previousProgress;
  const crossedUnlock = previousProgress < ANSWER_UNLOCK_PROGRESS && nextProgress >= ANSWER_UNLOCK_PROGRESS;
  const score = contributionScore(progressDelta, crossedUnlock);

  const item: HostAnswer = {
    ...answer,
    id: id("answer"),
    progress: nextProgress,
    progressDelta,
    contributionScore: score,
    isBreakthrough: progressDelta >= 20 || crossedUnlock,
    pinned: false,
    coveredPointIds: answer.coveredPointIds ?? [],
    coverageConfidence: answer.coverageConfidence ?? 0,
    createdAt: now()
  };

  room.hostLog.push(item);
  room.progress = nextProgress;
  player.score += score;
  if (progressDelta > 0) {
    player.hits += 1;
    player.bestDelta = Math.max(player.bestDelta, progressDelta);
  }
  if (answer.answerType !== "solved" && answer.answerType !== "unsolved") {
    room.questionsUsed += 1;
  }
  if (answer.answerType === "solved" || room.progress >= ANSWER_UNLOCK_PROGRESS) {
    room.answerUnlocked = true;
    room.status = "solved";
    room.settlement = calculateSettlement(room, crossedUnlock ? answer.playerId : undefined);
  }
  return item;
}

export function pinAnswer(roomId: string, answerId: string): RoomState {
  const room = requireRoom(roomId);
  const answer = room.hostLog.find((item) => item.id === answerId);
  if (!answer) {
    throw new Error("问答不存在");
  }

  if (answer.pinned || room.caseNotes.some((note) => note.sourceAnswerId === answerId)) {
    answer.pinned = true;
    return room;
  }

  answer.pinned = true;
  const note: CaseNote = {
    id: id("note"),
    sourceAnswerId: answerId,
    body: `Q: ${answer.question}\nA: ${answer.answer}`,
    createdAt: now()
  };
  room.caseNotes.push(note);
  return room;
}
