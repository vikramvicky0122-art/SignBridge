import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = 3000;

  app.use(express.json());

  // Socket.io signaling
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", (roomId) => {
      socket.join(roomId);
      const room = io.sockets.adapter.rooms.get(roomId);
      const roomSize = room ? room.size : 0;
      console.log(`User ${socket.id} joined room ${roomId}. Current room size: ${roomSize}`);
      
      // Tell the user who just joined how many people are in the room
      socket.emit("room-info", { roomId, size: roomSize });
      
      // Tell others someone joined
      socket.to(roomId).emit("user-joined", socket.id);
    });

    socket.on("ready", (roomId) => {
      console.log(`User ${socket.id} is ready in room ${roomId}`);
      socket.to(roomId).emit("ready", socket.id);
    });

    socket.on("offer", ({ roomId, offer }) => {
      console.log(`Relaying offer from ${socket.id} to room ${roomId}`);
      socket.to(roomId).emit("offer", { senderId: socket.id, offer });
    });

    socket.on("answer", ({ roomId, answer }) => {
      console.log(`Relaying answer from ${socket.id} to room ${roomId}`);
      socket.to(roomId).emit("answer", { senderId: socket.id, answer });
    });

    socket.on("ice-candidate", ({ roomId, candidate }) => {
      console.log(`Relaying ICE candidate from ${socket.id} to room ${roomId}`);
      socket.to(roomId).emit("ice-candidate", { senderId: socket.id, candidate });
    });

    socket.on("chat-message", ({ roomId, message }) => {
      socket.to(roomId).emit("chat-message", message);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
