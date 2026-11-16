# GrowthTrack API

Express API for the Expo mobile app. The backend owns authentication and all
MongoDB access; the mobile app should only call this API and must never connect
directly to MongoDB.

## Run locally

1. Copy `.env.example` to `.env` and set `MONGODB_URI` to your MongoDB Atlas
   connection string (or a local MongoDB URI). Use a `JWT_SECRET` with at least
   32 characters. Keep `.env` out of source control.
2. In Atlas, allow the IP address of the machine running this API in **Network
   Access**, and ensure the database user has read/write access to the selected
   database.
3. Install and start the API:

   ```sh
   npm install
   npm run dev
   ```

4. Set `EXPO_PUBLIC_API_URL` in the mobile app's local environment to the API
   base URL, including `/api`, then restart Expo:

   ```text
   http://localhost:5001/api
   ```

   For an Android emulator, use `http://10.0.2.2:5001/api`. For a physical
   device, use the development computer's LAN IP instead of `localhost`.

The API listens on port `5001` by default. `GET /` and `GET /api/health` return
the health response. `OPENAI_API_KEY` is optional; it is required only for the
Growth Coach endpoint.

If MongoDB reports `bad auth` or `Authentication failed`, use the MongoDB
**database user** credentials in `MONGODB_URI` (not the Atlas website login).
If the password contains reserved URI characters, percent-encode them before
putting the URI in `.env`. Never share the URI or commit `.env`.

## MongoDB schema

Collections are created by MongoDB on first write. Indexes are created during
startup.

### `users`

```text
_id: ObjectId
name: string
email: string (lowercase, unique)
passwordHash: string (bcrypt; never returned by the API)
createdAt: Date
updatedAt: Date
```

### `habits`

```text
_id: ObjectId
userId: ObjectId -> users._id
title: string
description: string
frequency: "daily" | "weekly"
targetPerWeek: integer (1..7)
icon?: string
isActive: boolean
createdAt: Date
updatedAt: Date
```

### `habitLogs`

```text
_id: ObjectId
userId: ObjectId -> users._id
habitId: ObjectId -> habits._id
dayKey: string ("YYYY-MM-DD", UTC)
completedAt: Date
note: string
createdAt: Date
updatedAt: Date
```

There is a unique index on `(userId, habitId, dayKey)`, so a habit can only be
completed once per user per day. Habit completion is stored separately so
history remains available when a habit is deactivated.

### `goals`

```text
_id: ObjectId
userId: ObjectId -> users._id
title: string
description: string
category: "Career" | "Health" | "Finance" | "Education" | "Personal Growth"
progress: number (0..100)
deadline?: Date
status: "active" | "completed" | "paused"
createdAt: Date
updatedAt: Date
```

Every user-owned collection is queried with the authenticated `userId`, so
users cannot read or modify another user's records by supplying an ID.

## API

All JSON responses use `{ success, data }` on success and `{ success: false,
message }` for errors. Authenticated routes require
`Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Create account; returns user and 7-day JWT |
| `POST` | `/api/auth/login` | Sign in; returns user and JWT |
| `GET` | `/api/auth/me` | Current authenticated user |
| `GET` | `/api/dashboard` | Today's habits, active goals, and progress stats |
| `GET`, `POST` | `/api/habits` | List or create habits |
| `PATCH`, `DELETE` | `/api/habits/:id` | Update or deactivate a habit |
| `POST` | `/api/habit-logs/:habitId/complete` | Mark a habit complete for a `dayKey` |
| `DELETE` | `/api/habit-logs/:habitId/complete?date=YYYY-MM-DD` | Undo that day's completion |
| `GET` | `/api/habit-logs/:habitId/logs` | Read completion history |
| `GET`, `POST` | `/api/goals` | List or create goals |
| `PATCH`, `DELETE` | `/api/goals/:id` | Update or delete a goal |
| `POST` | `/api/assistant/chat` | Stream a Growth Coach response |

`GET /api/habits` accepts an optional `?date=YYYY-MM-DD`; completion status is
derived from the matching habit log rather than stored on the habit itself.

## Growth Coach

The authenticated `POST /api/assistant/chat` endpoint streams AI SDK UI messages.
It uses `OPENAI_API_KEY` and the model named in `OPENAI_MODEL` (defaults to
`gpt-4.1-mini`). The backend sends the coach the signed-in user's name, active
goals, and recent habit activity; provider credentials are only used on the
backend. Without a valid provider key, the route responds with HTTP 503.
