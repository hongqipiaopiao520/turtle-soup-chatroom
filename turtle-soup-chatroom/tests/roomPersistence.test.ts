import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { seedPuzzles } from "../src/data/seedPuzzles";
import type { RoomState } from "../src/shared/types";
import { loadPersistedRooms, savePersistedRooms } from "../server/roomPersistence";

const tmpRoots: string[] = [];

function makeTmpPath() {
  const root = join(tmpdir(), `turtle-room-persistence-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tmpRoots.push(root);
  return join(root, "rooms.json");
}

function makeRoom(): RoomState {
  return {
    id: "room-test",
    puzzle: seedPuzzles[0],
    status: "playing",
    players: [{ id: "player-test", name: "房主", isHost: true, joinedAt: "2026-06-23T00:00:00.000Z" }],
    hostLog: [],
    chatMessages: [],
    caseNotes: [],
    questionLimit: 20,
    questionsUsed: 0,
    createdAt: "2026-06-23T00:00:00.000Z"
  };
}

afterEach(() => {
  for (const root of tmpRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tmpRoots.length = 0;
});

describe("roomPersistence", () => {
  it("saves and loads room snapshots", () => {
    const filePath = makeTmpPath();
    const room = makeRoom();

    savePersistedRooms([room], filePath);

    expect(loadPersistedRooms(filePath)).toEqual([room]);
  });

  it("returns an empty snapshot for a missing file", () => {
    expect(loadPersistedRooms(makeTmpPath())).toEqual([]);
  });

  it("returns an empty snapshot for corrupt JSON", () => {
    const filePath = makeTmpPath();
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, "{not json");

    expect(loadPersistedRooms(filePath)).toEqual([]);
  });
});
