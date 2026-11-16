import { Router } from "express";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import type { HabitDocument, HabitLogDocument } from "../types.js";
import { requireAuth } from "../middleware/auth.js";

const dayKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

const completionSchema = z.object({
  dayKey: dayKeySchema,
  note: z.string().trim().max(500).optional(),
});

function isValidObjectId(value: string) {
  return ObjectId.isValid(value) && new ObjectId(value).toHexString() === value;
}

export function createHabitLogsRouter(database: Db) {
  const router = Router();
  const habits = database.collection<HabitDocument>("habits");
  const logs = database.collection<HabitLogDocument>("habitLogs");

  router.use(requireAuth);

  router.post("/:habitId/complete", async (req: AuthenticatedRequest, res) => {
    const habitIdParam = req.params.habitId;
    if (typeof habitIdParam !== "string" || !isValidObjectId(habitIdParam)) {
      res.status(400).json({ success: false, message: "Invalid habit ID" });
      return;
    }

    const parsed = completionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "Invalid completion data" });
      return;
    }

    const habitId = new ObjectId(habitIdParam);
    const habit = await habits.findOne({
      _id: habitId,
      userId: req.userId!,
      isActive: true,
    });
    if (!habit) {
      res.status(404).json({ success: false, message: "Habit not found" });
      return;
    }

    const now = new Date();
    const result = await logs.findOneAndUpdate(
      {
        userId: req.userId!,
        habitId,
        dayKey: parsed.data.dayKey,
      },
      {
        $setOnInsert: {
          userId: req.userId!,
          habitId,
          dayKey: parsed.data.dayKey,
          completedAt: now,
          note: parsed.data.note ?? "",
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: "after" }
    );
    if (!result) {
      throw new Error("Unable to save habit completion");
    }

    res.json({
      success: true,
      data: {
        ...result,
        _id: result._id.toHexString(),
        userId: result.userId.toHexString(),
        habitId: result.habitId.toHexString(),
      },
    });
  });

  router.delete("/:habitId/complete", async (req: AuthenticatedRequest, res) => {
    const habitIdParam = req.params.habitId;
    if (typeof habitIdParam !== "string" || !isValidObjectId(habitIdParam)) {
      res.status(400).json({ success: false, message: "Invalid habit ID" });
      return;
    }
    const parsed = dayKeySchema.safeParse(req.query.date);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "A valid date is required" });
      return;
    }

    const result = await logs.deleteOne({
      userId: req.userId!,
      habitId: new ObjectId(habitIdParam),
      dayKey: parsed.data,
    });
    if (!result.deletedCount) {
      res.status(404).json({ success: false, message: "Completion not found" });
      return;
    }
    res.status(204).send();
  });

  router.get("/:habitId/logs", async (req: AuthenticatedRequest, res) => {
    const habitIdParam = req.params.habitId;
    if (typeof habitIdParam !== "string" || !isValidObjectId(habitIdParam)) {
      res.status(400).json({ success: false, message: "Invalid habit ID" });
      return;
    }

    const habitId = new ObjectId(habitIdParam);
    const habit = await habits.findOne({
      _id: habitId,
      userId: req.userId!,
    });
    if (!habit) {
      res.status(404).json({ success: false, message: "Habit not found" });
      return;
    }

    const items = await logs
      .find({ userId: req.userId!, habitId })
      .sort({ completedAt: -1 })
      .limit(365)
      .toArray();
    res.json({
      success: true,
      data: items.map((log) => ({
        ...log,
        _id: log._id.toHexString(),
        userId: log.userId.toHexString(),
        habitId: log.habitId.toHexString(),
      })),
    });
  });

  return router;
}
