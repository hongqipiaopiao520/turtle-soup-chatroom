import { useEffect, useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import type { PublicPuzzle, RoomSession, RoomState } from "../shared/types";
import { createSocket } from "./socket";

export function useRoomSocket() {
  const socket = useMemo<Socket>(() => createSocket(), []);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleRoomSession = (session: RoomSession) => {
      setRoom(session.room);
      setPlayerId(session.playerId);
      setError(null);
    };
    const handleRoomState = (nextRoom: RoomState) => {
      setRoom(nextRoom);
    };
    const handleServerError = ({ message }: { message: string }) => setError(message);

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
    createRoom(puzzle: Pick<PublicPuzzle, "id">, playerName: string) {
      socket.emit("room:create", { puzzleId: puzzle.id, playerName });
    },
    joinRoom(roomId: string, playerName: string) {
      socket.emit("room:join", { roomId, playerName });
    },
    rejoinRoom(roomId: string, playerId: string) {
      socket.emit("room:rejoin", { roomId, playerId });
    },
    sendChat(body: string) {
      if (room && playerId) socket.emit("chat:send", { roomId: room.id, playerId, body });
    },
    askHost(question: string, mode: "question" | "guess") {
      if (room && playerId) socket.emit("host:ask", { roomId: room.id, playerId, question, mode });
    },
    pinAnswer(answerId: string) {
      if (room) socket.emit("case:pin", { roomId: room.id, answerId });
    }
  };
}
