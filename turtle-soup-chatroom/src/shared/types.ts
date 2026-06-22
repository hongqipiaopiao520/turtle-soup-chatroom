export type Difficulty = "easy" | "medium" | "hard";

export type RoomStatus = "waiting" | "playing" | "solved" | "closed";

export type HostAnswerType =
  | "yes"
  | "no"
  | "irrelevant"
  | "partial"
  | "solved"
  | "unsolved";

export interface Puzzle {
  id: string;
  title: string;
  surface: string;
  truth: string;
  difficulty: Difficulty;
  tags: string[];
  author: string;
  rating: number;
  plays: number;
  createdAt: string;
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
}

export interface HostAnswer {
  id: string;
  playerId: string;
  playerName: string;
  question: string;
  answerType: HostAnswerType;
  answer: string;
  pinned: boolean;
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
  chatMessages: ChatMessage[];
  caseNotes: CaseNote[];
  questionLimit: number;
  questionsUsed: number;
  createdAt: string;
}
