import type { AppDatabase } from "./database";
import type { Difficulty, ManagedPuzzle, PublicPuzzle, PuzzleAiProfile, PuzzleStatus } from "../../src/shared/types";

export interface ManagedPuzzleUpdate {
  title: string;
  surface: string;
  truth: string;
  solutionPoints: string[];
  difficulty: Difficulty;
  tags: string[];
  rawText?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  hints: string[];
  qualityScore: number;
  qualityIssues: string[];
  qualitySummary: string;
}

interface PuzzleRow {
  id: string;
  title: string;
  surface: string;
  truth: string;
  solution_points_json: string;
  difficulty: Difficulty;
  tags_json: string;
  author: string;
  rating: number;
  plays: number;
  status: PuzzleStatus;
  raw_text?: string | null;
  source_url?: string | null;
  source_title?: string | null;
  hints_json: string;
  estimated_minutes: number;
  quality_score: number;
  quality_issues_json: string;
  quality_summary: string;
  reviewed_at?: string | null;
  published_at?: string | null;
  ai_profile_json?: string | null;
  ai_profile_version: number;
  ai_profile_generated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PuzzleRepository {
  findById(id: string): ManagedPuzzle | undefined;
  listPublished(): PublicPuzzle[];
  listManaged(status?: PuzzleStatus): ManagedPuzzle[];
  upsertManaged(puzzle: ManagedPuzzle): ManagedPuzzle;
  updateManaged(id: string, input: ManagedPuzzleUpdate): ManagedPuzzle;
  updateTags(id: string, tags: string[]): ManagedPuzzle;
  updateAiProfile(id: string, profile: PuzzleAiProfile): ManagedPuzzle;
  deleteManaged(id: string): ManagedPuzzle;
  publish(id: string): ManagedPuzzle;
  reject(id: string): ManagedPuzzle;
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseAiProfile(row: PuzzleRow): PuzzleAiProfile | undefined {
  if (!row.ai_profile_json) return undefined;
  try {
    const parsed = JSON.parse(row.ai_profile_json) as PuzzleAiProfile;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.themes)) return undefined;
    return {
      ...parsed,
      profileVersion: row.ai_profile_version || parsed.profileVersion || 0,
      generatedAt: row.ai_profile_generated_at ?? parsed.generatedAt ?? row.updated_at
    };
  } catch {
    return undefined;
  }
}

function toManagedPuzzle(row: PuzzleRow): ManagedPuzzle {
  return {
    id: row.id,
    title: row.title,
    surface: row.surface,
    truth: row.truth,
    solutionPoints: parseJsonArray(row.solution_points_json),
    difficulty: row.difficulty,
    tags: parseJsonArray(row.tags_json),
    author: row.author,
    rating: row.rating,
    plays: row.plays,
    createdAt: row.created_at,
    status: row.status,
    rawText: row.raw_text ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    sourceTitle: row.source_title ?? undefined,
    hints: parseJsonArray(row.hints_json),
    estimatedMinutes: row.estimated_minutes,
    qualityScore: row.quality_score,
    qualityIssues: parseJsonArray(row.quality_issues_json),
    qualitySummary: row.quality_summary,
    reviewedAt: row.reviewed_at ?? undefined,
    publishedAt: row.published_at ?? undefined,
    updatedAt: row.updated_at,
    aiProfile: parseAiProfile(row)
  };
}

function toPublicPuzzle(puzzle: ManagedPuzzle): PublicPuzzle {
  return {
    id: puzzle.id,
    title: puzzle.title,
    surface: puzzle.surface,
    difficulty: puzzle.difficulty,
    tags: puzzle.tags,
    author: puzzle.author,
    rating: puzzle.rating,
    plays: puzzle.plays,
    createdAt: puzzle.createdAt,
    hintCount: puzzle.hints.length
  };
}

function requirePuzzle(puzzle: ManagedPuzzle | undefined, id: string) {
  if (!puzzle) {
    throw new Error(`题目不存在：${id}`);
  }
  return puzzle;
}

function nextTimestampAfter(value: string) {
  const now = new Date();
  const previousTime = Date.parse(value);
  if (Number.isFinite(previousTime) && now.getTime() <= previousTime) {
    return new Date(previousTime + 1).toISOString();
  }
  return now.toISOString();
}

