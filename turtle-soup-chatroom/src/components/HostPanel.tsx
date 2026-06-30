import { Eye, Lightbulb, Pin, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HostPersonaId, PublicHostAnswer, PublicRoomState } from "../shared/types";
import { SegmentedControl } from "./ui";

const hostPersonaProfiles: Record<HostPersonaId, { name: string; image: string }> = {
  xiaowai: {
    name: "小歪",
    image: "/assets/host-xiaowai.png"
  },
  dav: {
    name: "大V",
    image: "/assets/host-dav.png"
  },
  guigui: {
    name: "龟龟",
    image: "/assets/host-guigui.png"
  }
};

export function getComposerModeConfig(mode: "question" | "guess", isThinking: boolean) {
  if (mode === "guess") {
    return {
      className: "question-console-guess",
      placeholder: "写下完整推理，命中真相后将解锁汤底...",
      buttonLabel: isThinking ? "判断中" : "提交推理"
    };
  }

  return {
    className: "question-console-question",
    placeholder: "提出是 / 不是 / 无关问题...",
    buttonLabel: isThinking ? "思考中" : "发送提问"
  };
}

function needsAnswerSpacing(answer: string, styleText: string): boolean {
  return !/[\s，。！？、；：,.!?;:]$/.test(answer) && !/^[\s，。！？、；：,.!?;:]/.test(styleText);
}

function HostAnswerText({ item }: { item: PublicHostAnswer }) {
  if (!item.styleText) return <>{item.answer}</>;
  const separator = needsAnswerSpacing(item.answer, item.styleText) ? " " : "";
  return <>{item.answer}{separator}<span className="answer-style-text">{item.styleText}</span></>;
}

