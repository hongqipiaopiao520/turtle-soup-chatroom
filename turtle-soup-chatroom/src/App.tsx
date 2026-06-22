import { useEffect, useMemo, useState } from "react";
import { useRoomSocket } from "./client/useRoomSocket";
import { HomePage } from "./components/HomePage";
import { PuzzleDetail } from "./components/PuzzleDetail";
import { RoomPage } from "./components/RoomPage";
import { seedPuzzles } from "./data/seedPuzzles";
import type { Puzzle } from "./shared/types";

type View =
  | { name: "home" }
  | { name: "detail"; puzzle: Puzzle }
  | { name: "room" };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });
  const [pendingPuzzle, setPendingPuzzle] = useState<Puzzle | null>(null);
  const roomSocket = useRoomSocket();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get("room");
    if (roomId) {
      const playerName = window.prompt("输入昵称加入房间") || "访客";
      roomSocket.joinRoom(roomId, playerName);
      setView({ name: "room" });
    }
  }, []);

  useEffect(() => {
    if (roomSocket.room && pendingPuzzle) {
      setPendingPuzzle(null);
      setView({ name: "room" });
    }
  }, [roomSocket.room, pendingPuzzle]);

  const randomPuzzle = useMemo(
    () => () => {
      const puzzle = seedPuzzles[Math.floor(Math.random() * seedPuzzles.length)];
      setView({ name: "detail", puzzle });
    },
    []
  );

  function startRoom(puzzle: Puzzle) {
    const playerName = window.prompt("输入你的昵称") || "访客";
    setPendingPuzzle(puzzle);
    roomSocket.createRoom(puzzle, playerName);
  }

  if (view.name === "detail") {
    return (
      <PuzzleDetail
        puzzle={view.puzzle}
        onBack={() => setView({ name: "home" })}
        onStart={startRoom}
      />
    );
  }

  if (view.name === "room" && roomSocket.room && roomSocket.playerId) {
    return (
      <RoomPage
        room={roomSocket.room}
        playerId={roomSocket.playerId}
        onBack={() => setView({ name: "home" })}
        onAsk={roomSocket.askHost}
        onPin={roomSocket.pinAnswer}
        onSendChat={roomSocket.sendChat}
      />
    );
  }

  return (
    <>
      {roomSocket.error && <div className="toast-error">{roomSocket.error}</div>}
      <HomePage
        onOpenPuzzle={(puzzle) => setView({ name: "detail", puzzle })}
        onRandomPuzzle={randomPuzzle}
      />
    </>
  );
}
