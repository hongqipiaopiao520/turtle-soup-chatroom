import type {
  RoomCompanionAssistRequest,
  RoomCompanionAssistResponse,
  RoomCompanionSnapshot
} from "../shared/types";
import type { RoomCompanionBrief } from "../shared/roomCompanionAgent";
import type { PublicRoomState } from "../shared/types";

export function createRoomCompanionSnapshot(room: PublicRoomState, brief: RoomCompanionBrief): RoomCompanionSnapshot {
  return {
    puzzle: {
      title: room.puzzle.title,
      surface: room.puzzle.surface,
      difficulty: room.puzzle.difficulty,
      tags: room.puzzle.tags.slice(0, 6)
    },
    stageLabel: brief.stageLabel,
    progressNote: brief.progressNote,
    summary: brief.summary,
    confirmed: brief.confirmed.slice(0, 3),
    toVerify: brief.toVerify.slice(0, 3),
    offTrack: brief.offTrack.slice(0, 2),
    nextQuestion: brief.nextQuestion,
    recentAnswers: [...room.hostLog]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 6)
      .map((answer) => ({
        question: answer.question,
        answerType: answer.answerType,
        answer: answer.answer,
        progressDelta: answer.progressDelta
      }))
  };
}

export async function fetchRoomCompanionAssist(
  input: RoomCompanionAssistRequest,
  fetcher: typeof fetch = fetch
): Promise<RoomCompanionAssistResponse> {
  const response = await fetcher("/api/agent/room-companion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = (await response.json().catch(() => null)) as { message?: string } | RoomCompanionAssistResponse | null;
  if (!response.ok) {
    throw new Error((payload && "message" in payload && payload.message) || `陪玩 Agent 失败：${response.status}`);
  }
  return payload as RoomCompanionAssistResponse;
}
