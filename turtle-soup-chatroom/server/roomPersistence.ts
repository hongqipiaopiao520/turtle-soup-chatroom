import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RoomState } from "../src/shared/types";

export function getRoomsFilePath() {
  return join(process.cwd(), "data", "rooms.json");
}

export function loadPersistedRooms(filePath = getRoomsFilePath()): RoomState[] {
  try {
    if (!existsSync(filePath)) return [];
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as RoomState[]) : [];
  } catch {
    return [];
  }
}

export function savePersistedRooms(rooms: RoomState[], filePath = getRoomsFilePath()) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(rooms, null, 2));
}
