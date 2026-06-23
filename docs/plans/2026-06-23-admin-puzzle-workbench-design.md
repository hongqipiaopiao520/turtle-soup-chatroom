# Admin Puzzle Workbench Design

## Goal

Build a usable first version of the puzzle production workflow: collect candidate turtle soup stories, structure them with the existing LLM importer, review and edit them in an admin page, then publish them to the public homepage.

## Approach

The workflow stays deliberately linear:

1. A script collects candidate puzzle text from search results or provided URLs.
2. The script sends each candidate to the existing admin import endpoint.
3. The LLM importer creates `reviewing` puzzles when structure is valid, or `draft` puzzles when it falls back.
4. `/admin` lists managed puzzles and lets the admin edit, publish, or reject each record.
5. The player-facing homepage continues to show only `published` puzzles from `/api/puzzles`.

This keeps network collection separate from editorial review. The crawler does not write SQLite directly, and the player app does not need to know about draft or rejected records.

## Admin Page

The admin page is an in-app workbench at `/admin`. It is not linked from the player homepage in this version. Development mode can use it without a token; production calls include `Authorization: Bearer <ADMIN_TOKEN>`.

Layout:

- Header: "题库审核台", status filter, refresh button.
- Import panel: raw text, source title, source URL, import button.
- Left list: title, status, difficulty, quality score, source title, updated time.
- Right editor: title, surface, truth, solution points, hints, difficulty, tags, quality score, quality issues, quality summary, source fields.
- Actions: save, publish, reject.

The workbench should feel like an editorial case desk rather than a marketing screen: dense, stable, dark, and scan-friendly. It should reuse the current dark palette, but admin-specific panels should favor neutral surfaces and compact controls.

## API Changes

Existing endpoints remain:

- `GET /api/admin/puzzles?status=reviewing`
- `POST /api/admin/puzzles/import-text`
- `POST /api/admin/puzzles/:id/publish`
- `POST /api/admin/puzzles/:id/reject`

Add:

- `PUT /api/admin/puzzles/:id`

The update endpoint accepts editable fields only:

- `title`
- `surface`
- `truth`
- `solutionPoints`
- `hints`
- `difficulty`
- `tags`
- `qualityScore`
- `qualityIssues`
- `qualitySummary`
- `sourceTitle`
- `sourceUrl`
- `rawText`

It preserves immutable counters and timestamps where appropriate, sets `updatedAt` to now, and leaves `status` unchanged. Publishing and rejecting stay explicit.

## Collection Script

The first collection script is a conservative MVP:

- Input can be search terms or specific URLs.
- Search uses a configurable provider URL when available; direct URLs are always supported.
- Each fetched page is converted to plain text with simple HTML stripping.
- The script extracts candidate blocks by looking for title/surface/truth-like sections and falls back to the largest readable block.
- Each candidate is posted to `/api/admin/puzzles/import-text`.
- The script prints a short summary: imported count, skipped count, failed URLs.

The script does not attempt to solve copyright, deduplicate every variation, or publish automatically. Its job is to feed the review queue.

## Error Handling

- Admin client errors are shown as compact inline messages.
- Empty imports are rejected before network calls.
- Update validation errors return `400` with a Chinese message.
- Publish/reject errors keep the selected puzzle visible and show the failure message.
- Collection failures continue to the next URL and report a summary at the end.

## Testing

Add focused tests:

- Admin helper validates editable fields and preserves status during update.
- Admin client builds authenticated requests and parses managed puzzles.
- Admin page server-render includes the import panel, editor actions, and selected puzzle content.
- Collection parser extracts candidate text from HTML.
- Collection importer posts candidates to the admin import endpoint.

Manual verification:

- Open `/admin`.
- Import raw text.
- Edit fields and save.
- Publish the puzzle.
- Refresh `/` and confirm the published puzzle appears.

