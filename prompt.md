# BuildAI LiveCast — Prompt History

This document is a chronological record of the prompts I used while building the LiveCast platform for the BuildableLabs Wildcard Generalist Engineer assignment. I used an AI coding assistant throughout the 48-hour build. The prompts below reflect how I approached each problem — starting from understanding the assignment and system design, through implementation, debugging on a physical Android device, and production hardening.



---

## Phase 0 — Understanding the Assignment & System Design

### Prompt 01 — Deconstructing the Assignment

```
Before I write a single line of code, I need to understand the full picture of what's being asked.

The assignment says: "Real-Time Live Event Broadcasting System" — Creator broadcasts video, viewers watch with chat, n8n handles notifications. Three phases: Streaming, Offline sync, Automation.

I know roughly how WebRTC works (the SFU receives the publisher track and fans it out to subscribers), and I know Socket.IO is for real-time bidirectional events. But I need you to break this down architecturally:

1. Where does LiveKit fit in this? Is it just a hosted SFU, or does it also handle room management, token auth, etc.? I've seen their docs mention AccessToken and RoomServiceClient — what's the boundary between what LiveKit handles and what my Express backend handles?

2. For chat — should I use LiveKit's data channels or a separate Socket.IO connection? My instinct says Socket.IO because I need to persist messages to Postgres and do offline queuing later, and data channels are unreliable for that. Am I right?

3. For viewer counting — if I just do +1/-1 in Postgres on join/leave, network flaps will cause race conditions and possibly negative counts. What's the right data structure here?

4. What does n8n actually do in this architecture? Is it like a Zapier where I fire HTTP webhooks and it runs workflows? I've never used it.

Don't generate any code yet. Just help me build the mental model.
```

### Prompt 02 — Tech Stack Decisions & Tradeoffs

```
Okay so the architecture is clearer now. Let me lay out the tech stack I'm thinking and you tell me if I'm overcomplicating anything given the 48-hour deadline:

- Backend: Express + TypeScript + Prisma (I've used this combo before)
- Database: PostgreSQL (hosted on Render so I don't waste time with local Docker Postgres)
- Cache/Presence: Redis for viewer sets and rate limiting
- WebRTC: LiveKit Cloud (they have a free tier, I'll use livekit-server-sdk on backend for token generation)
- Mobile: Expo + React Native with @livekit/react-native for the video player
- Chat transport: Socket.IO (separate from LiveKit)
- Offline storage: react-native-mmkv (I've heard it's way faster than AsyncStorage since it uses JSI)
- Automation: n8n running in Docker locally

My original thought was to use BullMQ for job queues and Redis Pub/Sub for chat fanout, but I think that's overkill for a 48-hour build. The assignment just says "real-time chat" — Socket.IO rooms should handle that without needing a pub/sub layer. And BullMQ is only useful if I need delayed retries at scale, which I don't right now. Am I wrong? Challenge me if there's something I'm missing.

Also — should I run Postgres locally in Docker or just use the Render hosted instance? I'm leaning toward Render so I don't have to deal with Docker networking issues.
```

### Prompt 03 — Data Flow: Creator Goes Live

```
Let's trace the exact data flow for the most critical user journey — when a creator hits "Go Live":

1. The mobile app calls POST /api/streams to create the stream record. At this point status should be SCHEDULED, no LiveKit room exists yet. Why? Because the creator might fill in the title/description and then back out.

2. When they actually tap "Start Broadcasting", the app calls POST /api/streams/:id/start. The backend should:
   - Validate the stream is in SCHEDULED state (guard against double-start)
   - Create the LiveKit room
   - Generate an AccessToken with canPublish: true for the creator
   - Set up the Redis viewer set (empty initially)
   - Fire the n8n stream-started webhook asynchronously
   - Return the token to the mobile app

3. The mobile app connects to LiveKit using the token and publishes camera/mic tracks.

4. Viewers call POST /api/streams/:id/join, get a token with canPublish: false, canSubscribe: true, and connect.

I need to make sure the creator is NOT counted in the viewer set. The Redis SADD should only happen for users where stream.creatorId !== user.id. Confirm this flow makes sense and point out anything I'm missing.
```

---

## Phase 1 — Project Scaffolding & Infrastructure

### Prompt 04 — Docker Compose & Prisma Schema

