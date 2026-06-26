import { Eye, Lightbulb, Pin, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HostPersonaId, PublicHostAnswer, PublicRoomState } from "../shared/types";
import { SegmentedControl } from "./ui";

const hostPersonaNames: Record<HostPersonaId, string> = {
  xiaowai: "小歪",
  dav: "大V",
  guigui: "龟龟"
};

function needsAnswerSpacing(answer: string, styleText: string): boolean {
  return !/[\s，。！？、；：,.!?;:]$/.test(answer) && !/^[\s，。！？、；：,.!?;:]/.test(styleText);
}

function HostAnswerText({ item }: { item: PublicHostAnswer }) {
  if (!item.styleText) return <>{item.answer}</>;
  const separator = needsAnswerSpacing(item.answer, item.styleText) ? " " : "";
  return <>{item.answer}{separator}<span className="answer-style-text">{item.styleText}</span></>;
}

export function HostPanel({
  room,
  playerId,
  onAsk,
  onPin,
  onReveal,
  onRevealHint,
  onRequestHint
}: {
  room: PublicRoomState;
  playerId?: string;
  onAsk: (question: string, mode: "question" | "guess") => void;
  onPin: (answerId: string) => void;
  onReveal: () => void;
  onRevealHint: () => void;
  onRequestHint: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<"question" | "guess">("question");
  const hostLogRef = useRef<HTMLDivElement>(null);
  const questionInputRef = useRef<HTMLTextAreaElement>(null);
  const hasUnlimitedQuestions = room.questionLimit === 0;
  const remainingQuestions = hasUnlimitedQuestions ? 0 : Math.max(room.questionLimit - room.questionsUsed, 0);
  const isSolved = room.answerUnlocked;
  const isQuestionLimitReached = !hasUnlimitedQuestions && remainingQuestions === 0;
  const isThinking = Boolean(room.hostPending);
  const isDisabled = isThinking || isSolved || (mode === "question" && isQuestionLimitReached);
  const isHost = room.players.find((p) => p.id === playerId)?.isHost ?? false;
  const isNearTruth = room.progress >= 95 && !isSolved;
  const [confirmReveal, setConfirmReveal] = useState(false);
  const totalHints = room.puzzle.hintCount;
  const hasHints = totalHints > 0;
  const hintsRemaining = totalHints - room.hintsRevealed;
  const hasHintRequests = room.hintRequestedBy.length > 0;
  const hostPersonaName = hostPersonaNames[room.hostPersonaId] ?? "小歪";

  useEffect(() => {
    const log = hostLogRef.current;
    if (log) {
      log.scrollTop = log.scrollHeight;
    }
  }, [room.hostLog.length, room.hostPending?.id]);

  function submit() {
    const trimmed = question.trim();
    if (!trimmed || isDisabled) return;
    onAsk(trimmed, mode);
    setQuestion("");
    window.setTimeout(() => questionInputRef.current?.focus(), 0);
  }

  return (
    <section className="host-panel">
      <div className="panel-title">
        <h2>主持人问答</h2>
        <span>
          {hasUnlimitedQuestions ? "不限问" : `剩余 ${remainingQuestions} 问`}
        </span>
      </div>
      <div className="progress-block">
        <div className="progress-line">
          <span>推理完成度</span>
          <strong>{room.progress}%</strong>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${room.progress}%` }} />
        </div>
        {room.answerUnlocked && <span className="unlock-label">汤底已解锁</span>}
      </div>
      <div className="host-log" ref={hostLogRef}>
        {room.hostLog.length === 0 && !room.hostPending ? (
          <p className="muted">暂无问答记录</p>
        ) : (
          <>
            {room.hostLog.map((item) => (
              <article
                className={`answer-card answer-${item.answerType} ${item.contributionScore > 0 ? "answer-scored" : ""}`}
                key={item.id}
              >
                <div className="answer-card-actions">
                  <button
                    className={`icon-button pin-answer-button ${item.pinned ? "pin-answer-button-active" : ""}`}
                    onClick={() => onPin(item.id)}
                    title={item.pinned ? "已收藏到卷宗" : "收藏到卷宗"}
                    aria-label={item.pinned ? "已收藏到卷宗" : "收藏到卷宗"}
                  >
                    <Pin size={15} />
                  </button>
                </div>
                <div className="answer-card-top">
                  <div className="question-line">
                    <span className="line-label">{item.playerName}</span>
                    <p>{item.question}</p>
                  </div>
                  <div className="answer-meta">
                    <span className="answer-progress-chip">完成度 {item.progress}%</span>
                    {item.progressDelta > 0 && <span className="answer-score-chip">+{item.progressDelta}%</span>}
                    {item.contributionScore > 0 && <span className="answer-score-chip">{item.contributionScore} 分</span>}
                  </div>
                </div>
                <div className="answer-answer-row">
                  <div className="answer-line">
                    <span className="line-label host-line-label">{hostPersonaName}</span>
                    <p><HostAnswerText item={item} /></p>
                  </div>
                  {item.isBreakthrough && <span className="breakthrough-chip">关键突破</span>}
                </div>
              </article>
            ))}
            {room.hostPending && (
              <article className="answer-card answer-card-pending" aria-live="polite">
                <div className="question-line">
                  <span className="line-label">{room.hostPending.playerName}</span>
                  <p>{room.hostPending.question}</p>
                </div>
                <div className="answer-line">
                  <span className="line-label host-line-label">{hostPersonaName}</span>
                  <p>{hostPersonaName}正在思考...</p>
                </div>
              </article>
            )}
          </>
        )}
      </div>
      {isSolved && <p className="flow-hint">本局已解出，主持人问答已结束。</p>}
      {!isSolved && isNearTruth && (
        <p className="flow-hint">已接近真相，请提交最终推理来解锁汤底。</p>
      )}
      {!isSolved && isQuestionLimitReached && mode === "question" && (
        <p className="flow-hint">普通提问次数已用完，可以继续提交完整推理争取解锁汤底。</p>
      )}
      {isThinking && (
        <p className="host-pending" aria-live="polite">
          {hostPersonaName}正在思考...
        </p>
      )}
      <div className="host-composer">
        {!isSolved && (isHost || hasHints) && (
          <div className="host-tools">
            {isHost && (
              <div className="host-reveal-area">
                <button className="host-tool-button" onClick={() => setConfirmReveal((value) => !value)} title="房主揭晓" aria-label="房主揭晓" aria-expanded={confirmReveal}>
                  <Eye size={16} />
                </button>
                {confirmReveal && (
                  <div className="host-tool-popover" role="dialog" aria-label="确认揭晓汤底">
                    <span>提前揭晓汤底并结束本局？</span>
                    <div className="host-tool-popover-actions">
                      <button className="ghost-button" onClick={() => setConfirmReveal(false)}>取消</button>
                      <button className="primary-button" onClick={() => { onReveal(); setConfirmReveal(false); }}>
                        确认揭晓
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {hasHints && (
              <div className="hint-area">
                {room.revealedHints.length > 0 && (
                  <div className="revealed-hints">
                    {room.revealedHints.map((hint, index) => (
                      <p key={index} className="hint-item">
                        <Lightbulb size={14} /> 提示 {index + 1}：{hint}
                      </p>
                    ))}
                  </div>
                )}
                {isHost ? (
                  hintsRemaining > 0 ? (
                    <button className="host-tool-button" onClick={onRevealHint} title={`发放提示 (${room.hintsRevealed}/${totalHints})`} aria-label={`发放提示 (${room.hintsRevealed}/${totalHints})`}>
                      <Lightbulb size={16} />
                      <span className="host-tool-count">{room.hintsRevealed}/{totalHints}</span>
                      {hasHintRequests && <span className="hint-request-dot">{room.hintRequestedBy.length}</span>}
                    </button>
                  ) : (
                    <span className="flow-hint">提示已用完</span>
                  )
                ) : (
                  hintsRemaining > 0 && (
                    <button className="host-tool-button" onClick={onRequestHint} title="请求提示" aria-label="请求提示">
                      <Lightbulb size={16} />
                      {hasHintRequests && <span className="hint-request-count">{room.hintRequestedBy.length}</span>}
                    </button>
                  )
                )}
              </div>
            )}
            {!hasHints && isHost && (
              <div className="hint-area">
                <button className="host-tool-button" disabled title="暂无提示" aria-label="暂无提示">
                  <Lightbulb size={16} />
                </button>
              </div>
            )}
          </div>
        )}
        <div className="ask-box">
          <SegmentedControl
            value={mode}
            onChange={setMode}
            ariaLabel="问答模式"
            disabled={isThinking || isSolved}
            options={[
              { value: "question", label: "提问" },
              { value: "guess", label: "推理提交" }
            ]}
          />
          <textarea
            ref={questionInputRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            maxLength={256}
            disabled={isDisabled}
            placeholder={mode === "question" ? "请提出可以用是/不是/无关回答的问题..." : "提交你的完整推理..."}
          />
          <button className="primary-button" onClick={submit} disabled={isDisabled}>
            <Send size={16} /> {isThinking ? "思考中" : "发送"}
          </button>
        </div>
      </div>
    </section>
  );
}
