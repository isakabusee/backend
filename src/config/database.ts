import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB_NAME || "growthtrack";

if (!uri) {
  throw new Error("MONGODB_URI is not configured");
}

const client = new MongoClient(uri, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 10_000,
});

export async function connectDatabase() {
  await client.connect();

  const database = client.db(databaseName);
  await Promise.all([
    database.collection("users").createIndex({ email: 1 }, { unique: true }),
    database
      .collection("habits")
      .createIndex({ userId: 1, isActive: 1, createdAt: -1 }),
    database
      .collection("goals")
      .createIndex({ userId: 1, status: 1, deadline: 1 }),
    database.collection("habitLogs").createIndex(
      { userId: 1, habitId: 1, dayKey: 1 },
      { unique: true }
    ),
    database.collection("habitLogs").createIndex({ userId: 1, dayKey: 1 }),
  ]);

  return database;
}

export async function closeDatabase() {
  await client.close();
}
