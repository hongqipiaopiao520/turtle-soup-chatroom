import type {
  CaseNote,
  ChatMessage,
  HostAnswer,
  Player,
  Puzzle,
  RoomSession,
  RoomState
} from "../src/shared/types";

const rooms = new Map<string, RoomState>();

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
    rooms.set(room.id, room);
  }
}

export function getRoom(roomId: string) {
  return rooms.get(roomId);
}

export function createRoom(puzzle: Puzzle, hostName: string): RoomSession {
  const host: Player = {
    id: id("player"),
    name: hostName.trim() || "访客",
    isHost: true,
    joinedAt: now()
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
    joinedAt: now()
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
  answer: Omit<HostAnswer, "id" | "createdAt" | "pinned">
): HostAnswer {
  const room = requireRoom(roomId);
  if (room.status === "solved") {
    throw new Error("本局已结束");
  }
  if (room.questionsUsed >= room.questionLimit && answer.answerType !== "solved") {
    throw new Error("提问次数已用完");
  }

  const item: HostAnswer = {
    ...answer,
    id: id("answer"),
    pinned: false,
    createdAt: now()
  };

  room.hostLog.push(item);
  if (answer.answerType !== "solved" && answer.answerType !== "unsolved") {
    room.questionsUsed += 1;
  }
  if (answer.answerType === "solved") {
    room.status = "solved";
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
