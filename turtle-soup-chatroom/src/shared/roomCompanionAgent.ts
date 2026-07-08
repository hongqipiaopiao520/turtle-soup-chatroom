import type { PublicHostAnswer, PublicRoomState } from "./types";

type RoomCompanionInput = Pick<
  PublicRoomState,
  "puzzle" | "hostLog" | "status" | "questionLimit" | "questionsUsed" | "progress" | "answerUnlocked"
>;

export interface RoomCompanionBrief {
  confirmed: string[];
  toVerify: string[];
  offTrack: string[];
  nextQuestion: string;
  summary: string;
  stageLabel: string;
  progressNote: string;
  pulse: string;
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

function inferStage(room: RoomCompanionInput) {
  if (room.answerUnlocked || room.status === "solved") {
    return {
      stageLabel: "复盘整理",
      summary: "汤底已解锁，我会帮你回看关键问答和贡献点。"
    };
  }
  if (room.hostLog.length === 0) {
    return {
      stageLabel: "破冰建模",
      summary: "先建立地点、人物关系和异常触发点。"
    };
  }
  if (room.progress >= 90) {
    return {
      stageLabel: "临门一脚",
      summary: "线索已经接近闭环，下一步适合提交完整推理。"
    };
  }
  if (room.progress >= 60) {
    return {
      stageLabel: "收束推理",
      summary: "已有多条有效线索，优先把动机、顺序和误解串起来。"
    };
  }
  if (room.progress >= 30) {
    return {
      stageLabel: "追关键变量",
      summary: "局面开始打开，继续追问最有增量的异常点。"
    };
  }
  return {
    stageLabel: "建立边界",
    summary: "根据公开问答记录整理，不读取汤底。"
  };
}

function inferPulse(room: RoomCompanionInput) {
  const latest = [...room.hostLog].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  if (!latest) return "还没有问答，我会先帮你定第一问。";
  if (latest.answerType === "solved") return "刚才已经命中汤底，可以复盘关键路径。";
  if (latest.progressDelta >= 10 || latest.isBreakthrough) return `刚才有突破，完成度 +${latest.progressDelta}%。`;
  if (latest.progressDelta > 0) return `刚才有小进展，完成度 +${latest.progressDelta}%。`;
  if (latest.answerType === "irrelevant" || latest.answerType === "invalid") return "刚才的问题偏离主线，建议换回异常触发点。";
  if (latest.answerType === "no") return "刚才排除了一条路，可以把范围收窄。";
  return "我会继续盯着公开问答里的增量。";
}

function describeProgress(room: RoomCompanionInput) {
  const questionText = room.questionLimit === 0 ? `已问 ${room.questionsUsed} 问` : `已问 ${room.questionsUsed}/${room.questionLimit} 问`;
  return `${Math.round(room.progress)}% · ${questionText}`;
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
  const stage = inferStage(room);

  return {
    confirmed,
    toVerify,
    offTrack,
    nextQuestion,
    summary: stage.summary,
    stageLabel: stage.stageLabel,
    progressNote: describeProgress(room),
    pulse: inferPulse(room)
  };
}
