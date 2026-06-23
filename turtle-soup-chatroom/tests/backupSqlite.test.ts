import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backupSqlite } from "../scripts/backup-sqlite.mjs";

const tmpRoots: string[] = [];

function makeDbPath() {
  const root = join(tmpdir(), `turtle-backup-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tmpRoots.push(root);
  mkdirSync(root, { recursive: true });
  return join(root, "app.sqlite");
}

afterEach(() => {
  for (const root of tmpRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tmpRoots.length = 0;
});

describe("backupSqlite", () => {
  it("copies a sqlite file into a backups directory", () => {
    const dbPath = makeDbPath();
    writeFileSync(dbPath, "sqlite bytes");

    const backupPath = backupSqlite(dbPath);

    expect(backupPath).toContain("/backups/app-");
    expect(existsSync(backupPath)).toBe(true);
  });
});
