import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HostPanel } from "../src/components/HostPanel";
import { RoomPage } from "../src/components/RoomPage";
import { SidePanel } from "../src/components/SidePanel";
import type { RoomState } from "../src/shared/types";

function makeSolvedRoom(): RoomState {
  return {
    id: "room-ui-test",
    puzzle: {
      id: "puzzle-ui-test",
      title: "雨夜站台",
      surface: "深夜的站台空无一人，女孩却向空气道谢，然后消失了。",
      truth: "女孩正在参加一次沉浸式告别仪式。",
      solutionPoints: ["沉浸式告别仪式", "不是真的消失"],
      difficulty: "medium",
      tags: ["悬疑", "温情"],
      author: "测试",
      rating: 8.4,
      plays: 128,
      createdAt: "2026-06-23"
    },
    status: "solved",
    players: [
      {
        id: "player-host",
        name: "房主",
        isHost: true,
        joinedAt: "2026-06-23T00:00:00.000Z",
        score: 320,
        hits: 2,
        bestDelta: 24
      }
    ],
    hostLog: [
      {
        id: "answer-best",
        playerId: "player-host",
        playerName: "房主",
        question: "这是告别仪式吗？",
        answerType: "solved",
        answer: "已经接近真相。",
        progress: 96,
        progressDelta: 24,
        contributionScore: 370,
        isBreakthrough: true,
        pinned: false,
        createdAt: "2026-06-23T00:01:00.000Z"
      }
    ],
    chatMessages: [],
    caseNotes: [],
    questionLimit: 20,
    questionsUsed: 3,
    progress: 96,
    answerUnlocked: true,
    truthRevealed: true,
    settlement: {
      mvpPlayerId: "player-host",
      bestAnswerId: "answer-best",
      unlockingPlayerId: "player-host"
    },
    createdAt: "2026-06-23T00:00:00.000Z"
  };
}

