import { Router } from "express";
import type { ManagedPuzzle, PuzzleStatus } from "../src/shared/types";
import type { PuzzleRepository } from "./storage/puzzleRepository";

interface ImportTextInput {
  rawText: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function normalizeRawText(rawText: string) {
  return rawText.trim().replace(/\r\n/g, "\n");
}

function titleFromRawText(rawText: string) {
  return normalizeRawText(rawText).split("\n").find(Boolean)?.slice(0, 40) || "未命名题目";
}

function surfaceFromRawText(rawText: string) {
  return normalizeRawText(rawText).slice(0, 180) || "待补充汤面";
}

export function isAdminRequestAuthorized(authorizationHeader: string | undefined) {
  const token = process.env.ADMIN_TOKEN;
  if (!token && process.env.NODE_ENV !== "production") return true;
  return authorizationHeader === `Bearer ${token}`;
}

export function listAdminPuzzles(repository: PuzzleRepository, status?: PuzzleStatus) {
  return repository.listManaged(status);
}

export function importTextDraft(repository: PuzzleRepository, input: ImportTextInput): ManagedPuzzle {
  const now = new Date().toISOString();
  const rawText = normalizeRawText(input.rawText);
  return repository.upsertManaged({
    id: id("puzzle"),
    title: titleFromRawText(rawText),
    surface: surfaceFromRawText(rawText),
    truth: "待结构化汤底",
    solutionPoints: [],
    difficulty: "medium",
    tags: [],
    author: "题库导入",
    rating: 0,
    plays: 0,
    createdAt: now,
    status: "draft",
    rawText,
    sourceUrl: input.sourceUrl,
    sourceTitle: input.sourceTitle,
    hints: [],
    estimatedMinutes: 15,
    qualityScore: 0,
    qualityIssues: ["尚未经过 LLM 结构化"],
    qualitySummary: "原始文本已保存，等待结构化和人工审核。",
    updatedAt: now
  });
}

export function publishAdminPuzzle(repository: PuzzleRepository, puzzleId: string) {
  return repository.publish(puzzleId);
}

export function rejectAdminPuzzle(repository: PuzzleRepository, puzzleId: string) {
  return repository.reject(puzzleId);
}

export function createAdminPuzzleRouter(repository: PuzzleRepository) {
  const router = Router();

  router.use((request, response, next) => {
    if (!isAdminRequestAuthorized(request.header("authorization"))) {
      response.status(401).json({ message: "未授权" });
      return;
    }
    next();
  });

  router.get("/puzzles", (request, response) => {
    const status = typeof request.query.status === "string" ? (request.query.status as PuzzleStatus) : undefined;
    response.json(listAdminPuzzles(repository, status));
  });

  router.post("/puzzles/import-text", (request, response) => {
    const rawText = typeof request.body?.rawText === "string" ? request.body.rawText : "";
    if (!rawText.trim()) {
      response.status(400).json({ message: "rawText 不能为空" });
      return;
    }
    response.status(201).json(
      importTextDraft(repository, {
        rawText,
        sourceUrl: request.body?.sourceUrl,
        sourceTitle: request.body?.sourceTitle
      })
    );
  });

  router.post("/puzzles/:id/publish", (request, response) => {
    response.json(publishAdminPuzzle(repository, request.params.id));
  });

  router.post("/puzzles/:id/reject", (request, response) => {
    response.json(rejectAdminPuzzle(repository, request.params.id));
  });

  return router;
}
