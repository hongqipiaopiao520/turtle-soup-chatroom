import { afterEach, describe, expect, it } from "vitest";
import {
  listRoomSessions,
  mostRecentRoomSession,
  readRoomSession,
  removeRoomSession,
  storeRoomSession
} from "../src/client/roomSessionMemory";

const originalWindow = globalThis.window;

function installLocalStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key)
      }
    }
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow
  });
});

describe("roomSessionMemory", () => {
  it("stores and reads a room session by room id", () => {
    installLocalStorage();

    const stored = storeRoomSession({
      roomId: "room-a",
      playerId: "player-a",
      puzzleTitle: "冷掉的水"
    });

    expect(stored.roomId).toBe("room-a");
    expect(readRoomSession("room-a")).toMatchObject({
      roomId: "room-a",
      playerId: "player-a",
      puzzleTitle: "冷掉的水"
    });
  });

  it("lists newest sessions first and returns the most recent one", () => {
    installLocalStorage();

    storeRoomSession({ roomId: "room-old", playerId: "player-old" });
    storeRoomSession({ roomId: "room-new", playerId: "player-new" });

    expect(listRoomSessions().map((item) => item.roomId)).toEqual(["room-new", "room-old"]);
    expect(mostRecentRoomSession()?.roomId).toBe("room-new");
  });

  it("removes a stale room session", () => {
    installLocalStorage();

    storeRoomSession({ roomId: "room-a", playerId: "player-a" });
    removeRoomSession("room-a");

    expect(readRoomSession("room-a")).toBeNull();
    expect(listRoomSessions()).toEqual([]);
  });
});
