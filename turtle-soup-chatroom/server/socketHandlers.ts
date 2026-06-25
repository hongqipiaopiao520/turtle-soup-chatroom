import type { Server, Socket } from "socket.io";
import type { Puzzle } from "../src/shared/types";
import { askHost } from "./aiHost";
import {
  addChatMessage,
  addHostAnswer,
  clearHostPending,
  createRoom,
  exportRoomsSnapshot,
  getRoom,
  joinRoom,
  pinAnswer,
  rejoinRoom,
  removePlayer,
  setHostPending
} from "./roomStore";
import type { PuzzleRepository } from "./storage/puzzleRepository";
import type { RoomRepository } from "./storage/roomRepository";

interface SocketHandlerDependencies {
  puzzleRepository: PuzzleRepository;
  roomRepository: RoomRepository;
}

function emitError(socket: Socket, error: unknown) {
  socket.emit("server:error", {
    message: error instanceof Error ? error.message : "未知错误"
  });
}

function persistRooms(roomRepository: RoomRepository) {
  roomRepository.saveAll(exportRoomsSnapshot());
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
    socket.on("room:create", ({ puzzleId, playerName, questionLimit }) => {
      try {
        const puzzle = getPublishedPuzzleForRoom(dependencies.puzzleRepository, puzzleId);
        const session = createRoom(puzzle, playerName, {
          questionLimit: questionLimit === 0 ? 0 : undefined
        });
        const { room } = session;
        socket.join(room.id);
        persistRooms(dependencies.roomRepository);
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
        persistRooms(dependencies.roomRepository);
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
          persistRooms(dependencies.roomRepository);
          io.to(room.id).emit("room:state", room);
        }
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("host:ask", async ({ roomId, playerId, question, mode }) => {
      let pendingId: string | undefined;
      try {
        const pendingRoom = setHostPending(roomId, playerId, question, mode === "guess" ? "guess" : "question");
        pendingId = pendingRoom.hostPending?.id;
        persistRooms(dependencies.roomRepository);
        io.to(pendingRoom.id).emit("room:state", pendingRoom);

        const decision = await askHost({
          puzzle: pendingRoom.puzzle,
          history: pendingRoom.hostLog.map((item) => ({
            question: item.question,
            answer: item.answer
          })),
          question: pendingRoom.hostPending?.question ?? question,
          mode: pendingRoom.hostPending?.mode ?? "question",
          currentProgress: pendingRoom.progress
        });

        addHostAnswer(roomId, {
          playerId,
          playerName: pendingRoom.hostPending?.playerName ?? "",
          question: pendingRoom.hostPending?.question ?? question,
          answerType: decision.answerType,
          answer: decision.answer,
          progress: decision.progress,
          coveredPointIds: decision.coveredPointIds,
          coverageConfidence: decision.coverageConfidence
        });
        clearHostPending(roomId);

        const updated = getRoom(roomId);
        if (updated) {
          persistRooms(dependencies.roomRepository);
          io.to(updated.id).emit("room:state", updated);
        }
      } catch (error) {
        const room = getRoom(roomId);
        if (room?.hostPending && room.hostPending.id === pendingId) {
          const updated = clearHostPending(roomId);
          persistRooms(dependencies.roomRepository);
          io.to(updated.id).emit("room:state", updated);
        }
        emitError(socket, error);
      }
    });

    socket.on("case:pin", ({ roomId, answerId }) => {
      try {
        const room = pinAnswer(roomId, answerId);
        persistRooms(dependencies.roomRepository);
        io.to(room.id).emit("room:state", room);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("room:leave", ({ roomId, playerId }) => {
      try {
        socket.leave(roomId);
        const room = removePlayer(roomId, playerId);
        if (room.players.length === 0) {
          dependencies.roomRepository.remove(roomId);
        } else {
          persistRooms(dependencies.roomRepository);
          io.to(room.id).emit("room:state", room);
        }
      } catch (error) {
        emitError(socket, error);
      }
    });
  });
}