export function getNewHintNotice(previousHintCount: number, revealedHints: string[]) {
  if (revealedHints.length <= previousHintCount) return null;
  const text = revealedHints.at(-1)?.trim();
  if (!text) return null;
  return {
    index: revealedHints.length,
    text
  };
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
  const hintsHistoryRef = useRef<HTMLDivElement>(null);
  const previousHintCountRef = useRef(room.revealedHints.length);
  const hasUnlimitedQuestions = room.questionLimit === 0;
  const remainingQuestions = hasUnlimitedQuestions ? 0 : Math.max(room.questionLimit - room.questionsUsed, 0);
  const isSolved = room.answerUnlocked;
  const isQuestionLimitReached = !hasUnlimitedQuestions && remainingQuestions === 0;
  const isThinking = Boolean(room.hostPending);
  const isDisabled = isThinking || isSolved || (mode === "question" && isQuestionLimitReached);
  const isHost = room.players.find((p) => p.id === playerId)?.isHost ?? false;
  const isNearTruth = room.progress >= 80 && !isSolved;
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [confirmHint, setConfirmHint] = useState(false);
  const [hintsHistoryOpen, setHintsHistoryOpen] = useState(false);
  const [newHintNotice, setNewHintNotice] = useState<{ index: number; text: string } | null>(null);
  const totalHints = room.puzzle.hintCount;
  const hasHints = totalHints > 0;
  const hintsRemaining = totalHints - room.hintsRevealed;
  const hasHintRequests = room.hintRequestedBy.length > 0;
  const hasRevealedHints = room.revealedHints.length > 0;
  const hostPersona = hostPersonaProfiles[room.hostPersonaId] ?? hostPersonaProfiles.xiaowai;
  const hostPersonaName = hostPersona.name;
  const hostStatusLabel = isThinking ? "思考中" : isSolved ? "已收案" : "待提问";
  const composerConfig = getComposerModeConfig(mode, isThinking);

  useEffect(() => {
    const log = hostLogRef.current;
    if (log) {
      log.scrollTop = log.scrollHeight;
    }
  }, [room.hostLog.length, room.hostPending?.id]);

  useEffect(() => {
    if (!hintsHistoryOpen) return;

    function closeWhenOutside(event: MouseEvent) {
      if (hintsHistoryRef.current?.contains(event.target as Node)) return;
      setHintsHistoryOpen(false);
    }

    document.addEventListener("mousedown", closeWhenOutside);
    return () => document.removeEventListener("mousedown", closeWhenOutside);
  }, [hintsHistoryOpen]);

  useEffect(() => {
    if (!hasRevealedHints) setHintsHistoryOpen(false);
  }, [hasRevealedHints]);

  useEffect(() => {
    const notice = getNewHintNotice(previousHintCountRef.current, room.revealedHints);
    previousHintCountRef.current = room.revealedHints.length;
    if (notice) {
      setNewHintNotice(notice);
      setHintsHistoryOpen(false);
    }
  }, [room.revealedHints]);

  function submit() {
    const trimmed = question.trim();
    if (!trimmed || isDisabled) return;
    onAsk(trimmed, mode);
    setQuestion("");
    window.setTimeout(() => questionInputRef.current?.focus(), 0);
  }

  return (
    <section className="host-panel">
      <div className="case-status-strip">
        <div className="host-mini-status">
          <img src={hostPersona.image} alt="" aria-hidden="true" />
          <span>{hostPersonaName} · {hostStatusLabel}</span>
        </div>
        <div className="case-status-progress">
          <div className="progress-line">
            <span>推理完成度</span>
            <strong>{room.progress}%</strong>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${room.progress}%` }} />
          </div>
        </div>
        <span className="question-budget-pill">
          {hasUnlimitedQuestions ? "不限问" : `剩余 ${remainingQuestions} 问`}
        </span>
      </div>
      {room.answerUnlocked && <span className="unlock-label">汤底已解锁</span>}
      <div className="panel-title host-log-title">
        <h2>问答记录</h2>
        <span>
          {hasUnlimitedQuestions ? "不限问" : `剩余 ${remainingQuestions} 问`}
        </span>
      </div>
      <div className="host-log" ref={hostLogRef}>
        {room.hostLog.length === 0 && !room.hostPending ? (
          <div className="host-empty-state">
            <strong>先抛出一个是/不是/无关问题</strong>
            <p>比如“这件事发生在室内吗？”“报警和水本身有关吗？”主持人会把每次回答转成完成度和线索。</p>
          </div>
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
        <p className="flow-hint">已经很接近真相了。把模式切到“推理提交”，用完整推理尝试解锁汤底。</p>
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
        {!isSolved && (isHost || hasHints || hasRevealedHints) && (
          <div className="host-tools host-assist-tray">
            <span className="host-assist-label">{isHost ? "房主工具" : "提示工具"}</span>
            <div className="host-assist-actions">
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
                  {isHost ? (
                    hintsRemaining > 0 ? (
                      <div className="host-hint-confirm-area">
                        <button
                          className="host-tool-button"
                          onClick={() => setConfirmHint((value) => !value)}
                          title={`发放提示 (${room.hintsRevealed}/${totalHints})`}
                          aria-label={`发放提示 (${room.hintsRevealed}/${totalHints})`}
                          aria-expanded={confirmHint}
                          aria-haspopup="dialog"
                        >
                          <Lightbulb size={16} />
                          <span className="host-tool-count">{room.hintsRevealed}/{totalHints}</span>
                          {hasHintRequests && <span className="hint-request-dot">{room.hintRequestedBy.length}</span>}
                        </button>
                        <div
                          className="host-tool-popover host-hint-confirm-popover"
                          role="dialog"
                          aria-label="确认发放提示"
                          hidden={!confirmHint}
                        >
                          <span>发放下一条提示给所有玩家？</span>
                          <div className="host-tool-popover-actions">
                            <button className="ghost-button" onClick={() => setConfirmHint(false)}>取消</button>
                            <button className="primary-button" onClick={() => { onRevealHint(); setConfirmHint(false); }}>
                              确认发放
                            </button>
                          </div>
                        </div>
                      </div>
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
              {hasRevealedHints && (
                <div className="host-hints-history" ref={hintsHistoryRef}>
                  <button
                    className="host-tool-button host-hints-history-button"
                    onClick={() => {
                      setHintsHistoryOpen((value) => !value);
                      setNewHintNotice(null);
                    }}
                    title={`已发放提示 ${room.revealedHints.length}`}
                    aria-label={`查看已发放提示 ${room.revealedHints.length}`}
                    aria-expanded={hintsHistoryOpen}
                  >
                    <Lightbulb size={16} />
                    <span className="host-tool-count">已发放提示 {room.revealedHints.length}</span>
                  </button>
                  <div
                    className="host-hints-popover"
                    role="dialog"
                    aria-label="已发放提示"
                    hidden={!hintsHistoryOpen}
                  >
                    <div className="host-hints-popover-head">
                      <span>已发放提示</span>
                      <strong>{room.revealedHints.length}</strong>
                    </div>
                    <div className="revealed-hints" aria-label="已发放提示列表">
                      {room.revealedHints.map((hint, index) => (
                        <p key={index} className="hint-item">
                          <Lightbulb size={14} /> 提示 {index + 1}：{hint}
                        </p>
                      ))}
                    </div>
                  </div>
                  {newHintNotice && (
                    <div className="host-new-hint-popover" role="status" aria-live="polite">
                      <div className="host-new-hint-head">
                        <Lightbulb size={15} />
                        <span>新提示 {newHintNotice.index}</span>
                        <button className="icon-button" onClick={() => setNewHintNotice(null)} aria-label="关闭新提示">
                          ×
                        </button>
                      </div>
                      <p>{newHintNotice.text}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        <div className={`ask-box question-console ${composerConfig.className}`}>
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
            placeholder={composerConfig.placeholder}
          />
          <button className="primary-button" onClick={submit} disabled={isDisabled}>
            <Send size={16} /> {composerConfig.buttonLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
