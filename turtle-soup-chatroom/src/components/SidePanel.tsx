import { Award, MessageCircle, NotebookTabs, Send, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PublicRoomState } from "../shared/types";

export function SidePanel({
  room,
  playerId,
  onSendChat,
  isChatPending = false
}: {
  room: PublicRoomState;
  playerId: string;
  onSendChat: (body: string) => void;
  isChatPending?: boolean;
}) {
  const [chat, setChat] = useState("");
  const chatListRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const shouldRestoreChatFocusRef = useRef(false);
  const rankedPlayers = [...room.players].sort((a, b) => b.score - a.score);

  useEffect(() => {
    const chatList = chatListRef.current;
    if (chatList) {
      chatList.scrollTop = chatList.scrollHeight;
    }
  }, [room.chatMessages.length]);

  useEffect(() => {
    if (!isChatPending && shouldRestoreChatFocusRef.current) {
      shouldRestoreChatFocusRef.current = false;
      window.setTimeout(() => chatInputRef.current?.focus(), 0);
    }
  }, [isChatPending]);

  function submitChat() {
    const trimmed = chat.trim();
    if (!trimmed) return;
    shouldRestoreChatFocusRef.current = true;
    onSendChat(trimmed);
    setChat("");
    window.setTimeout(() => chatInputRef.current?.focus(), 0);
  }

  return (
    <aside className="side-panel auxiliary-rail">
      <section className="side-section chat-section">
        <div className="aux-rail-header">辅助栏</div>
        <h2>
          <MessageCircle size={17} /> 游戏聊天
        </h2>
        <div className="chat-list" ref={chatListRef}>
          {room.chatMessages.length === 0 ? (
            <p className="muted">暂无聊天消息</p>
          ) : (
            room.chatMessages.map((message) => (
              <p key={message.id}>
                <strong>{message.playerName}</strong>：{message.body}
              </p>
            ))
          )}
          {isChatPending && (
            <p className="chat-pending" aria-live="polite">
              正在发送...
            </p>
          )}
        </div>
        <div className="chat-input">
          <input
            ref={chatInputRef}
            value={chat}
            onChange={(event) => setChat(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitChat();
              }
            }}
            placeholder="输入消息..."
            disabled={isChatPending}
          />
          <button className="ghost-button" onClick={submitChat} disabled={isChatPending}>
            <Send size={15} />
          </button>
        </div>
      </section>
      <div className="side-tool-drawer">
        <section className="tool-drawer-section players-section">
          <h2>
            <Users size={15} /> 在线用户 ({room.players.length})
          </h2>
          <div className="player-list">
            {room.players.map((player) => (
              <span className="player-pill" key={player.id}>
                <span>{player.name}{player.id === playerId ? "（你）" : ""}</span>
                {player.isHost && <strong className="host-badge">房主</strong>}
              </span>
            ))}
          </div>
        </section>
        <section className="tool-drawer-section score-section">
          <div className="side-section-heading">
            <h2>
              <Award size={15} /> 贡献榜
            </h2>
          </div>
          <div className="score-list">
            {rankedPlayers.map((player) => (
              <div className="score-row" key={player.id}>
                <span>
                  {player.name}
                  {player.id === playerId ? "（你）" : ""}
                </span>
                <strong>{player.score}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="tool-drawer-section notes-section">
          <h2>
            <NotebookTabs size={15} /> 调查卷宗
          </h2>
          {room.caseNotes.length === 0 ? (
            <p className="muted">收藏关键问答后会出现在这里。</p>
          ) : (
            room.caseNotes.map((note) => <pre key={note.id}>{note.body}</pre>)
          )}
        </section>
      </div>
    </aside>
  );
}
