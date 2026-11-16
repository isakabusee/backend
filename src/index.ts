import "dotenv/config";
import { createApp } from "./app.js";
import { closeDatabase, connectDatabase } from "./config/database.js";

const port = Number(process.env.PORT || 5001);
const jwtSecret = process.env.JWT_SECRET;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port");
}
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be set to a secret of at least 32 characters");
}

async function startServer() {
  try {
    const database = await connectDatabase();
    const app = createApp(database);
    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`GrowthTrack API listening on port ${port}`);
    });
    server.on("error", (error: NodeJS.ErrnoException) => {
      const message =
        error.code === "EADDRINUSE"
          ? `Port ${port} is already in use. Set PORT to an available port.`
          : `Unable to listen on port ${port}: ${error.message}`;
      console.error(message);
      void closeDatabase().finally(() => process.exit(1));
    });

    const shutdown = () => {
      server.close(() => {
        void closeDatabase().then(() => process.exit(0));
      });
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : undefined;
    const errorDetails =
      error instanceof Error
        ? error.message
            .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, "mongodb://[redacted]")
            .split("\n")[0]
        : "Unknown startup error";
    console.error(
      `Backend startup failed (${errorName}${errorCode ? `, code ${errorCode}` : ""}): ${errorDetails}`
    );
    process.exitCode = 1;
    await closeDatabase();
  }
}

void startServer();
