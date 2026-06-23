import type { ManagedPuzzle, PuzzleStatus } from "../src/shared/types";
import type { PuzzleRepository } from "../server/storage/puzzleRepository";

export interface MarkdownPuzzleRow {
  index: number;
  title: string;
  surface: string;
  truth: string;
  sourceTitle: string;
  sourceUrl?: string;
}

export interface MarkdownPuzzleImportOptions {
  content: string;
  repository: PuzzleRepository;
  limit?: number;
  source?: string;
  status?: PuzzleStatus;
}

export function parseSourceLink(value: string): { sourceTitle: string; sourceUrl?: string };
export function parseMarkdownPuzzleTable(content: string): MarkdownPuzzleRow[];
export function convertMarkdownRowToPuzzle(row: MarkdownPuzzleRow, status?: PuzzleStatus): ManagedPuzzle;
export function importMarkdownPuzzles(options: MarkdownPuzzleImportOptions): { imported: number; skipped: number };
