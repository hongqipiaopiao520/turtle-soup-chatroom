import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomePage } from "../src/components/HomePage";
import { publicSeedPuzzles } from "../src/data/seedPuzzles";

describe("HomePage", () => {
  it("renders the public chatroom name", () => {
    const markup = renderToStaticMarkup(
      <HomePage puzzles={[]} onOpenPuzzle={() => undefined} onRandomPuzzle={() => undefined} />
    );

    expect(markup).toContain("知心李歪聊天室");
  });

  it("renders a continue room action when a recent room exists", () => {
    const markup = renderToStaticMarkup(
      <HomePage
        puzzles={[]}
        recentRoom={{
          roomId: "room-a",
          playerId: "player-a",
          puzzleTitle: "冷掉的水",
          updatedAt: "2026-06-23T00:00:00.000Z"
        }}
        onOpenPuzzle={() => undefined}
        onRandomPuzzle={() => undefined}
        onResumeRoom={() => undefined}
      />
    );

    expect(markup).toContain("继续上次房间");
    expect(markup).toContain("冷掉的水");
  });

  it("uses unified select controls for filters", () => {
    const markup = renderToStaticMarkup(
      <HomePage puzzles={[]} onOpenPuzzle={() => undefined} onRandomPuzzle={() => undefined} />
    );

    expect(markup).toContain("ui-select");
    expect(markup).toContain("所有难度");
    expect(markup).toContain("全部标签");
    expect(markup).toContain('aria-label="排序方式"');
    expect(markup).not.toContain("<select");
  });

  it("renders AI host persona artwork on the home page", () => {
    const markup = renderToStaticMarkup(
      <HomePage puzzles={[]} onOpenPuzzle={() => undefined} onRandomPuzzle={() => undefined} />
    );

    expect(markup).toContain("host-persona-showcase");
    expect(markup).toContain("host-persona-avatar host-persona-xiaowai");
    expect(markup).toContain("host-persona-avatar host-persona-dav");
    expect(markup).toContain("host-persona-avatar host-persona-guigui");
    expect(markup).toContain("小歪");
    expect(markup).toContain("大V");
    expect(markup).toContain("龟龟");
    expect(markup).toContain("/assets/host-xiaowai.png");
    expect(markup).toContain("/assets/host-dav.png");
    expect(markup).toContain("/assets/host-guigui.png");
  });

  it("renders a themed case desk instead of a plain case card", () => {
    const markup = renderToStaticMarkup(
      <HomePage puzzles={[]} onOpenPuzzle={() => undefined} onRandomPuzzle={() => undefined} />
    );

    expect(markup).toContain("case-desk-visual");
    expect(markup).toContain("case-desk-folder");
    expect(markup).toContain("case-desk-pin");
    expect(markup).toContain("case-desk-scan");
  });

  it("renders a clean sequential case code for the featured puzzle", () => {
    const markup = renderToStaticMarkup(
      <HomePage
        puzzles={[
          { ...publicSeedPuzzles[0], plays: 999, rating: 9.5 },
          { ...publicSeedPuzzles[1], plays: 1, rating: 6.1 }
        ]}
        onOpenPuzzle={() => undefined}
        onRandomPuzzle={() => undefined}
      />
    );

    expect(markup).toContain("CASE-001");
    expect(markup).not.toContain("CASE-COLD-C");
  });

  it("uses the featured puzzle position for the case code instead of always 001", () => {
    const markup = renderToStaticMarkup(
      <HomePage
        puzzles={[
          { ...publicSeedPuzzles[0], plays: 1, rating: 6.1 },
          { ...publicSeedPuzzles[1], plays: 999, rating: 9.2 }
        ]}
        onOpenPuzzle={() => undefined}
        onRandomPuzzle={() => undefined}
      />
    );

    expect(markup).toContain("CASE-002");
    expect(markup).not.toContain("CASE-001");
  });

  it("renders opening agent as a floating drawer instead of a hero panel", () => {
    const markup = renderToStaticMarkup(
      <HomePage puzzles={publicSeedPuzzles} onOpenPuzzle={() => undefined} onRandomPuzzle={() => undefined} />
    );

    expect(markup).toContain("开局 Agent");
    expect(markup).toContain("opening-agent-float");
    expect(markup).toContain("opening-agent-trigger");
    expect(markup).toContain("opening-agent-assistant");
    expect(markup).toContain("opening-agent-trigger-copy");
    expect(markup).toContain("opening-agent-status");
    expect(markup).toContain("帮我找题");
    expect(markup).toContain("在线找题");
    expect(markup).toContain("找题官");
    expect(markup).toContain("小档");
    expect(markup).toContain("/assets/assistant-finder.png");
    expect(markup).not.toContain("帮我找一题");
    expect(markup).toContain("opening-agent-backdrop");
    expect(markup).toContain("opening-agent-drawer");
    expect(markup).toContain("opening-agent-panel");
    expect(markup).not.toContain("opening-agent-dossier");
    expect(markup).toContain("agent-chat-card");
    expect(markup).toContain("工作记录");
    expect(markup).toContain("<details");
    expect(markup).toContain("<summary");
    expect(markup).toContain("理解偏好");
    expect(markup).toContain("搜索题库");
    expect(markup).toContain("匹配画像");
    expect(markup).toContain("生成方案");
    expect(markup).toContain("等待确认");
    expect(markup).toContain("parse_intent");
    expect(markup).toContain("search_puzzles");
    expect(markup).toContain("rank_profiles");
    expect(markup).toContain("draft_plans");
    expect(markup).toContain("request_confirm");
    expect(markup).toContain("涉及父母，反转强一点，不要太血腥");
    expect(markup).toContain("生成开局方案");
    expect(markup).not.toContain("Agent 工作流");
  });

  it("restores the host persona showcase beside the case desk in the first screen", () => {
    const markup = renderToStaticMarkup(
      <HomePage puzzles={publicSeedPuzzles} onOpenPuzzle={() => undefined} onRandomPuzzle={() => undefined} />
    );
    const heroStart = markup.indexOf('class="home-hero"');
    const heroEnd = markup.indexOf('class="opening-agent-float"');
    const heroMarkup = markup.slice(heroStart, heroEnd);

    expect(heroMarkup).toContain("case-hero-panel");
    expect(heroMarkup).toContain("host-persona-showcase");
    expect(heroMarkup).not.toContain("opening-director-panel");
    expect(heroMarkup.indexOf("case-hero-panel")).toBeLessThan(heroMarkup.indexOf("host-persona-showcase"));
    expect(markup.indexOf("opening-agent-float")).toBeGreaterThan(markup.indexOf("home-hero"));
  });
});
