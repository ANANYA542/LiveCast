# LiveCast: Real-Time Live Event Broadcasting System

LiveCast is a premium, real-time live streaming platform built with Expo (React Native), Express, PostgreSQL, Redis, and WebRTC (via LiveKit). It features dynamic onboarding, stream categorization, real-time chat, and a robust offline synchronization engine.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v18 or newer recommended)
- **Docker & Docker Compose** (for running PostgreSQL, Redis, and n8n)
- **Expo Go** app on your physical device (or iOS Simulator / Android Emulator installed)

---

### 2. Environment Setup

Copy `.env.example` in the backend directory to `.env` (or configure your shell environment):
```ini
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/buildai?schema=public"
REDIS_URL="redis://localhost:6379"
LIVEKIT_API_KEY="devkey"
LIVEKIT_API_SECRET="secret"
LIVEKIT_URL="ws://localhost:7800"
PORT=3001
```

---

### 3. Spin Up Infrastructure Services

In the root of the project, start Postgres and Redis via Docker Compose:
```bash
docker compose up -d
```
This launches:
- **PostgreSQL** on port `5432`
- **Redis** on port `6379`
- **n8n** on port `5678`

---

### 4. Database Setup & Seeding

Go to the `backend` directory, run migrations, and seed the categories:
```bash
cd backend
npm install
npx prisma migrate dev
npx prisma db seed
```
This creates the schema tables (User, Category, Stream, ChatMessage, Follow, StreamHighlight) and seeds categories (Gaming, Music, Sports, Food, Talk Shows).

---

### 5. Start the Backend Server

Inside the `backend` directory, run:
```bash
npm run dev
```
The server will start at `http://localhost:3001`.

---

### 6. Start the Mobile Client

Open a new terminal window, go to the `mobile` directory, and start Expo:
```bash
cd mobile
npm install
npm run start
```
- Tap **`i`** to open the iOS Simulator or **`a`** to open the Android Emulator.
- Alternatively, scan the QR code using your phone's camera to run on a physical device.

---

## 🛠️ Verifying Key Features

### 📡 1. Dynamic Video Streaming (WebRTC)
1. **Onboarding**: Launch the app, enter a display name on the Splash Screen, and press **Get Started**.
2. **Go Live**: Under the **Studio** tab, enter a title, category, and select **Start Live Broadcast**.
3. **Join Stream**: From another device/emulator, navigate to the **Browse** tab. The live stream will show up instantly in the **Featured Live** or **Trending** section. Tap to join and view the video feed.

### 💬 2. Real-Time Chat & Concurrency
- Enter a chat message on either the creator or viewer screen.
- The chat syncs in real-time between clients via isolated Socket.IO rooms.
- Spammers are automatically throttled to 5 messages/sec using Redis-based rate limiting.

### 👥 3. Viewer Tracking (Redis SADD/SREM)
- The viewer count increases automatically when a viewer joins the stream, using distinct set insertion to prevent double-counting.
- If a viewer leaves or disconnects, the count drops immediately.

### 🔌 4. Offline Chat Outbox Queue & Sync
1. Turn off Wi-Fi on the simulator or phone while viewing a live stream.
2. The app detects the change and shows an offline banner.
3. Send 3 chat messages. They are added to MMKV storage with UUID message IDs and display a "pending" status indicator.
4. Turn Wi-Fi back on. The client triggers the batch sync endpoint `/api/chat/sync` with exponential backoff.
5. The messages sync, the database deduplicates them based on the client ID, and they are broadcasted to all viewers in real-time.
