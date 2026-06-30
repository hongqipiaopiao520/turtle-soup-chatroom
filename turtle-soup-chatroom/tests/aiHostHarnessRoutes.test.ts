import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedPuzzles } from "../src/data/seedPuzzles";
import { addHostAnswer, createRoom, importRoomsSnapshot, resetRooms } from "../server/roomStore";
import {
  getAiHostRoomDetail,
  listAiHostReviewRows,
  listAiHostRooms,
  reviewAiHostAnswer
} from "../server/aiHostHarnessRoutes";
import { openDatabase } from "../server/storage/database";
import { createRoomRepository } from "../server/storage/roomRepository";

const tmpRoots: string[] = [];
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function makeRepository() {
  const root = join(tmpdir(), `turtle-ai-host-harness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tmpRoots.push(root);
  const db = openDatabase(join(root, "app.sqlite"));
  return { db, repository: createRoomRepository(db) };
}

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
  resetRooms();
  for (const root of tmpRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tmpRoots.length = 0;
});

describe("aiHostHarnessRoutes helpers", () => {
  it("lists room summaries", () => {
    const { db, repository } = makeRepository();
    const { room, playerId } = createRoom(seedPuzzles[0], "房主");
    addHostAnswer(room.id, {
      playerId,
      playerName: "房主",
      question: "这是告别吗？",
      answerType: "partial",
      answer: "部分相关",
      progress: 20
    });
    repository.save(room);

    expect(listAiHostRooms(repository)[0]).toMatchObject({
      roomId: room.id,
      puzzleTitle: room.puzzle.title,
      answerCount: 1,
      reviewedCount: 0
    });
    db.close();
  });

  it("reviews an answer and persists the critic result", async () => {
    process.env.AI_CRITIC_BASE_URL = "https://critic.example/v1";
    process.env.AI_CRITIC_API_KEY = "critic-key";
    process.env.AI_CRITIC_MODEL = "critic-model";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          status: "flagged",
          severity: "medium",
          action: "downgrade_progress",
          risks: ["progress_inflation"],
          rationale: "进度偏高",
          suggestedProgress: 10,
          confidence: 0.8
        }) } }]
      })
    } as unknown as Response);
    const { db, repository } = makeRepository();
    const { room, playerId } = createRoom(seedPuzzles[0], "房主");
    const answer = addHostAnswer(room.id, {
      playerId,
      playerName: "房主",
      question: "这是告别吗？",
      answerType: "partial",
      answer: "部分相关",
      progress: 20
    });
    repository.save(room);
    importRoomsSnapshot([room]);

    const review = await reviewAiHostAnswer(repository, room.id, answer.id);

    expect(review).toMatchObject({ status: "flagged", risks: ["progress_inflation"] });
    expect(getAiHostRoomDetail(repository, room.id).hostLog[0].criticReview).toMatchObject({ status: "flagged" });
    expect(listAiHostReviewRows(repository, { severity: "medium" })).toHaveLength(1);
    db.close();
  });
});
