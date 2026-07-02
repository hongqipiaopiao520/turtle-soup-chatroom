import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { seedPuzzles } from "../src/data/seedPuzzles";
import { getClientAppAssets, listPublicPuzzles, shouldServeClientRoute } from "../server/app";
import { openDatabase } from "../server/storage/database";
import { createPuzzleRepository } from "../server/storage/puzzleRepository";

const tmpRoots: string[] = [];

function makeRepository() {
  const root = join(tmpdir(), `turtle-api-puzzles-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tmpRoots.push(root);
  const db = openDatabase(join(root, "app.sqlite"));
  return { db, repository: createPuzzleRepository(db) };
}

afterEach(() => {
  for (const root of tmpRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tmpRoots.length = 0;
});

describe("/api/puzzles", () => {
  it("returns published puzzles from storage without truth", async () => {
    const { db, repository } = makeRepository();
    repository.upsertManaged({
      ...seedPuzzles[0],
      status: "published",
      hints: [],
      estimatedMinutes: 15,
      qualityScore: 80,
      qualityIssues: [],
      qualitySummary: "可发布",
      publishedAt: "2026-06-23T00:00:00.000Z",
      updatedAt: "2026-06-23T00:00:00.000Z"
    });
    repository.upsertManaged({
      ...seedPuzzles[1],
      status: "reviewing",
      hints: [],
      estimatedMinutes: 15,
      qualityScore: 70,
      qualityIssues: [],
      qualitySummary: "待审核",
      updatedAt: "2026-06-23T00:00:00.000Z"
    });

    const body = listPublicPuzzles(repository);
    db.close();

    expect(body).toHaveLength(1);
    expect(body?.[0].id).toBe("rain-platform");
    expect(body?.[0].surface).toBe(seedPuzzles[0].surface);
    expect(body?.[0]).not.toHaveProperty("truth");
    expect(body?.[0]).not.toHaveProperty("solutionPoints");
    expect(body?.[0]).not.toHaveProperty("aiProfile");
  });

  it("detects the built SPA and limits fallback serving to client routes", () => {
    const root = join(tmpdir(), `turtle-static-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    tmpRoots.push(root);
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist", "index.html"), "<main>知心李歪聊天室</main>");

    expect(getClientAppAssets(root, "production")).toMatchObject({
      enabled: true,
      distPath: join(root, "dist"),
      indexPath: join(root, "dist", "index.html")
    });
    expect(getClientAppAssets(root, "development").enabled).toBe(false);
    expect(shouldServeClientRoute("GET", "/rooms/example")).toBe(true);
    expect(shouldServeClientRoute("GET", "/admin")).toBe(true);
    expect(shouldServeClientRoute("GET", "/api/puzzles")).toBe(false);
    expect(shouldServeClientRoute("GET", "/share/room/abc")).toBe(false);
    expect(shouldServeClientRoute("POST", "/rooms/example")).toBe(false);
  });
});
