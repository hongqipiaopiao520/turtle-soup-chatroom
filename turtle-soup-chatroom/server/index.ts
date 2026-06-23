import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import { seedPuzzles } from "../src/data/seedPuzzles";
import { createApp } from "./app";
import { loadLocalEnv } from "./env";
import { loadPersistedRooms } from "./roomPersistence";
import { importRoomsSnapshot } from "./roomStore";
import { registerSocketHandlers } from "./socketHandlers";
import { openDatabase } from "./storage/database";
import { createPuzzleRepository } from "./storage/puzzleRepository";
import { seedPuzzleDatabase } from "./storage/seedDatabase";

loadLocalEnv();
importRoomsSnapshot(loadPersistedRooms());

const database = openDatabase();
seedPuzzleDatabase(database, seedPuzzles);
const puzzleRepository = createPuzzleRepository(database);
const app = createApp(puzzleRepository);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true
  }
});

registerSocketHandlers(io, { puzzleRepository });

const port = Number(process.env.PORT || 8787);
server.listen(port, () => {
  console.log(`Haiguitang chatroom server listening on http://localhost:${port}`);
});
