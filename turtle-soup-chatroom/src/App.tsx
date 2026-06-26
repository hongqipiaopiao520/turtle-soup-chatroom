import { useEffect, useMemo, useState } from "react";
import { fetchPublicPuzzles } from "./client/puzzles";
import {
  mostRecentRoomSession,
  readRoomSession,
  removeRoomSession,
  storeRoomSession
} from "./client/roomSessionMemory";
import { clearRoomRoute, setRoomRoute } from "./client/roomNavigation";
import { useRoomSocket } from "./client/useRoomSocket";
import { AdminPage } from "./components/AdminPage";
import { HomePage } from "./components/HomePage";
import { PuzzleDetail } from "./components/PuzzleDetail";
import { RoomPage } from "./components/RoomPage";
import { publicSeedPuzzles } from "./data/seedPuzzles";
import type { PublicPuzzle } from "./shared/types";

type View =
  | { name: "home" }
  | { name: "detail"; puzzle: PublicPuzzle }
  | { name: "room" };

type NameRequest =
  | { kind: "create"; puzzle: PublicPuzzle; unlimitedQuestions: boolean }
  | { kind: "join"; roomId: string };

export function App() {
  if (typeof window !== "undefined" && window.location.pathname === "/admin") {
    return <AdminPage />;
  }

  return <PlayerApp />;
}

function PlayerApp() {
  const [view, setView] = useState<View>({ name: "home" });
  const [puzzles, setPuzzles] = useState<PublicPuzzle[]>(publicSeedPuzzles);
  const [pendingPuzzle, setPendingPuzzle] = useState<PublicPuzzle | null>(null);
  const [nameRequest, setNameRequest] = useState<NameRequest | null>(null);
  const [recentRoom, setRecentRoom] = useState(() => mostRecentRoomSession());
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
          setPuzzles(publicSeedPuzzles);
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
      const storedSession = readRoomSession(roomId);
      if (storedSession) {
        roomSocket.rejoinRoom(roomId, storedSession.playerId);
        setView({ name: "room" });
      } else {
        setNameRequest({ kind: "join", roomId });
      }
    }
  }, []);

  useEffect(() => {
    if (roomSocket.room && roomSocket.playerId) {
      storeRoomSession({
        roomId: roomSocket.room.id,
        playerId: roomSocket.playerId,
        puzzleTitle: roomSocket.room.puzzle.title
      });
      setRecentRoom(mostRecentRoomSession());
    }
    if (roomSocket.room && roomSocket.playerId && pendingPuzzle) {
      setRoomRoute(roomSocket.room.id);
      setPendingPuzzle(null);
      setView({ name: "room" });
    }
  }, [roomSocket.room, roomSocket.playerId, pendingPuzzle]);

  useEffect(() => {
    if (!roomSocket.error) return;
    const roomId = new URLSearchParams(window.location.search).get("room");
    if (roomId) {
      removeRoomSession(roomId);
      setRecentRoom(mostRecentRoomSession());
      if (roomSocket.error.includes("玩家不在房间内")) {
        setNameRequest({ kind: "join", roomId });
      }
      if (roomSocket.error.includes("房间不存在")) {
        clearRoomRoute();
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
    setNameRequest({ kind: "create", puzzle, unlimitedQuestions: false });
  }

  function submitName(playerName: string, options: { unlimitedQuestions?: boolean } = {}) {
    const trimmedName = playerName.trim() || "访客";
    if (!nameRequest) return;

    if (nameRequest.kind === "create") {
      setPendingPuzzle(nameRequest.puzzle);
      roomSocket.createRoom(nameRequest.puzzle, trimmedName, {
        questionLimit: options.unlimitedQuestions ? 0 : undefined
      });
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
        onBack={() => {
          removeRoomSession(roomSocket.room?.id ?? "");
          setRecentRoom(mostRecentRoomSession());
          clearRoomRoute();
          roomSocket.leaveRoom();
          setView({ name: "home" });
        }}
        onAsk={roomSocket.askHost}
        onPin={roomSocket.pinAnswer}
        onReveal={roomSocket.revealTruth}
        onRevealHint={roomSocket.revealHint}
        onRequestHint={roomSocket.requestHint}
        onSendChat={roomSocket.sendChat}
        isChatPending={roomSocket.isChatPending}
      />
    );
  }

  return (
    <>
      {roomSocket.error && <div className="toast-error">{roomSocket.error}</div>}
      {nameRequest && <NameDialog request={nameRequest} onCancel={() => setNameRequest(null)} onSubmit={submitName} />}
      <HomePage
        puzzles={puzzles}
        recentRoom={recentRoom}
        onOpenPuzzle={(puzzle) => setView({ name: "detail", puzzle })}
        onRandomPuzzle={randomPuzzle}
        onResumeRoom={(session) => {
          roomSocket.rejoinRoom(session.roomId, session.playerId);
          setRoomRoute(session.roomId);
          setView({ name: "room" });
        }}
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
  onSubmit: (playerName: string, options?: { unlimitedQuestions?: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [unlimitedQuestions, setUnlimitedQuestions] = useState(
    request.kind === "create" ? request.unlimitedQuestions : false
  );
  const actionLabel = request.kind === "create" ? "创建房间" : "加入房间";

  return (
    <div className="dialog-backdrop" role="presentation">
      <form
        className="name-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(name, { unlimitedQuestions });
        }}
      >
        <h2>输入昵称</h2>
        <label>
          昵称
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={18} placeholder="访客" />
        </label>
        {request.kind === "create" && (
          <label className="name-dialog-check">
            <input
              type="checkbox"
              checked={unlimitedQuestions}
              onChange={(event) => setUnlimitedQuestions(event.target.checked)}
            />
            普通提问不限次数
          </label>
        )}
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
