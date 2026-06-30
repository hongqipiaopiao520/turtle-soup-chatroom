import { RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  fetchAiHostRoom,
  fetchAiHostRooms,
  reviewAiHostAnswer,
  reviewAiHostRoom,
  type AiHostRoomSummary
} from "../client/aiHostHarness";
import type { HostAnswer, HostCriticReview, HostPersonaId, RoomState } from "../shared/types";

const hostPersonaNames: Record<HostPersonaId, string> = {
  xiaowai: "小歪",
  dav: "大V",
  guigui: "龟龟"
};

export function AiHostHarnessPanel({ token, disabled = false }: { token: string; disabled?: boolean }) {
  const [rooms, setRooms] = useState<AiHostRoomSummary[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [roomDetail, setRoomDetail] = useState<RoomState | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const filteredRooms = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rooms.filter((room) => !normalized || room.puzzleTitle.toLowerCase().includes(normalized) || room.roomId.toLowerCase().includes(normalized));
  }, [query, rooms]);

  useEffect(() => {
    void loadRooms();
  }, []);

  async function loadRooms() {
    setIsBusy(true);
    setMessage("");
    try {
      const nextRooms = await fetchAiHostRooms({ token: token.trim() || undefined });
      setRooms(nextRooms);
      const nextSelected = selectedRoomId && nextRooms.some((room) => room.roomId === selectedRoomId)
        ? selectedRoomId
        : nextRooms[0]?.roomId ?? "";
      setSelectedRoomId(nextSelected);
      if (nextSelected) {
        await loadRoom(nextSelected);
      } else {
        setRoomDetail(null);
      }
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function loadRoom(roomId: string) {
    if (!roomId) return;
    const detail = await fetchAiHostRoom(roomId, { token: token.trim() || undefined });
    setRoomDetail(detail);
    setSelectedRoomId(roomId);
  }

  async function selectRoom(roomId: string) {
    setIsBusy(true);
    setMessage("");
    try {
      await loadRoom(roomId);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function reviewAnswer(answerId: string) {
    if (!roomDetail) return;
    setIsBusy(true);
    setMessage("正在审查这条问答...");
    try {
      const review = await reviewAiHostAnswer(roomDetail.id, answerId, { token: token.trim() || undefined });
      setRoomDetail({
        ...roomDetail,
        hostLog: roomDetail.hostLog.map((answer) => answer.id === answerId ? { ...answer, criticReview: review } : answer)
      });
      setRooms((current) => current.map((room) => room.roomId === roomDetail.id
        ? {
            ...room,
            reviewedCount: room.reviewedCount + (roomDetail.hostLog.find((answer) => answer.id === answerId)?.criticReview ? 0 : 1),
            flaggedCount: room.flaggedCount + (review.status === "flagged" || review.severity === "high" ? 1 : 0)
          }
        : room));
      setMessage("审查完成");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function reviewRoom() {
    if (!roomDetail) return;
    setIsBusy(true);
    setMessage("正在审查本房间未审查问答...");
    try {
      const result = await reviewAiHostRoom(roomDetail.id, { token: token.trim() || undefined });
      await loadRoom(roomDetail.id);
      await loadRooms();
      const failureText = result.failed.length ? `，失败 ${result.failed.length} 条` : "";
      setMessage(`已审查 ${result.reviewed.length} 条${failureText}`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  const reviewedCount = roomDetail?.hostLog.filter((answer) => answer.criticReview).length ?? 0;
  const flaggedCount = roomDetail?.hostLog.filter((answer) => answer.criticReview?.status === "flagged" || answer.criticReview?.severity === "high").length ?? 0;

  return (
    <section className="admin-import-panel ai-host-harness-panel">
      <div className="ai-host-harness-head">
        <div>
          <h2><ShieldCheck size={18} /> AI Host Harness</h2>
          <p>手动触发 Critic Agent 审查主持人判题，回放剧透风险、进度虚高和角色话术越界。</p>
        </div>
        <button className="ghost-button" type="button" onClick={loadRooms} disabled={disabled || isBusy}>
          <RefreshCw size={16} /> 刷新房间
        </button>
      </div>
      {message && <div className="admin-message">{message}</div>}
      <div className="ai-host-harness-grid">
        <aside className="ai-host-room-list">
          <label className="admin-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选房间或题目..." />
          </label>
          <div className="ai-host-room-list-scroll">
            {filteredRooms.map((room) => (
              <button
                className={`ai-host-room-row ${room.roomId === selectedRoomId ? "ai-host-room-row-active" : ""}`}
                type="button"
                key={room.roomId}
                onClick={() => void selectRoom(room.roomId)}
              >
                <strong>{room.puzzleTitle}</strong>
                <span>{hostPersonaNames[room.hostPersonaId]} · {room.progress}% · {room.answerCount} 问</span>
                <small>已审 {room.reviewedCount} · 风险 {room.flaggedCount}</small>
              </button>
            ))}
            {filteredRooms.length === 0 && <p className="admin-empty">暂无可审查房间。</p>}
          </div>
        </aside>
        <div className="ai-host-room-detail">
          {roomDetail ? (
            <>
              <div className="ai-host-room-summary">
                <div>
                  <span className="panel-kicker">当前房间</span>
                  <h3>{roomDetail.puzzle.title}</h3>
                  <p>{roomDetail.puzzle.surface}</p>
                </div>
                <div className="ai-host-summary-cards">
                  <span>进度 <strong>{roomDetail.progress}%</strong></span>
                  <span>问答 <strong>{roomDetail.hostLog.length}</strong></span>
                  <span>已审 <strong>{reviewedCount}</strong></span>
                  <span>风险 <strong>{flaggedCount}</strong></span>
                </div>
              </div>
              <div className="ai-host-truth-box">
                <strong>汤底</strong>
                <p>{roomDetail.puzzle.truth}</p>
                <strong>关键点</strong>
                <ul>
                  {roomDetail.puzzle.solutionPoints.map((point, index) => <li key={index}>{point}</li>)}
                </ul>
              </div>
              <div className="ai-host-detail-actions">
                <button className="primary-button" type="button" onClick={reviewRoom} disabled={disabled || isBusy || roomDetail.hostLog.length === reviewedCount}>
                  审查本房间未审问答
                </button>
              </div>
              <div className="ai-host-answer-list">
                {roomDetail.hostLog.map((answer) => (
                  <article className="ai-host-answer-card" key={answer.id}>
                    <div className="ai-host-answer-main">
                      <span className="panel-kicker">{answer.playerName}</span>
                      <strong>{answer.question}</strong>
                      <p>{answer.answer}{answer.styleText ? ` ${answer.styleText}` : ""}</p>
                      <small>{answer.answerType} · progress {answer.progress}% · Δ {answer.progressDelta}%</small>
                    </div>
                    <ReviewBlock review={answer.criticReview} />
                    <button className="ghost-button" type="button" onClick={() => void reviewAnswer(answer.id)} disabled={disabled || isBusy}>
                      {answer.criticReview ? "重新审查" : "审查"}
                    </button>
                  </article>
                ))}
                {roomDetail.hostLog.length === 0 && <p className="admin-empty">这个房间还没有主持问答。</p>}
              </div>
            </>
          ) : (
            <p className="admin-empty">选择一个房间查看主持质检。</p>
          )}
        </div>
      </div>
    </section>
  );
}

function ReviewBlock({ review }: { review?: HostCriticReview }) {
  if (!review) return <div className="ai-host-review-empty">未审查</div>;
  return (
    <div className={`ai-host-review ai-host-review-${review.status}`}>
      <strong>{review.status} · {review.severity}</strong>
      <span>{review.action}</span>
      {review.risks.length > 0 && <small>{review.risks.join(" / ")}</small>}
      <p>{review.rationale}</p>
      {review.suggestedProgress !== undefined && <small>建议进度：{review.suggestedProgress}%</small>}
      {review.suggestedAnswer && <small>建议回答：{review.suggestedAnswer}</small>}
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}
