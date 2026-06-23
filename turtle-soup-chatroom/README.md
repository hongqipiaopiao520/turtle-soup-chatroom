# 出前一汤聊天室 MVP

线上海龟汤聊天室初版：题库选题、创建房间、好友聊天、AI 主持问答、最终推理和调查卷宗。

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

## MVP Checks

- Homepage shows seed puzzle cards.
- Search, difficulty, tag, and sort controls filter the list.
- Puzzle detail shows title, tags, surface, stats, and start button.
- Starting a puzzle creates a private room.
- Invite link can be copied from the room.
- Joining with `?room=<id>` asks for a nickname and joins the room.
- Player chat appears for everyone in the room.
- Host questions add AI answers to the host log. With `.env` configured, the answer should come from the configured model instead of the local configuration warning.
- Pinning an answer adds it to the case notebook.
