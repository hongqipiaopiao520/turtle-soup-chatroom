import type { Server, Socket } from "socket.io";
import { seedPuzzles } from "../src/data/seedPuzzles";
import { askHost } from "./aiHost";
import {
  addChatMessage,
  addHostAnswer,
  createRoom,
  getRoom,
  joinRoom,
  pinAnswer,
  removePlayer
} from "./roomStore";

function emitError(socket: Socket, error: unknown) {
  socket.emit("server:error", {
    message: error instanceof Error ? error.message : "未知错误"
  });
}

export function registerSocketHandlers(io: Server) {
  io.on("connection", (socket) => {
    socket.on("room:create", ({ puzzleId, playerName }) => {
      try {
        const puzzle = seedPuzzles.find((item) => item.id === puzzleId);
        if (!puzzle) throw new Error("题目不存在");
        const room = createRoom(puzzle, playerName);
        socket.join(room.id);
        socket.emit("room:state", room);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("room:join", ({ roomId, playerName }) => {
      try {
        const room = joinRoom(roomId, playerName);
        socket.join(room.id);
        io.to(room.id).emit("room:state", room);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("chat:send", ({ roomId, playerId, body }) => {
      try {
        addChatMessage(roomId, playerId, body);
        const room = getRoom(roomId);
        if (room) io.to(room.id).emit("room:state", room);
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
          answer: decision.answer
        });

        const updated = getRoom(roomId);
        if (updated) io.to(updated.id).emit("room:state", updated);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("case:pin", ({ roomId, answerId }) => {
      try {
        const room = pinAnswer(roomId, answerId);
        io.to(room.id).emit("room:state", room);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("room:leave", ({ roomId, playerId }) => {
      try {
        const room = removePlayer(roomId, playerId);
        io.to(room.id).emit("room:state", room);
      } catch (error) {
        emitError(socket, error);
      }
    });
  });
}
