import { Pin, Send } from "lucide-react";
import { useState } from "react";
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
  const remainingQuestions = Math.max(room.questionLimit - room.questionsUsed, 0);
  const isSolved = room.status === "solved";
  const isQuestionLimitReached = remainingQuestions === 0;
  const isDisabled = isSolved || (mode === "question" && isQuestionLimitReached);

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
      <div className="host-log">
        {room.hostLog.length === 0 ? (
          <p className="muted">暂无问答记录</p>
        ) : (
          room.hostLog.map((item) => (
            <article className={`answer-card answer-${item.answerType}`} key={item.id}>
              <div className="question-line">
                {item.playerName}：{item.question}
              </div>
              <div className="answer-line">汤仙人：{item.answer}</div>
              <button className="icon-button" onClick={() => onPin(item.id)} title="收藏到卷宗">
                <Pin size={15} /> {item.pinned ? "已收藏" : "收藏"}
              </button>
            </article>
          ))
        )}
      </div>
      {isSolved && <p className="flow-hint">本局已解出，主持人问答已结束。</p>}
      {!isSolved && isQuestionLimitReached && mode === "question" && (
        <p className="flow-hint">普通提问次数已用完，可以提交最终推理。</p>
      )}
      <div className="ask-box">
        <select value={mode} onChange={(event) => setMode(event.target.value as "question" | "guess")}>
          <option value="question">提问</option>
          <option value="guess">最终推理</option>
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
