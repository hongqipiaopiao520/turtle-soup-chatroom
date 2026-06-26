import type {
  CaseNote,
  ChatMessage,
  HostAnswer,
  HostPending,
  HostPersonaId,
  Player,
  Puzzle,
  RoomSettlement,
  RoomStoreSession,
  RoomState
} from "../src/shared/types";
import { parseSolutionPointDefinitions } from "./puzzleImporter";

const rooms = new Map<string, RoomState>();
const ANSWER_UNLOCK_PROGRESS = 95;
const HOST_PERSONA_IDS: HostPersonaId[] = ["xiaowai", "dav", "guigui"];

export function normalizeHostPersonaId(value: unknown): HostPersonaId {
  return HOST_PERSONA_IDS.includes(value as HostPersonaId) ? (value as HostPersonaId) : "xiaowai";
}

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

function normalizeHostPending(pending?: HostPending): HostPending | undefined {
  return pending
    ? {
        ...pending,
        mode: pending.mode === "guess" ? "guess" : "question"
      }
    : undefined;
}

function normalizeRoom(room: RoomState): RoomState {
  return {
    ...room,
    hostPersonaId: normalizeHostPersonaId((room as { hostPersonaId?: unknown }).hostPersonaId),
    puzzle: normalizePuzzle(room.puzzle),
    players: room.players.map(normalizePlayer),
    hostLog: room.hostLog.map(normalizeHostAnswer),
    hostPending: normalizeHostPending(room.hostPending),
    progress: room.progress ?? 0,
    answerUnlocked: room.answerUnlocked ?? room.status === "solved",
    truthRevealed: room.truthRevealed ?? false,
    hintsRevealed: room.hintsRevealed ?? 0,
    hintRequestedBy: room.hintRequestedBy ?? [],
    revealedHints: room.revealedHints ?? []
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

function calculateSettlement(
  room: RoomState,
  unlockingPlayerId?: string,
  options: { endedBy?: "solved" | "host-reveal"; finalGuess?: string; finalGuessPlayerId?: string; finalGuessResult?: "solved" | "unsolved" } = {}
): RoomSettlement {
  const mvp = [...room.players].sort((a, b) => b.score - a.score)[0];
  const bestAnswer = [...room.hostLog].sort((a, b) => b.progressDelta - a.progressDelta)[0];
  const endedBy = options.endedBy ?? "solved";

  return {
    mvpPlayerId: mvp?.id,
    bestAnswerId: bestAnswer?.id,
    unlockingPlayerId: room.settlement?.unlockingPlayerId ?? unlockingPlayerId,
    ...(options.finalGuess ? { finalGuess: options.finalGuess } : {}),
    ...(options.finalGuessPlayerId ? { finalGuessPlayerId: options.finalGuessPlayerId } : {}),
    ...(options.finalGuessResult ? { finalGuessResult: options.finalGuessResult } : {}),
    hintsRevealed: room.hintsRevealed,
    durationMs: Date.parse(now()) - Date.parse(room.createdAt),
    endedAt: now(),
    endedBy
  };
}

export function resetRooms() {
  rooms.clear();
}

export function listRooms() {
  return Array.from(rooms.values());
}

export function exportRoomsSnapshot(): RoomState[] {
  return listRooms().map((room) => ({
    ...room,
    hostPending: undefined
  }));
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

export function createRoom(
  puzzle: Puzzle,
  hostName: string,
  options: { questionLimit?: number; hostPersonaId?: unknown } = {}
): RoomStoreSession {
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
    hostPersonaId: normalizeHostPersonaId(options.hostPersonaId),
    status: "playing",
    players: [host],
    hostLog: [],
    chatMessages: [],
    caseNotes: [],
    questionLimit: options.questionLimit === 0 ? 0 : 20,
    questionsUsed: 0,
    progress: 0,
    answerUnlocked: false,
    truthRevealed: false,
    hintsRevealed: 0,
    hintRequestedBy: [],
    revealedHints: [],
    createdAt: now()
  };

  rooms.set(room.id, room);
  return { room, playerId: host.id };
}

export function joinRoom(roomId: string, playerName: string): RoomStoreSession {
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

export function rejoinRoom(roomId: string, playerId: string): RoomStoreSession {
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
  if (
    room.questionLimit > 0 &&
    room.questionsUsed >= room.questionLimit &&
    answer.answerType !== "solved" &&
    answer.answerType !== "unsolved"
  ) {
    throw new Error("提问次数已用完");
  }

  const previousProgress = room.progress;
  const structuredProgress = progressFromCoveredPoints(room.puzzle, answer.coveredPointIds);
  const reportedProgress =
    answer.answerType === "solved" ? 100 : Math.max(structuredProgress ?? 0, answer.progress ?? 0);
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
  if (answer.answerType === "solved") {
    room.answerUnlocked = true;
    room.truthRevealed = true;
    room.status = "solved";
    room.settlement = calculateSettlement(room, answer.playerId, {
      endedBy: "solved",
      finalGuess: answer.question,
      finalGuessPlayerId: answer.playerId,
      finalGuessResult: "solved"
    });
  }
  return item;
}

export function setHostPending(
  roomId: string,
  playerId: string,
  question: string,
  mode: "question" | "guess"
): RoomState {
  const room = requireRoom(roomId);
  const player = requirePlayer(room, playerId);
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) {
    throw new Error("问题不能为空");
  }
  if (room.hostPending) {
    throw new Error("小歪正在思考中");
  }
  if (room.status === "solved") {
    throw new Error("本局已结束");
  }

  room.hostPending = {
    id: id("pending"),
    playerId,
    playerName: player.name,
    question: trimmedQuestion.slice(0, 256),
    mode,
    createdAt: now()
  };
  return room;
}

export function clearHostPending(roomId: string): RoomState {
  const room = requireRoom(roomId);
  delete room.hostPending;
  return room;
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

export function revealTruth(roomId: string, playerId: string): RoomState {
  const room = requireRoom(roomId);
  const player = requirePlayer(room, playerId);
  if (!player.isHost) {
    throw new Error("只有房主可以揭晓");
  }
  if (room.status === "solved") {
    throw new Error("本局已结束");
  }
  room.truthRevealed = true;
  room.answerUnlocked = true;
  room.status = "solved";
  room.settlement = calculateSettlement(room, undefined, { endedBy: "host-reveal" });
  return room;
}

function getPuzzleHints(puzzle: Puzzle): string[] {
  if ("hints" in puzzle && Array.isArray((puzzle as { hints?: unknown[] }).hints)) {
    return (puzzle as { hints: string[] }).hints;
  }
  return [];
}

export function revealHint(roomId: string, playerId: string): RoomState {
  const room = requireRoom(roomId);
  const player = requirePlayer(room, playerId);
  if (!player.isHost) {
    throw new Error("只有房主可以发放提示");
  }
  if (room.status === "solved") {
    throw new Error("本局已结束");
  }
  const hints = getPuzzleHints(room.puzzle);
  if (room.hintsRevealed >= hints.length) {
    throw new Error("没有更多提示了");
  }
  const nextHint = hints[room.hintsRevealed];
  room.revealedHints.push(nextHint);
  room.hintsRevealed += 1;
  room.hintRequestedBy = [];
  return room;
}

export function requestHint(roomId: string, playerId: string): RoomState {
  const room = requireRoom(roomId);
  const player = requirePlayer(room, playerId);
  if (room.status === "solved") {
    throw new Error("本局已结束");
  }
  if (!room.hintRequestedBy.includes(playerId)) {
    room.hintRequestedBy.push(playerId);
  }
  return room;
}
