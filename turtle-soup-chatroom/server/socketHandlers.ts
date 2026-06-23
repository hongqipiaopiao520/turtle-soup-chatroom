import type { Server, Socket } from "socket.io";
import type { Puzzle } from "../src/shared/types";
import { askHost } from "./aiHost";
import { savePersistedRooms } from "./roomPersistence";
import {
  addChatMessage,
  addHostAnswer,
  createRoom,
  exportRoomsSnapshot,
  getRoom,
  joinRoom,
  pinAnswer,
  rejoinRoom,
  removePlayer
} from "./roomStore";
import type { PuzzleRepository } from "./storage/puzzleRepository";

interface SocketHandlerDependencies {
  puzzleRepository: PuzzleRepository;
}

function emitError(socket: Socket, error: unknown) {
  socket.emit("server:error", {
    message: error instanceof Error ? error.message : "未知错误"
  });
}

function persistRooms() {
  savePersistedRooms(exportRoomsSnapshot());
}

export function getPublishedPuzzleForRoom(puzzleRepository: PuzzleRepository, puzzleId: string): Puzzle {
  const puzzle = puzzleRepository.findById(puzzleId);
  if (!puzzle || puzzle.status !== "published") {
    throw new Error("题目不存在");
  }
  return puzzle;
}

export function registerSocketHandlers(io: Server, dependencies: SocketHandlerDependencies) {
  io.on("connection", (socket) => {
    socket.on("room:create", ({ puzzleId, playerName }) => {
      try {
        const puzzle = getPublishedPuzzleForRoom(dependencies.puzzleRepository, puzzleId);
        const session = createRoom(puzzle, playerName);
        const { room } = session;
        socket.join(room.id);
        persistRooms();
        socket.emit("room:session", session);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("room:join", ({ roomId, playerName }) => {
      try {
        const session = joinRoom(roomId, playerName);
        const { room } = session;
        socket.join(room.id);
        persistRooms();
        socket.emit("room:session", session);
        io.to(room.id).emit("room:state", room);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("room:rejoin", ({ roomId, playerId }) => {
      try {
        const session = rejoinRoom(roomId, playerId);
        socket.join(session.room.id);
        socket.emit("room:session", session);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("chat:send", ({ roomId, playerId, body }) => {
      try {
        addChatMessage(roomId, playerId, body);
        const room = getRoom(roomId);
        if (room) {
          persistRooms();
          io.to(room.id).emit("room:state", room);
        }
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("host:ask", async ({ roomId, playerId, question, mode }) => {
      try {
        const room = getRoom(roomId);
        if (!room) throw new Error("房间不存在");
        const player = room.players.find((item) => item.id === playerId);
        if (!player) throw new Error("玩家不在房间内");

        const decision = await askHost({
          puzzle: room.puzzle,
          history: room.hostLog.map((item) => ({
            question: item.question,
            answer: item.answer
          })),
          question,
          mode
        });

        addHostAnswer(roomId, {
          playerId,
          playerName: player.name,
          question,
          answerType: decision.answerType,
          answer: decision.answer,
          progress: decision.progress
        });

        const updated = getRoom(roomId);
        if (updated) {
          persistRooms();
          io.to(updated.id).emit("room:state", updated);
        }
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("case:pin", ({ roomId, answerId }) => {
      try {
        const room = pinAnswer(roomId, answerId);
        persistRooms();
        io.to(room.id).emit("room:state", room);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("room:leave", ({ roomId, playerId }) => {
      try {
        const room = removePlayer(roomId, playerId);
        persistRooms();
        io.to(room.id).emit("room:state", room);
      } catch (error) {
        emitError(socket, error);
      }
    });
  });
}