```
Let's scaffold the project. I need:

1. A docker-compose.yml with:
   - Redis 7 Alpine with a healthcheck (redis-cli ping)
   - n8n latest image on port 5678, connected to my Render Postgres (I'll pass the connection string via environment variables)
   - No local Postgres container — I'm using the hosted Render instance

2. The Prisma schema. Here's my data model thinking:
   - User: id, displayName, email (optional, unique), passwordHash, createdAt
   - Stream: id, creatorId (FK to User), title, description, status (SCHEDULED|LIVE|ENDED), livekitRoomName (unique), peakViewerCount, startedAt, endedAt, scheduledAt, categoryId
   - ChatMessage: id, streamId, userId, content, clientMessageId (unique — this is the idempotency key for offline sync), isOfflineSync (boolean), clientTimestamp, serverTimestamp
   - Category: id, name (unique), slug (unique)
   - Follow: followerId + followingId (compound unique)
   - Notification: id, userId, type, title, message, read, createdAt
   - Reminder: userId + streamId (compound unique)

The clientMessageId on ChatMessage is critical — it's how I prevent duplicate inserts when the mobile app retries sync after reconnection. It needs a @unique constraint in Prisma.

Set up the backend with Express + TypeScript using tsx for dev mode. Give me the exact prisma/schema.prisma and docker-compose.yml.
```

### Prompt 05 — Singleton Prisma & Redis Setup

```
I need a config/db.ts that exports a singleton PrismaClient and a Redis client. Important:

1. The PrismaClient must be instantiated ONCE and exported. I do NOT want to see new PrismaClient() in any middleware or route handler — that causes connection pool leaks. Every file should import { prisma } from "../config/db".

2. For Redis — I want a fallback. If Redis isn't running (like when someone clones the repo without Docker), the backend should still work with an in-memory mock that implements the same interface (get, set, del, sadd, srem, scard, incr, expire, ping). This way development isn't blocked.

3. The Redis connection should have a short connectTimeout (1500ms) and retryStrategy that returns null so it fails fast instead of hanging.
```

---

## Phase 2 — LiveKit Integration (First Time)

### Prompt 06 — LiveKit Token Generation

```
I've never used the livekit-server-sdk package before. Looking at their npm page, I see they export AccessToken and RoomServiceClient.

I need a services/livekitService.ts that:
1. Generates participant tokens using AccessToken. The grant object needs roomJoin: true, room: roomName, canPublish (true for creator, false for viewer), and canSubscribe: true for everyone.
2. Has a deleteRoom function using RoomServiceClient — this is for when the creator ends the stream, I want to forcefully disconnect all participants.

One thing I noticed in their docs — the RoomServiceClient expects an HTTP URL, but my LIVEKIT_URL env var uses wss://. I need to sanitize that: replace ws:// with http:// and wss:// with https://. Handle this in the service file.

Also — the token needs to be converted to JWT with await token.toJwt(). Make sure it's async.
```

### Prompt 07 — Camera Preview Before Going Live

```
Before the creator actually goes live, I want to show a camera preview on the CreatorScreen. The flow should be:

1. When the screen mounts, initialize a local video track using the @livekit/react-native SDK
2. Show the preview in a VideoView component
3. The creator fills in title, category, etc.
4. When they tap "Go Live", THEN we call the backend to create + start the stream, get the token, and connect to the LiveKit room

The key thing is: the camera preview should work WITHOUT connecting to any LiveKit room. It's purely local track creation. I think the API is something like createLocalVideoTrack() from livekit-client, but I'm not sure how it works in React Native specifically. The @livekit/react-native package might need registerGlobals() called first.

Also implement a camera flip button (front/back toggle).
```

### Prompt 08 — Stream State Machine Guards

```
I need to implement proper state machine guards in streamService.ts for the stream lifecycle:

SCHEDULED → LIVE → ENDED

The guards I need:
1. startStream: If stream.status === "LIVE", throw "Stream is already live." If stream.status === "ENDED", throw "Cannot restart a stream that has already ended." Only SCHEDULED streams can transition to LIVE.

2. endStream: If stream.status === "SCHEDULED", throw "Cannot end a stream that has not started yet. Call /start first." If stream.status === "ENDED", throw "Stream has already ended." Only LIVE streams can transition to ENDED.

3. On end, read the peak viewer count from Redis (key: peak_viewers:{streamId}) before deleting the Redis keys.

4. On end, delete the LiveKit room, clean up the Redis viewer set, peak counter, AND all milestone flags (stream:{id}:milestone_3_sent, etc. for all 5 thresholds).

Return appropriate HTTP 409 Conflict responses from the routes when state violations occur.
```

