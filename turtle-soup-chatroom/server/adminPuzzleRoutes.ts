import { Router, raw } from "express";
import { z } from "zod";
import type { ManagedPuzzle, PuzzleStatus } from "../src/shared/types";
import { importPuzzleTextFromImages } from "./imagePuzzleImporter";
import { parseMultipartImageUpload } from "./multipartImageUpload";
import { createFallbackDraft, importPuzzleFromText } from "./puzzleImporter";
import type { PuzzleRepository } from "./storage/puzzleRepository";

interface ImportTextInput {
  rawText: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

const ImportBatchSchema = z.object({
  items: z.array(z.object({
    rawText: z.string().trim().min(1).max(10000),
    sourceTitle: z.string().trim().max(160).optional(),
    sourceUrl: z.string().trim().url().optional().or(z.literal(""))
  })).min(1).max(100)
});

const ImportImagesSchema = z.object({
  images: z.array(z.object({
    dataUrl: z.string().trim().startsWith("data:image/").max(6_000_000),
    role: z.enum(["auto", "surface", "truth", "full"]).optional()
  })).min(1).max(6)
});

const AdminPuzzleUpdateSchema = z.object({
  title: z.string().trim().min(1).max(80),
  surface: z.string().trim().min(1).max(500),
  truth: z.string().trim().min(1).max(2000),
  solutionPoints: z.array(z.string().trim().min(1)).min(1).max(12),
  hints: z.array(z.string().trim().min(1)).max(10).default([]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  tags: z.array(z.string().trim().min(1)).max(10).default([]),
  qualityScore: z.number().min(0).max(100),
  qualityIssues: z.array(z.string().trim().min(1)).max(16).default([]),
  qualitySummary: z.string().trim().max(500).default(""),
  sourceTitle: z.string().trim().max(160).optional(),
  sourceUrl: z.string().trim().url().optional().or(z.literal("")),
  rawText: z.string().trim().max(10000).optional()
});

export function isAdminRequestAuthorized(authorizationHeader: string | undefined) {
  const token = process.env.ADMIN_TOKEN;
  if (!token && process.env.NODE_ENV !== "production") return true;
  return authorizationHeader === `Bearer ${token}`;
}

export function listAdminPuzzles(repository: PuzzleRepository, status?: PuzzleStatus) {
  return repository.listManaged(status);
}

export function importTextDraft(repository: PuzzleRepository, input: ImportTextInput): ManagedPuzzle {
  return repository.upsertManaged(createFallbackDraft(input.rawText, input.sourceUrl, input.sourceTitle));
}

export async function importTextWithAi(repository: PuzzleRepository, input: ImportTextInput): Promise<ManagedPuzzle> {
  const result = await importPuzzleFromText(input.rawText, input.sourceUrl, input.sourceTitle);
  return repository.upsertManaged(result.puzzle);
}

export async function importBatchWithAi(repository: PuzzleRepository, input: unknown) {
  const parsed = ImportBatchSchema.parse(input);
  const imported: ManagedPuzzle[] = [];
  const failed: Array<{ index: number; message: string; rawText: string; sourceTitle?: string; sourceUrl?: string }> = [];

  for (let index = 0; index < parsed.items.length; index += 1) {
    const item = parsed.items[index];
    try {
      imported.push(await importTextWithAi(repository, {
        rawText: item.rawText,
        sourceTitle: item.sourceTitle,
        sourceUrl: item.sourceUrl || undefined
      }));
    } catch (error) {
      failed.push({
        index,
        message: error instanceof Error ? error.message : "导入失败",
        rawText: item.rawText,
        sourceTitle: item.sourceTitle,
        sourceUrl: item.sourceUrl || undefined
      });
    }
  }

  return { imported, failed };
}

export function publishAdminPuzzle(repository: PuzzleRepository, puzzleId: string) {
  return repository.publish(puzzleId);
}

export function rejectAdminPuzzle(repository: PuzzleRepository, puzzleId: string) {
  return repository.reject(puzzleId);
}

export function updateAdminPuzzle(repository: PuzzleRepository, puzzleId: string, input: unknown) {
  const parsed = AdminPuzzleUpdateSchema.parse(input);
  return repository.updateManaged(puzzleId, {
    ...parsed,
    sourceUrl: parsed.sourceUrl || undefined
  });
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

  router.post("/puzzles/import-text", async (request, response) => {
    const rawText = typeof request.body?.rawText === "string" ? request.body.rawText : "";
    if (!rawText.trim()) {
      response.status(400).json({ message: "rawText 不能为空" });
      return;
    }
    response.status(201).json(
      await importTextWithAi(repository, {
        rawText,
        sourceUrl: request.body?.sourceUrl,
        sourceTitle: request.body?.sourceTitle
      })
    );
  });

  router.post("/puzzles/import-batch", async (request, response) => {
    try {
      response.status(201).json(await importBatchWithAi(repository, request.body));
    } catch (error) {
      response.status(400).json({ message: error instanceof Error ? error.message : "批量导入失败" });
    }
  });

  router.post("/puzzles/import-images/parse", raw({ type: "multipart/form-data", limit: "12mb" }), async (request, response) => {
    try {
      const parsed = Buffer.isBuffer(request.body)
        ? parseMultipartImageUpload(request.body, request.header("content-type"))
        : ImportImagesSchema.parse(request.body);
      response.json(await importPuzzleTextFromImages(parsed));
    } catch (error) {
      response.status(400).json({ message: error instanceof Error ? error.message : "图片解析失败" });
    }
  });

  router.post("/puzzles/:id/publish", (request, response) => {
    response.json(publishAdminPuzzle(repository, request.params.id));
  });

  router.post("/puzzles/:id/reject", (request, response) => {
    response.json(rejectAdminPuzzle(repository, request.params.id));
  });

  router.put("/puzzles/:id", (request, response) => {
    try {
      response.json(updateAdminPuzzle(repository, request.params.id, request.body));
    } catch (error) {
      response.status(400).json({ message: error instanceof Error ? error.message : "题目更新失败" });
    }
  });

  return router;
}
