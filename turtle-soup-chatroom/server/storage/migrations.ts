export interface Migration {
  version: number;
  sql: string;
}

export const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      create table if not exists schema_migrations (
        version integer primary key,
        applied_at text not null
      );

      create table if not exists puzzles (
        id text primary key,
        title text not null,
        surface text not null,
        truth text not null,
        solution_points_json text not null,
        difficulty text not null,
        tags_json text not null,
        author text not null,
        rating real not null default 0,
        plays integer not null default 0,
        status text not null default 'published',
        raw_text text,
        source_url text,
        source_title text,
        hints_json text not null default '[]',
        estimated_minutes integer not null default 15,
        quality_score integer not null default 0,
        quality_issues_json text not null default '[]',
        quality_summary text not null default '',
        reviewed_at text,
        published_at text,
        created_at text not null,
        updated_at text not null
      );

      create index if not exists idx_puzzles_status on puzzles(status);
      create index if not exists idx_puzzles_created_at on puzzles(created_at);

      create table if not exists rooms (
        id text primary key,
        state_json text not null,
        created_at text not null,
        updated_at text not null
      );

      create index if not exists idx_rooms_updated_at on rooms(updated_at);
    `
  }
];