---

## Phase 3 — Real-Time Chat & Viewer Tracking

### Prompt 09 — Socket.IO Room Architecture

```
Set up the Socket.IO server and chat handler. Here's how I want the room architecture:

1. Socket.IO middleware: Extract userId and displayName from socket.handshake.auth. Reject connection if missing.

2. Events I need:
   - room:join — joins the Socket.IO room for that streamId, adds user to Redis viewer set (SADD viewers:{streamId} userId), computes SCARD, broadcasts viewer_count to the room
   - room:leave — leaves room, SREM from viewer set, broadcast updated count
   - disconnect — automatic cleanup, same as room:leave but triggered by connection drop
   - chat:message — receive message, validate, rate limit, save to DB, broadcast chat:new_message to room

3. IMPORTANT: On room:join, the creator (stream.creatorId === user.id) should NOT be added to the viewer set. They're broadcasting, not viewing. But they should still join the Socket.IO room so they can see chat messages.

4. Also on room:join, compute and track peak viewer count. If current SCARD > stored peak, update peak_viewers:{streamId} in Redis.
```

### Prompt 10 — Redis Rate Limiter for Chat

```
I need a rate limiter in the chat:message handler to prevent spam. Here's what I want:

Use Redis INCR on a key like rate_limit:{streamId}:{userId}. On count === 1, set EXPIRE to 5 seconds. If count > 3, emit a chat:error with reason "rate_limited" and drop the message.

This gives us max 3 messages per 5-second window per user. The window auto-resets when the key expires.

Add a debug log line that prints the current count so I can verify during testing: 
console.log(`[Rate Limiter Debug]: user=${user.displayName} key=${rateLimitKey} count=${count}`)

Also add validation: reject empty content, reject content over 500 chars, and check if the stream status is ENDED before allowing messages through.
```

### Prompt 11 — Viewer Milestone Alerts with Anti-Spam

```
When the viewer count crosses certain thresholds (3, 50, 100, 500, 1000), I want to:
1. Fire the n8n viewer-milestone webhook
2. Create a notification record in Postgres for the creator

But the problem is — every new viewer triggers room:join, which recomputes SCARD. If 101 people join, the milestone fires for viewer 101, but also for viewer 102, 103... unless I prevent it.

Solution: Use Redis flags. Key pattern: stream:{streamId}:milestone_{m}_sent with a 24-hour TTL.

CRITICAL: The milestones array must be checked in DESCENDING order: [1000, 500, 100, 50, 3]. Loop through, and break on the first match. If the count is 500, I want to fire the 500 milestone, not the 3, 50, AND 100 milestones.

Check the flag before firing. If already sent, skip. If not sent, set the flag and fire. Break after the first match.

These flags need to be cleaned up in endStream() — delete all 5 milestone keys for the stream.
```

---

## Phase 4 — Offline Synchronization (Phase 2 of Assignment)

### Prompt 12 — MMKV Outbox Pattern

```
This is the offline resilience implementation. Here's the architecture I want:

Mobile side:
1. services/storage.ts — instantiate MMKV with id "buildai-app-storage", export AppStorage helpers and StorageKeys constants
2. services/outbox.ts — OutboxService with getQueue(), enqueue(msg), dequeue(sentIds), clearQueue(). The queue is stored as a JSON-serialized array in MMKV under the key "offline_chat_outbox".

In useChat.ts sendMessage():
1. Generate a clientMessageId like msg-{userId.slice(0,5)}-{Date.now()}-{random6chars}
2. Optimistically add the message to local state with pending: true
3. Check if online (NetInfo) — if offline, call OutboxService.enqueue() and return
4. If online, emit via Socket.IO

On reconnection (NetInfo listener detects online + socket reconnect):
1. Flush the outbox via a batch POST /api/chat/sync endpoint
2. Use exponential backoff for retries: 1s, 2s, 4s, 8s, max 16s
3. On success, dequeue the synced IDs from MMKV and resolve the optimistic UI (set pending: false)
```

### Prompt 13 — Idempotent Sync Endpoint & Duplicate Prevention

