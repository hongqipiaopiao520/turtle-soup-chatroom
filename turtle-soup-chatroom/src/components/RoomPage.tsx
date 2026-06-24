import { ArrowLeft, Award, Link, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RoomState } from "../shared/types";
import { HostPanel } from "./HostPanel";
import { SidePanel } from "./SidePanel";

const difficultyLabel = {
  easy: "简单",
  medium: "中等",
  hard: "困难"
};

export function RoomPage({
  room,
  playerId,
  onBack,
  onAsk,
  onPin,
  onSendChat,
  isChatPending = false,
  isHostPending = false
}: {
  room: RoomState;
  playerId: string;
  onBack: () => void;
  onAsk: (question: string, mode: "question" | "guess") => void;
  onPin: (answerId: string) => void;
  onSendChat: (body: string) => void;
  isChatPending?: boolean;
  isHostPending?: boolean;
}) {
  const inviteUrl = `${window.location.origin}?room=${room.id}`;
  const [copied, setCopied] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(room.answerUnlocked);
  const lastUnlockedRoomRef = useRef<string | null>(room.answerUnlocked ? room.id : null);
  const statusLabel = room.answerUnlocked ? "汤底已解锁" : "进行中";
  const rankedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  const mvp = room.settlement?.mvpPlayerId
    ? room.players.find((player) => player.id === room.settlement?.mvpPlayerId)
    : rankedPlayers[0];
  const bestAnswer = room.settlement?.bestAnswerId
    ? room.hostLog.find((item) => item.id === room.settlement?.bestAnswerId)
    : [...room.hostLog].sort((a, b) => b.progressDelta - a.progressDelta)[0];

  useEffect(() => {
    if (room.answerUnlocked && lastUnlockedRoomRef.current !== room.id) {
      setSettlementOpen(true);
      lastUnlockedRoomRef.current = room.id;
    }
    if (!room.answerUnlocked) {
      lastUnlockedRoomRef.current = null;
      setSettlementOpen(false);
    }
  }, [room.answerUnlocked, room.id]);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("复制邀请链接", inviteUrl);
    }
  }

  return (
    <main className="room-shell">
      <header className="room-topbar">
        <button className="ghost-button" onClick={onBack}>
          <ArrowLeft size={16} /> 离开
        </button>
        <div>
          <h1>私人房间</h1>
          <span className={`status-pill room-status-${room.status}`}>{statusLabel}</span>
        </div>
        <button className="primary-button" onClick={copyInvite}>
          <Link size={16} /> {copied ? "已复制" : "邀请好友"}
        </button>
      </header>
      <section className="room-grid">
        <aside className="puzzle-panel">
          <span className="panel-kicker">汤面</span>
          <h2>{room.puzzle.title}</h2>
          <div className="tag-row">
            <span className={`difficulty difficulty-${room.puzzle.difficulty}`}>
              {difficultyLabel[room.puzzle.difficulty]}
            </span>
            {room.puzzle.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
          <p className="surface-text">{room.puzzle.surface}</p>
        </aside>
        <HostPanel room={room} onAsk={onAsk} onPin={onPin} isHostPending={isHostPending} />
        <SidePanel
          room={room}
          playerId={playerId}
          onOpenSettlement={() => setSettlementOpen(true)}
          onSendChat={onSendChat}
          isChatPending={isChatPending}
        />
      </section>
      {settlementOpen && room.answerUnlocked && (
        <section className="settlement-backdrop" role="presentation">
          <div className="settlement-dialog" role="dialog" aria-modal="true" aria-labelledby="settlement-title">
            <button className="dialog-close" onClick={() => setSettlementOpen(false)} aria-label="关闭结算">
              <X size={18} />
            </button>
            <div className="settlement-hero">
              <span className="panel-kicker">汤底揭晓</span>
              <h2 id="settlement-title">{room.puzzle.title}</h2>
              <strong>{room.progress}%</strong>
            </div>
            <p className="truth-text">{room.puzzle.truth}</p>
            <div className="settlement-grid">
              <span>本局 MVP</span>
              <strong>
                <Award size={16} /> {mvp?.name ?? "暂无"}
              </strong>
              <span>最佳回答</span>
              <strong>{bestAnswer ? `${bestAnswer.playerName} +${bestAnswer.progressDelta}%` : "暂无"}</strong>
            </div>
            <button className="primary-button settlement-confirm" onClick={() => setSettlementOpen(false)}>
              收下汤底
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
