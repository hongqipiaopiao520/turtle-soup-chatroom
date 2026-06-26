export interface NormalizePuzzleTagsDatabaseOptions {
  dbPath?: string;
  write?: boolean;
  ai?: boolean;
  status?: "draft" | "reviewing" | "published" | "rejected";
}

export interface NormalizePuzzleTagsDatabaseResult {
  changed: number;
  unchanged: number;
  changes: Array<{
    id: string;
    title: string;
    before: string[];
    after: string[];
  }>;
}

export function normalizePuzzleTagsDatabase(options?: NormalizePuzzleTagsDatabaseOptions): Promise<NormalizePuzzleTagsDatabaseResult>;