```
The batch sync endpoint POST /api/chat/sync needs to handle duplicates gracefully. Here's the scenario:

1. User goes offline, queues 5 messages
2. Network flaps — comes back for 2 seconds, sync fires, sends all 5
3. Network drops again before the response comes back
4. Network comes back again, sync fires AGAIN with the same 5 messages

Without idempotency, I'd get 10 rows in the database. The solution:

In ChatService.saveMessage() and ChatService.syncMessages():
- Before inserting, check if a ChatMessage with that clientMessageId already exists (it has a @unique constraint in Prisma)
- If it exists, return the existing record instead of inserting a duplicate
- This makes the endpoint naturally idempotent

For the sync endpoint specifically:
- Accept an array of messages
- Loop through each one, check existence, insert if new
- Return the full list of synced/existing records so the client can resolve its optimistic UI

Also implement catch-up on reconnection: when the socket reconnects, fetch GET /api/chat/:streamId/messages?since={lastTimestamp} to get any messages the user missed while offline. Merge with local state, deduplicate by clientMessageId, sort chronologically.
```

### Prompt 14 — Network Status Toast Overlays

```
I need global toast notifications that show when the device goes offline and when it comes back online. The design:

1. A floating red banner at the top: "Connection Lost: You are offline" — shows when NetInfo reports isConnected === false
2. A floating green banner: "Connection Restored: Back Online" — shows briefly when connection comes back, then auto-hides after 3 seconds

These should be global (in App.tsx), not per-screen. Use NetInfo.addEventListener to watch for changes. The toasts should be absolute-positioned so they overlay on top of whatever screen is active.

Also — the banner should trigger the outbox sync when connection is restored. If we have queued messages in MMKV, flush them as soon as the green banner shows.
```

---

## Phase 5 — n8n Automation (First Time Using n8n)

### Prompt 15 — n8n Setup & Webhook Architecture

```
I've never used n8n before so walk me through this:

1. My docker-compose.yml already has n8n on port 5678. I need 4 workflows:
   - stream-start-notification: Triggered when creator goes live, notifies followers
   - viewer-milestone-alert: Triggered when viewer count crosses thresholds
   - stream-end-highlights: Triggered when stream ends, generates highlight data
   - daily-digest: Cron job, compiles top streams daily

2. How do I trigger these from the backend? I'm thinking fire-and-forget HTTP POSTs from Express to n8n webhook URLs. The n8n webhook node gives me a URL like http://localhost:5678/webhook/stream-started, right?

3. I want the backend to NOT block or hang if n8n is slow or down. So the HTTP calls should be async with a short timeout (4 seconds) and catch errors silently. Create a utils/n8n.ts with helper functions:
   - n8nTriggers.streamStarted(data) 
   - n8nTriggers.streamEnded(data)
   - n8nTriggers.viewerMilestone(data)

Each one does axios.post() with timeout: 4000 and .catch() that logs the error but doesn't throw.

4. For the stream-end-highlights workflow, the backend needs to send: streamId, creatorId, peakViewers, durationSeconds (computed from startedAt to endedAt), and streamStartedAt (ISO string). The n8n Code node will use the startedAt to compute relative offsets for the highlight timestamps.
```

### Prompt 16 — Sliding Window Highlight Algorithm for n8n

```
The stream-end-highlights workflow needs to find the peak chat activity moment. Here's the problem with fixed time buckets:

If I split chat timestamps into 30-second buckets (0:00-0:30, 0:30-1:00, etc.), and the actual activity spike happens at 0:25-0:35, it gets split across two buckets and neither bucket looks like the peak.

Instead, use a sliding window approach in the n8n Code node:

1. Query all ChatMessage rows for the stream from Postgres
2. If zero messages, output a default highlight with "No chat activity" and skip processing
3. For each message timestamp Ti, count how many messages fall within [Ti - 15s, Ti + 15s] — a 30-second sliding window centered on Ti
4. The message with the highest surrounding density is the peak moment
5. Convert the peak timestamp to a relative offset from streamStartedAt (in seconds)
6. Save a StreamHighlight record with: summary, peakViewers, totalMessages, durationSeconds

I also need an IF node before the Code node that checks whether totalMessages > 0. If the stream ended with zero chat, skip the highlight generation entirely and just save a basic summary.
```

### Prompt 17 — Daily Digest Cron Workflow

```
The daily-digest workflow should:
1. Be triggered by a Cron node (n8n Schedule Trigger) at 5:00 AM daily
2. Query the top 10 streams from the last 24 hours ordered by peakViewerCount DESC
3. For each stream, fetch the creator's displayName
4. Format it as a digest notification
5. Simulate sending it (in production this would go to email/push, for now just write to the database)

Export all 4 workflow JSONs to /n8n-workflows/ so they can be imported on any n8n instance.
```

