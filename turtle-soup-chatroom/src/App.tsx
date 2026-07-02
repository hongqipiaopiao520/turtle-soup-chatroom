import { BadgeCheck, Play, UserRound } from "lucide-react";
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
import type { HostPersonaId, OpeningDirectorPlan, PublicPuzzle } from "./shared/types";

type View =
  | { name: "home" }
  | { name: "detail"; puzzle: PublicPuzzle }
  | { name: "room" };

type NameRequest =
  | {
      kind: "create";
      puzzle: PublicPuzzle;
      unlimitedQuestions: boolean;
      hostPersonaId?: HostPersonaId;
      questionLimit?: number;
      source?: "manual" | "opening-director";
    }
  | { kind: "join"; roomId: string };

const hostPersonaOptions: { id: HostPersonaId; name: string; role: string; line: string; image: string }[] = [
  {
    id: "xiaowai",
    name: "小歪",
    role: "友好主持",
    line: "节奏轻松，适合边聊边推。",
    image: "/assets/host-xiaowai.png"
  },
  {
    id: "dav",
    name: "大V",
    role: "冷面侦探",
    line: "回答克制，压迫感更足。",
    image: "/assets/host-dav.png"
  },
  {
    id: "guigui",
    name: "龟龟",
    role: "慢速观察员",
    line: "稳一点，慢慢靠近真相。",
    image: "/assets/host-guigui.png"
  }
];

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

  function startDirectedRoom(plan: OpeningDirectorPlan) {
    setNameRequest({
      kind: "create",
      puzzle: plan.puzzle,
      unlimitedQuestions: plan.questionLimit === 0,
      questionLimit: plan.questionLimit,
      hostPersonaId: plan.hostPersonaId,
      source: "opening-director"
    });
  }

  function submitName(playerName: string, options: { unlimitedQuestions?: boolean; hostPersonaId?: HostPersonaId } = {}) {
    const trimmedName = playerName.trim() || "访客";
    if (!nameRequest) return;

    if (nameRequest.kind === "create") {
      setPendingPuzzle(nameRequest.puzzle);
      roomSocket.createRoom(nameRequest.puzzle, trimmedName, {
        questionLimit: options.unlimitedQuestions ? 0 : nameRequest.questionLimit,
        hostPersonaId: options.hostPersonaId ?? nameRequest.hostPersonaId
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
        onStartDirectedPlan={startDirectedRoom}
      />
    </>
  );
}

export function NameDialog({
  request,
  onCancel,
  onSubmit
}: {
  request: NameRequest;
  onCancel: () => void;
  onSubmit: (playerName: string, options?: { unlimitedQuestions?: boolean; hostPersonaId?: HostPersonaId }) => void;
}) {
  const [name, setName] = useState("");
  const [unlimitedQuestions, setUnlimitedQuestions] = useState(
    request.kind === "create" ? request.unlimitedQuestions : false
  );
  const [hostPersonaId, setHostPersonaId] = useState<HostPersonaId>(
    request.kind === "create" ? request.hostPersonaId ?? "xiaowai" : "xiaowai"
  );
  const actionLabel = request.kind === "create" ? "创建房间" : "加入房间";
  const dialogTitle = request.kind === "create" ? "开案登记" : "加入房间";
  const caseTitle = request.kind === "create" ? request.puzzle.title : `房间 ${request.roomId}`;
  const caseSurface = request.kind === "create" ? request.puzzle.surface : "输入昵称后加入正在推理的案台。";

  return (
    <div className="dialog-backdrop" role="presentation">
      <form
        className="name-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(name, { unlimitedQuestions, hostPersonaId });
        }}
      >
        <div className="name-dialog-beam" aria-hidden="true" />
        <header className="name-dialog-header">
          <div>
            <span className="panel-kicker"><BadgeCheck size={14} /> CASE-001</span>
            <h2 id="name-dialog-title">{dialogTitle}</h2>
          </div>
          <span className="name-dialog-status">AI HOST READY</span>
        </header>

        <div className="name-dialog-case-strip">
          <span>当前案件</span>
          <strong>{caseTitle}</strong>
          <p>{caseSurface}</p>
        </div>

        {request.kind === "create" && request.source === "opening-director" && (
          <div className="name-dialog-agent-strip">
            AI 开局导演已配好主持人和问数，确认昵称后开局。
          </div>
        )}

        <label className="name-dialog-field">
          <span><UserRound size={15} /> 玩家席位</span>
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={18} placeholder="访客" />
          <small>不填会以“访客”入场</small>
        </label>

        {request.kind === "create" && (
          <>
            <fieldset className="name-dialog-personas">
              <legend>主持人</legend>
              {hostPersonaOptions.map((persona) => (
                <label className="host-persona-choice" key={persona.id}>
                  <input
                    type="radio"
                    name="hostPersonaId"
                    value={persona.id}
                    checked={hostPersonaId === persona.id}
                    onChange={() => setHostPersonaId(persona.id)}
                  />
                  <span className="host-choice-art" aria-hidden="true">
                    <img src={persona.image} alt="" />
                  </span>
                  <span className="host-choice-copy">
                    <span>{persona.role}</span>
                    <strong>{persona.name}</strong>
                    <small>{persona.line}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="name-dialog-check name-dialog-limit">
              <input
                type="checkbox"
                checked={unlimitedQuestions}
                onChange={(event) => setUnlimitedQuestions(event.target.checked)}
              />
              <span>
                <strong>普通提问不限次数</strong>
                <small>展示模式更友好，玩家可以尽情追问。</small>
              </span>
            </label>
          </>
        )}
        <div className="dialog-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="primary-button" type="submit">
            <Play size={16} /> {actionLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
