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

export type AdminBatchImportItem = AdminPuzzleImportInput;

export interface AdminImageImportInput {
  images: Array<{ file: File; role?: "auto" | "surface" | "truth" | "full" }>;
}

export interface AdminImageImportResult {
  title: string;
  surface: string;
  truth: string;
  rawText: string;
  correctedNotes: string[];
}

export interface AdminBatchImportResult {
  imported: ManagedPuzzle[];
  failed: Array<AdminBatchImportFailure>;
}

export interface AdminBatchImportFailure extends AdminBatchImportItem {
  index: number;
  message: string;
}

export interface AdminBatchPublishResult {
  published: ManagedPuzzle[];
  failed: Array<{ id: string; message: string }>;
}

export interface AdminBatchDeleteResult {
  deleted: ManagedPuzzle[];
  failed: Array<{ id: string; message: string }>;
}

export interface AdminTagReanalysisInput {
  ids?: string[];
  status?: PuzzleStatus | "all";
}

export interface AdminTagReanalysisResult {
  updated: ManagedPuzzle[];
  unchanged: string[];
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

export function importAdminPuzzleBatch(items: AdminBatchImportItem[], options: AdminClientOptions = {}) {
  return adminFetch<AdminBatchImportResult>(
    "/api/admin/puzzles/import-batch",
    {
      method: "POST",
      headers: headers(options, true),
      body: JSON.stringify({ items })
    },
    options
  );
}

export function parseAdminPuzzleImages(input: AdminImageImportInput, options: AdminClientOptions = {}) {
  const body = new FormData();
  for (const image of input.images) {
    body.append("images", image.file, image.file.name);
    body.append("roles", image.role ?? "auto");
  }
  return adminFetch<AdminImageImportResult>(
    "/api/admin/puzzles/import-images/parse",
    {
      method: "POST",
      headers: headers(options),
      body
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

export async function publishAdminPuzzleBatch(ids: string[], options: AdminClientOptions = {}): Promise<AdminBatchPublishResult> {
  const published: ManagedPuzzle[] = [];
  const failed: Array<{ id: string; message: string }> = [];

  for (const id of ids) {
    try {
      published.push(await publishAdminPuzzle(id, options));
    } catch (error) {
      failed.push({ id, message: error instanceof Error ? error.message : "发布失败" });
    }
  }

  return { published, failed };
}

export function deleteAdminPuzzle(id: string, options: AdminClientOptions = {}) {
  return adminFetch<ManagedPuzzle>(
    `/api/admin/puzzles/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: headers(options)
    },
    options
  );
}

export async function deleteAdminPuzzleBatch(ids: string[], options: AdminClientOptions = {}): Promise<AdminBatchDeleteResult> {
  const deleted: ManagedPuzzle[] = [];
  const failed: Array<{ id: string; message: string }> = [];

  for (const id of ids) {
    try {
      deleted.push(await deleteAdminPuzzle(id, options));
    } catch (error) {
      failed.push({ id, message: error instanceof Error ? error.message : "删除失败" });
    }
  }

  return { deleted, failed };
}

export function reanalyzeAdminPuzzleTags(input: AdminTagReanalysisInput, options: AdminClientOptions = {}) {
  return adminFetch<AdminTagReanalysisResult>(
    "/api/admin/puzzles/reanalyze-tags",
    {
      method: "POST",
      headers: headers(options, true),
      body: JSON.stringify(input)
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
