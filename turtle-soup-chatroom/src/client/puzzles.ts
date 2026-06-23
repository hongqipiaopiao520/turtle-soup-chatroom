import type { PublicPuzzle } from "../shared/types";

export async function fetchPublicPuzzles(fetcher: typeof fetch = fetch): Promise<PublicPuzzle[]> {
  const response = await fetcher("/api/puzzles");
  if (!response.ok) {
    throw new Error(`题库加载失败：${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  return Array.isArray(payload) ? (payload as PublicPuzzle[]) : [];
}
