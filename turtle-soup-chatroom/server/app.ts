import express from "express";
import type { PuzzleRepository } from "./storage/puzzleRepository";

export function listPublicPuzzles(puzzleRepository: PuzzleRepository) {
  return puzzleRepository.listPublished().map(({ truth, ...publicPuzzle }) => publicPuzzle);
}

export function createApp(puzzleRepository: PuzzleRepository) {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/puzzles", (_request, response) => {
    response.json(listPublicPuzzles(puzzleRepository));
  });

  return app;
}
