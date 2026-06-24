import { Award, MessageCircle, NotebookTabs, Send, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RoomState } from "../shared/types";

export function SidePanel({
  room,
  playerId,
  onOpenSettlement,
  onSendChat
}: {
  room: RoomState;
  playerId: string;
  onOpenSettlement: () => void;
  onSendChat: (body: string) => void;
}) {
  const [chat, setChat] = useState("");
  const chatListRef = useRef<HTMLDivElement>(null);
  const rankedPlayers = [...room.players].sort((a, b) => b.score - a.score);

  useEffect(() => {
    const chatList = chatListRef.current;
    if (chatList) {
      chatList.scrollTop = chatList.scrollHeight;
    }
  }, [room.chatMessages.length]);

  function submitChat() {
    const trimmed = chat.trim();
    if (!trimmed) return;
    onSendChat(trimmed);
    setChat("");
  }

  return (
    <aside className="side-panel">
      <section className="side-section">
        <h2>
          <Users size={17} /> 在线用户 ({room.players.length})
        </h2>
        <div className="player-list">
          {room.players.map((player) => (
            <span className="player-pill" key={player.id}>
              {player.name}
              {player.id === playerId ? "（你）" : ""}
              {player.isHost ? " · 发起人" : ""}
            </span>
          ))}
        </div>
      </section>
      <section className="side-section">
        <h2>
          <Award size={17} /> 贡献榜
        </h2>
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
        {room.answerUnlocked && (
          <button className="settlement-button" onClick={onOpenSettlement}>
            查看结算
          </button>
        )}
      </section>
      <section className="side-section chat-section">
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
        </div>
        <div className="chat-input">
          <input
            value={chat}
            onChange={(event) => setChat(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitChat();
              }
            }}
            placeholder="输入消息..."
          />
          <button className="ghost-button" onClick={submitChat}>
            <Send size={15} />
          </button>
        </div>
      </section>
      <section className="side-section">
        <h2>
          <NotebookTabs size={17} /> 调查卷宗
        </h2>
        {room.caseNotes.length === 0 ? (
          <p className="muted">点击问答里的“收藏”把关键线索放进这里。</p>
        ) : (
          room.caseNotes.map((note) => <pre key={note.id}>{note.body}</pre>)
        )}
      </section>
    </aside>
  );
}
