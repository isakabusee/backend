import { Router } from "express";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import type { GoalDocument } from "../types.js";

const goalInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  category: z.enum([
    "Career",
    "Health",
    "Finance",
    "Education",
    "Personal Growth",
  ]),
  deadline: z.coerce.date().optional(),
});

const goalUpdateSchema = goalInputSchema
  .extend({
    progress: z.number().min(0).max(100).optional(),
    status: z.enum(["active", "completed", "paused"]).optional(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0);

function isValidObjectId(value: string) {
  return ObjectId.isValid(value) && new ObjectId(value).toHexString() === value;
}

export function createGoalsRouter(database: Db) {
  const router = Router();
  const goals = database.collection<GoalDocument>("goals");

  router.use(requireAuth);

  router.get("/", async (req: AuthenticatedRequest, res) => {
    const items = await goals
      .find({ userId: req.userId! })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({
      success: true,
      data: items.map((goal) => ({
        ...goal,
        _id: goal._id.toHexString(),
        userId: goal.userId.toHexString(),
      })),
    });
  });

  router.post("/", async (req: AuthenticatedRequest, res) => {
    const parsed = goalInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "Invalid goal data" });
      return;
    }

    const now = new Date();
    const goal: GoalDocument = {
      userId: req.userId!,
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      category: parsed.data.category,
      progress: 0,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    if (parsed.data.deadline !== undefined) goal.deadline = parsed.data.deadline;

    const result = await goals.insertOne(goal);
    res.status(201).json({
      success: true,
      data: {
        ...goal,
        _id: result.insertedId.toHexString(),
        userId: goal.userId.toHexString(),
      },
    });
  });

  router.patch("/:id", async (req: AuthenticatedRequest, res) => {
    const id = req.params.id;
    if (typeof id !== "string" || !isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid goal ID" });
      return;
    }

    const parsed = goalUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "Invalid goal update" });
      return;
    }

    const updates: Partial<
      Pick<
        GoalDocument,
        "title" | "description" | "category" | "deadline" | "progress" | "status"
      >
    > = {};
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.description !== undefined) {
      updates.description = parsed.data.description;
    }
    if (parsed.data.category !== undefined) {
      updates.category = parsed.data.category;
    }
    if (parsed.data.deadline !== undefined) {
      updates.deadline = parsed.data.deadline;
    }
    if (parsed.data.progress !== undefined) {
      updates.progress = parsed.data.progress;
    }
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;

    const result = await goals.findOneAndUpdate(
      { _id: new ObjectId(id), userId: req.userId! },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
    if (!result) {
      res.status(404).json({ success: false, message: "Goal not found" });
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
      res.status(400).json({ success: false, message: "Invalid goal ID" });
      return;
    }

    const result = await goals.deleteOne({
      _id: new ObjectId(id),
      userId: req.userId!,
    });
    if (!result.deletedCount) {
      res.status(404).json({ success: false, message: "Goal not found" });
      return;
    }
    res.status(204).send();
  });

  return router;
}
