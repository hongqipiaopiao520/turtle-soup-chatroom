import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import type { PuzzleRepository } from "../server/storage/puzzleRepository";

const servers: Server[] = [];

function makeRepository(): PuzzleRepository {
  return {
    findById: () => undefined,
    listPublished: () => [],
    listManaged: () => [],
    upsertManaged: (puzzle) => puzzle,
    updateManaged: () => { throw new Error("unused"); },
    updateTags: () => { throw new Error("unused"); },
    updateAiProfile: () => { throw new Error("unused"); },
    deleteManaged: () => { throw new Error("unused"); },
    publish: () => { throw new Error("unused"); },
    reject: () => { throw new Error("unused"); }
  };
}

async function listen(app: ReturnType<typeof createApp>) {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server failed");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("room companion route", () => {
  it("returns low-token companion assistance from public snapshot", async () => {
    const baseUrl = await listen(createApp(makeRepository()));
    const response = await fetch(`${baseUrl}/api/agent/room-companion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "summarize_clues",
        draftGuess: "私有汤底不应出现。",
        snapshot: {
          puzzle: {
            title: "冷掉的水",
            surface: "男人喝了一口冷水后立刻报警。",
            difficulty: "easy",
            tags: ["生活"]
          },
          stageLabel: "追关键变量",
          progressNote: "36% · 已问 4/20 问",
          summary: "公开线索摘要。",
          confirmed: ["这件事发生在室内吗？"],
          toVerify: ["报警和水本身有关吗？"],
          offTrack: [],
          nextQuestion: "水的来源或状态发生过变化吗？",
          recentAnswers: []
        }
      })
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.source).toBe("fallback");
    expect(body.title).toContain("线索");
    expect(JSON.stringify(body)).not.toContain("私有汤底");
  });

  it("rejects invalid actions", async () => {
    const baseUrl = await listen(createApp(makeRepository()));
    const response = await fetch(`${baseUrl}/api/agent/room-companion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "chat" })
    });

    expect(response.status).toBe(400);
  });
});
