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

type NameRequest =
  | { kind: "create"; puzzle: Puzzle }
  | { kind: "join"; roomId: string };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });
  const [pendingPuzzle, setPendingPuzzle] = useState<Puzzle | null>(null);
  const [nameRequest, setNameRequest] = useState<NameRequest | null>(null);
  const roomSocket = useRoomSocket();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get("room");
    if (roomId) {
      setNameRequest({ kind: "join", roomId });
    }
  }, []);

  useEffect(() => {
    if (roomSocket.room && pendingPuzzle) {
      window.history.replaceState(null, "", `?room=${roomSocket.room.id}`);
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
    setNameRequest({ kind: "create", puzzle });
  }

  function submitName(playerName: string) {
    const trimmedName = playerName.trim() || "访客";
    if (!nameRequest) return;

    if (nameRequest.kind === "create") {
      setPendingPuzzle(nameRequest.puzzle);
      roomSocket.createRoom(nameRequest.puzzle, trimmedName);
    } else {
      roomSocket.joinRoom(nameRequest.roomId, trimmedName);
      setView({ name: "room" });
    }
    setNameRequest(null);
  }

  if (view.name === "detail") {
    return (
      <>
        <PuzzleDetail
          puzzle={view.puzzle}
          onBack={() => setView({ name: "home" })}
          onStart={startRoom}
        />
        {nameRequest && <NameDialog request={nameRequest} onCancel={() => setNameRequest(null)} onSubmit={submitName} />}
      </>
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
      {nameRequest && <NameDialog request={nameRequest} onCancel={() => setNameRequest(null)} onSubmit={submitName} />}
      <HomePage
        onOpenPuzzle={(puzzle) => setView({ name: "detail", puzzle })}
        onRandomPuzzle={randomPuzzle}
      />
    </>
  );
}

function NameDialog({
  request,
  onCancel,
  onSubmit
}: {
  request: NameRequest;
  onCancel: () => void;
  onSubmit: (playerName: string) => void;
}) {
  const [name, setName] = useState("");
  const actionLabel = request.kind === "create" ? "创建房间" : "加入房间";

  return (
    <div className="dialog-backdrop" role="presentation">
      <form
        className="name-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(name);
        }}
      >
        <h2>输入昵称</h2>
        <label>
          昵称
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={18} placeholder="访客" />
        </label>
        <div className="dialog-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="primary-button" type="submit">
            {actionLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
