import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomePage } from "../src/components/HomePage";

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
});