export function createPuzzleRepository(db: AppDatabase): PuzzleRepository {
  const selectById = db.prepare("select * from puzzles where id = ?");
  const selectPublished = db.prepare("select * from puzzles where status = 'published' order by created_at desc, id asc");
  const selectManaged = db.prepare("select * from puzzles order by updated_at desc, id asc");
  const selectManagedByStatus = db.prepare("select * from puzzles where status = ? order by updated_at desc, id asc");
  const deleteById = db.prepare("delete from puzzles where id = ?");
  const upsert = db.prepare(`
    insert into puzzles (
      id,
      title,
      surface,
      truth,
      solution_points_json,
      difficulty,
      tags_json,
      author,
      rating,
      plays,
      status,
      raw_text,
      source_url,
      source_title,
      hints_json,
      estimated_minutes,
      quality_score,
      quality_issues_json,
      quality_summary,
      reviewed_at,
      published_at,
      ai_profile_json,
      ai_profile_version,
      ai_profile_generated_at,
      created_at,
      updated_at
    ) values (
      @id,
      @title,
      @surface,
      @truth,
      @solutionPointsJson,
      @difficulty,
      @tagsJson,
      @author,
      @rating,
      @plays,
      @status,
      @rawText,
      @sourceUrl,
      @sourceTitle,
      @hintsJson,
      @estimatedMinutes,
      @qualityScore,
      @qualityIssuesJson,
      @qualitySummary,
      @reviewedAt,
      @publishedAt,
      @aiProfileJson,
      @aiProfileVersion,
      @aiProfileGeneratedAt,
      @createdAt,
      @updatedAt
    )
    on conflict(id) do update set
      title = excluded.title,
      surface = excluded.surface,
      truth = excluded.truth,
      solution_points_json = excluded.solution_points_json,
      difficulty = excluded.difficulty,
      tags_json = excluded.tags_json,
      author = excluded.author,
      rating = excluded.rating,
      plays = excluded.plays,
      status = excluded.status,
      raw_text = excluded.raw_text,
      source_url = excluded.source_url,
      source_title = excluded.source_title,
      hints_json = excluded.hints_json,
      estimated_minutes = excluded.estimated_minutes,
      quality_score = excluded.quality_score,
      quality_issues_json = excluded.quality_issues_json,
      quality_summary = excluded.quality_summary,
      reviewed_at = excluded.reviewed_at,
      published_at = excluded.published_at,
      ai_profile_json = excluded.ai_profile_json,
      ai_profile_version = excluded.ai_profile_version,
      ai_profile_generated_at = excluded.ai_profile_generated_at,
      updated_at = excluded.updated_at
  `);

  function findById(id: string) {
    const row = selectById.get(id) as PuzzleRow | undefined;
    return row ? toManagedPuzzle(row) : undefined;
  }

  return {
    findById,
    listPublished() {
      return (selectPublished.all() as PuzzleRow[]).map(toManagedPuzzle).map(toPublicPuzzle);
    },
    listManaged(status?: PuzzleStatus) {
      const rows = status ? selectManagedByStatus.all(status) : selectManaged.all();
      return (rows as PuzzleRow[]).map(toManagedPuzzle);
    },
    upsertManaged(puzzle: ManagedPuzzle) {
      upsert.run({
        id: puzzle.id,
        title: puzzle.title,
        surface: puzzle.surface,
        truth: puzzle.truth,
        solutionPointsJson: JSON.stringify(puzzle.solutionPoints),
        difficulty: puzzle.difficulty,
        tagsJson: JSON.stringify(puzzle.tags),
        author: puzzle.author,
        rating: puzzle.rating,
        plays: puzzle.plays,
        status: puzzle.status,
        rawText: puzzle.rawText ?? null,
        sourceUrl: puzzle.sourceUrl ?? null,
        sourceTitle: puzzle.sourceTitle ?? null,
        hintsJson: JSON.stringify(puzzle.hints),
        estimatedMinutes: puzzle.estimatedMinutes,
        qualityScore: puzzle.qualityScore,
        qualityIssuesJson: JSON.stringify(puzzle.qualityIssues),
        qualitySummary: puzzle.qualitySummary,
        reviewedAt: puzzle.reviewedAt ?? null,
        publishedAt: puzzle.publishedAt ?? null,
        aiProfileJson: puzzle.aiProfile ? JSON.stringify(puzzle.aiProfile) : null,
        aiProfileVersion: puzzle.aiProfile?.profileVersion ?? 0,
        aiProfileGeneratedAt: puzzle.aiProfile?.generatedAt ?? null,
        createdAt: puzzle.createdAt,
        updatedAt: puzzle.updatedAt
      });
      return requirePuzzle(findById(puzzle.id), puzzle.id);
    },
    updateManaged(id: string, input: ManagedPuzzleUpdate) {
      const existing = requirePuzzle(findById(id), id);
      return this.upsertManaged({
        ...existing,
        title: input.title,
        surface: input.surface,
        truth: input.truth,
        solutionPoints: input.solutionPoints,
        difficulty: input.difficulty,
        tags: input.tags,
        rawText: input.rawText,
        sourceUrl: input.sourceUrl,
        sourceTitle: input.sourceTitle,
        hints: input.hints,
        qualityScore: input.qualityScore,
        qualityIssues: input.qualityIssues,
        qualitySummary: input.qualitySummary,
        updatedAt: nextTimestampAfter(existing.updatedAt)
      });
    },
    updateTags(id: string, tags: string[]) {
      const existing = requirePuzzle(findById(id), id);
      return this.upsertManaged({
        ...existing,
        tags,
        updatedAt: nextTimestampAfter(existing.updatedAt)
      });
    },
    updateAiProfile(id: string, profile: PuzzleAiProfile) {
      const existing = requirePuzzle(findById(id), id);
      return this.upsertManaged({
        ...existing,
        aiProfile: profile,
        updatedAt: nextTimestampAfter(existing.updatedAt)
      });
    },
    deleteManaged(id: string) {
      const existing = requirePuzzle(findById(id), id);
      deleteById.run(id);
      return existing;
    },
    publish(id: string) {
      const now = new Date().toISOString();
      db.prepare(
        "update puzzles set status = 'published', published_at = coalesce(published_at, ?), updated_at = ? where id = ?"
      ).run(now, now, id);
      return requirePuzzle(findById(id), id);
    },
    reject(id: string) {
      const now = new Date().toISOString();
      db.prepare("update puzzles set status = 'rejected', updated_at = ? where id = ?").run(now, id);
      return requirePuzzle(findById(id), id);
    }
  };
}