---

## Phase 6 — Frontend Screens & Backend Integration

### Prompt 18 — Browse Screen (Viewer Dashboard)

```
The BrowseScreen needs to be fully dynamic — no hardcoded data:

1. Category pills at the top — fetched from GET /api/streams/categories. "All" selected by default. Clicking a category should filter all three sections below.

2. "Live Right Now" section — fetched from GET /api/streams?status=LIVE&category={slug}. Show a red LIVE badge, creator name, viewer count.

3. "Upcoming Scheduled" section — fetched from GET /api/streams?status=SCHEDULED&category={slug}. Show scheduled time, "Remind Me" button that toggles a Reminder record via POST /api/streams/:id/reminder.

4. "Recent Lives" section — fetched from GET /api/streams?status=ENDED&category={slug}. These should NOT show a LIVE badge — they're ended. Show peak viewer count and duration.

5. Pull-to-refresh on the whole screen.

Make sure the category filter actually works — when I tap "Music", it should pass the category slug as a query parameter and re-fetch all three sections.
```

### Prompt 19 — Creator Dashboard Screen

```
The CreatorDashboardScreen needs:

1. Stats row at top: Total Streams, Total Viewers, Followers — all from the backend
2. "My Streams" list — fetched from GET /api/streams?creatorId={userId}, shows status badges
3. "Go Live" button that navigates to CreatorScreen
4. "Schedule Stream" modal — title, category dropdown (from API), scheduled time picker. Calls POST /api/streams with scheduledAt.
5. "View Analytics" button on each stream card — opens a modal showing peak viewers, chat count, duration, highlight data if available
6. "Manage Followers" section — list of followers from GET /api/users/:id/followers

All data from the backend. Zero hardcoded mock data. If the API returns empty, show an empty state message.
```

### Prompt 20 — Profile Screen & Notification Alerts

```
Two screens to build:

ProfileScreen:
- Show user avatar (generated from initials), display name, email
- Creator stats: streams count, total viewers, followers count
- "My Followers" expandable list
- "Following" expandable list with unfollow option
- All data from backend APIs

AlertsScreen (Notifications):
- Fetch from GET /api/notifications
- Show unread badge count on the tab bar icon
- Each notification has: type icon, title, message, timestamp
- "Mark All Read" button — calls PUT /api/notifications/read-all
- If offline, queue the mark-all-read action and sync when back online
- Show offline indicator banner when not connected

Notification types to support:
- viewer_milestone: "You hit 100 viewers!"
- stream_started: "User X you follow just went live!"  
- new_follower: "User Y started following you!"
```

### Prompt 21 — Automations Screen

```
Build an AutomationsScreen that shows the n8n workflow statuses. For the MVP, I'll manage the workflow states in our own Postgres database rather than proxying to the n8n API directly (mention in README that production would use n8n's REST API).

Create a new AutomationWorkflow model in Prisma:
- id, name, description, type (Webhook/Event/Condition/Schedule), status (ACTIVE/PAUSED/FAILED), lastRun, runsToday

Seed 4 records matching our actual workflows:
1. Stream Start Notification — Webhook type
2. Viewer Milestone Alert — Event type
3. Stream End Highlights — Webhook type
4. Daily Digest — Schedule type

The screen should show cards with toggle switches for ACTIVE/PAUSED, run counts, and last execution time. Toggle calls PATCH /api/automations/:id/toggle.
```

---

## Phase 7 — Android Device Testing & Debugging

### Prompt 22 — ADB Setup & Port Forwarding

```
I'm trying to test on my physical Samsung phone but adb isn't in my PATH. I found it at ~/Library/Android/sdk/platform-tools/adb. 

Also when I run adb devices I see two entries:
- 192.168.1.3:36231 (wireless debug)
- adb-10ME8MFBX900038-R5wcPG._adb-tls-connect._tcp (USB)

So adb reverse fails with "more than one device/emulator". How do I target a specific device? I think I need the -s flag?

I need to reverse two ports:
- tcp:8081 for Metro bundler
- tcp:3001 for my Express backend + Socket.IO

Give me the exact commands.
```

### Prompt 23 — EADDRINUSE Port 3001

