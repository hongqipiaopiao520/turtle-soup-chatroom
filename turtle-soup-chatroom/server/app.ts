import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { createAdminPuzzleRouter } from "./adminPuzzleRoutes";
import type { PuzzleRepository } from "./storage/puzzleRepository";

export function listPublicPuzzles(puzzleRepository: PuzzleRepository) {
  return puzzleRepository.listPublished().map(({ truth, ...publicPuzzle }) => publicPuzzle);
}

export function getClientAppAssets(root = process.cwd(), nodeEnv = process.env.NODE_ENV) {
  const distPath = path.join(root, "dist");
  const indexPath = path.join(distPath, "index.html");
  return {
    enabled: nodeEnv === "production" && existsSync(indexPath),
    distPath,
    indexPath
  };
}

export function shouldServeClientRoute(method: string, url: string) {
  if (method !== "GET" && method !== "HEAD") return false;
  if (url.startsWith("/api/") || url === "/api") return false;
  if (url.startsWith("/socket.io/")) return false;
  return true;
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

  app.use("/api/admin", createAdminPuzzleRouter(puzzleRepository));

  const clientAssets = getClientAppAssets();
  if (clientAssets.enabled) {
    app.use(express.static(clientAssets.distPath));
    app.use((request, response, next) => {
      if (!shouldServeClientRoute(request.method, request.url)) {
        next();
        return;
      }
      response.sendFile(clientAssets.indexPath);
    });
  }

  return app;
}
