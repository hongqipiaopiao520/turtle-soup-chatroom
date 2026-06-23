import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { seedPuzzles } from "../../src/data/seedPuzzles";
import type { RoomState } from "../../src/shared/types";
import { openDatabase } from "../../server/storage/database";
import { createRoomRepository } from "../../server/storage/roomRepository";

const tmpRoots: string[] = [];

function makeDb() {
  const root = join(tmpdir(), `turtle-room-repo-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tmpRoots.push(root);
  return openDatabase(join(root, "app.sqlite"));
}

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    id: "room-test",
    puzzle: seedPuzzles[0],
    status: "playing",
    players: [
      {
        id: "player-test",
        name: "房主",
        isHost: true,
        joinedAt: "2026-06-23T00:00:00.000Z",
        score: 0,
        hits: 0,
        bestDelta: 0
      }
    ],
    hostLog: [],
    chatMessages: [],
    caseNotes: [],
    questionLimit: 20,
    questionsUsed: 0,
    progress: 0,
    answerUnlocked: false,
    truthRevealed: false,
    createdAt: "2026-06-23T00:00:00.000Z",
    ...overrides
  };
}

afterEach(() => {
  for (const root of tmpRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tmpRoots.length = 0;
});

describe("RoomRepository", () => {
  it("saves and loads room snapshots", () => {
    const db = makeDb();
    const repository = createRoomRepository(db);
    const room = makeRoom();

    repository.save(room);

    expect(repository.loadAll()).toEqual([room]);
    db.close();
  });

  it("replaces all snapshots when saving all rooms", () => {
    const db = makeDb();
    const repository = createRoomRepository(db);
    repository.save(makeRoom({ id: "old-room" }));

    const roomA = makeRoom({ id: "room-a" });
    const roomB = makeRoom({ id: "room-b", progress: 40 });
    repository.saveAll([roomA, roomB]);

    expect(repository.loadAll().map((room) => room.id)).toEqual(["room-a", "room-b"]);
    expect(repository.loadAll()[1].progress).toBe(40);
    db.close();
  });

  it("removes a room snapshot", () => {
    const db = makeDb();
    const repository = createRoomRepository(db);
    repository.save(makeRoom());

    repository.remove("room-test");

    expect(repository.loadAll()).toEqual([]);
    db.close();
  });
});
