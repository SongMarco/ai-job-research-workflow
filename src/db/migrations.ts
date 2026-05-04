import type Database from 'better-sqlite3';

export interface Migration {
  readonly version: number;
  readonly up: (db: Database.Database) => void;
}

export function readSchemaVersion(db: Database.Database): number {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'")
    .get();
  if (!table) return 0;

  const row = db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as
    | { readonly value: string }
    | undefined;
  return row ? Number(row.value) : 0;
}

export function runMigrations(db: Database.Database, migrations: readonly Migration[]): void {
  const current = readSchemaVersion(db);
  const pending = migrations.filter((migration) => migration.version > current);

  db.transaction(() => {
    for (const migration of pending) {
      migration.up(db);
      db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)").run(
        String(migration.version),
      );
    }
  })();
}
