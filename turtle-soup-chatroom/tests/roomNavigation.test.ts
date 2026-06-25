import { describe, expect, it, vi } from "vitest";
import { clearRoomRoute, setRoomRoute } from "../src/client/roomNavigation";

function makeWindow(href: string) {
  const calls: string[] = [];
  return {
    location: new URL(href),
    history: {
      replaceState: vi.fn((_state: unknown, _title: string, nextUrl: string) => {
        calls.push(nextUrl);
      })
    },
    calls
  };
}

describe("room navigation helpers", () => {
  it("sets the current room id in the URL", () => {
    const win = makeWindow("http://localhost:8790/?foo=1");

    setRoomRoute("room-a", win);

    expect(win.history.replaceState).toHaveBeenCalledWith(null, "", "/?foo=1&room=room-a");
  });

  it("clears only the room id when leaving a room", () => {
    const win = makeWindow("http://localhost:8790/?foo=1&room=room-a#chat");

    clearRoomRoute(win);

    expect(win.history.replaceState).toHaveBeenCalledWith(null, "", "/?foo=1#chat");
  });
});
