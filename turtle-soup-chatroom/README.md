# 出前一汤聊天室 MVP

线上海龟汤聊天室初版：题库选题、创建房间、好友聊天、AI 主持问答、完成度解锁、贡献榜结算和调查卷宗。

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Then open `http://localhost:5173`.

## AI Configuration

The server loads local `.env` values on startup. Generic `AI_*` values take precedence; if they are absent, the host falls back to `MIMO_*`.

```bash
AI_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
AI_API_KEY=replace_me
AI_MODEL=mimo-v2.5-pro
AI_IMPORT_TIMEOUT_MS=60000
PORT=8787
```

You can also use the MIMO-specific names:

```bash
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
MIMO_API_KEY=replace_me
MIMO_AGENT_MODEL=mimo-v2.5-pro
MIMO_FAST_MODEL=mimo-v2-flash
PORT=8787
```

Without either set of values, the host panel returns a configuration warning instead of calling a model.

## Storage

The server uses SQLite by default:

```bash
DATABASE_URL=file:./data/app.sqlite
ADMIN_TOKEN=replace_me
```

`data/app.sqlite` stores published puzzles, puzzle drafts, and room snapshots. Keep the `data/` directory on persistent disk when deploying to a VPS or container host. If `data/rooms.json` exists from an older local run and SQLite has no rooms yet, the server imports it once on startup.

Back up the SQLite file with:

```bash
npm run backup:sqlite
```

Backups are written to `data/backups/`.

## Admin Puzzle Workflow

Open `http://localhost:5173/admin` to use the puzzle review workbench. In development, the admin API allows a missing token. In production, set `ADMIN_TOKEN` and enter the same value in the page header.

The workbench supports:

- paste raw puzzle text and import it through the configured LLM structuring flow
- review draft, reviewing, published, and rejected puzzles
- edit title, surface, truth, solution points, hints, tags, difficulty, and quality notes
- save changes, publish a puzzle, or reject it

Only published puzzles appear on the public homepage.

## Collecting Candidate Puzzles

Use the collection script to fetch candidate puzzle text into the admin review queue:

```bash
npm run collect:puzzles -- --url https://example.com/puzzle --admin-token replace_me
```

For keyword search, provide a search endpoint that returns JSON in this shape:

```json
{
  "results": [
    { "title": "候选题标题", "url": "https://example.com/puzzle" }
  ]
}
```

Then run:

```bash
PUZZLE_SEARCH_ENDPOINT=https://search.example.com/api npm run collect:puzzles -- --query 海龟汤 --admin-token replace_me
```

The script does not publish automatically. It imports candidates through `/api/admin/puzzles/import-text`, then the admin page handles editing and publishing.

## Importing Markdown Puzzle Tables

For a local Markdown table with columns `# / 标题 / 汤面 / 汤底 / 来源`, import directly into the review queue:

```bash
npm run import:puzzles-md -- --file /Users/levi/海龟汤去重总表.md --limit 10
```

Useful options:

```bash
npm run import:puzzles-md -- --file /Users/levi/海龟汤去重总表.md --source 许二木 --limit 20
npm run import:puzzles-md -- --file /Users/levi/海龟汤去重总表.md --status draft
```

Markdown imports do not call the LLM. They reuse the existing `汤面` and `汤底` fields, generate lightweight review metadata, and default to `reviewing`.

## Single-Server Deploy

Recommended one-command deploy on the server:

```bash
cd /www/wwwroot/turtle-soup-chatroom/turtle-soup-chatroom
npm run deploy:server
```

Useful overrides:

```bash
DEPLOY_BRANCH=main npm run deploy:server
SKIP_GIT_PULL=1 npm run deploy:server
HEALTH_URL=http://127.0.0.1:8787/api/health npm run deploy:server
```

The deploy script requires a clean working tree and an existing production `.env`.
It pulls latest code, runs `npm ci --include=dev`, builds the app, creates `data/`
and `logs/`, restarts PM2, saves the PM2 process list, and checks `/api/health`.

Manual deploy:

```bash
npm install
npm run build
cp .env.example .env
npm run start
```

For production, edit `.env` first:

```bash
NODE_ENV=production
PORT=8787
DATABASE_URL=file:./data/app.sqlite
ADMIN_TOKEN=replace_me
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
MIMO_API_KEY=replace_me
MIMO_AGENT_MODEL=mimo-v2.5-pro
MIMO_FAST_MODEL=mimo-v2-flash
```

### PM2 / BaoTa

```bash
npm install
npm run build
mkdir -p data logs
pm2 start ecosystem.config.cjs
pm2 save
```

Then point the BaoTa site root to:

```text
/www/wwwroot/turtle-soup-chatroom/turtle-soup-chatroom/dist
```

Add these Nginx locations in the BaoTa site config:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8787/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

location /socket.io/ {
    proxy_pass http://127.0.0.1:8787/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

Keep `data/` on persistent disk and back up `data/app.sqlite` regularly.

## MVP Checks

- Homepage shows seed puzzle cards.
- Search, difficulty, tag, and sort controls filter the list.
- Puzzle detail shows title, tags, surface, stats, and start button.
- Starting a puzzle creates a private room.
- Invite link can be copied from the room.
- Joining with `?room=<id>` asks for a nickname and joins the room.
- Player chat appears for everyone in the room.
- Host questions add AI answers and completion progress to the host log. With `.env` configured, the answer should come from the configured model instead of the local configuration warning.
- The answer unlocks when progress reaches 95%, then shows the full truth, MVP, and best answer.
- Pinning an answer adds it to the case notebook.
