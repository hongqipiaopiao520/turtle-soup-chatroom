import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import { seedPuzzles } from "../src/data/seedPuzzles";
import { loadLocalEnv } from "./env";
import { loadPersistedRooms } from "./roomPersistence";
import { importRoomsSnapshot } from "./roomStore";
import { registerSocketHandlers } from "./socketHandlers";

loadLocalEnv();
importRoomsSnapshot(loadPersistedRooms());

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true
  }
});

app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/puzzles", (_request, response) => {
  response.json(seedPuzzles.map(({ truth, ...publicPuzzle }) => publicPuzzle));
});

registerSocketHandlers(io);

const port = Number(process.env.PORT || 8787);
server.listen(port, () => {
  console.log(`Haiguitang chatroom server listening on http://localhost:${port}`);
});
