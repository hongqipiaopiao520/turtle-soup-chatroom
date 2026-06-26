import type {
  HostAnswer,
  PublicHostAnswer,
  PublicPuzzle,
  PublicRoomState,
  Puzzle,
  RoomState
} from "../src/shared/types";

function toPublicPuzzle(puzzle: Puzzle): PublicPuzzle {
  const { truth, solutionPoints, ...publicFields } = puzzle;
  const hints = "hints" in puzzle && Array.isArray((puzzle as { hints?: unknown[] }).hints)
    ? ((puzzle as { hints: unknown[] }).hints)
    : [];
  return {
    ...publicFields,
    hintCount: hints.length
  };
}

function toPublicHostAnswer(answer: HostAnswer): PublicHostAnswer {
  const { coveredPointIds, coverageConfidence, ...publicFields } = answer;
  return publicFields;
}

export function toPublicRoomState(room: RoomState): PublicRoomState {
  const { puzzle, hostLog, truthRevealed, ...rest } = room;
  return {
    ...rest,
    puzzle: toPublicPuzzle(puzzle),
    hostLog: hostLog.map(toPublicHostAnswer),
    truthRevealed,
    ...(truthRevealed ? { truth: puzzle.truth } : {})
  };
}
