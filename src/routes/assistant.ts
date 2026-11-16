import { Router } from "express";
import { once } from "node:events";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { z } from "zod";
import type { Db } from "mongodb";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import type { GoalDocument, HabitDocument, UserDocument } from "../types.js";

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        parts: z.array(z.unknown()),
      })
    )
    .min(1)
    .max(30),
});

export function createAssistantRouter(database: Db) {
  const router = Router();
  const users = database.collection<UserDocument>("users");
  const goals = database.collection<GoalDocument>("goals");
  const habits = database.collection<HabitDocument>("habits");
  const logs = database.collection("habitLogs");

  router.post("/chat", requireAuth, async (req: AuthenticatedRequest, res) => {
    if (!process.env.OPENAI_API_KEY) {
      res.status(503).json({
        success: false,
        message: "The Growth Coach is not configured",
      });
      return;
    }

    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "A valid conversation is required",
      });
      return;
    }

    const messages = parsed.data.messages.map((message) => {
      const text = message.parts
        .flatMap((part) => {
          if (
            typeof part === "object" &&
            part !== null &&
            "type" in part &&
            part.type === "text" &&
            "text" in part &&
            typeof part.text === "string"
          ) {
            return [part.text.slice(0, 8000)];
          }
          return [];
        })
        .join("\n");
      return { role: message.role, content: text };
    });
    const totalCharacters = messages.reduce(
      (total, message) => total + message.content.length,
      0
    );
    if (!totalCharacters || totalCharacters > 24_000) {
      res.status(400).json({
        success: false,
        message: "Conversation text must be between 1 and 24000 characters",
      });
      return;
    }

    const user = await users.findOne({ _id: req.userId! });
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const weekStart = new Date();
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const weekStartKey = weekStart.toISOString().slice(0, 10);
    const [activeGoals, activeHabits, weekLogs] = await Promise.all([
      goals
        .find({ userId: req.userId!, status: "active" })
        .project({ title: 1, category: 1, progress: 1, deadline: 1 })
        .toArray(),
      habits
        .find({ userId: req.userId!, isActive: true })
        .project({ title: 1, targetPerWeek: 1 })
        .toArray(),
      logs
        .find({ userId: req.userId!, dayKey: { $gte: weekStartKey } })
        .project({ habitId: 1 })
        .toArray(),
    ]);

    const weeklyTarget = activeHabits.reduce(
      (sum, habit) => sum + habit.targetPerWeek,
      0
    );
    const weeklyCompletionRate = weeklyTarget
      ? Math.min(100, Math.round((weekLogs.length / weeklyTarget) * 100))
      : 0;
    const context = {
      userName: user.name,
      activeGoals: activeGoals.map((goal) => ({
        title: goal.title,
        category: goal.category,
        progress: goal.progress,
        deadline: goal.deadline?.toISOString() ?? null,
      })),
      habits: activeHabits.map((habit) => ({
        title: habit.title,
        completedThisWeek: weekLogs.filter(
          (log) => log.habitId.toHexString() === habit._id.toHexString()
        ).length,
        targetPerWeek: habit.targetPerWeek,
      })),
      weeklyCompletionRate,
    };

    const coachSystemPrompt = `You are Growth Coach, a warm, practical personal-growth coach.
Help the user make steady progress on their own goals and build habits that fit their life.

Use the supplied goals and habit records to make advice specific. Treat those records as the only source of progress facts: never invent results, assume a deadline, or claim to create or change data. When important details are missing, ask one focused question instead of guessing.

Offer small, concrete next steps, realistic routines, ways to reduce friction, and encouragement without judgment. Adapt suggestions to the user's stated constraints. Keep replies concise and easy to act on; use short lists when useful.

You are not a substitute for professional medical, mental-health, financial, or other expert care. Do not diagnose or prescribe.

User: ${context.userName}
Active goals: ${JSON.stringify(context.activeGoals)}
Active habits and recent completion counts: ${JSON.stringify(context.habits)}
Weekly habit completion rate: ${context.weeklyCompletionRate}%`;

    const result = streamText({
      model: openai(process.env.OPENAI_MODEL || "gpt-4.1-mini"),
      system: coachSystemPrompt,
      messages,
      maxOutputTokens: 1000,
    });
    const response = result.toUIMessageStreamResponse();
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.status(200);
    if (!response.body) {
      res.end();
      return;
    }
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(value)) await once(res, "drain");
      }
      res.end();
    } catch (error) {
      await reader.cancel().catch(() => {});
      if (!res.destroyed) {
        console.error("Growth Coach stream failed:", error);
        res.end();
      }
    }
  });

  return router;
}
