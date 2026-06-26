export type Difficulty = "easy" | "medium" | "hard";

export type RoomStatus = "waiting" | "playing" | "solved" | "closed";

export type HostAnswerType =
  | "yes"
  | "no"
  | "irrelevant"
  | "partial"
  | "invalid"
  | "solved"
  | "unsolved";

export interface Puzzle {
  id: string;
  title: string;
  surface: string;
  truth: string;
  solutionPoints: string[];
  difficulty: Difficulty;
  tags: string[];
  author: string;
  rating: number;
  plays: number;
  createdAt: string;
}

export interface SolutionPointDefinition {
  id: string;
  label: string;
  weight: number;
  aliases: string[];
}

export type PublicPuzzle = Omit<Puzzle, "truth" | "solutionPoints"> & {
  hintCount: number;
};

export type PuzzleStatus = "draft" | "reviewing" | "published" | "rejected";

export interface ManagedPuzzle extends Puzzle {
  status: PuzzleStatus;
  rawText?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  hints: string[];
  estimatedMinutes: number;
  qualityScore: number;
  qualityIssues: string[];
  qualitySummary: string;
  reviewedAt?: string;
  publishedAt?: string;
  updatedAt: string;
}

export type PuzzleSort = "hot" | "latest" | "rating";

export interface PuzzleFilters {
  query?: string;
  difficulty?: Difficulty | "all";
  tag?: string | "all";
  sort: PuzzleSort;
}

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: string;
  score: number;
  hits: number;
  bestDelta: number;
}

export interface HostAnswer {
  id: string;
  playerId: string;
  playerName: string;
  question: string;
  answerType: HostAnswerType;
  answer: string;
  progress: number;
  progressDelta: number;
  contributionScore: number;
  isBreakthrough: boolean;
  pinned: boolean;
  coveredPointIds?: string[];
  coverageConfidence?: number;
  createdAt: string;
}

export type PublicHostAnswer = Omit<HostAnswer, "coveredPointIds" | "coverageConfidence">;

export interface HostPending {
  id: string;
  playerId: string;
  playerName: string;
  question: string;
  mode: "question" | "guess";
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  body: string;
  createdAt: string;
}

export interface CaseNote {
  id: string;
  sourceAnswerId?: string;
  body: string;
  createdAt: string;
}

export interface RoomState {
  id: string;
  puzzle: Puzzle;
  status: RoomStatus;
  players: Player[];
  hostLog: HostAnswer[];
  hostPending?: HostPending;
  chatMessages: ChatMessage[];
  caseNotes: CaseNote[];
  questionLimit: number;
  questionsUsed: number;
  progress: number;
  answerUnlocked: boolean;
  truthRevealed: boolean;
  settlement?: RoomSettlement;
  hintsRevealed: number;
  hintRequestedBy: string[];
  revealedHints: string[];
  createdAt: string;
}

export interface PublicRoomState {
  id: string;
  puzzle: PublicPuzzle;
  status: RoomStatus;
  players: Player[];
  hostLog: PublicHostAnswer[];
  hostPending?: HostPending;
  chatMessages: ChatMessage[];
  caseNotes: CaseNote[];
  questionLimit: number;
  questionsUsed: number;
  progress: number;
  answerUnlocked: boolean;
  truthRevealed: boolean;
  truth?: string;
  settlement?: RoomSettlement;
  hintsRevealed: number;
  hintRequestedBy: string[];
  revealedHints: string[];
  createdAt: string;
}

export interface RoomSession {
  room: PublicRoomState;
  playerId: string;
}

export interface RoomStoreSession {
  room: RoomState;
  playerId: string;
}

export interface RoomSettlement {
  mvpPlayerId?: string;
  bestAnswerId?: string;
  unlockingPlayerId?: string;
  finalGuess?: string;
  finalGuessPlayerId?: string;
  finalGuessResult?: "solved" | "unsolved";
  hintsRevealed: number;
  durationMs: number;
  endedAt: string;
  endedBy: "solved" | "host-reveal";
}
