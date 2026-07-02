import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../server/storage/database";
import { migrations } from "../../server/storage/migrations";

const tmpRoots: string[] = [];

function makeDbPath() {
  const root = join(tmpdir(), `turtle-storage-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tmpRoots.push(root);
  return join(root, "nested", "app.sqlite");
}

afterEach(() => {
  for (const root of tmpRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tmpRoots.length = 0;
});

describe("openDatabase", () => {
  it("creates the database file, parent directory, and migration tables", () => {
    const dbPath = makeDbPath();
    const db = openDatabase(dbPath);

    expect(existsSync(dirname(dbPath))).toBe(true);
    expect(existsSync(dbPath)).toBe(true);
    expect(
      db.prepare("select name from sqlite_master where type = 'table' order by name").all()
    ).toEqual([
      { name: "puzzles" },
      { name: "rooms" },
      { name: "schema_migrations" }
    ]);
    expect(db.prepare("select count(*) as count from schema_migrations").get()).toEqual({
      count: migrations.length
    });

    db.close();
  });

  it("does not re-apply migrations when opened twice", () => {
    const dbPath = makeDbPath();
    const first = openDatabase(dbPath);
    first.close();

    const second = openDatabase(dbPath);
    expect(second.prepare("select count(*) as count from schema_migrations").get()).toEqual({
      count: migrations.length
    });
    second.close();
  });

  it("creates AI profile columns for server-only opening recommendations", () => {
    const dbPath = makeDbPath();
    const db = openDatabase(dbPath);
    const columns = db.prepare("pragma table_info(puzzles)").all() as Array<{ name: string }>;

    expect(columns.map((column) => column.name)).toContain("ai_profile_json");
    expect(columns.map((column) => column.name)).toContain("ai_profile_version");
    expect(columns.map((column) => column.name)).toContain("ai_profile_generated_at");
    db.close();
  });
});
