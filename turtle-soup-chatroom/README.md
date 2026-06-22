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

Set these values in `.env` before using the real AI host:

```bash
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=replace_me
AI_MODEL=gpt-4.1-mini
PORT=8787
```

Without these values, the host panel returns a configuration warning instead of calling a model.

## MVP Checks

- Homepage shows seed puzzle cards.
- Search, difficulty, tag, and sort controls filter the list.
- Puzzle detail shows title, tags, surface, stats, and start button.
- Starting a puzzle creates a private room.
- Invite link can be copied from the room.
- Joining with `?room=<id>` asks for a nickname and joins the room.
- Player chat appears for everyone in the room.
- Host questions add AI answers to the host log.
- Pinning an answer adds it to the case notebook.
