import http from "http";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { webhooksRouter } from "./routes/webhooks";
import { streamsRouter } from "./routes/streams";
import { chatRouter } from "./routes/chat";
import { usersRouter } from "./routes/users";
import { authRouter } from "./routes/auth";
import { notificationsRouter } from "./routes/notifications";
import { automationsRouter } from "./routes/automations";
import { identityMiddleware } from "./middleware/identity";
import { initSocket } from "./socket";
import { prisma, redis } from "./config/db";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Create HTTP server wrapping Express
const server = http.createServer(app);

// Initialize Socket.IO
initSocket(server);

app.use(cors());
app.use(express.json());

// Public webhook endpoints (must sit above global identity check)
app.use("/webhooks", webhooksRouter);
app.use("/api/auth", authRouter);

// Public health check route
app.get("/health", async (req, res) => {
  try {
    await prisma.$executeRaw`SELECT 1`;
    const redisPing = await redis.ping();

    res.status(200).json({
      status: "healthy",
      database: "connected",
      redis: redisPing === "PONG" ? "connected" : "error",
    });
  } catch (error: any) {
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
    });
  }
});

// Apply global identity middleware for all other routes
app.use(identityMiddleware);

// Core application endpoints
app.use("/api/streams", streamsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/users", usersRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/automations", automationsRouter);

server.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
