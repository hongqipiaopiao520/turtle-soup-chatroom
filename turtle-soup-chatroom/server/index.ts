import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import { seedPuzzles } from "../src/data/seedPuzzles";
import { createApp } from "./app";
import { loadLocalEnv } from "./env";
import { loadPersistedRooms } from "./roomPersistence";
import { exportRoomsSnapshot, importRoomsSnapshot } from "./roomStore";
import { registerSocketHandlers } from "./socketHandlers";
import { openDatabase } from "./storage/database";
import { createPuzzleRepository } from "./storage/puzzleRepository";
import { createRoomRepository } from "./storage/roomRepository";
import { seedPuzzleDatabase } from "./storage/seedDatabase";

loadLocalEnv();

const database = openDatabase();
seedPuzzleDatabase(database, seedPuzzles);
const puzzleRepository = createPuzzleRepository(database);
const roomRepository = createRoomRepository(database);
const storedRooms = roomRepository.loadAll();
importRoomsSnapshot(storedRooms.length > 0 ? storedRooms : loadPersistedRooms());
if (storedRooms.length === 0) {
  roomRepository.saveAll(exportRoomsSnapshot());
}
const app = createApp(puzzleRepository);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true
  }
});

registerSocketHandlers(io, { puzzleRepository, roomRepository });

const port = Number(process.env.PORT || 8787);
server.listen(port, () => {
  console.log(`Haiguitang chatroom server listening on http://localhost:${port}`);
});