```
I keep getting this when I restart the backend server:

Error: listen EADDRINUSE: address already in use :::3001

What's the fastest way to kill whatever process is holding port 3001? I think it's a zombie node process from a previous tsx watch session that didn't clean up. Give me the one-liner to find and kill it.
```

### Prompt 24 — Camera Preview Bug

```
The camera preview on CreatorScreen is broken. Getting this error:

WARN Failed to start camera preview: [TypeError: Cannot read property 'createCameraTrack' of undefined]

I think the issue is that @livekit/react-native needs registerGlobals() called before any track creation. The native module might not be available in Expo Go — it needs a dev client build.

But actually, for the camera preview I don't even need LiveKit. I can use expo-camera or just handle it through LiveKit's local track API if the native modules are properly linked. What's the right approach here? I'm running on a physical Android device with npx expo run:android.
```

---

## Phase 8 — Production Hardening & Edge Cases

### Prompt 25 — Full System Audit Checklist

```
I want to do a proper audit before submission. Give me a brutally honest checklist to verify every critical path. Specifically:

Backend code inspection:
1. Prisma connection pool — verify there's ZERO instances of new PrismaClient() outside config/db.ts. Every file must import the singleton.
2. Milestone array order — must be [1000, 500, 100, 50, 3] descending. If it's ascending, only the 3-viewer milestone fires.
3. Redis cleanup on stream end — all 5 milestone flags must be deleted. If not, running tests twice on the same stream silently swallows milestones.
4. Rate limiter — verify the Redis INCR + EXPIRE pattern is correct. The EXPIRE must only be set when count === 1.

n8n workflow inspection:
5. stream-end-highlights — must have an IF node checking message count > 0 before the Code node
6. The Code node must receive streamStartedAt to compute relative offsets
7. daily-digest — cron must be set to 5:00 AM, not midnight

Mobile inspection:
8. All screens must pull data from backend APIs. Search for any hardcoded arrays or mock data.
9. The category filter on BrowseScreen must actually re-fetch with the category slug parameter
10. Ended streams must NOT show a LIVE badge
```

### Prompt 26 — Integration Test Script

```
I want an automated test script (verify_audit.ts) that I can run with npx tsx to verify the critical backend paths:

Test 1: Register with invalid email format → expect 400
Test 2: Register valid user → expect 201
Test 3: Register same email again → expect 409 Conflict
Test 4: Login with wrong password → expect 401 with generic "Invalid credentials" message (not "wrong password" — don't leak which field is wrong)
Test 5: Login with correct credentials → expect 200
Test 6: Create stream, start it, try to start it again → expect 409 (state machine guard)
Test 7: Create stream (SCHEDULED), try to end it without starting → expect 409
Test 8: Sync same clientMessageId twice via POST /api/chat/sync → verify only 1 row in DB (idempotency)
Test 9: Open Socket.IO connection, send 10 messages rapidly → verify rate_limited error fires after message 3
Test 10: End a stream, try to send chat → verify stream_ended error

Run these sequentially with clear PASS/FAIL output.
```

### Prompt 27 — Stream End Latency Fix

```
When the creator ends the stream, there's a noticeable delay before the viewer gets kicked out. The viewer should see the stream end instantly.

Currently the flow is: creator calls POST /api/streams/:id/end → backend updates DB → backend deletes LiveKit room → LiveKit disconnects participants.

The problem is I'm not explicitly broadcasting a stream:ended event via Socket.IO. The viewer only knows the stream ended when the LiveKit connection drops, which has latency.

Fix: In the endStream route, after updating the DB, immediately broadcast stream:ended via Socket.IO to the room BEFORE deleting the LiveKit room. The mobile app should listen for stream:ended and show a "Stream Ended" overlay immediately.
```

### Prompt 28 — Category Filter Bug

```
When I click on a specific category pill on the BrowseScreen (like "Music"), the page isn't filtering. I can see in the code that fetchActiveStreams, fetchUpcomingStreams, and fetchRecentStreams all exist, but the category slug isn't being passed to the API call when a category is selected.

The state selectedCategory updates correctly on press, but the useEffect that triggers the re-fetch isn't watching selectedCategory in its dependency array. Fix this — the three fetch functions should re-run whenever the selected category changes.
```

### Prompt 29 — Remove All Hardcoded Frontend Data

