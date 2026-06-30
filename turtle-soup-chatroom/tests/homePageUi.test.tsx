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
      <HomePage puzzles={publicSeedPuzzles} onOpenPuzzle={() => undefined} onRandomPuzzle={() => undefined} />
    );

    expect(markup).toContain("CASE-001");
    expect(markup).not.toContain("CASE-COLD-C");
  });
});
