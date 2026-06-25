import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { createAdminPuzzleRouter } from "./adminPuzzleRoutes";
import type { PuzzleRepository } from "./storage/puzzleRepository";

const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "24mb";

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
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/puzzles", (_request, response) => {
    response.json(listPublicPuzzles(puzzleRepository));
  });

  app.use("/api/admin", createAdminPuzzleRouter(puzzleRepository));
  app.use(handlePayloadTooLargeError);

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

function handlePayloadTooLargeError(error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) {
  if (isPayloadTooLargeError(error)) {
    const limit = readPayloadLimit(error);
    response.status(413).json({ message: `请求内容超过服务端限制${limit ? `（${formatBytes(limit)}）` : ""}，请减少图片数量或裁剪长图后再试` });
    return;
  }
  next(error);
}

function isPayloadTooLargeError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      ("type" in error ? error.type === "entity.too.large" : false)
  );
}

function readPayloadLimit(error: unknown) {
  if (!error || typeof error !== "object" || !("limit" in error) || typeof error.limit !== "number") {
    return 0;
  }
  return error.limit;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
