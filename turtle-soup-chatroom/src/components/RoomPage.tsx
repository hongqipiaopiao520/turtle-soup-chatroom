import { ArrowLeft, Award, BadgeCheck, Compass, KeyRound, Link, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HostAnswer, RoomState } from "../shared/types";
import { HostPanel } from "./HostPanel";
import { SidePanel } from "./SidePanel";

const difficultyLabel = {
  easy: "简单",
  medium: "中等",
  hard: "困难"
};

function offTrackScore(answer: HostAnswer) {
  const answerTypeScore =
    answer.answerType === "unsolved" ? 80 : answer.answerType === "irrelevant" ? 50 : answer.answerType === "no" ? 25 : 0;
  const wordingScore = Math.min(answer.question.length, 80) / 2;
  return answerTypeScore + wordingScore;
}

function selectLeastUsefulQuestion(hostLog: HostAnswer[]) {
  return [...hostLog]
    .filter((item) => item.progressDelta === 0 && item.contributionScore === 0 && item.answerType !== "solved")
    .sort((a, b) => offTrackScore(b) - offTrackScore(a) || Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

export function RoomPage({
  room,
  playerId,
  onBack,
  onAsk,
  onPin,
  onSendChat,
  isChatPending = false
}: {
  room: RoomState;
  playerId: string;
  onBack: () => void;
  onAsk: (question: string, mode: "question" | "guess") => void;
  onPin: (answerId: string) => void;
  onSendChat: (body: string) => void;
  isChatPending?: boolean;
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
  const breakthroughAnswer = [...room.hostLog]
    .filter((item) => item.progressDelta > 0)
    .sort((a, b) => b.progressDelta - a.progressDelta)[0];
  const keyReplies = [...room.hostLog]
    .filter((item) => item.progressDelta > 0 || item.contributionScore > 0)
    .sort((a, b) => b.contributionScore - a.contributionScore || b.progressDelta - a.progressDelta)
    .slice(0, 3);
  const leastUsefulQuestion = selectLeastUsefulQuestion(room.hostLog);

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
        <div className="room-title-meta">
          <h1>私人房间</h1>
          <span className={`status-pill room-status-${room.status}`}>{statusLabel}</span>
          <span className="room-code-pill">{room.id}</span>
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
        <HostPanel room={room} onAsk={onAsk} onPin={onPin} />
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
              <span className="panel-kicker">破案报告</span>
              <h2 id="settlement-title">{room.puzzle.title}</h2>
              <div className="settlement-score">
                <Sparkles size={20} />
                <strong>{room.progress}%</strong>
                <span>真相还原</span>
              </div>
            </div>
            <div className="settlement-truth-block">
              <span>汤底揭晓</span>
              <p className="truth-text">{room.puzzle.truth}</p>
            </div>
            <div className="settlement-awards">
              <article>
                <span><Award size={15} /> 本局 MVP</span>
                <strong>{mvp?.name ?? "暂无"}</strong>
              </article>
              <article>
                <span><BadgeCheck size={15} /> 最佳突破</span>
                <strong>{breakthroughAnswer ? `${breakthroughAnswer.playerName} +${breakthroughAnswer.progressDelta}%` : "暂无"}</strong>
              </article>
              <article>
                <span><KeyRound size={15} /> 关键回复</span>
                <strong>{keyReplies[0] ? keyReplies[0].question : bestAnswer?.question ?? "暂无"}</strong>
              </article>
              <article>
                <span><Compass size={15} /> 最绕远提问</span>
                <strong>{leastUsefulQuestion ? leastUsefulQuestion.question : "本局没有明显绕远"}</strong>
              </article>
            </div>
            {keyReplies.length > 0 && (
              <div className="settlement-key-replies">
                <span>关键回复记录</span>
                {keyReplies.map((item) => (
                  <p key={item.id}>
                    <strong>{item.playerName}</strong>：{item.question}
                  </p>
                ))}
              </div>
            )}
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
