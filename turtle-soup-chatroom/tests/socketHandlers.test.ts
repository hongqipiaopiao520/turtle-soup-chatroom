import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seedPuzzles } from "../src/data/seedPuzzles";
import { askHost } from "../server/aiHost";
import { createRoom, getRoom, resetRooms, setHostPending } from "../server/roomStore";
import { getPublishedPuzzleForRoom, registerSocketHandlers } from "../server/socketHandlers";
import { openDatabase } from "../server/storage/database";
import { createPuzzleRepository } from "../server/storage/puzzleRepository";

vi.mock("../server/aiHost", () => ({
  askHost: vi.fn(),
  calculateStylePolicy: vi.fn(() => "optional"),
  isHostErrorDecision: (decision: { answerType: string; progress: number }) =>
    decision.answerType === "partial" && decision.progress === 0
}));

const tmpRoots: string[] = [];

function makeRepository() {
  const root = join(tmpdir(), `turtle-socket-puzzles-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tmpRoots.push(root);
  const db = openDatabase(join(root, "app.sqlite"));
  return { db, repository: createPuzzleRepository(db) };
}

afterEach(() => {
  for (const root of tmpRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tmpRoots.length = 0;
  vi.clearAllMocks();
});

beforeEach(() => {
  resetRooms();
});

describe("getPublishedPuzzleForRoom", () => {
  it("returns only published puzzles for room creation", () => {
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

    expect(getPublishedPuzzleForRoom(repository, "rain-platform").id).toBe("rain-platform");
    expect(() => getPublishedPuzzleForRoom(repository, "cold-cup")).toThrow("题目不存在");
    expect(() => getPublishedPuzzleForRoom(repository, "missing")).toThrow("题目不存在");

    db.close();
  });


  it("creates rooms with the requested host persona", () => {
    const roomEmit = vi.fn();
    const savedRooms: Array<ReturnType<typeof createRoom>["room"]> = [];
    const io = {
      on: vi.fn(),
      to: vi.fn(() => ({ emit: roomEmit }))
    };
    const socketHandlers = new Map<string, (...args: unknown[]) => unknown>();
    const socket = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        socketHandlers.set(event, handler);
      }),
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn()
    };
    const puzzle = {
      ...seedPuzzles[0],
      status: "published" as const,
      hints: [],
      estimatedMinutes: 15,
      qualityScore: 80,
      qualityIssues: [],
      qualitySummary: "可发布",
      publishedAt: "2026-06-23T00:00:00.000Z",
      updatedAt: "2026-06-23T00:00:00.000Z"
    };

    registerSocketHandlers(io as never, {
      puzzleRepository: { findById: vi.fn(() => puzzle) } as never,
      roomRepository: {
        save: vi.fn((room: ReturnType<typeof createRoom>["room"]) => {
          savedRooms.push(room);
        }),
        remove: vi.fn()
      } as never
    });
    const connectionHandler = io.on.mock.calls[0][1] as (nextSocket: typeof socket) => void;
    connectionHandler(socket);

    socketHandlers.get("room:create")?.({
      puzzleId: puzzle.id,
      playerName: "房主",
      hostPersonaId: "guigui"
    });

    expect(savedRooms[0].hostPersonaId).toBe("guigui");
    expect(socket.emit).toHaveBeenCalledWith(
      "room:session",
      expect.objectContaining({
        room: expect.objectContaining({ hostPersonaId: "guigui" })
      })
    );
  });

  it("broadcasts host pending state to the whole room before the AI answer completes", async () => {
    const { room, playerId } = createRoom(seedPuzzles[0], "房主", { hostPersonaId: "dav" });
    let resolveHost!: (decision: Awaited<ReturnType<typeof askHost>>) => void;
    vi.mocked(askHost).mockReturnValue(
      new Promise((resolve) => {
        resolveHost = resolve;
      })
    );
    const roomEmit = vi.fn();
    const io = {
      on: vi.fn(),
      to: vi.fn(() => ({ emit: roomEmit }))
    };
    const socketHandlers = new Map<string, (...args: unknown[]) => unknown>();
    const socket = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        socketHandlers.set(event, handler);
      }),
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn()
    };

    registerSocketHandlers(io as never, {
      puzzleRepository: { findById: vi.fn() } as never,
      roomRepository: { save: vi.fn(), remove: vi.fn() } as never
    });
    const connectionHandler = io.on.mock.calls[0][1] as (nextSocket: typeof socket) => void;
    connectionHandler(socket);

    const askPromise = socketHandlers.get("host:ask")?.({
      roomId: room.id,
      playerId,
      question: "门后有人吗？",
      mode: "question"
    }) as Promise<void>;

    expect(roomEmit).toHaveBeenCalledWith(
      "room:state",
      expect.objectContaining({
        hostPending: expect.objectContaining({
          playerId,
          playerName: "房主",
          question: "门后有人吗？",
          mode: "question"
        })
      })
    );

    expect(askHost).toHaveBeenCalledWith(expect.objectContaining({
      hostPersonaId: "dav",
      stylePolicy: "optional"
    }));

    resolveHost({
      answerType: "yes",
      answer: "是。",
      styleText: "问题终于有点像样了。",
      progress: 20
    });
    await askPromise;
    const emittedStates = roomEmit.mock.calls
      .filter(([event]) => event === "room:state")
      .map(([, emittedRoom]) => emittedRoom);
    const finalState = emittedStates.at(-1);

    expect(finalState).toMatchObject({
      hostPending: undefined,
      hostPersonaId: "dav",
      hostLog: [
        expect.objectContaining({
          question: "门后有人吗？",
          answer: "是。",
          styleText: "问题终于有点像样了。"
        })
      ]
    });
  });

  it("keeps the active pending question when another host ask is rejected", async () => {
    const { room, playerId } = createRoom(seedPuzzles[0], "房主");
    setHostPending(room.id, playerId, "第一问还在思考", "question");
    const roomEmit = vi.fn();
    const io = {
      on: vi.fn(),
      to: vi.fn(() => ({ emit: roomEmit }))
    };
    const socketHandlers = new Map<string, (...args: unknown[]) => unknown>();
    const socket = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        socketHandlers.set(event, handler);
      }),
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn()
    };

    registerSocketHandlers(io as never, {
      puzzleRepository: { findById: vi.fn() } as never,
      roomRepository: { save: vi.fn(), remove: vi.fn() } as never
    });
    const connectionHandler = io.on.mock.calls[0][1] as (nextSocket: typeof socket) => void;
    connectionHandler(socket);

    await socketHandlers.get("host:ask")?.({
      roomId: room.id,
      playerId,
      question: "第二问不该覆盖",
      mode: "question"
    });

    expect(socket.emit).toHaveBeenCalledWith("server:error", { message: "小歪正在思考中" });
    expect(getRoom(room.id)?.hostPending?.question).toBe("第一问还在思考");
    expect(roomEmit).not.toHaveBeenCalled();
  });
});