```
I've been going through the app and I'm still seeing hardcoded data in several places:

1. BrowseScreen — "Trending Now" section with fake stream data
2. CreatorDashboardScreen — "Upcoming Events" with hardcoded dates
3. AlertsScreen — some notifications are mock objects instead of coming from the API
4. ProfileScreen — follower count is sometimes a static number

Search the entire mobile/ directory for any hardcoded arrays, mock data objects, or static placeholder content that should be coming from the backend. Remove all of it and replace with actual API calls. If the backend doesn't have a route for something, either create the route or remove the UI section entirely. No fake data.
```

### Prompt 30 — Follow-Based Notifications

```
The notification system isn't complete. I need:

1. When User A follows User B, create a notification for User B: type "new_follower", title "User A started following you"
2. When a creator starts a stream, find all users who follow that creator and create a notification for each: type "stream_started", title "Creator X just went live — join now!"
3. Viewer milestone notifications are already working via n8n webhooks

The follow notification should be created in the POST /api/users/:id/follow route handler. The stream-start notification should fire in the streams route when transitioning from SCHEDULED to LIVE — query the Follow table for all followers of the creator and batch insert notifications.
```

---

## Phase 9 — Offline Pipeline Optimization

### Prompt 31 — Spam Detection on Reconnection Bug

```
There's a bug: when a user goes offline and queues up messages, then comes back online, the outbox sync sometimes triggers the spam detection rate limiter on the backend. The spam alert dialog pops up which should NOT happen for legitimate offline-queued messages.

The root cause: in useChat.ts sendMessage(), we check isOnline but not whether the Socket.IO connection is actually established. When the device is technically online but the socket hasn't reconnected yet, messages get emitted to a disconnected socket. Socket.IO buffers them and flushes all at once when it reconnects, which hits the rate limiter.

Fix: Check both isOnline AND socketRef.current?.connected before emitting. If either is false, route the message to OutboxService.enqueue() instead of socket.emit(). The outbox sync goes through POST /api/chat/sync which doesn't have rate limiting.
```

### Prompt 32 — Optimize Chat Sync Pipeline Performance

```
The ChatService.syncMessages() function in chatService.ts is slow. Currently it loops through each message sequentially with a findUnique + create for each one. For 10 queued messages, that's 20 sequential database roundtrips.

Optimize this:
1. Extract all clientMessageIds from the incoming array
2. Do a single findMany query with { clientMessageId: { in: clientMessageIds } } to check which already exist
3. Build a Map of existing messages
4. Filter out the already-existing ones
5. Create all new messages in parallel using Promise.all
6. Merge the results preserving the original input order

This reduces it from 2N sequential queries to 2 queries (one read, one parallel write batch). Should be dramatically faster for large offline queues.
```

---

## Phase 10 — Documentation & Submission

### Prompt 33 — README Cleanup

```
The README has too many emojis and reads like a tutorial. Make it professional and to the point:

1. Remove all emojis
2. Add clear Mermaid diagrams for:
   - WebRTC media delivery pipeline (Creator → Backend → LiveKit → Viewer)
   - Chat synchronization and reconnect recovery flow
   - n8n webhook automation pipeline
3. Clearly define the project structure as a tree
4. List the complete tech stack with specific package names
5. Separate the features list by assignment phase (Phase 1, 2, 3)
6. Setup instructions should be copy-paste-able
7. Testing procedures should be specific and verifiable
```

### Prompt 34 — Git History Cleanup

```
Help me commit the changes in a series of clean, logical commits. I want conventional commit messages that tell a story of the build process. Group related files together — don't commit everything in one giant blob.

The commits should be ordered logically:
1. Infrastructure and config changes first
2. Backend features  
3. Mobile app screens
4. n8n workflow files
5. Documentation
```

### Prompt 35 — Submission Checklist

```
The assignment says I need to submit:
1. GitHub repo (with /mobile, /backend, /n8n-workflows directories)
2. Prompt sharing doc (this prompt.md file)
3. n8n workflow JSON exports
4. The app
5. A Loom video (5 minutes)

Questions:
- For the app — do I need to build an APK/IPA or is running via Expo locally sufficient? I don't want to waste time with EAS Build if I can just demo it running locally.
- For the Loom video — what should I show? I'm thinking: quick architecture overview, then demo the creator flow (go live, see viewers, see chat), then the viewer flow, then the offline flow (toggle airplane mode, queue messages, come back online), then show n8n workflow executions.
- For prompt sharing — should I clean up the raw prompts into something readable or just dump the conversation?

```
