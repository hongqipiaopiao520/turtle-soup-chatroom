import { useEffect, useMemo, useState } from "react";
import { fetchPublicPuzzles } from "./client/puzzles";
import { useRoomSocket } from "./client/useRoomSocket";
import { HomePage } from "./components/HomePage";
import { PuzzleDetail } from "./components/PuzzleDetail";
import { RoomPage } from "./components/RoomPage";
import { seedPuzzles } from "./data/seedPuzzles";
import type { PublicPuzzle } from "./shared/types";

type View =
  | { name: "home" }
  | { name: "detail"; puzzle: PublicPuzzle }
  | { name: "room" };

type NameRequest =
  | { kind: "create"; puzzle: PublicPuzzle }
  | { kind: "join"; roomId: string };

function roomSessionKey(roomId: string) {
  return `turtle-room-session:${roomId}`;
}

function readStoredPlayerId(roomId: string) {
  try {
    const raw = window.localStorage.getItem(roomSessionKey(roomId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { roomId?: string; playerId?: string };
    return parsed.roomId === roomId && parsed.playerId ? parsed.playerId : null;
  } catch {
    return null;
  }
}

function storeRoomSession(roomId: string, playerId: string) {
  window.localStorage.setItem(roomSessionKey(roomId), JSON.stringify({ roomId, playerId }));
}

function clearRoomSession(roomId: string) {
  window.localStorage.removeItem(roomSessionKey(roomId));
}

export function App() {
  const [view, setView] = useState<View>({ name: "home" });
  const [puzzles, setPuzzles] = useState<PublicPuzzle[]>(seedPuzzles);
  const [pendingPuzzle, setPendingPuzzle] = useState<PublicPuzzle | null>(null);
  const [nameRequest, setNameRequest] = useState<NameRequest | null>(null);
  const roomSocket = useRoomSocket();

  useEffect(() => {
    let isActive = true;
    fetchPublicPuzzles()
      .then((nextPuzzles) => {
        if (isActive && nextPuzzles.length > 0) {
          setPuzzles(nextPuzzles);
        }
      })
      .catch(() => {
        if (isActive) {
          setPuzzles(seedPuzzles);
        }
      });
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get("room");
    if (roomId) {
      const storedPlayerId = readStoredPlayerId(roomId);
      if (storedPlayerId) {
        roomSocket.rejoinRoom(roomId, storedPlayerId);
        setView({ name: "room" });
      } else {
        setNameRequest({ kind: "join", roomId });
      }
    }
  }, []);

  useEffect(() => {
    if (roomSocket.room && roomSocket.playerId) {
      storeRoomSession(roomSocket.room.id, roomSocket.playerId);
    }
    if (roomSocket.room && roomSocket.playerId && pendingPuzzle) {
      window.history.replaceState(null, "", `?room=${roomSocket.room.id}`);
      setPendingPuzzle(null);
      setView({ name: "room" });
    }
  }, [roomSocket.room, roomSocket.playerId, pendingPuzzle]);

  useEffect(() => {
    if (!roomSocket.error) return;
    const roomId = new URLSearchParams(window.location.search).get("room");
    if (roomId) {
      clearRoomSession(roomId);
      if (roomSocket.error.includes("玩家不在房间内")) {
        setNameRequest({ kind: "join", roomId });
      }
      if (roomSocket.error.includes("房间不存在")) {
        setView({ name: "home" });
      }
    }
  }, [roomSocket.error]);

  const randomPuzzle = useMemo(
    () => () => {
      const puzzle = puzzles[Math.floor(Math.random() * puzzles.length)];
      setView({ name: "detail", puzzle });
    },
    [puzzles]
  );

  function startRoom(puzzle: PublicPuzzle) {
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
        puzzles={puzzles}
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
