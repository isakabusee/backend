import cors from "cors";
import express from "express";
import type { Db } from "mongodb";
import { createAssistantRouter } from "./routes/assistant.js";
import { createAuthRouter } from "./routes/auth.js";
import { createDashboardRouter } from "./routes/dashboard.js";
import { createGoalsRouter } from "./routes/goals.js";
import { createHabitLogsRouter } from "./routes/habitLogs.js";
import { createHabitsRouter } from "./routes/habits.js";

export function createApp(database: Db) {
  const app = express();
  const allowedOrigins = process.env.CLIENT_ORIGIN
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(cors({ origin: allowedOrigins?.length ? allowedOrigins : true }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/", (_req, res) => {
    res.json({ success: true, message: "GrowthTrack API is running" });
  });
  app.get("/api/health", (_req, res) => {
    res.json({ success: true, message: "GrowthTrack API is running" });
  });

  app.use("/api/auth", createAuthRouter(database));
  app.use("/api/dashboard", createDashboardRouter(database));
  app.use("/api/habits", createHabitsRouter(database));
  app.use("/api/habit-logs", createHabitLogsRouter(database));
  app.use("/api/goals", createGoalsRouter(database));
  app.use("/api/assistant", createAssistantRouter(database));

  app.use((_req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
  });
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error("API request failed:", error);
      if (res.headersSent) return;
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  );

  return app;
}
