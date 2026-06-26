import type { Server, Socket } from "socket.io";
import type { Puzzle } from "../src/shared/types";
import { askHost, calculateStylePolicy, isHostErrorDecision } from "./aiHost";
import {
  addChatMessage,
  addHostAnswer,
  clearHostPending,
  createRoom,
  getRoom,
  joinRoom,
  pinAnswer,
  rejoinRoom,
  removePlayer,
  requestHint,
  revealHint,
  revealTruth,
  setHostPending
} from "./roomStore";
import { toPublicRoomState } from "./roomSerializer";
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

export function getPublishedPuzzleForRoom(puzzleRepository: PuzzleRepository, puzzleId: string): Puzzle {
  const puzzle = puzzleRepository.findById(puzzleId);
  if (!puzzle || puzzle.status !== "published") {
    throw new Error("题目不存在");
  }
  return puzzle;
}

export function registerSocketHandlers(io: Server, dependencies: SocketHandlerDependencies) {
  io.on("connection", (socket) => {
    socket.on("room:create", ({ puzzleId, playerName, questionLimit, hostPersonaId }) => {
      try {
        const puzzle = getPublishedPuzzleForRoom(dependencies.puzzleRepository, puzzleId);
        const session = createRoom(puzzle, playerName, {
          questionLimit: questionLimit === 0 ? 0 : undefined,
          hostPersonaId
        });
        const { room, playerId } = session;
        socket.join(room.id);
        dependencies.roomRepository.save(room);
        socket.emit("room:session", { room: toPublicRoomState(room), playerId });
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("room:join", ({ roomId, playerName }) => {
      try {
        const session = joinRoom(roomId, playerName);
        const { room, playerId } = session;
        socket.join(room.id);
        dependencies.roomRepository.save(room);
        socket.emit("room:session", { room: toPublicRoomState(room), playerId });
        io.to(room.id).emit("room:state", toPublicRoomState(room));
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("room:rejoin", ({ roomId, playerId }) => {
      try {
        const session = rejoinRoom(roomId, playerId);
        socket.join(session.room.id);
        socket.emit("room:session", { room: toPublicRoomState(session.room), playerId: session.playerId });
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("chat:send", ({ roomId, playerId, body }) => {
      try {
        addChatMessage(roomId, playerId, body);
        const room = getRoom(roomId);
        if (room) {
          dependencies.roomRepository.save(room);
          io.to(room.id).emit("room:state", toPublicRoomState(room));
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
        dependencies.roomRepository.save(pendingRoom);
        io.to(pendingRoom.id).emit("room:state", toPublicRoomState(pendingRoom));

        const stylePolicy = calculateStylePolicy({
          mode: pendingRoom.hostPending?.mode ?? "question",
          currentProgress: pendingRoom.progress
        });

        const decision = await askHost({
          puzzle: pendingRoom.puzzle,
          history: pendingRoom.hostLog.map((item) => ({
            question: item.question,
            answer: item.answer
          })),
          question: pendingRoom.hostPending?.question ?? question,
          mode: pendingRoom.hostPending?.mode ?? "question",
          currentProgress: pendingRoom.progress,
          hostPersonaId: pendingRoom.hostPersonaId,
          stylePolicy
        });

        if (isHostErrorDecision(decision)) {
          clearHostPending(roomId);
          const updated = getRoom(roomId);
          if (updated) {
            dependencies.roomRepository.save(updated);
            io.to(updated.id).emit("room:state", toPublicRoomState(updated));
          }
          socket.emit("server:error", { message: decision.answer });
          return;
        }

        addHostAnswer(roomId, {
          playerId,
          playerName: pendingRoom.hostPending?.playerName ?? "",
          question: pendingRoom.hostPending?.question ?? question,
          answerType: decision.answerType,
          answer: decision.answer,
          styleText: decision.styleText,
          progress: decision.progress,
          coveredPointIds: decision.coveredPointIds,
          coverageConfidence: decision.coverageConfidence
        });
        clearHostPending(roomId);

        const updated = getRoom(roomId);
        if (updated) {
          dependencies.roomRepository.save(updated);
          io.to(updated.id).emit("room:state", toPublicRoomState(updated));
        }
      } catch (error) {
        const room = getRoom(roomId);
        if (room?.hostPending && room.hostPending.id === pendingId) {
          const updated = clearHostPending(roomId);
          dependencies.roomRepository.save(updated);
          io.to(updated.id).emit("room:state", toPublicRoomState(updated));
        }
        emitError(socket, error);
      }
    });

    socket.on("case:pin", ({ roomId, answerId }) => {
      try {
        const room = pinAnswer(roomId, answerId);
        dependencies.roomRepository.save(room);
        io.to(room.id).emit("room:state", toPublicRoomState(room));
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("host:reveal", ({ roomId, playerId }) => {
      try {
        const room = revealTruth(roomId, playerId);
        dependencies.roomRepository.save(room);
        io.to(room.id).emit("room:state", toPublicRoomState(room));
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("host:revealHint", ({ roomId, playerId }) => {
      try {
        const room = revealHint(roomId, playerId);
        dependencies.roomRepository.save(room);
        io.to(room.id).emit("room:state", toPublicRoomState(room));
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("player:requestHint", ({ roomId, playerId }) => {
      try {
        const room = requestHint(roomId, playerId);
        dependencies.roomRepository.save(room);
        io.to(room.id).emit("room:state", toPublicRoomState(room));
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
          dependencies.roomRepository.save(room);
          io.to(room.id).emit("room:state", toPublicRoomState(room));
        }
      } catch (error) {
        emitError(socket, error);
      }
    });
  });
}
