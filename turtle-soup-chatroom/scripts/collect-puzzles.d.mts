export interface PuzzleCandidate {
  rawText: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

export interface CollectPuzzlesOptions {
  urls?: string[];
  queries?: string[];
  adminBaseUrl?: string;
  adminToken?: string;
  searchEndpoint?: string;
  fetcher?: typeof fetch;
}

export interface CollectPuzzlesResult {
  imported: number;
  skipped: number;
  failed: string[];
}

export function stripHtmlToText(html: string): string;
export function extractTitleFromHtml(html: string, fallback?: string): string;
export function extractPuzzleCandidates(text: string, sourceUrl?: string, sourceTitle?: string): PuzzleCandidate[];
export function collectPuzzles(options: CollectPuzzlesOptions): Promise<CollectPuzzlesResult>;
