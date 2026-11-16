import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { ObjectId, type Db, type WithId } from "mongodb";
import type { UserDocument } from "../types.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

function createToken(userId: ObjectId) {
  return jwt.sign({}, process.env.JWT_SECRET!, {
    subject: userId.toHexString(),
    expiresIn: "7d",
  });
}

function userResponse(user: WithId<UserDocument>) {
  return {
    _id: user._id.toHexString(),
    name: user.name,
    email: user.email,
  };
}

export function createAuthRouter(database: Db) {
  const router = Router();
  const users = database.collection<UserDocument>("users");

  router.post("/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "Invalid registration data" });
      return;
    }

    const { name, password } = parsed.data;
    const email = parsed.data.email.toLowerCase();
    const now = new Date();
    const user: UserDocument = {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      createdAt: now,
      updatedAt: now,
    };

    try {
      const result = await users.insertOne(user);
      const id = result.insertedId;
      res.status(201).json({
        success: true,
        data: {
          token: createToken(id),
          user: { _id: id.toHexString(), name, email },
        },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        res.status(409).json({
          success: false,
          message: "Email already registered",
        });
        return;
      }

      throw error;
    }
  });

  router.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "Invalid login data" });
      return;
    }

    const user = await users.findOne({
      email: parsed.data.email.toLowerCase(),
    });
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    res.json({
      success: true,
      data: { token: createToken(user._id), user: userResponse(user) },
    });
  });

  router.get(
    "/me",
    requireAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = await users.findOne(
        { _id: req.userId! },
        { projection: { passwordHash: 0 } }
      );
      if (!user) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      res.json({ success: true, data: userResponse(user) });
    }
  );

  return router;
}
