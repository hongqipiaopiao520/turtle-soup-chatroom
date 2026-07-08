import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HostPanel, getComposerModeConfig, getNewHintNotice } from "../src/components/HostPanel";
import { RoomPage } from "../src/components/RoomPage";
import { SidePanel } from "../src/components/SidePanel";
import type { PublicRoomState } from "../src/shared/types";

function makeSolvedRoom(): PublicRoomState {
  return {
    id: "room-ui-test",
    hostPersonaId: "xiaowai",
    puzzle: {
      id: "puzzle-ui-test",
      title: "雨夜站台",
      surface: "深夜的站台空无一人，女孩却向空气道谢，然后消失了。",
      difficulty: "medium",
      tags: ["悬疑", "温情"],
      author: "测试",
      rating: 8.4,
      plays: 128,
      createdAt: "2026-06-23",
      hintCount: 0
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
    truth: "女孩正在参加一次沉浸式告别仪式。",
    hintsRevealed: 0,
    hintRequestedBy: [],
    revealedHints: [],
    settlement: {
      mvpPlayerId: "player-host",
      bestAnswerId: "answer-best",
      unlockingPlayerId: "player-host",
      hintsRevealed: 0,
      durationMs: 60000,
      endedAt: "2026-06-23T00:02:00.000Z",
      endedBy: "solved"
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
        onSendChat={() => undefined}
      />
    );

    expect(markup).not.toContain(room.truth);
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
        onReveal={() => undefined} onRevealHint={() => undefined} onRequestHint={() => undefined}
        onSendChat={() => undefined}
      />
    );

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain(room.truth);
    expect(markup).toContain("本局 MVP");
    expect(markup).toContain("破案报告");
    expect(markup).toContain("最佳突破");
    expect(markup).toContain("关键回复");
    expect(markup).toContain("最绕远提问");
    expect(markup).toContain("settlement-awards");
  });

  it("renders the active room as a detective command desk", () => {
    const room = makeSolvedRoom();
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { origin: "http://localhost:5173" }, setTimeout: () => 0 }
    });

    const markup = renderToStaticMarkup(
      <RoomPage
        room={{ ...room, answerUnlocked: false, truthRevealed: false, status: "playing", hostLog: [], questionsUsed: 0, progress: 0, settlement: undefined }}
        playerId="player-host"
        onBack={() => undefined}
        onAsk={() => undefined}
        onPin={() => undefined}
        onReveal={() => undefined}
        onRevealHint={() => undefined}
        onRequestHint={() => undefined}
        onSendChat={() => undefined}
      />
    );

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });

    expect(markup).toContain("room-command-desk");
    expect(markup).toContain("case-dossier");
    expect(markup).toContain("案件档案");
    expect(markup).toContain("提问规则");
    expect(markup).toContain("case-rule-disclosure");
    expect(markup).toContain("<summary");
    expect(markup).not.toContain("case-rule-card");
    expect(markup).toContain("case-surface-feature");
    expect(markup).toContain("case-status-strip");
    expect(markup).not.toContain("case-status-summary");
    expect(markup).not.toContain("当前汤面");
    expect(markup).toContain("host-mini-status");
    expect(markup).toContain("小歪 · 待提问");
    expect(markup).toContain("推理完成度");
    expect(markup).toContain("剩余 20 问");
    expect(markup).not.toContain("host-stage-art");
    expect(markup).toContain("先抛出一个是/不是/无关问题");
    expect(markup).toContain("question-console");
    expect(markup).toContain("发送提问");
    expect(markup).toContain("side-tool-drawer");
    expect(markup).toContain("auxiliary-rail");
    expect(markup).toContain("aux-rail-header");
    expect(markup).toContain("companion-agent-float");
    expect(markup).toContain("companion-agent-trigger");
  });

  it("keeps persona status compact instead of rendering stage artwork in the room flow", () => {
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { origin: "http://localhost:5173" }, setTimeout: () => 0 }
    });

    const davMarkup = renderToStaticMarkup(
      <RoomPage
        room={{ ...makeSolvedRoom(), hostPersonaId: "dav", answerUnlocked: false, truthRevealed: false, status: "playing", settlement: undefined }}
        playerId="player-host"
        onBack={() => undefined}
        onAsk={() => undefined}
        onPin={() => undefined}
        onReveal={() => undefined}
        onRevealHint={() => undefined}
        onRequestHint={() => undefined}
        onSendChat={() => undefined}
      />
    );
    const guiguiMarkup = renderToStaticMarkup(
      <RoomPage
        room={{ ...makeSolvedRoom(), hostPersonaId: "guigui", answerUnlocked: false, truthRevealed: false, status: "playing", settlement: undefined }}
        playerId="player-host"
        onBack={() => undefined}
        onAsk={() => undefined}
        onPin={() => undefined}
        onReveal={() => undefined}
        onRevealHint={() => undefined}
        onRequestHint={() => undefined}
        onSendChat={() => undefined}
      />
    );

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });

    expect(davMarkup).toContain("大V · 待提问");
    expect(guiguiMarkup).toContain("龟龟 · 待提问");
    expect(davMarkup).not.toContain("host-stage-art");
    expect(guiguiMarkup).not.toContain("host-stage-art");
  });

  it("places the settlement action beside the invite action in the room topbar", () => {
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
        onReveal={() => undefined} onRevealHint={() => undefined} onRequestHint={() => undefined}
        onSendChat={() => undefined}
      />
    );

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });

    expect(markup).toContain('class="room-actions"');
    expect(markup.indexOf("查看结算")).toBeLessThan(markup.indexOf("邀请好友"));
    expect(markup.indexOf("查看结算")).toBeLessThan(markup.indexOf('class="room-grid"'));
  });

  it("selects the most off-track zero-progress guess instead of the first zero-score question", () => {
    const room = {
      ...makeSolvedRoom(),
      hostLog: [
        {
          id: "zero-first",
          playerId: "player-host",
          playerName: "房主",
          question: "门是红色的吗？",
          answerType: "no" as const,
          answer: "不是。",
          progress: 0,
          progressDelta: 0,
          contributionScore: 0,
          isBreakthrough: false,
          pinned: false,
          createdAt: "2026-06-23T00:01:00.000Z"
        },
        {
          id: "zero-guess",
          playerId: "player-host",
          playerName: "房主",
          question: "我猜其实这是外星人操控火车导致所有人失忆。",
          answerType: "unsolved" as const,
          answer: "不是这个方向。",
          progress: 0,
          progressDelta: 0,
          contributionScore: 0,
          isBreakthrough: false,
          pinned: false,
          createdAt: "2026-06-23T00:02:00.000Z"
        },
        makeSolvedRoom().hostLog[0]
      ]
    };
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
        onReveal={() => undefined} onRevealHint={() => undefined} onRequestHint={() => undefined}
        onSendChat={() => undefined}
      />
    );

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });

    expect(markup).toMatch(/最绕远提问[\s\S]*<strong>我猜其实这是外星人操控火车导致所有人失忆。<\/strong>/);
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
        onReveal={() => undefined} onRevealHint={() => undefined} onRequestHint={() => undefined}
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

  it("renders room status as a compact single-line meta strip", () => {
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
        onReveal={() => undefined} onRevealHint={() => undefined} onRequestHint={() => undefined}
        onSendChat={() => undefined}
      />
    );

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });

    expect(markup).toContain("room-title-meta");
    expect(markup).not.toContain("room-code-pill");
    expect(markup).toMatch(/room-title-meta[\s\S]*私人房间[\s\S]*汤底已解锁/);
  });

  it("places answer actions in the top-right corner of each answer card", () => {
    const markup = renderToStaticMarkup(
      <HostPanel room={makeSolvedRoom()} playerId="player-host" onAsk={() => undefined} onPin={() => undefined} onReveal={() => undefined} onRevealHint={() => undefined} onRequestHint={() => undefined} />
    );

    expect(markup).toContain("answer-card-top");
    expect(markup).toContain("answer-card-actions");
    expect(markup.indexOf("answer-card-actions")).toBeLessThan(markup.indexOf("answer-line"));
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
        onSendChat={() => undefined}
      />
    );

    expect(markup.indexOf("游戏聊天")).toBeLessThan(markup.indexOf("在线用户"));
    expect(markup.indexOf("游戏聊天")).toBeLessThan(markup.indexOf("贡献榜"));
  });

  it("keeps the companion agent out of the auxiliary side rail", () => {
    const markup = renderToStaticMarkup(
      <SidePanel
        room={makeSolvedRoom()}
        playerId="player-host"
        onSendChat={() => undefined}
      />
    );

    expect(markup).not.toContain("companion-agent-section");
    expect(markup).not.toContain("陪玩 Agent");
  });

  it("renders a compact floating companion agent from public host history", () => {
    const room = {
      ...makeSolvedRoom(),
      status: "playing" as const,
      answerUnlocked: false,
      truthRevealed: false,
      truth: "隐藏汤底不该出现在陪玩 Agent。",
      questionsUsed: 4,
      progress: 36,
      hostLog: [
        ...makeSolvedRoom().hostLog,
        {
          id: "answer-water",
          playerId: "player-host",
          playerName: "房主",
          question: "水的状态关键吗？",
          answerType: "partial" as const,
          answer: "有关。",
          progress: 36,
          progressDelta: 12,
          contributionScore: 60,
          isBreakthrough: false,
          pinned: false,
          createdAt: "2026-06-23T00:04:00.000Z"
        }
      ]
    };
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
        onReveal={() => undefined}
        onRevealHint={() => undefined}
        onRequestHint={() => undefined}
        onSendChat={() => undefined}
      />
    );

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });

    expect(markup).toContain("companion-agent-float");
    expect(markup).toContain("companion-agent-trigger");
    expect(markup).toContain("companion-agent-popover");
    expect(markup).toContain("陪玩 Agent");
    expect(markup).toContain("/assets/assistant-finder.png");
    expect(markup).toContain("陪玩助理");
    expect(markup).toContain("追关键变量");
    expect(markup).toContain("36% · 已问 4/20 问");
    expect(markup).toContain("小档 · 陪玩观察");
    expect(markup).toContain("刚才有突破，完成度 +12%。");
    expect(markup).toContain("建议下一问");
    expect(markup).toContain("水的来源或状态发生过变化吗？");
    expect(markup).toContain("companion-agent-tools");
    expect(markup).toContain("想下一问");
    expect(markup).toContain("整理线索");
    expect(markup).toContain("检查推理");
    expect(markup).toContain("companion-guess-input");
    expect(markup).toContain("写下你的推理，再点“检查推理”");
    expect(markup).not.toContain("隐藏汤底");
  });

  it("keeps the contribution list focused on scores when it grows", () => {
    const room = {
      ...makeSolvedRoom(),
      players: Array.from({ length: 9 }, (_, index) => ({
        id: `player-${index}`,
        name: index === 0 ? "房主" : `玩家${index}`,
        isHost: index === 0,
        joinedAt: "2026-06-23T00:00:00.000Z",
        score: 900 - index * 50,
        hits: 0,
        bestDelta: 0
      }))
    };

    const markup = renderToStaticMarkup(
      <SidePanel
        room={room}
        playerId="player-0"
        onSendChat={() => undefined}
      />
    );

    expect(markup).toContain("tool-drawer-section score-section");
    expect(markup).not.toContain("查看结算");
  });

  it("groups compact side summaries so long player lists cannot cover chat or notes", () => {
    const room = {
      ...makeSolvedRoom(),
      players: Array.from({ length: 12 }, (_, index) => ({
        id: `player-${index}`,
        name: index === 0 ? "房主" : `玩家${index}`,
        isHost: index === 0,
        joinedAt: "2026-06-23T00:00:00.000Z",
        score: 900 - index * 50,
        hits: 0,
        bestDelta: 0
      }))
    };

    const markup = renderToStaticMarkup(
      <SidePanel
        room={room}
        playerId="player-0"
        onSendChat={() => undefined}
      />
    );

    expect(markup).toContain("side-tool-drawer");
    expect(markup).toContain("tool-drawer-section players-section");
    expect(markup).toContain("tool-drawer-section score-section");
    expect(markup).toContain("tool-drawer-section notes-section");
    expect(markup.indexOf("游戏聊天")).toBeLessThan(markup.indexOf("side-tool-drawer"));
    expect(markup.indexOf("side-tool-drawer")).toBeLessThan(markup.indexOf("调查卷宗"));
  });

  it("configures a distinct final-reasoning console state for guess mode", () => {
    expect(getComposerModeConfig("question", false)).toEqual({
      className: "question-console-question",
      placeholder: "提出是 / 不是 / 无关问题...",
      buttonLabel: "发送提问"
    });
    expect(getComposerModeConfig("guess", false)).toEqual({
      className: "question-console-guess",
      placeholder: "写下完整推理，命中真相后将解锁汤底...",
      buttonLabel: "提交推理"
    });
    expect(getComposerModeConfig("guess", true).buttonLabel).toBe("判断中");
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
      <HostPanel room={room} playerId="player-host" onAsk={() => undefined} onPin={() => undefined} onReveal={() => undefined} onRevealHint={() => undefined} onRequestHint={() => undefined} />
    );

    expect(markup).toContain("小歪正在思考");
    expect(markup).toContain("门后有人吗？");
    expect(markup).toContain("answer-card-pending");
    expect(markup).toContain("disabled");
  });

  it("does not keep local host pending feedback after the server room state has an answer", () => {
    const room = {
      ...makeSolvedRoom(),
      status: "playing" as const,
      answerUnlocked: false,
      truthRevealed: false,
      progress: 28
    };

    const markup = renderToStaticMarkup(
      <HostPanel room={room} playerId="player-host" onAsk={() => undefined} onPin={() => undefined} onReveal={() => undefined} onRevealHint={() => undefined} onRequestHint={() => undefined} />
    );

    expect(markup).not.toContain("小歪正在思考");
    expect(markup).not.toContain("思考中");
    expect(markup).toContain("发送");
  });

  it("guides players to submit final reasoning when progress is high", () => {
    const room = {
      ...makeSolvedRoom(),
      status: "playing" as const,
      answerUnlocked: false,
      truthRevealed: false,
      progress: 82
    };

    const markup = renderToStaticMarkup(
      <HostPanel room={room} playerId="player-host" onAsk={() => undefined} onPin={() => undefined} onReveal={() => undefined} onRevealHint={() => undefined} onRequestHint={() => undefined} />
    );

    expect(markup).toContain("已经很接近真相了");
    expect(markup).toContain("推理提交");
    expect(markup).toContain("解锁汤底");
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
      <HostPanel room={room} playerId="player-host" onAsk={() => undefined} onPin={() => undefined} onReveal={() => undefined} onRevealHint={() => undefined} onRequestHint={() => undefined} />
    );

    expect(markup).toContain("不限问");
    expect(markup).not.toContain("剩余 0 问");
  });

  it("marks scored host answers with a subtle visual class", () => {
    const markup = renderToStaticMarkup(
      <HostPanel room={makeSolvedRoom()} playerId="player-host" onAsk={() => undefined} onPin={() => undefined} onReveal={() => undefined} onRevealHint={() => undefined} onRequestHint={() => undefined} />
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
      <HostPanel room={room} playerId="player-host" onAsk={() => undefined} onPin={() => undefined} onReveal={() => undefined} onRevealHint={() => undefined} onRequestHint={() => undefined} />
    );

    expect(markup).toContain("segmented-control");
    expect(markup).toContain("提问");
    expect(markup).toContain("推理提交");
    expect(markup).not.toContain("<select");
  });

  it("groups host-only controls above the question composer", () => {
    const room = {
      ...makeSolvedRoom(),
      status: "playing" as const,
      answerUnlocked: false,
      truthRevealed: false,
      puzzle: {
        ...makeSolvedRoom().puzzle,
        hintCount: 3
      }
    };

    const markup = renderToStaticMarkup(
      <HostPanel room={room} playerId="player-host" onAsk={() => undefined} onPin={() => undefined} onReveal={() => undefined} onRevealHint={() => undefined} onRequestHint={() => undefined} />
    );

    expect(markup).toContain("host-composer");
    expect(markup).toContain("host-tools");
    expect(markup).toContain("host-assist-tray");
    expect(markup).toContain("host-assist-actions");
    expect(markup.indexOf("host-composer")).toBeLessThan(markup.indexOf("host-tools"));
    expect(markup.indexOf("host-tools")).toBeLessThan(markup.indexOf("ask-box"));
    expect(markup.indexOf('aria-label="房主揭晓"')).toBeLessThan(markup.indexOf('aria-label="发放提示 (0/3)"'));
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("host-tool-button");
    expect(markup).toContain("host-tool-count");
  });

  it("asks the host to confirm before revealing a hint", () => {
    const room = {
      ...makeSolvedRoom(),
      status: "playing" as const,
      answerUnlocked: false,
      truthRevealed: false,
      puzzle: {
        ...makeSolvedRoom().puzzle,
        hintCount: 3
      }
    };

    const markup = renderToStaticMarkup(
      <HostPanel room={room} playerId="player-host" onAsk={() => undefined} onPin={() => undefined} onReveal={() => undefined} onRevealHint={() => undefined} onRequestHint={() => undefined} />
    );

    expect(markup).toContain('aria-label="发放提示 (0/3)"');
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain("host-hint-confirm-popover");
    expect(markup).toContain('aria-label="确认发放提示"');
    expect(markup).toContain("发放下一条提示给所有玩家？");
    expect(markup).toContain("确认发放");
  });

  it("detects the latest revealed hint only when the hint count increases", () => {
    expect(getNewHintNotice(0, [])).toBeNull();
    expect(getNewHintNotice(1, ["注意镜子、狗叫声和劈柴声的关联"])).toBeNull();
    expect(getNewHintNotice(1, ["注意镜子、狗叫声和劈柴声的关联", "思考父母行为前后矛盾"])).toEqual({
      index: 2,
      text: "思考父母行为前后矛盾"
    });
    expect(getNewHintNotice(1, ["注意镜子、狗叫声和劈柴声的关联", "   "])).toBeNull();
  });

  it("opens revealed hints from a separate history popover instead of expanding the tray", () => {
    const room = {
      ...makeSolvedRoom(),
      status: "playing" as const,
      answerUnlocked: false,
      truthRevealed: false,
      puzzle: {
        ...makeSolvedRoom().puzzle,
        hintCount: 4
      },
      hintsRevealed: 2,
      revealedHints: ["注意镜子、狗叫声和劈柴声的关联", "思考父母行为前后矛盾"]
    };

    const markup = renderToStaticMarkup(
      <HostPanel room={room} playerId="player-host" onAsk={() => undefined} onPin={() => undefined} onReveal={() => undefined} onRevealHint={() => undefined} onRequestHint={() => undefined} />
    );

    expect(markup).toContain("host-assist-tray");
    expect(markup).toContain("host-hints-history-button");
    expect(markup).toContain('aria-label="查看已发放提示 2"');
    expect(markup).toContain("host-hints-popover");
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("已发放提示 2");
    expect(markup).toContain("提示 1：注意镜子、狗叫声和劈柴声的关联");
    expect(markup).not.toContain("host-hints-disclosure");
    expect(markup).not.toContain("<summary");
    expect(markup.indexOf("host-log")).toBeLessThan(markup.indexOf("host-assist-tray"));
    expect(markup.indexOf("host-assist-tray")).toBeLessThan(markup.indexOf("ask-box"));
  });

  it("lets non-host players view revealed hints without showing host hint controls", () => {
    const room = {
      ...makeSolvedRoom(),
      status: "playing" as const,
      answerUnlocked: false,
      truthRevealed: false,
      puzzle: {
        ...makeSolvedRoom().puzzle,
        hintCount: 4
      },
      players: [
        ...makeSolvedRoom().players,
        {
          id: "player-guest",
          name: "玩家甲",
          isHost: false,
          joinedAt: "2026-06-23T00:03:00.000Z",
          score: 0,
          hits: 0,
          bestDelta: 0
        }
      ],
      hintsRevealed: 2,
      revealedHints: ["注意镜子、狗叫声和劈柴声的关联", "思考父母行为前后矛盾"]
    };

    const markup = renderToStaticMarkup(
      <HostPanel room={room} playerId="player-guest" onAsk={() => undefined} onPin={() => undefined} onReveal={() => undefined} onRevealHint={() => undefined} onRequestHint={() => undefined} />
    );

    expect(markup).toContain("host-hints-history-button");
    expect(markup).toContain('aria-label="查看已发放提示 2"');
    expect(markup).toContain("host-hints-popover");
    expect(markup).toContain('aria-label="请求提示"');
    expect(markup).not.toContain('aria-label="发放提示');
    expect(markup).not.toContain('aria-label="房主揭晓"');
  });

  it("keeps the hint tool visible as disabled when a puzzle has no hints", () => {
    const room = {
      ...makeSolvedRoom(),
      status: "playing" as const,
      answerUnlocked: false,
      truthRevealed: false
    };

    const markup = renderToStaticMarkup(
      <HostPanel room={room} playerId="player-host" onAsk={() => undefined} onPin={() => undefined} onReveal={() => undefined} onRevealHint={() => undefined} onRequestHint={() => undefined} />
    );

    expect(markup).toContain('aria-label="暂无提示"');
    expect(markup).toContain("disabled");
    expect(markup.indexOf('aria-label="房主揭晓"')).toBeLessThan(markup.indexOf('aria-label="暂无提示"'));
  });

  it("renders a distinctive host badge for the room owner", () => {
    const room = makeSolvedRoom();

    const markup = renderToStaticMarkup(
      <SidePanel
        room={room}
        playerId="player-host"
        onSendChat={() => undefined}
      />
    );

    expect(markup).toContain("host-badge");
    expect(markup).toContain("房主");
    expect(markup).not.toContain("小歪主持");
    expect(markup).not.toContain("发起人");
  });
});
