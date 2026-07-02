import type { OpeningDirectorRequest, OpeningDirectorResponse } from "../shared/types";

export async function fetchOpeningDirectorPlans(
  input: OpeningDirectorRequest,
  fetcher: typeof fetch = fetch
): Promise<OpeningDirectorResponse> {
  const response = await fetcher("/api/agent/opening-plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = (await response.json().catch(() => null)) as { message?: string } | OpeningDirectorResponse | null;
  if (!response.ok) {
    throw new Error((payload && "message" in payload && payload.message) || `开局导演失败：${response.status}`);
  }
  return payload as OpeningDirectorResponse;
}
