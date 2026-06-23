import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { migrations } from "./migrations";

export type AppDatabase = Database.Database;

function defaultDatabasePath() {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv?.startsWith("file:")) {
    return fromEnv.slice("file:".length);
  }
  return fromEnv || "data/app.sqlite";
}

export function openDatabase(filePath = defaultDatabasePath()): AppDatabase {
  const resolvedPath = resolve(filePath);
  mkdirSync(dirname(resolvedPath), { recursive: true });

  const db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  applyMigrations(db);
  return db;
}

function applyMigrations(db: AppDatabase) {
  db.exec(`
    create table if not exists schema_migrations (
      version integer primary key,
      applied_at text not null
    );
  `);

  const applied = new Set(
    db.prepare("select version from schema_migrations").all().map((row) => (row as { version: number }).version)
  );

  const apply = db.transaction(() => {
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      db.exec(migration.sql);
      db.prepare("insert into schema_migrations (version, applied_at) values (?, ?)").run(
        migration.version,
        new Date().toISOString()
      );
    }
  });

  apply();
}
