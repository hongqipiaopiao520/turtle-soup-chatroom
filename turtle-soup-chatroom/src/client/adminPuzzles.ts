import type { Difficulty, ManagedPuzzle, PuzzleStatus } from "../shared/types";

export interface AdminClientOptions {
  token?: string;
  fetcher?: typeof fetch;
}

export interface AdminPuzzleImportInput {
  rawText: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

export interface AdminPuzzleUpdateInput {
  title: string;
  surface: string;
  truth: string;
  solutionPoints: string[];
  hints: string[];
  difficulty: Difficulty;
  tags: string[];
  qualityScore: number;
  qualityIssues: string[];
  qualitySummary: string;
  sourceTitle?: string;
  sourceUrl?: string;
  rawText?: string;
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

export function fetchAdminPuzzles(options: AdminClientOptions & { status?: PuzzleStatus } = {}) {
  const params = new URLSearchParams();
  if (options.status) {
    params.set("status", options.status);
  }
  const query = params.toString();
  return adminFetch<ManagedPuzzle[]>(
    `/api/admin/puzzles${query ? `?${query}` : ""}`,
    { headers: headers(options) },
    options
  );
}

export function importAdminPuzzleText(input: AdminPuzzleImportInput, options: AdminClientOptions = {}) {
  return adminFetch<ManagedPuzzle>(
    "/api/admin/puzzles/import-text",
    {
      method: "POST",
      headers: headers(options, true),
      body: JSON.stringify(input)
    },
    options
  );
}

export function updateAdminPuzzle(id: string, input: AdminPuzzleUpdateInput, options: AdminClientOptions = {}) {
  return adminFetch<ManagedPuzzle>(
    `/api/admin/puzzles/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: headers(options, true),
      body: JSON.stringify(input)
    },
    options
  );
}

export function publishAdminPuzzle(id: string, options: AdminClientOptions = {}) {
  return adminFetch<ManagedPuzzle>(
    `/api/admin/puzzles/${encodeURIComponent(id)}/publish`,
    {
      method: "POST",
      headers: headers(options)
    },
    options
  );
}

export function rejectAdminPuzzle(id: string, options: AdminClientOptions = {}) {
  return adminFetch<ManagedPuzzle>(
    `/api/admin/puzzles/${encodeURIComponent(id)}/reject`,
    {
      method: "POST",
      headers: headers(options)
    },
    options
  );
}