describe("room UI settlement", () => {
  it("does not render the truth inside the side panel after unlock", () => {
    const room = makeSolvedRoom();
    const markup = renderToStaticMarkup(
      <SidePanel
        room={room}
        playerId="player-host"
        onOpenSettlement={() => undefined}
        onSendChat={() => undefined}
      />
    );

    expect(markup).not.toContain(room.puzzle.truth);
  });

  it("renders unlocked truth in a settlement dialog", () => {
    const room = makeSolvedRoom();
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { origin: "http://localhost:5173" }, setTimeout: () => 0 }
    });

    const markup = renderToStaticMarkup(
      <RoomPage
        room={room}
        playerId="player-host"
        onBack={() => undefined}
        onAsk={() => undefined}
        onPin={() => undefined}
        onSendChat={() => undefined}
      />
    );

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain(room.puzzle.truth);
    expect(markup).toContain("本局 MVP");
    expect(markup).toContain("破案报告");
    expect(markup).toContain("最佳突破");
    expect(markup).toContain("关键回复");
    expect(markup).toContain("最绕远提问");
    expect(markup).toContain("settlement-awards");
  });

  it("renders compact pin controls without visible pin text", () => {
    const room = makeSolvedRoom();
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { origin: "http://localhost:5173" }, setTimeout: () => 0 }
    });

    const markup = renderToStaticMarkup(
      <RoomPage
        room={room}
        playerId="player-host"
        onBack={() => undefined}
        onAsk={() => undefined}
        onPin={() => undefined}
        onSendChat={() => undefined}
      />
    );

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });

    expect(markup).toContain("pin-answer-button");
    expect(markup).toContain('aria-label="收藏到卷宗"');
    expect(markup).not.toContain(">收藏</button>");
  });

  it("renders chat as a constrained scroll region", () => {
    const room = {
      ...makeSolvedRoom(),
      chatMessages: Array.from({ length: 24 }, (_, index) => ({
        id: `chat-${index}`,
        playerId: "player-host",
        playerName: "房主",
        body: `消息 ${index}`,
        createdAt: "2026-06-23T00:01:00.000Z"
      }))
    };

    const markup = renderToStaticMarkup(
      <SidePanel
        room={room}
        playerId="player-host"
        onOpenSettlement={() => undefined}
        onSendChat={() => undefined}
      />
    );

    expect(markup).toContain('class="side-section chat-section"');
    expect(markup).toContain('class="chat-list"');
    expect(markup).toContain("消息 23");
  });

  it("renders chat sending feedback while a message is pending", () => {
    const room = makeSolvedRoom();

    const markup = renderToStaticMarkup(
      <SidePanel
        room={room}
        playerId="player-host"
        onOpenSettlement={() => undefined}
        onSendChat={() => undefined}
        isChatPending
      />
    );

    expect(markup).toContain("正在发送");
  });

  it("prioritizes game chat before auxiliary side sections on small screens", () => {
    const markup = renderToStaticMarkup(
      <SidePanel
        room={makeSolvedRoom()}
        playerId="player-host"
        onOpenSettlement={() => undefined}
        onSendChat={() => undefined}
      />
    );

    expect(markup.indexOf("游戏聊天")).toBeLessThan(markup.indexOf("在线用户"));
    expect(markup.indexOf("游戏聊天")).toBeLessThan(markup.indexOf("贡献榜"));
  });

  it("renders host judging feedback while the AI host is pending", () => {
    const room = {
      ...makeSolvedRoom(),
      status: "playing" as const,
      answerUnlocked: false,
      truthRevealed: false,
      progress: 46,
      hostPending: {
        id: "pending-1",
        playerId: "player-host",
        playerName: "房主",
        question: "门后有人吗？",
        mode: "question" as const,
        createdAt: "2026-06-23T00:02:00.000Z"
      }
    };

    const markup = renderToStaticMarkup(
      <HostPanel room={room} onAsk={() => undefined} onPin={() => undefined} isHostPending />
    );

    expect(markup).toContain("小歪正在思考");
    expect(markup).toContain("门后有人吗？");
    expect(markup).toContain("answer-card-pending");
    expect(markup).toContain("disabled");
  });

  it("renders unlimited question rooms without a remaining count", () => {
    const room = {
      ...makeSolvedRoom(),
      status: "playing" as const,
      answerUnlocked: false,
      truthRevealed: false,
      questionLimit: 0,
      questionsUsed: 42
    };

    const markup = renderToStaticMarkup(
      <HostPanel room={room} onAsk={() => undefined} onPin={() => undefined} />
    );

    expect(markup).toContain("不限问");
    expect(markup).not.toContain("剩余 0 问");
  });

  it("marks scored host answers with a subtle visual class", () => {
    const markup = renderToStaticMarkup(
      <HostPanel room={makeSolvedRoom()} onAsk={() => undefined} onPin={() => undefined} />
    );

    expect(markup).toContain("answer-scored");
    expect(markup).toContain("answer-score-chip");
  });

  it("uses a segmented control instead of a native select for host mode", () => {
    const room = {
      ...makeSolvedRoom(),
      status: "playing" as const,
      answerUnlocked: false,
      truthRevealed: false
    };

    const markup = renderToStaticMarkup(
      <HostPanel room={room} onAsk={() => undefined} onPin={() => undefined} />
    );

    expect(markup).toContain("segmented-control");
    expect(markup).toContain("提问");
    expect(markup).toContain("推理提交");
    expect(markup).not.toContain("<select");
  });

  it("renders a distinctive host badge for the room owner", () => {
    const room = makeSolvedRoom();

    const markup = renderToStaticMarkup(
      <SidePanel
        room={room}
        playerId="player-host"
        onOpenSettlement={() => undefined}
        onSendChat={() => undefined}
      />
    );

    expect(markup).toContain("host-badge");
    expect(markup).toContain("房主");
    expect(markup).not.toContain("小歪主持");
    expect(markup).not.toContain("发起人");
  });
});
