import { Router } from "express";
import type { Db } from "mongodb";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import type { GoalDocument, HabitDocument } from "../types.js";

function utcDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function createDashboardRouter(database: Db) {
  const router = Router();
  const habits = database.collection<HabitDocument>("habits");
  const goals = database.collection<GoalDocument>("goals");
  const logs = database.collection("habitLogs");

  router.use(requireAuth);
  router.get("/", async (req: AuthenticatedRequest, res) => {
    const dayKey = utcDayKey(new Date());
    const [habitItems, goalItems, completedItems] = await Promise.all([
      habits
        .find({ userId: req.userId!, isActive: true })
        .sort({ createdAt: -1 })
        .toArray(),
      goals
        .find({ userId: req.userId!, status: "active" })
        .sort({ createdAt: -1 })
        .toArray(),
      logs
        .find({ userId: req.userId!, dayKey }, { projection: { habitId: 1 } })
        .toArray(),
    ]);

    const completedIds = new Set(
      completedItems.map((item) => item.habitId.toHexString())
    );
    const completedCount = habitItems.filter((habit) =>
      completedIds.has(habit._id.toHexString())
    ).length;

    res.json({
      success: true,
      data: {
        habits: habitItems.map((habit) => ({
          ...habit,
          _id: habit._id.toHexString(),
          userId: habit.userId.toHexString(),
          completed: completedIds.has(habit._id.toHexString()),
        })),
        goals: goalItems.map((goal) => ({
          ...goal,
          _id: goal._id.toHexString(),
          userId: goal.userId.toHexString(),
        })),
        stats: {
          completedHabits: completedCount,
          totalHabits: habitItems.length,
          habitProgress: habitItems.length
            ? Math.round((completedCount / habitItems.length) * 100)
            : 0,
          activeGoals: goalItems.length,
        },
      },
    });
  });

  return router;
}
