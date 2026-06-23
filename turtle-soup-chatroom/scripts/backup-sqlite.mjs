import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function databasePath() {
  const fromEnv = process.env.DATABASE_PATH || process.env.DATABASE_URL || "file:./data/app.sqlite";
  return fromEnv.startsWith("file:") ? fromEnv.slice("file:".length) : fromEnv;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function backupSqlite(sourcePath = databasePath()) {
  const resolvedSource = resolve(sourcePath);
  if (!existsSync(resolvedSource)) {
    throw new Error(`SQLite database not found: ${resolvedSource}`);
  }

  const backupDir = join(dirname(resolvedSource), "backups");
  mkdirSync(backupDir, { recursive: true });
  const targetPath = join(backupDir, `app-${timestamp()}.sqlite`);
  copyFileSync(resolvedSource, targetPath);
  return targetPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const targetPath = backupSqlite();
  console.log(`SQLite backup written to ${targetPath}`);
}
