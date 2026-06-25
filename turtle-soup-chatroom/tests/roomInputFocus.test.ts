import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("room input focus affordances", () => {
  it("returns focus to the host question textarea after Enter submit", () => {
    const source = readFileSync("src/components/HostPanel.tsx", "utf8");

    expect(source).toContain("questionInputRef");
    expect(source).toContain("questionInputRef.current?.focus()");
  });

  it("returns focus to the chat input after Enter submit", () => {
    const source = readFileSync("src/components/SidePanel.tsx", "utf8");

    expect(source).toContain("chatInputRef");
    expect(source).toContain("chatInputRef.current?.focus()");
    expect(source).toContain("shouldRestoreChatFocusRef");
    expect(source).toMatch(/!isChatPending && shouldRestoreChatFocusRef\.current/);
  });

  it("uses a clear room-owner badge instead of implying the player is Xiao Wai", () => {
    const source = readFileSync("src/components/SidePanel.tsx", "utf8");

    expect(source).toContain("房主");
    expect(source).not.toContain("小歪主持");
  });
});
