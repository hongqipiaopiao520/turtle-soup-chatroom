import { useEffect, useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import type { HostPersonaId, PublicPuzzle, PublicRoomState, RoomSession } from "../shared/types";
import { createSocket } from "./socket";

export function useRoomSocket() {
  const socket = useMemo<Socket>(() => createSocket(), []);
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChatPending, setIsChatPending] = useState(false);

  useEffect(() => {
    const handleRoomSession = (session: RoomSession) => {
      setRoom(session.room);
      setPlayerId(session.playerId);
      setError(null);
      setIsChatPending(false);
    };
    const handleRoomState = (nextRoom: PublicRoomState) => {
      setRoom(nextRoom);
      setIsChatPending(false);
    };
    const handleServerError = ({ message }: { message: string }) => {
      setError(message);
      setIsChatPending(false);
    };

    socket.on("room:session", handleRoomSession);
    socket.on("room:state", handleRoomState);
    socket.on("server:error", handleServerError);
    socket.connect();
    return () => {
      socket.off("room:session", handleRoomSession);
      socket.off("room:state", handleRoomState);
      socket.off("server:error", handleServerError);
      socket.disconnect();
    };
  }, [socket]);

  return {
    room,
    playerId,
    error,
    isChatPending,
    createRoom(puzzle: Pick<PublicPuzzle, "id">, playerName: string, options?: { questionLimit?: number; hostPersonaId?: HostPersonaId }) {
      socket.emit("room:create", { puzzleId: puzzle.id, playerName, questionLimit: options?.questionLimit, hostPersonaId: options?.hostPersonaId });
    },
    joinRoom(roomId: string, playerName: string) {
      socket.emit("room:join", { roomId, playerName });
    },
    rejoinRoom(roomId: string, playerId: string) {
      socket.emit("room:rejoin", { roomId, playerId });
    },
    sendChat(body: string) {
      if (room && playerId) {
        setIsChatPending(true);
        socket.emit("chat:send", { roomId: room.id, playerId, body });
      }
    },
    askHost(question: string, mode: "question" | "guess") {
      if (room && playerId) {
        socket.emit("host:ask", { roomId: room.id, playerId, question, mode });
      }
    },
    pinAnswer(answerId: string) {
      if (room) socket.emit("case:pin", { roomId: room.id, answerId });
    },
    revealTruth() {
      if (room && playerId) {
        socket.emit("host:reveal", { roomId: room.id, playerId });
      }
    },
    revealHint() {
      if (room && playerId) {
        socket.emit("host:revealHint", { roomId: room.id, playerId });
      }
    },
    requestHint() {
      if (room && playerId) {
        socket.emit("player:requestHint", { roomId: room.id, playerId });
      }
    },
    leaveRoom() {
      if (room && playerId) {
        socket.emit("room:leave", { roomId: room.id, playerId });
      }
      setRoom(null);
      setPlayerId(null);
      setIsChatPending(false);
    }
  };
}
