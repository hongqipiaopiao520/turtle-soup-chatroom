import type { PublicHostAnswer, PublicRoomState } from "./types";

type RoomCompanionInput = Pick<PublicRoomState, "puzzle" | "hostLog">;

export interface RoomCompanionBrief {
  confirmed: string[];
  toVerify: string[];
  offTrack: string[];
  nextQuestion: string;
  summary: string;
}

function compactQuestion(question: string) {
  return question.trim().replace(/[？?。.!！]+$/, "？");
}

function pickRecent(answers: PublicHostAnswer[], predicate: (answer: PublicHostAnswer) => boolean, limit = 2) {
  return answers
    .filter(predicate)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit)
    .map((answer) => compactQuestion(answer.question));
}

function inferNextQuestion(room: RoomCompanionInput, toVerify: string[], confirmed: string[]) {
  const combined = `${room.puzzle.title}\n${room.puzzle.surface}\n${room.puzzle.tags.join(" ")}\n${[...toVerify, ...confirmed].join("\n")}`;
  if (/水|喝|杯|冷/.test(combined)) return "水的来源或状态发生过变化吗？";
  if (/人|父母|妈妈|爸爸|关系|亲人/.test(combined)) return "人物关系是否被误解了？";
  if (/时间|夜|当天|后来/.test(combined)) return "事件发生的时间顺序关键吗？";
  if (/地点|室内|房间|门|电梯/.test(combined)) return "地点或空间条件是关键吗？";
  return "刚才有进展的问题，还能换一个角度继续追问吗？";
}

export function createRoomCompanionBrief(room: RoomCompanionInput): RoomCompanionBrief {
  const confirmed = pickRecent(
    room.hostLog,
    (answer) => answer.answerType === "yes" || answer.answerType === "solved" || answer.progressDelta >= 15
  );
  const toVerify = pickRecent(
    room.hostLog,
    (answer) => answer.answerType === "partial" || (answer.progressDelta > 0 && answer.progressDelta < 15)
  );
  const offTrack = pickRecent(
    room.hostLog,
    (answer) => answer.answerType === "irrelevant" || answer.answerType === "no" || answer.answerType === "invalid",
    1
  );
  const nextQuestion = inferNextQuestion(room, toVerify, confirmed);

  return {
    confirmed,
    toVerify,
    offTrack,
    nextQuestion,
    summary: room.hostLog.length === 0 ? "先建立地点、人物关系和异常触发点。" : "根据公开问答记录整理，不读取汤底。"
  };
}
