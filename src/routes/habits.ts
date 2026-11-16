import { Router } from "express";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import type { HabitDocument } from "../types.js";

const habitInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  frequency: z.enum(["daily", "weekly"]).default("daily"),
  targetPerWeek: z.number().int().min(1).max(7).optional(),
  icon: z.string().trim().max(80).optional(),
});

const habitUpdateSchema = habitInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required"
);

function isValidObjectId(value: string) {
  return ObjectId.isValid(value) && new ObjectId(value).toHexString() === value;
}

export function createHabitsRouter(database: Db) {
  const router = Router();
  const habits = database.collection<HabitDocument>("habits");
  const logs = database.collection("habitLogs");

  router.use(requireAuth);

  router.get("/", async (req: AuthenticatedRequest, res) => {
    const dateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.query.date);
    const dayKey = dateParam.success
      ? dateParam.data
      : new Date().toISOString().slice(0, 10);

    if (req.query.date !== undefined && !dateParam.success) {
      res.status(400).json({ success: false, message: "Invalid date" });
      return;
    }

    const [items, completed] = await Promise.all([
      habits
        .find({ userId: req.userId!, isActive: true })
        .sort({ createdAt: -1 })
        .toArray(),
      logs
        .find(
          { userId: req.userId!, dayKey },
          { projection: { habitId: 1 } }
        )
        .toArray(),
    ]);
    const completedIds = new Set(completed.map((log) => log.habitId.toHexString()));

    res.json({
      success: true,
      data: items.map((habit) => ({
        ...habit,
        _id: habit._id.toHexString(),
        userId: habit.userId.toHexString(),
        completed: completedIds.has(habit._id.toHexString()),
      })),
    });
  });

  router.post("/", async (req: AuthenticatedRequest, res) => {
    const parsed = habitInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "Invalid habit data" });
      return;
    }

    const now = new Date();
    const habit: HabitDocument = {
      userId: req.userId!,
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      frequency: parsed.data.frequency,
      targetPerWeek:
        parsed.data.targetPerWeek ??
        (parsed.data.frequency === "daily" ? 7 : 1),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    if (parsed.data.icon !== undefined) habit.icon = parsed.data.icon;

    const result = await habits.insertOne(habit);
    res.status(201).json({
      success: true,
      data: {
        ...habit,
        _id: result.insertedId.toHexString(),
        userId: habit.userId.toHexString(),
        completed: false,
      },
    });
  });

  router.patch("/:id", async (req: AuthenticatedRequest, res) => {
    const id = req.params.id;
    if (typeof id !== "string" || !isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid habit ID" });
      return;
    }

    const parsed = habitUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "Invalid habit update" });
      return;
    }

    const updates: Partial<
      Pick<
        HabitDocument,
        "title" | "description" | "frequency" | "targetPerWeek" | "icon"
      >
    > = {};
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.description !== undefined) {
      updates.description = parsed.data.description;
    }
    if (parsed.data.frequency !== undefined) {
      updates.frequency = parsed.data.frequency;
    }
    if (parsed.data.targetPerWeek !== undefined) {
      updates.targetPerWeek = parsed.data.targetPerWeek;
    }
    if (parsed.data.icon !== undefined) updates.icon = parsed.data.icon;

    const result = await habits.findOneAndUpdate(
      { _id: new ObjectId(id), userId: req.userId!, isActive: true },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
    if (!result) {
      res.status(404).json({ success: false, message: "Habit not found" });
      return;
    }

    res.json({
      success: true,
      data: {
        ...result,
        _id: result._id.toHexString(),
        userId: result.userId.toHexString(),
      },
    });
  });

  router.delete("/:id", async (req: AuthenticatedRequest, res) => {
    const id = req.params.id;
    if (typeof id !== "string" || !isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid habit ID" });
      return;
    }

    const result = await habits.updateOne(
      { _id: new ObjectId(id), userId: req.userId!, isActive: true },
      { $set: { isActive: false, updatedAt: new Date() } }
    );
    if (!result.matchedCount) {
      res.status(404).json({ success: false, message: "Habit not found" });
      return;
    }

    res.status(204).send();
  });

  return router;
}
