import { describe, expect, it, vi } from "vitest";
import {
  fetchAiHostRoom,
  fetchAiHostRooms,
  reviewAiHostAnswer,
  reviewAiHostRoom
} from "../src/client/aiHostHarness";

function jsonResponse(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: vi.fn().mockResolvedValue(payload)
  };
}

describe("ai host harness client", () => {
  it("loads AI host room summaries", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse([{ roomId: "room-1" }]));

    await expect(fetchAiHostRooms({ token: "secret", fetcher: fetcher as unknown as typeof fetch }))
      .resolves.toEqual([{ roomId: "room-1" }]);

    expect(fetcher).toHaveBeenCalledWith("/api/admin/ai-host/rooms", {
      headers: { Authorization: "Bearer secret" }
    });
  });

  it("loads one AI host room detail", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ id: "room-1" }));

    await fetchAiHostRoom("room-1", { fetcher: fetcher as unknown as typeof fetch });

    expect(fetcher).toHaveBeenCalledWith("/api/admin/ai-host/rooms/room-1", { headers: {} });
  });

  it("triggers answer and room reviews", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ status: "passed" }));

    await reviewAiHostAnswer("room-1", "answer-1", { token: "secret", fetcher: fetcher as unknown as typeof fetch });
    await reviewAiHostRoom("room-1", { token: "secret", fetcher: fetcher as unknown as typeof fetch });

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/admin/ai-host/rooms/room-1/answers/answer-1/review", {
      method: "POST",
      headers: { Authorization: "Bearer secret" }
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/admin/ai-host/rooms/room-1/review", {
      method: "POST",
      headers: { Authorization: "Bearer secret" }
    });
  });

  it("throws response messages for failed requests", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ message: "未授权" }, { ok: false, status: 401 }));

    await expect(fetchAiHostRooms({ fetcher: fetcher as unknown as typeof fetch })).rejects.toThrow("未授权");
  });
});
