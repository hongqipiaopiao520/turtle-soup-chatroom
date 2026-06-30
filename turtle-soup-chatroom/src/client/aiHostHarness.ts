import type { HostAnswer, HostCriticReview, HostPersonaId, RoomState, RoomStatus } from "../shared/types";
import type { AdminClientOptions } from "./adminPuzzles";

export interface AiHostRoomSummary {
  roomId: string;
  puzzleTitle: string;
  hostPersonaId: HostPersonaId;
  status: RoomStatus;
  questionsUsed: number;
  progress: number;
  answerCount: number;
  reviewedCount: number;
  flaggedCount: number;
  createdAt: string;
}

export interface AiHostReviewRow {
  roomId: string;
  answerId: string;
  puzzleTitle: string;
  question: string;
  answer: string;
  styleText?: string;
  answerType: HostAnswer["answerType"];
  progress: number;
  progressDelta: number;
  criticReview: HostCriticReview;
  createdAt: string;
}

export interface AiHostRoomReviewResult {
  reviewed: HostCriticReview[];
  failed: Array<{ answerId: string; message: string }>;
}

function headers(options: AdminClientOptions, hasJsonBody = false) {
  const nextHeaders: Record<string, string> = {};
  if (hasJsonBody) {
    nextHeaders["Content-Type"] = "application/json";
  }
  if (options.token) {
    nextHeaders.Authorization = `Bearer ${options.token}`;
  }
  return nextHeaders;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { message?: string } | T | null;
  if (!response.ok) {
    const message = typeof payload === "object" && payload && "message" in payload ? payload.message : undefined;
    throw new Error(message || `请求失败：${response.status}`);
  }
  return payload as T;
}

async function adminFetch<T>(path: string, init: RequestInit, options: AdminClientOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(path, init);
  return parseJsonResponse<T>(response);
}

export function fetchAiHostRooms(options: AdminClientOptions = {}) {
  return adminFetch<AiHostRoomSummary[]>("/api/admin/ai-host/rooms", { headers: headers(options) }, options);
}

export function fetchAiHostRoom(roomId: string, options: AdminClientOptions = {}) {
  return adminFetch<RoomState>(`/api/admin/ai-host/rooms/${encodeURIComponent(roomId)}`, { headers: headers(options) }, options);
}

export function fetchAiHostReviews(options: AdminClientOptions & { status?: string; severity?: string; risk?: string; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (options.status) params.set("status", options.status);
  if (options.severity) params.set("severity", options.severity);
  if (options.risk) params.set("risk", options.risk);
  if (options.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  return adminFetch<AiHostReviewRow[]>(`/api/admin/ai-host/reviews${query ? `?${query}` : ""}`, { headers: headers(options) }, options);
}

export function reviewAiHostAnswer(roomId: string, answerId: string, options: AdminClientOptions = {}) {
  return adminFetch<HostCriticReview>(
    `/api/admin/ai-host/rooms/${encodeURIComponent(roomId)}/answers/${encodeURIComponent(answerId)}/review`,
    {
      method: "POST",
      headers: headers(options)
    },
    options
  );
}

export function reviewAiHostRoom(roomId: string, options: AdminClientOptions = {}) {
  return adminFetch<AiHostRoomReviewResult>(
    `/api/admin/ai-host/rooms/${encodeURIComponent(roomId)}/review`,
    {
      method: "POST",
      headers: headers(options)
    },
    options
  );
}
