import { describe, expect, it } from "vitest";
import { parseHostResponse } from "../server/aiHost";

describe("parseHostResponse", () => {
  it("parses structured host JSON", () => {
    const result = parseHostResponse('{"answerType":"yes","answer":"是。这个方向有帮助。"}');
    expect(result).toEqual({
      answerType: "yes",
      answer: "是。这个方向有帮助。"
    });
  });

  it("falls back to partial for non-json model output", () => {
    const result = parseHostResponse("也许有关，但不能直接确认。");
    expect(result.answerType).toBe("partial");
    expect(result.answer).toContain("也许有关");
  });

  it("rejects unknown answer types", () => {
    const result = parseHostResponse('{"answerType":"maybe","answer":"不知道"}');
    expect(result.answerType).toBe("partial");
    expect(result.answer).toBe("不知道");
  });
});
