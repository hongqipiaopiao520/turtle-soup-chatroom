import { beforeEach, describe, expect, it } from "vitest";
import { seedPuzzles } from "../src/data/seedPuzzles";
import {
  addChatMessage,
  addHostAnswer,
  createRoom,
  getRoom,
  joinRoom,
  pinAnswer,
  rejoinRoom,
  resetRooms
} from "../server/roomStore";

describe("roomStore", () => {
  beforeEach(() => resetRooms());

  it("creates a room with a host player", () => {
    const { room, playerId } = createRoom(seedPuzzles[0], "阿汤");
    expect(room.puzzle.id).toBe("rain-platform");
    expect(room.players).toHaveLength(1);
    expect(room.players[0]).toMatchObject({ name: "阿汤", isHost: true });
    expect(playerId).toBe(room.players[0].id);
    expect(room.questionLimit).toBe(20);
  });

  it("allows up to 10 players and rejects the eleventh", () => {
    const { room } = createRoom(seedPuzzles[0], "房主");
    for (let i = 0; i < 9; i += 1) {
      joinRoom(room.id, `玩家${i}`);
    }
    expect(() => joinRoom(room.id, "第十一人")).toThrow("房间已满");
  });

  it("returns the joining player id and supports rejoining the same room", () => {
    const { room } = createRoom(seedPuzzles[0], "房主");
    const joinSession = joinRoom(room.id, "玩家甲");
    expect(joinSession.playerId).toBe(joinSession.room.players[1].id);

    const rejoinSession = rejoinRoom(room.id, joinSession.playerId);
    expect(rejoinSession.playerId).toBe(joinSession.playerId);
    expect(rejoinSession.room.id).toBe(room.id);
  });

  it("rejects stale player ids when rejoining", () => {
    const { room } = createRoom(seedPuzzles[0], "房主");
    expect(() => rejoinRoom(room.id, "missing-player")).toThrow("玩家不在房间内");
  });

  it("adds chat and pinned host answers", () => {
    const { room, playerId } = createRoom(seedPuzzles[0], "房主");
    const chat = addChatMessage(room.id, playerId, "先确认人物关系");
    expect(chat.body).toBe("先确认人物关系");

    const answer = addHostAnswer(room.id, {
      playerId,
      playerName: "房主",
      question: "女孩真的消失了吗？",
      answerType: "no",
      answer: "不是。",
    });
    const updated = pinAnswer(room.id, answer.id);
    expect(updated.caseNotes[0].body).toContain("女孩真的消失了吗？");
    expect(getRoom(room.id)?.hostLog[0].pinned).toBe(true);
  });
});
