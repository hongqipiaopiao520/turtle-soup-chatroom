import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { createAdminPuzzleRouter } from "./adminPuzzleRoutes";
import { createAiHostHarnessRouter } from "./aiHostHarnessRoutes";
import { getRoom } from "./roomStore";
import type { PuzzleRepository } from "./storage/puzzleRepository";
import type { RoomRepository } from "./storage/roomRepository";

const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "24mb";

export function getAllowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildCorsOptions() {
  const allowedOrigins = getAllowedOrigins();
  return {
    origin: (origin: string | undefined, callback: (err: Error | null, ok?: boolean) => void) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    }
  };
}

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
  if (url.startsWith("/share/")) return false;
  return true;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function createApp(puzzleRepository: PuzzleRepository, roomRepository?: RoomRepository) {
  const app = express();
  app.use(cors(buildCorsOptions()));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/puzzles", (_request, response) => {
    response.json(listPublicPuzzles(puzzleRepository));
  });

  app.get("/share/room/:roomId", (request, response) => {
    const room = getRoom(request.params.roomId);
    const title = room ? `海龟汤：${room.puzzle.title}` : "知心李歪聊天室 — AI 海龟汤";
    const description = room
      ? `难度：${room.puzzle.difficulty} | ${room.players.length}人正在玩`
      : "和好友一起玩 AI 主持的海龟汤推理游戏";
    const redirectUrl = room ? `/?room=${room.id}` : "/";
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta http-equiv="refresh" content="0;url=${redirectUrl}" />
</head><body><p>正在跳转…</p></body></html>`;
    response.type("html").send(html);
  });

  app.use("/api/admin", createAdminPuzzleRouter(puzzleRepository));
  if (roomRepository) {
    app.use("/api/admin", createAiHostHarnessRouter(roomRepository));
  }
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
