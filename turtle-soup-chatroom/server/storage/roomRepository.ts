import type { RoomState } from "../../src/shared/types";
import type { AppDatabase } from "./database";

interface RoomRow {
  id: string;
  state_json: string;
}

export interface RoomRepository {
  loadAll(): RoomState[];
  save(room: RoomState): void;
  saveAll(rooms: RoomState[]): void;
  remove(roomId: string): void;
}

function parseRoom(row: RoomRow): RoomState | undefined {
  try {
    return JSON.parse(row.state_json) as RoomState;
  } catch {
    return undefined;
  }
}

export function createRoomRepository(db: AppDatabase): RoomRepository {
  const selectAll = db.prepare("select id, state_json from rooms order by created_at asc, id asc");
  const upsert = db.prepare(`
    insert into rooms (id, state_json, created_at, updated_at)
    values (@id, @stateJson, @createdAt, @updatedAt)
    on conflict(id) do update set
      state_json = excluded.state_json,
      updated_at = excluded.updated_at
  `);
  const deleteAll = db.prepare("delete from rooms");
  const deleteById = db.prepare("delete from rooms where id = ?");

  function save(room: RoomState) {
    const now = new Date().toISOString();
    upsert.run({
      id: room.id,
      stateJson: JSON.stringify(room),
      createdAt: room.createdAt,
      updatedAt: now
    });
  }

  return {
    loadAll() {
      return (selectAll.all() as RoomRow[]).map(parseRoom).filter((room): room is RoomState => Boolean(room));
    },
    save,
    saveAll(rooms: RoomState[]) {
      const replaceAll = db.transaction(() => {
        deleteAll.run();
        for (const room of rooms) {
          save(room);
        }
      });
      replaceAll();
    },
    remove(roomId: string) {
      deleteById.run(roomId);
    }
  };
}
