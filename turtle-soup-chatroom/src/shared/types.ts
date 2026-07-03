export type Difficulty = "easy" | "medium" | "hard";

export type RoomStatus = "waiting" | "playing" | "solved" | "closed";

export type HostPersonaId = "xiaowai" | "dav" | "guigui";

export type CriticSeverity = "none" | "low" | "medium" | "high";

export type CriticRisk =
  | "spoiler"
  | "invalid_misuse"
  | "progress_inflation"
  | "style_boundary"
  | "hallucination"
  | "mode_violation"
  | "parse_error"
  | "critic_unavailable";

export type CriticAction = "allow" | "strip_style" | "downgrade_progress" | "replace_with_fallback" | "manual_review";

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

export interface PuzzleAiProfile {
  themes: string[];
  moods: string[];
  twistTypes: string[];
  contentWarnings: string[];
  suitableFor: string[];
  intensity: {
    gore: number;
    horror: number;
    sadness: number;
    absurdity: number;
  };
  spoilerFreePitch: string;
  estimatedQuestions: number;
  profileVersion: number;
  generatedAt: string;
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
  aiProfile?: PuzzleAiProfile;
}

export interface OpeningDirectorIntent {
  rawText: string;
  themes: string[];
  moods: string[];
  avoidThemes: string[];
  preferredDifficulty?: Difficulty;
  preferredHostPersonaId?: HostPersonaId;
  maxGore?: number;
  playerCount?: number;
  desiredLength?: "short" | "standard" | "long";
  confidence: number;
  source: "ai" | "fallback";
}

export type OpeningDirectorSource = "profile-score" | "ai-intent-profile-score" | "fallback";

export type OpeningDirectorTraceStatus = "done" | "active" | "waiting" | "fallback";

export interface OpeningDirectorTraceItem {
  id: "parse_intent" | "search_puzzles" | "rank_profiles" | "draft_plans" | "request_confirm";
  toolName: "parse_intent" | "search_puzzles" | "rank_profiles" | "draft_plans" | "request_confirm";
  label: string;
  status: OpeningDirectorTraceStatus;
  summary: string;
  detail: string;
  inputSummary: string;
  outputSummary: string;
}

export interface OpeningDirectorPlan {
  id: string;
  puzzle: PublicPuzzle;
  title: string;
  reason: string;
  matchSummary: string;
  retrievalMatches: string[];
  retrievalScore: number;
  chips: string[];
  contentIntensity: string;
  hostPersonaId: HostPersonaId;
  questionLimit: number;
  confidence: "high" | "medium" | "low";
  source: OpeningDirectorSource;
}

export interface OpeningDirectorRequest {
  prompt: string;
  limit?: number;
  decisionId?: string;
}

export interface OpeningDirectorDecisionOption {
  id: "more_intense" | "more_reasoning";
  title: string;
  description: string;
  promptPatch: string;
}

export interface OpeningDirectorDecision {
  id: "clarify_intensity";
  title: string;
  reason: string;
  options: OpeningDirectorDecisionOption[];
}

export interface OpeningDirectorResponse {
  intent: OpeningDirectorIntent;
  plans: OpeningDirectorPlan[];
  agentTrace: OpeningDirectorTraceItem[];
  decision?: OpeningDirectorDecision;
  fallbackUsed: boolean;
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

export interface HostCriticReview {
  id: string;
  status: "passed" | "flagged" | "error";
  severity: CriticSeverity;
  action: CriticAction;
  risks: CriticRisk[];
  rationale: string;
  suggestedAnswerType?: HostAnswerType;
  suggestedAnswer?: string;
  suggestedStyleText?: string;
  suggestedProgress?: number;
  suggestedCoveredPointIds?: string[];
  confidence: number;
  model?: string;
  durationMs: number;
  reviewedAt: string;
}

export interface HostAnswer {
  id: string;
  playerId: string;
  playerName: string;
  question: string;
  answerType: HostAnswerType;
  answer: string;
  styleText?: string;
  progress: number;
  progressDelta: number;
  contributionScore: number;
  isBreakthrough: boolean;
  pinned: boolean;
  coveredPointIds?: string[];
  coverageConfidence?: number;
  criticReview?: HostCriticReview;
  createdAt: string;
}

export type PublicHostAnswer = Omit<HostAnswer, "coveredPointIds" | "coverageConfidence" | "criticReview">;

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
  hostPersonaId: HostPersonaId;
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
  hostPersonaId: HostPersonaId;
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
