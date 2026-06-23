# Markdown Puzzle Import Design

## Goal

Import the user's local Markdown puzzle table into the SQLite review queue without re-calling the LLM for fields that already exist in the table.

## Input

The source file is a Markdown table with these columns:

- `#`
- `标题`
- `汤面`
- `汤底`
- `来源`

The first available file is `/Users/levi/海龟汤去重总表.md`. It contains 113 deduplicated entries.

## Import Behavior

The import script reads the Markdown table, normalizes each row, and writes each puzzle as a `reviewing` `ManagedPuzzle`.

Normalization:

- Strip wrapping book-title brackets from titles, for example `《妹妹的房间》` becomes `妹妹的房间`.
- Convert `<br>` tags in surface and truth to newlines.
- Decode minimal HTML entities.
- Parse source Markdown links into `sourceTitle` and `sourceUrl`.
- Preserve the original row as `rawText`.

Generated fields:

- `solutionPoints`: first pass uses 3 to 6 concise segments from the truth text.
- `hints`: empty by default.
- `difficulty`: estimated from surface/truth length, defaulting to `medium`.
- `tags`: derived from source title and simple content signals.
- `qualityScore`: starts at `70`, reduced for very long text, missing source URL, or obvious ad fragments.
- `qualityIssues`: includes cleanup notes such as ad-like text or long truth.
- `qualitySummary`: one concise review note.

Deduplication:

- Default ID is deterministic: `md-<row-number>-<slug-title>`.
- Re-running the script updates the same records instead of creating duplicates.
- The script also supports `--source` to import only rows whose source title contains the provided string.

## CLI

```bash
npm run import:puzzles-md -- --file /Users/levi/海龟汤去重总表.md --limit 10
```

Options:

- `--file <path>` required.
- `--limit <number>` optional.
- `--source <text>` optional source-title filter.
- `--status <draft|reviewing>` optional, defaults to `reviewing`.
- `--database-url <file:...>` optional override.

## Verification

- Parser tests cover Markdown table parsing, `<br>` cleanup, source link parsing, and deterministic IDs.
- Import tests run against a temporary SQLite database and confirm rows are written as managed puzzles.
- A real run imports the first 10 rows from `/Users/levi/海龟汤去重总表.md`.

