import { beforeEach, describe, expect, it } from "vitest";
import { seedPuzzles } from "../src/data/seedPuzzles";
import {
  addChatMessage,
  addHostAnswer,
  createRoom,
  exportRoomsSnapshot,
  getRoom,
  importRoomsSnapshot,
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
      progress: 10
    });
    const updated = pinAnswer(room.id, answer.id);
    expect(updated.caseNotes[0].body).toContain("女孩真的消失了吗？");
    expect(getRoom(room.id)?.hostLog[0].pinned).toBe(true);
  });

  it("tracks ordinary questions but not final guesses", () => {
    const { room, playerId } = createRoom(seedPuzzles[0], "房主");

    addHostAnswer(room.id, {
      playerId,
      playerName: "房主",
      question: "女孩真的消失了吗？",
      answerType: "no",
      answer: "不是。",
      progress: 30
    });
    addHostAnswer(room.id, {
      playerId,
      playerName: "房主",
      question: "最终推理：这是告别仪式。",
      answerType: "unsolved",
      answer: "还差一点。",
      progress: 40
    });

    expect(getRoom(room.id)?.questionsUsed).toBe(1);
  });

  it("unlocks the answer at 95 percent and prevents more host answers", () => {
    const { room, playerId } = createRoom(seedPuzzles[0], "房主");

    addHostAnswer(room.id, {
      playerId,
      playerName: "房主",
      question: "最终推理：她在参加告别仪式。",
      answerType: "solved",
      answer: "完全正确。",
      progress: 96
    });

    expect(getRoom(room.id)?.status).toBe("solved");
    expect(getRoom(room.id)?.answerUnlocked).toBe(true);
    expect(getRoom(room.id)?.progress).toBe(100);
    expect(getRoom(room.id)?.questionsUsed).toBe(0);
    expect(() =>
      addHostAnswer(room.id, {
        playerId,
        playerName: "房主",
        question: "还能继续问吗？",
        answerType: "yes",
        answer: "是。",
        progress: 97
      })
    ).toThrow("本局已结束");
  });

  it("rejects ordinary questions after the question limit", () => {
    const { room, playerId } = createRoom(seedPuzzles[0], "房主");
    room.questionLimit = 1;

    addHostAnswer(room.id, {
      playerId,
      playerName: "房主",
      question: "第一问",
      answerType: "yes",
      answer: "是。",
      progress: 10
    });

    expect(() =>
      addHostAnswer(room.id, {
        playerId,
        playerName: "房主",
        question: "第二问",
        answerType: "no",
        answer: "不是。",
        progress: 20
      })
    ).toThrow("提问次数已用完");
  });

  it("keeps progress monotonic and scores player contributions", () => {
    const { room, playerId } = createRoom(seedPuzzles[0], "房主");
    const joinSession = joinRoom(room.id, "玩家甲");

    const first = addHostAnswer(room.id, {
      playerId,
      playerName: "房主",
      question: "这和录音有关吗？",
      answerType: "yes",
      answer: "是。",
      progress: 40
    });
    const second = addHostAnswer(room.id, {
      playerId: joinSession.playerId,
      playerName: "玩家甲",
      question: "是告别仪式吗？",
      answerType: "partial",
      answer: "接近。",
      progress: 35
    });

    const updated = getRoom(room.id);
    expect(updated?.progress).toBe(40);
    expect(first.progressDelta).toBe(40);
    expect(first.contributionScore).toBe(450);
    expect(second.progressDelta).toBe(0);
    expect(second.contributionScore).toBe(0);
    expect(updated?.players[0]).toMatchObject({ score: 450, hits: 1, bestDelta: 40 });
    expect(updated?.players[1]).toMatchObject({ score: 0, hits: 0, bestDelta: 0 });
  });

  it("computes progress from weighted covered solution points", () => {
    const { room, playerId } = createRoom(
      {
        ...seedPuzzles[1],
        solutionPoints: [
          "25|water-state|杯中液体状态异常|水变冷,原本是热水",
          "15|cup-position|杯子位置没有明显变化|杯子没动",
          "25|intrusion|有人进入房间|有人来过,有人进屋",
          "25|liquid-tampered|有人替换或动过杯中液体|换水,动过水",
          "10|realization|男人意识到住所被入侵|报警原因"
        ]
      },
      "房主"
    );

    addHostAnswer(room.id, {
      playerId,
      playerName: "房主",
      question: "有人进来换了水，所以他知道家里被闯入？",
      answerType: "partial",
      answer: "方向很接近。",
      progress: 0,
      coveredPointIds: ["intrusion", "liquid-tampered", "realization"],
      coverageConfidence: 0.9
    });

    expect(getRoom(room.id)?.progress).toBe(60);
  });

  it("trusts higher AI progress when a close answer covers the core logic beyond explicit point ids", () => {
    const { room, playerId } = createRoom(
      {
        ...seedPuzzles[1],
        solutionPoints: [
          "25|water-state|杯中液体状态异常|水变冷,原本是热水",
          "15|cup-position|杯子位置没有明显变化|杯子没动",
          "25|intrusion|有人进入房间|有人来过,有人进屋",
          "25|liquid-tampered|有人替换或动过杯中液体|换水,动过水",
          "10|realization|男人意识到住所被入侵|报警原因"
        ]
      },
      "房主"
    );

    addHostAnswer(room.id, {
      playerId,
      playerName: "房主",
      question: "杯子没动但水被人处理过，所以他知道有人来过。",
      answerType: "partial",
      answer: "核心逻辑很接近。",
      progress: 88,
      coveredPointIds: ["intrusion", "liquid-tampered"],
      coverageConfidence: 0.78
    });

    expect(getRoom(room.id)?.progress).toBe(88);
  });

  it("sets solved final guesses to full progress even when point ids are incomplete", () => {
    const { room, playerId } = createRoom(
      {
        ...seedPuzzles[1],
        solutionPoints: [
          "25|water-state|杯中液体状态异常|水变冷,原本是热水",
          "15|cup-position|杯子位置没有明显变化|杯子没动",
          "25|intrusion|有人进入房间|有人来过,有人进屋",
          "25|liquid-tampered|有人替换或动过杯中液体|换水,动过水",
          "10|realization|男人意识到住所被入侵|报警原因"
        ]
      },
      "房主"
    );

    addHostAnswer(room.id, {
      playerId,
      playerName: "房主",
      question: "最终推理：有人进屋动了杯里的水，水变冷暴露了入侵。",
      answerType: "solved",
      answer: "正确，核心真相已经解出。",
      progress: 86,
      coveredPointIds: ["intrusion", "liquid-tampered"],
      coverageConfidence: 0.82
    });

    expect(getRoom(room.id)?.progress).toBe(100);
    expect(getRoom(room.id)?.answerUnlocked).toBe(true);
  });

  it("returns settlement highlights after the answer is unlocked", () => {
    const { room, playerId } = createRoom(seedPuzzles[0], "房主");
    const joinSession = joinRoom(room.id, "玩家甲");

    addHostAnswer(room.id, {
      playerId,
      playerName: "房主",
      question: "这和录音有关吗？",
      answerType: "yes",
      answer: "是。",
      progress: 40
    });
    const best = addHostAnswer(room.id, {
      playerId: joinSession.playerId,
      playerName: "玩家甲",
      question: "最终推理：她参加沉浸式告别仪式，感谢父亲录音后离开。",
      answerType: "solved",
      answer: "已经接近真相。",
      progress: 96
    });

    const updated = getRoom(room.id);
    expect(updated?.answerUnlocked).toBe(true);
    expect(updated?.settlement?.mvpPlayerId).toBe(joinSession.playerId);
    expect(updated?.settlement?.bestAnswerId).toBe(best.id);
    expect(updated?.settlement?.unlockingPlayerId).toBe(joinSession.playerId);
  });

  it("pins each host answer only once", () => {
    const { room, playerId } = createRoom(seedPuzzles[0], "房主");
    const answer = addHostAnswer(room.id, {
      playerId,
      playerName: "房主",
      question: "女孩真的消失了吗？",
      answerType: "no",
      answer: "不是。",
      progress: 10
    });

    pinAnswer(room.id, answer.id);
    const updated = pinAnswer(room.id, answer.id);

    expect(updated.caseNotes).toHaveLength(1);
  });

  it("exports and imports room snapshots for persistence", () => {
    const { room, playerId } = createRoom(seedPuzzles[1], "房主");
    addChatMessage(room.id, playerId, "这条消息应该被保存");

    const snapshot = exportRoomsSnapshot();
    resetRooms();
    expect(getRoom(room.id)).toBeUndefined();

    importRoomsSnapshot(snapshot);
    const restored = rejoinRoom(room.id, playerId);

    expect(restored.room.id).toBe(room.id);
    expect(restored.playerId).toBe(playerId);
    expect(restored.room.chatMessages[0].body).toBe("这条消息应该被保存");
  });
});
