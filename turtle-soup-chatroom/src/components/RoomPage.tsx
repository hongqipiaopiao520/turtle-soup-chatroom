import { ArrowLeft, Link } from "lucide-react";
import { useState } from "react";
import type { RoomState } from "../shared/types";
import { HostPanel } from "./HostPanel";
import { SidePanel } from "./SidePanel";

export function RoomPage({
  room,
  playerId,
  onBack,
  onAsk,
  onPin,
  onSendChat
}: {
  room: RoomState;
  playerId: string;
  onBack: () => void;
  onAsk: (question: string, mode: "question" | "guess") => void;
  onPin: (answerId: string) => void;
  onSendChat: (body: string) => void;
}) {
  const inviteUrl = `${window.location.origin}?room=${room.id}`;
  const [copied, setCopied] = useState(false);
  const statusLabel = room.answerUnlocked ? "汤底已解锁" : "进行中";

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
          <h2>{room.puzzle.title}</h2>
          <div className="tag-row">
            <span className={`difficulty difficulty-${room.puzzle.difficulty}`}>{room.puzzle.difficulty}</span>
            {room.puzzle.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
          <p className="surface-text">{room.puzzle.surface}</p>
        </aside>
        <HostPanel room={room} onAsk={onAsk} onPin={onPin} />
        <SidePanel room={room} playerId={playerId} onSendChat={onSendChat} />
      </section>
    </main>
  );
}
