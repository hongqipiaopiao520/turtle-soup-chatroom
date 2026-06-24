import { Pin, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RoomState } from "../shared/types";

export function HostPanel({
  room,
  onAsk,
  onPin
}: {
  room: RoomState;
  onAsk: (question: string, mode: "question" | "guess") => void;
  onPin: (answerId: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<"question" | "guess">("question");
  const hostLogRef = useRef<HTMLDivElement>(null);
  const remainingQuestions = Math.max(room.questionLimit - room.questionsUsed, 0);
  const isSolved = room.answerUnlocked;
  const isQuestionLimitReached = remainingQuestions === 0;
  const isDisabled = isSolved || (mode === "question" && isQuestionLimitReached);

  useEffect(() => {
    const log = hostLogRef.current;
    if (log) {
      log.scrollTop = log.scrollHeight;
    }
  }, [room.hostLog.length]);

  function submit() {
    const trimmed = question.trim();
    if (!trimmed || isDisabled) return;
    onAsk(trimmed, mode);
    setQuestion("");
  }

  return (
    <section className="host-panel">
      <div className="panel-title">
        <h2>主持人问答</h2>
        <span>
          剩余 {remainingQuestions} 问
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
        {room.hostLog.length === 0 ? (
          <p className="muted">暂无问答记录</p>
        ) : (
          room.hostLog.map((item) => (
            <article className={`answer-card answer-${item.answerType}`} key={item.id}>
              <div className="question-line">
                <span className="line-label">{item.playerName}</span>
                <p>{item.question}</p>
              </div>
              <div className="answer-line">
                <span className="line-label">汤仙人</span>
                <p>{item.answer}</p>
              </div>
              <div className="answer-card-foot">
                <div className="answer-meta">
                  <span>完成度 {item.progress}%</span>
                  {item.progressDelta > 0 && <span>+{item.progressDelta}%</span>}
                  {item.contributionScore > 0 && <span>{item.contributionScore} 分</span>}
                  {item.isBreakthrough && <span>关键突破</span>}
                </div>
                <button
                  className={`icon-button pin-answer-button ${item.pinned ? "pin-answer-button-active" : ""}`}
                  onClick={() => onPin(item.id)}
                  title={item.pinned ? "已收藏到卷宗" : "收藏到卷宗"}
                  aria-label={item.pinned ? "已收藏到卷宗" : "收藏到卷宗"}
                >
                  <Pin size={15} />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
      {isSolved && <p className="flow-hint">本局已解出，主持人问答已结束。</p>}
      {!isSolved && isQuestionLimitReached && mode === "question" && (
        <p className="flow-hint">普通提问次数已用完，可以继续提交完整推理争取解锁汤底。</p>
      )}
      <div className="ask-box">
        <select value={mode} onChange={(event) => setMode(event.target.value as "question" | "guess")}>
          <option value="question">提问</option>
          <option value="guess">推理提交</option>
        </select>
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={256}
          disabled={isDisabled}
          placeholder={mode === "question" ? "请提出可以用是/不是/无关回答的问题..." : "提交你的完整推理..."}
        />
        <button className="primary-button" onClick={submit} disabled={isDisabled}>
          <Send size={16} /> 发送
        </button>
      </div>
    </section>
  );
}
