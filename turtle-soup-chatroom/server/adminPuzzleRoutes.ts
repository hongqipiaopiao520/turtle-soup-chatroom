import { Router } from "express";
import type { ManagedPuzzle, PuzzleStatus } from "../src/shared/types";
import { createFallbackDraft, importPuzzleFromText } from "./puzzleImporter";
import type { PuzzleRepository } from "./storage/puzzleRepository";

interface ImportTextInput {
  rawText: string;
  sourceUrl?: string;
  sourceTitle?: string;
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
  return repository.upsertManaged(createFallbackDraft(input.rawText, input.sourceUrl, input.sourceTitle));
}

export async function importTextWithAi(repository: PuzzleRepository, input: ImportTextInput): Promise<ManagedPuzzle> {
  const result = await importPuzzleFromText(input.rawText, input.sourceUrl, input.sourceTitle);
  return repository.upsertManaged(result.puzzle);
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

  router.post("/puzzles/:id/publish", (request, response) => {
    response.json(publishAdminPuzzle(repository, request.params.id));
  });

  router.post("/puzzles/:id/reject", (request, response) => {
    response.json(rejectAdminPuzzle(repository, request.params.id));
  });

  return router;
}
