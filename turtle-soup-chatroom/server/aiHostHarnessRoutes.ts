import { Router } from "express";
import { z } from "zod";
import type { HostAnswer, HostCriticReview, RoomState } from "../src/shared/types";
import { reviewHostAnswer } from "./aiCritic";
import { isAdminRequestAuthorized } from "./adminPuzzleRoutes";
import { getRoom, saveCriticReview } from "./roomStore";
import type { RoomRepository } from "./storage/roomRepository";

const ReviewListQuerySchema = z.object({
  status: z.enum(["passed", "flagged", "error", "all"]).default("all"),
  severity: z.enum(["none", "low", "medium", "high", "all"]).default("all"),
  risk: z.string().trim().optional(),
  limit: z.coerce.number().min(1).max(200).default(50)
});

export interface AiHostRoomSummary {
  roomId: string;
  puzzleTitle: string;
  hostPersonaId: RoomState["hostPersonaId"];
  status: RoomState["status"];
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

function sortedRooms(roomRepository: RoomRepository): RoomState[] {
  return roomRepository.loadAll().sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function listAiHostRooms(roomRepository: RoomRepository): AiHostRoomSummary[] {
  return sortedRooms(roomRepository).map((room) => {
    const reviews = room.hostLog.map((answer) => answer.criticReview).filter((review): review is HostCriticReview => Boolean(review));
    return {
      roomId: room.id,
      puzzleTitle: room.puzzle.title,
      hostPersonaId: room.hostPersonaId,
      status: room.status,
      questionsUsed: room.questionsUsed,
      progress: room.progress,
      answerCount: room.hostLog.length,
      reviewedCount: reviews.length,
      flaggedCount: reviews.filter((review) => review.status === "flagged" || review.severity === "high").length,
      createdAt: room.createdAt
    };
  });
}

export function listAiHostReviewRows(roomRepository: RoomRepository, query: unknown): AiHostReviewRow[] {
  const parsed = ReviewListQuerySchema.parse(query);
  const rows = sortedRooms(roomRepository).flatMap((room) => room.hostLog.flatMap((answer): AiHostReviewRow[] => {
    if (!answer.criticReview) return [];
    return [{
      roomId: room.id,
      answerId: answer.id,
      puzzleTitle: room.puzzle.title,
      question: answer.question,
      answer: answer.answer,
      ...(answer.styleText ? { styleText: answer.styleText } : {}),
      answerType: answer.answerType,
      progress: answer.progress,
      progressDelta: answer.progressDelta,
      criticReview: answer.criticReview,
      createdAt: answer.createdAt
    }];
  }));
  return rows
    .filter((row) => parsed.status === "all" || row.criticReview.status === parsed.status)
    .filter((row) => parsed.severity === "all" || row.criticReview.severity === parsed.severity)
    .filter((row) => !parsed.risk || row.criticReview.risks.includes(parsed.risk as never))
    .slice(0, parsed.limit);
}

export function getAiHostRoomDetail(roomRepository: RoomRepository, roomId: string): RoomState {
  const room = getRoom(roomId) ?? roomRepository.loadAll().find((item) => item.id === roomId);
  if (!room) {
    throw new Error("房间不存在");
  }
  return room;
}

function reviewHistory(room: RoomState, answer: HostAnswer) {
  const index = room.hostLog.findIndex((item) => item.id === answer.id);
  return index >= 0 ? room.hostLog.slice(0, index + 1) : room.hostLog;
}

export async function reviewAiHostAnswer(roomRepository: RoomRepository, roomId: string, answerId: string) {
  const room = getAiHostRoomDetail(roomRepository, roomId);
  const answer = room.hostLog.find((item) => item.id === answerId);
  if (!answer) {
    throw new Error("问答不存在");
  }
  const review = await reviewHostAnswer({
    roomId,
    puzzle: room.puzzle,
    hostPersonaId: room.hostPersonaId,
    currentProgress: room.progress,
    history: reviewHistory(room, answer),
    answer
  });

  try {
    const updated = saveCriticReview(roomId, answerId, review);
    roomRepository.save(updated);
  } catch {
    answer.criticReview = review;
    roomRepository.save(room);
  }

  return review;
}

export async function reviewAiHostRoom(roomRepository: RoomRepository, roomId: string) {
  const room = getAiHostRoomDetail(roomRepository, roomId);
  const answers = room.hostLog.filter((answer) => !answer.criticReview).slice(0, 20);
  const reviewed: HostCriticReview[] = [];
  const failed: Array<{ answerId: string; message: string }> = [];
  for (const answer of answers) {
    try {
      reviewed.push(await reviewAiHostAnswer(roomRepository, roomId, answer.id));
    } catch (error) {
      failed.push({ answerId: answer.id, message: error instanceof Error ? error.message : "审查失败" });
    }
  }
  return { reviewed, failed };
}

export function createAiHostHarnessRouter(roomRepository: RoomRepository) {
  const router = Router();

  router.use((request, response, next) => {
    if (!isAdminRequestAuthorized(request.header("authorization"))) {
      response.status(401).json({ message: "未授权" });
      return;
    }
    next();
  });

  router.get("/ai-host/rooms", (_request, response) => {
    response.json(listAiHostRooms(roomRepository));
  });

  router.get("/ai-host/reviews", (request, response) => {
    try {
      response.json(listAiHostReviewRows(roomRepository, request.query));
    } catch (error) {
      response.status(400).json({ message: error instanceof Error ? error.message : "查询失败" });
    }
  });

  router.get("/ai-host/rooms/:roomId", (request, response) => {
    try {
      response.json(getAiHostRoomDetail(roomRepository, request.params.roomId));
    } catch (error) {
      response.status(404).json({ message: error instanceof Error ? error.message : "房间不存在" });
    }
  });

  router.post("/ai-host/rooms/:roomId/answers/:answerId/review", async (request, response) => {
    try {
      response.json(await reviewAiHostAnswer(roomRepository, request.params.roomId, request.params.answerId));
    } catch (error) {
      response.status(400).json({ message: error instanceof Error ? error.message : "审查失败" });
    }
  });

  router.post("/ai-host/rooms/:roomId/review", async (request, response) => {
    try {
      response.json(await reviewAiHostRoom(roomRepository, request.params.roomId));
    } catch (error) {
      response.status(400).json({ message: error instanceof Error ? error.message : "审查失败" });
    }
  });

  return router;
}
