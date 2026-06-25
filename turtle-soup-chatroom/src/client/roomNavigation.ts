interface HistoryWindow {
  location: Pick<Location, "pathname" | "search" | "hash">;
  history: Pick<History, "replaceState">;
}

function nextRoomUrl(win: HistoryWindow, roomId?: string) {
  const params = new URLSearchParams(win.location.search);
  if (roomId) {
    params.set("room", roomId);
  } else {
    params.delete("room");
  }
  const query = params.toString();
  return `${win.location.pathname}${query ? `?${query}` : ""}${win.location.hash}`;
}

export function setRoomRoute(roomId: string, win: HistoryWindow = window) {
  win.history.replaceState(null, "", nextRoomUrl(win, roomId));
}

export function clearRoomRoute(win: HistoryWindow = window) {
  win.history.replaceState(null, "", nextRoomUrl(win));
}
