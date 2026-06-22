import express from "express";

const app = express();
const port = Number(process.env.PORT || 8787);

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Haiguitang chatroom server listening on http://localhost:${port}`);
});
