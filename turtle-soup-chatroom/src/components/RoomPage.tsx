import { ArrowLeft, Award, BadgeCheck, Clock, Compass, KeyRound, Lightbulb, Link, Sparkles, Target, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HostPersonaId, PublicHostAnswer, PublicRoomState } from "../shared/types";
import { HostPanel } from "./HostPanel";
import { SidePanel } from "./SidePanel";

const difficultyLabel = {
  easy: "简单",
  medium: "中等",
  hard: "困难"
};

const hostPersonaNames: Record<HostPersonaId, string> = {
  xiaowai: "小歪",
  dav: "大V",
  guigui: "龟龟"
};

function formatHostAnswer(answer: PublicHostAnswer): string {
  if (!answer.styleText) return answer.answer;
  const needsSpace = !/[\s，。！？、；：,.!?;:]$/.test(answer.answer) && !/^[\s，。！？、；：,.!?;:]/.test(answer.styleText);
  return `${answer.answer}${needsSpace ? " " : ""}${answer.styleText}`;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}分${seconds.toString().padStart(2, "0")}秒`;
}

function offTrackScore(answer: PublicHostAnswer) {
  const answerTypeScore =
    answer.answerType === "unsolved" ? 80 : answer.answerType === "irrelevant" ? 50 : answer.answerType === "no" ? 25 : 0;
  const wordingScore = Math.min(answer.question.length, 80) / 2;
  return answerTypeScore + wordingScore;
}

function selectLeastUsefulQuestion(hostLog: PublicHostAnswer[]) {
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
  onReveal,
  onRevealHint,
  onRequestHint,
  onSendChat,
  isChatPending = false
}: {
  room: PublicRoomState;
  playerId: string;
  onBack: () => void;
  onAsk: (question: string, mode: "question" | "guess") => void;
  onPin: (answerId: string) => void;
  onReveal: () => void;
  onRevealHint: () => void;
  onRequestHint: () => void;
  onSendChat: (body: string) => void;
  isChatPending?: boolean;
}) {
  const inviteUrl = `${window.location.origin}?room=${room.id}`;
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(room.answerUnlocked);
  const lastUnlockedRoomRef = useRef<string | null>(room.answerUnlocked ? room.id : null);
  const statusLabel = room.answerUnlocked ? "汤底已解锁" : "进行中";
  const hostPersonaName = hostPersonaNames[room.hostPersonaId] ?? "小歪";
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
  const breakthroughAnswers = [...room.hostLog]
    .filter((item) => item.progressDelta >= 20)
    .sort((a, b) => b.progressDelta - a.progressDelta);
  const settlement = room.settlement;
  const finalGuessPlayer = settlement?.finalGuessPlayerId
    ? room.players.find((p) => p.id === settlement.finalGuessPlayerId)
    : undefined;
  const endedByHost = settlement?.endedBy === "host-reveal";

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

  function buildShareText(): string {
    const lines = [
      `我玩了海龟汤《${room.puzzle.title}》`,
      `难度：${difficultyLabel[room.puzzle.difficulty]}`,
      `提问 ${room.questionsUsed} 次`,
    ];
    if (settlement) {
      lines.push(`用时 ${formatDuration(settlement.durationMs)}`);
    }
    if (room.hintsRevealed > 0) lines.push(`用了 ${room.hintsRevealed} 条提示`);
    if (mvp?.id === playerId) lines.push("我拿了 MVP！");
    lines.push(`来挑战：${inviteUrl}`);
    return lines.join("\n");
  }

  async function copyShareText() {
    const text = buildShareText();
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      window.prompt("复制战绩文案", text);
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
          <span className="host-persona-pill">主持人：{hostPersonaName}</span>
          <span className={`status-pill room-status-${room.status}`}>{statusLabel}</span>
        </div>
        <div className="room-actions">
          {room.answerUnlocked && (
            <button className="settlement-button" onClick={() => setSettlementOpen(true)}>
              <Award size={16} /> 查看结算
            </button>
          )}
          <button className="primary-button" onClick={copyInvite}>
            <Link size={16} /> {copied ? "已复制" : "邀请好友"}
          </button>
        </div>
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
        <HostPanel room={room} onAsk={onAsk} onPin={onPin} onReveal={onReveal} onRevealHint={onRevealHint} onRequestHint={onRequestHint} playerId={playerId} />
        <SidePanel
          room={room}
          playerId={playerId}
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
              <div className="settlement-hero-copy">
                <span className="panel-kicker">破案报告</span>
                <h2 id="settlement-title">{room.puzzle.title}</h2>
                <div className="settlement-meta-row">
                  <span className={`difficulty difficulty-${room.puzzle.difficulty}`}>{difficultyLabel[room.puzzle.difficulty]}</span>
                  <span><Clock size={14} /> {settlement ? formatDuration(settlement.durationMs) : "—"}</span>
                  <span>提问 {room.questionsUsed} 次</span>
                  {room.hintsRevealed > 0 && <span><Lightbulb size={14} /> 提示 {room.hintsRevealed} 条</span>}
                  {endedByHost && <span className="host-reveal-tag">房主揭晓</span>}
                </div>
              </div>
              <div className="settlement-score">
                <Sparkles size={20} />
                <strong>{room.progress}%</strong>
                <span>真相还原</span>
              </div>
            </div>
            <div className="settlement-truth-block">
              <span>汤底揭晓</span>
              <p className="truth-text">{room.truth}</p>
            </div>
            {settlement?.finalGuess && (
              <div className="settlement-final-guess">
                <span><Target size={15} /> 最终推理</span>
                <p className="final-guess-text">{settlement.finalGuess}</p>
                <div className="final-guess-meta">
                  <strong>{finalGuessPlayer?.name ?? "未知"}</strong>
                  <span>{settlement.finalGuessResult === "solved" ? "✓ 成功解出" : endedByHost ? "未提交推理" : "× 尚未解出"}</span>
                </div>
              </div>
            )}
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
            {breakthroughAnswers.length > 0 && (
              <div className="settlement-breakthrough-list">
                <span>关键突破问答</span>
                {breakthroughAnswers.map((item) => (
                  <div key={item.id} className="breakthrough-item">
                    <span className="breakthrough-player">{item.playerName}</span>
                    <span className="breakthrough-question">{item.question}</span>
                    <span className="breakthrough-delta">+{item.progressDelta}%</span>
                  </div>
                ))}
              </div>
            )}
            <div className="settlement-timeline">
              <span>完整问答时间线</span>
              {room.hostLog.map((item, index) => (
                <div key={item.id} className="timeline-item">
                  <span className="timeline-index">#{index + 1}</span>
                  <div className="timeline-content">
                    <span className="timeline-player">{item.playerName}</span>
                    <span className="timeline-question">{item.question}</span>
                    <span className={`timeline-answer timeline-answer-${item.answerType}`}>{formatHostAnswer(item)}</span>
                    {item.progressDelta > 0 && <span className="timeline-delta">+{item.progressDelta}%</span>}
                  </div>
                </div>
              ))}
              {room.hostLog.length === 0 && <p className="muted">本局无问答记录</p>}
            </div>
            {room.revealedHints.length > 0 && (
              <div className="settlement-hints">
                <span><Lightbulb size={15} /> 使用提示</span>
                {room.revealedHints.map((hint, index) => (
                  <p key={index}>提示 {index + 1}：{hint}</p>
                ))}
              </div>
            )}
            <div className="settlement-actions">
              <button className="ghost-button" onClick={copyShareText}>
                <Link size={15} /> {shareCopied ? "已复制战绩" : "分享战绩"}
              </button>
              <button className="primary-button settlement-confirm" onClick={() => setSettlementOpen(false)}>
                收下汤底
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
