import type { ObjectId } from "mongodb";

export interface UserDocument {
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export type GoalCategory =
  | "Career"
  | "Health"
  | "Finance"
  | "Education"
  | "Personal Growth";

export interface HabitDocument {
  userId: ObjectId;
  title: string;
  description: string;
  frequency: "daily" | "weekly";
  targetPerWeek: number;
  icon?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface HabitLogDocument {
  userId: ObjectId;
  habitId: ObjectId;
  dayKey: string;
  completedAt: Date;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoalDocument {
  userId: ObjectId;
  title: string;
  description: string;
  category: GoalCategory;
  progress: number;
  deadline?: Date;
  status: "active" | "completed" | "paused";
  createdAt: Date;
  updatedAt: Date;
}
