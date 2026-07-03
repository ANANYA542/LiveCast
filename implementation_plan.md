# Real-Time Live Event Broadcasting System — System Design

> **BuildableLabs · Wildcard Generalist Engineer · 48-Hour Assignment**

---

## 1. Executive Summary

We're building a mobile live-streaming platform where **creators broadcast video**, **viewers watch with real-time chat**, and **n8n automation handles notifications and analytics**. The system spans three phases: core streaming, offline support, and automation workflows.

This document captures every architectural decision, trade-off, and integration point **before a single line of code is written**.

---

## 2. Technology Stack — Final Recommendations

| Layer | Technology | Rationale |
|:---|:---|:---|
| **Mobile** | React Native (Expo Dev Client) | Cross-platform, fast iteration. Expo Go won't work with LiveKit (requires native modules), so we use `expo-dev-client` for custom dev builds. |
| **Language** | TypeScript (end-to-end) | Type safety across mobile + backend reduces 48-hour bugs. |
| **Backend** | Express.js + TypeScript | Lightweight, massive ecosystem, fast to scaffold. |
| **Database** | PostgreSQL + Prisma ORM | Relational integrity for users/streams/messages. Prisma gives us type-safe queries and instant migrations. |
| **Cache / Pub-Sub** | Redis | In-memory viewer counts, Socket.IO adapter for horizontal scaling, session store. |
| **Real-time Chat** | Socket.IO | Persistent connections, room-based messaging, reconnection handling, Redis adapter for scale. |
| **Video Streaming** | LiveKit Cloud | Managed WebRTC infrastructure. Free tier provides 5,000 minutes — more than enough for a demo. Avoids spending hours on self-hosting. |
| **Offline Storage** | MMKV (via `react-native-mmkv`) | ~30x faster than AsyncStorage via JSI. Perfect for the offline outbox queue. |
| **Automation** | n8n (self-hosted via Docker) | Visual workflow builder, webhook triggers from our backend. |
| **Auth** | JWT (access + refresh tokens) | Simple, stateless, fast to implement. No OAuth complexity for MVP. |

### Stack Challenges & Trade-offs

> [!IMPORTANT]
> **Socket.IO vs LiveKit Data Channels for Chat — Key Decision**
>
> LiveKit has built-in data channels that *could* handle chat, but I recommend **Socket.IO separately** for these reasons:
> 1. **Persistence**: Chat messages need to be stored in PostgreSQL. Socket.IO connects to our backend directly; LiveKit data channels are peer-to-peer and bypass our server.
> 2. **Offline Sync**: Phase 2 requires queuing messages offline and syncing later. This is a backend concern — Socket.IO gives us the server-side hooks to handle this.
> 3. **Decoupling**: If LiveKit has an outage, chat still works. If a viewer hasn't joined the LiveKit room yet (browsing streams), they can still see chat.
> 4. **Room lifecycle**: Socket.IO connections persist across navigation. LiveKit rooms exist only while streaming.
>
> **Trade-off**: Two real-time connections per client (Socket.IO + LiveKit WebRTC). This is standard in production streaming apps (Twitch, YouTube Live all separate chat from video transport).

> [!NOTE]
> **LiveKit Cloud vs Self-Hosted**
>
> For a 48-hour assignment, LiveKit Cloud is the only sane choice. Self-hosting requires domain setup, TLS certificates, TURN server configuration, and Redis coordination — easily 4-6 hours of infrastructure work. The free tier gives us 5,000 WebRTC minutes which is more than enough for demo purposes.

> [!NOTE]
> **Why Redis is Essential (Not Optional)**
>
> You didn't mention Redis, but we need it for:
> - **Viewer counts**: Atomic `INCR`/`DECR` operations — no race conditions
> - **Socket.IO adapter**: Required if we ever run multiple backend instances
> - **Rate limiting**: Protect chat from spam
> - **Ephemeral state**: Online presence, typing indicators

---

## 3. High-Level System Architecture

```mermaid
graph TB
    subgraph "Mobile Clients"
        CA["Creator App<br/>(React Native/Expo)"]
        VA["Viewer App<br/>(React Native/Expo)"]
    end

    subgraph "Backend Services"
        API["Express API Server<br/>(REST + Socket.IO)"]
        LK["LiveKit Cloud<br/>(WebRTC SFU)"]
        N8N["n8n<br/>(Automation Engine)"]
    end

    subgraph "Data Layer"
        PG["PostgreSQL<br/>(Prisma ORM)"]
        RD["Redis<br/>(Cache + Pub/Sub)"]
        MMKV_C["MMKV<br/>(Client Offline Queue)"]
    end

    CA -->|"REST API<br/>(HTTPS)"| API
    CA -->|"Socket.IO<br/>(WSS)"| API
    CA -->|"WebRTC<br/>(Publish Video)"| LK

    VA -->|"REST API<br/>(HTTPS)"| API
    VA -->|"Socket.IO<br/>(WSS)"| API
    VA -->|"WebRTC<br/>(Subscribe Video)"| LK

    API -->|"Token Generation<br/>+ Room Mgmt"| LK
    API -->|"Webhook POST"| N8N
    API --> PG
    API --> RD

    LK -->|"Webhook Events<br/>(room.started, participant.joined)"| API

    CA -.->|"Offline Queue"| MMKV_C
    VA -.->|"Offline Queue"| MMKV_C

    style CA fill:#4F46E5,color:#fff
    style VA fill:#7C3AED,color:#fff
    style API fill:#059669,color:#fff
    style LK fill:#DC2626,color:#fff
    style N8N fill:#D97706,color:#fff
    style PG fill:#2563EB,color:#fff
    style RD fill:#DC2626,color:#fff
    style MMKV_C fill:#6B7280,color:#fff
```

### How Everything Talks to Each Other

| Connection | Protocol | Purpose |
|:---|:---|:---|
| Mobile → API Server | HTTPS (REST) | Auth, stream CRUD, message history, user profiles |
| Mobile ↔ API Server | WSS (Socket.IO) | Real-time chat, viewer count updates, presence |
| Mobile ↔ LiveKit Cloud | WebRTC (UDP) | Video/audio publish (creator) and subscribe (viewer) |
| API Server → LiveKit Cloud | HTTPS (Server SDK) | Generate participant tokens, create/end rooms |
| LiveKit Cloud → API Server | HTTPS (Webhooks) | Room lifecycle events (started, ended, participant joined/left) |
| API Server → n8n | HTTPS (Webhook POST) | Trigger automation workflows |
| API Server ↔ Redis | TCP | Viewer counts, Socket.IO adapter, rate limiting |
| API Server ↔ PostgreSQL | TCP (Prisma) | Persistent data storage |

---

## 4. Component Architecture

```mermaid
graph LR
    subgraph "Express API Server"
        direction TB
        MW["Middleware Layer<br/>Auth · CORS · Rate Limit"]
        
        subgraph "Route Handlers"
            AR["Auth Routes<br/>/api/auth/*"]
            SR["Stream Routes<br/>/api/streams/*"]
            UR["User Routes<br/>/api/users/*"]
            CR["Chat Routes<br/>/api/chat/*"]
            WH["Webhook Handler<br/>/webhooks/livekit"]
        end
        
        subgraph "Services"
            AS["Auth Service"]
            SS["Stream Service"]
            CS["Chat Service"]
            NS["Notification Service"]
            LKS["LiveKit Service"]
        end
        
        subgraph "Socket.IO Layer"
            SIO["Socket.IO Server"]
            CHN["Chat Namespace<br/>/chat"]
            PRN["Presence Namespace<br/>/presence"]
        end
        
        MW --> AR & SR & UR & CR & WH
        AR --> AS
        SR --> SS & LKS
        CR --> CS
        WH --> NS & SS
        SIO --> CHN & PRN
    end

    style MW fill:#6366F1,color:#fff
    style SIO fill:#059669,color:#fff
```

### Service Responsibilities

| Service | Responsibility |
|:---|:---|
| **Auth Service** | JWT token generation/validation, user registration/login, token refresh |
| **Stream Service** | Create/end streams, list active streams, stream metadata, viewer count management |
| **Chat Service** | Message persistence, offline message sync, message history pagination |
| **LiveKit Service** | Generate participant tokens (with correct grants), room management via LiveKit Server SDK |
| **Notification Service** | Fire webhook events to n8n, format notification payloads |

---

## 5. Entity-Relationship Diagram

```mermaid
erDiagram
    USER {
        uuid id PK
        string username UK
        string email UK
        string passwordHash
        string displayName
        string avatarUrl
        boolean isCreator
        timestamp createdAt
        timestamp updatedAt
    }

    STREAM {
        uuid id PK
        uuid creatorId FK
        string title
        string description
        string thumbnailUrl
        enum status "LIVE | ENDED | SCHEDULED"
        string livekitRoomName UK
        int peakViewerCount
        timestamp startedAt
        timestamp endedAt
        timestamp createdAt
    }

    CHAT_MESSAGE {
        uuid id PK
        uuid streamId FK
        uuid userId FK
        string content
        string clientMessageId UK "Idempotency key from client"
        boolean isOfflineSync "Was this sent while offline?"
        timestamp clientTimestamp "Client-side timestamp for ordering"
        timestamp serverTimestamp "Server-side receipt timestamp"
        timestamp createdAt
    }

    FOLLOW {
        uuid id PK
        uuid followerId FK
        uuid followingId FK
        timestamp createdAt
    }

    STREAM_HIGHLIGHT {
        uuid id PK
        uuid streamId FK
        string title
        string summary
        int peakViewers
        int totalMessages
        float durationMinutes
        timestamp createdAt
    }

    USER ||--o{ STREAM : "creates"
    USER ||--o{ CHAT_MESSAGE : "sends"
    STREAM ||--o{ CHAT_MESSAGE : "contains"
    USER ||--o{ FOLLOW : "follows"
    USER ||--o{ FOLLOW : "followed by"
    STREAM ||--o| STREAM_HIGHLIGHT : "generates"
```

### Key Design Decisions in the Schema

1. **`clientMessageId`** (UUID generated on the client): This is the **idempotency key** for offline sync. If a client sends the same message twice (network retry), the server uses this unique constraint to deduplicate.

2. **`clientTimestamp` vs `serverTimestamp`**: Two timestamps solve the offline ordering problem. `clientTimestamp` preserves the user's intended order. `serverTimestamp` records when the server actually received it. The chat UI sorts by `clientTimestamp` but groups offline messages visually.

3. **`isOfflineSync` flag**: Lets us distinguish messages that were queued offline and synced later. Useful for analytics and UI treatment (e.g., showing a subtle "sent while offline" indicator).

4. **`livekitRoomName`**: Unique per stream. We generate this deterministically (e.g., `stream-{streamId}`) so both the backend and clients can derive it independently.

5. **`STREAM_HIGHLIGHT`**: Populated by n8n automation after stream ends. Stores aggregated metrics rather than raw data.

---

## 6. Sequence Diagrams

### 6.1 Creator Starts a Live Stream

```mermaid
sequenceDiagram
    actor Creator
    participant App as Creator App
    participant API as Express API
    participant DB as PostgreSQL
    participant Redis
    participant LK as LiveKit Cloud
    participant N8N as n8n

    Creator->>App: Tap "Go Live"
    App->>API: POST /api/streams {title, description}
    API->>DB: INSERT stream (status: LIVE)
    DB-->>API: stream record
    API->>LK: createRoom(roomName)
    LK-->>API: room created
    API->>LK: generateToken(creatorId, roomName, canPublish: true)
    LK-->>API: participant token
    API->>Redis: SET viewer_count:{streamId} 0
    API-->>App: {stream, livekitToken, livekitUrl}
    
    App->>LK: Connect WebRTC (token)
    App->>LK: Publish video + audio tracks
    App->>API: Socket.IO join room:{streamId}
    
    API->>N8N: POST /webhook/stream-started {streamId, creatorId, title}
    N8N->>N8N: Fetch followers, send push notifications
    
    Note over Creator,N8N: Stream is now LIVE
```

### 6.2 Viewer Joins a Live Stream

```mermaid
sequenceDiagram
    actor Viewer
    participant App as Viewer App
    participant API as Express API
    participant Redis
    participant LK as LiveKit Cloud
    participant SIO as Socket.IO

    Viewer->>App: Tap stream card
    App->>API: POST /api/streams/{id}/join
    API->>LK: generateToken(viewerId, roomName, canPublish: false)
    LK-->>API: participant token
    API->>Redis: INCR viewer_count:{streamId}
    Redis-->>API: new count (e.g., 42)
    API-->>App: {livekitToken, livekitUrl, currentViewerCount}
    
    App->>LK: Connect WebRTC (token)
    App->>LK: Subscribe to creator's video + audio
    
    App->>SIO: join room:{streamId}
    SIO->>SIO: Broadcast to room: viewer_count_updated (42)
    
    App->>API: GET /api/chat/{streamId}/messages?limit=50
    API-->>App: Recent chat history

    Note over Viewer,SIO: Viewer is watching + chatting
```

### 6.3 Real-Time Chat Message Flow

```mermaid
sequenceDiagram
    actor Viewer
    participant App as Viewer App
    participant SIO as Socket.IO
    participant API as Express API
    participant DB as PostgreSQL
    participant Redis
    participant N8N as n8n

    Viewer->>App: Type message, tap Send
    App->>App: Generate clientMessageId (UUID)
    App->>App: Optimistic UI update (show message immediately)
    
    App->>SIO: emit("chat:message", {streamId, content, clientMessageId, clientTimestamp})
    
    SIO->>API: Handle chat:message event
    API->>Redis: Check rate limit (5 msg/sec per user)
    
    alt Rate limit OK
        API->>DB: INSERT chat_message (with clientMessageId for idempotency)
        DB-->>API: saved message (with serverTimestamp)
        API->>SIO: broadcast to room("chat:new_message", {message})
        SIO-->>App: All viewers receive the message
    else Rate limited
        API->>SIO: emit("chat:error", {reason: "rate_limited"})
        SIO-->>App: Show error, revert optimistic update
    end
```

### 6.4 Offline Chat Queue & Sync (Phase 2)

```mermaid
sequenceDiagram
    actor Viewer
    participant App as Viewer App
    participant MMKV as MMKV Storage
    participant NetInfo as NetInfo Listener
    participant SIO as Socket.IO
    participant API as Express API
    participant DB as PostgreSQL

    Note over Viewer,DB: Device goes OFFLINE

    Viewer->>App: Send message while offline
    App->>App: Generate clientMessageId + clientTimestamp
    App->>App: Optimistic UI (show with "pending" indicator)
    App->>MMKV: Queue message in outbox {id, content, streamId, clientTimestamp, status: "pending"}

    Viewer->>App: Send another message
    App->>MMKV: Queue message #2

    Note over Viewer,DB: Device comes back ONLINE

    NetInfo->>App: Connection restored event
    App->>MMKV: Read outbox (ordered by clientTimestamp, FIFO)
    
    loop For each pending message (sequential)
        App->>API: POST /api/chat/sync {messages: [msg]}
        API->>API: Check clientMessageId (idempotency)
        
        alt New message
            API->>DB: INSERT with isOfflineSync = true
            API-->>App: {status: "synced", serverTimestamp}
            App->>MMKV: Remove from outbox
            App->>App: Update UI (remove "pending" indicator)
        else Duplicate (already synced)
            API-->>App: {status: "duplicate"}
            App->>MMKV: Remove from outbox
        end
    end
    
    API->>SIO: Broadcast synced messages to room
    Note over App: Other viewers see offline messages in correct order
```

### 6.5 Creator Ends Stream

```mermaid
sequenceDiagram
    actor Creator
    participant App as Creator App
    participant API as Express API
    participant DB as PostgreSQL
    participant LK as LiveKit Cloud
    participant Redis
    participant SIO as Socket.IO
    participant N8N as n8n

    Creator->>App: Tap "End Stream"
    App->>API: POST /api/streams/{id}/end
    
    API->>LK: deleteRoom(roomName)
    API->>DB: UPDATE stream SET status='ENDED', endedAt=NOW()
    API->>Redis: GET viewer_count:{streamId} → peakViewerCount
    API->>DB: UPDATE stream SET peakViewerCount
    API->>Redis: DEL viewer_count:{streamId}
    
    API->>SIO: broadcast to room("stream:ended", {streamId})
    SIO-->>App: All viewers notified
    
    API->>N8N: POST /webhook/stream-ended {streamId, duration, peakViewers, totalMessages}
    N8N->>N8N: Generate highlight summary
    N8N->>DB: INSERT stream_highlight via API
    
    Note over Creator,N8N: Stream archived, highlight generated
```

### 6.6 Viewer Count Tracking (Detailed)

```mermaid
sequenceDiagram
    participant LK as LiveKit Cloud
    participant API as Express API
    participant Redis
    participant SIO as Socket.IO

    Note over LK,SIO: LiveKit sends webhook events for room participation

    LK->>API: POST /webhooks/livekit {event: "participant_joined", room, participant}
    API->>API: Verify webhook signature
    API->>Redis: INCR viewer_count:{streamId}
    Redis-->>API: count = 101
    API->>SIO: broadcast("viewer_count", {streamId, count: 101})

    alt count > 100 (milestone)
        API->>API: POST /webhook/viewer-milestone to n8n
    end

    LK->>API: POST /webhooks/livekit {event: "participant_left", room, participant}
    API->>Redis: DECR viewer_count:{streamId}
    Redis-->>API: count = 100
    API->>SIO: broadcast("viewer_count", {streamId, count: 100})
```

> [!IMPORTANT]
> **Viewer Count Strategy Decision**
>
> We have two options for tracking viewer counts:
>
> **Option A (Recommended): LiveKit Webhooks** — LiveKit sends `participant_joined` and `participant_left` webhook events to our backend. We use Redis `INCR`/`DECR` atomically. This is the most accurate because LiveKit handles the WebRTC connection lifecycle and detects disconnects reliably.
>
> **Option B: Socket.IO connection events** — Track via Socket.IO `connect`/`disconnect` events in each room. Simpler but less reliable — Socket.IO disconnect events can be delayed, and if a user's tab crashes without a clean disconnect, the count drifts.
>
> **Recommendation**: Use **Option A** (LiveKit webhooks) as the source of truth for viewer count, and broadcast the updated count to all clients via Socket.IO. This gives us accuracy from LiveKit's connection management and real-time delivery via Socket.IO.

---

## 7. Mobile App Component Architecture

```mermaid
graph TB
    subgraph "React Native App (Expo)"
        direction TB
        
        subgraph "Navigation"
            NAV["React Navigation<br/>(Stack + Tab)"]
        end
        
        subgraph "Screens"
            HS["Home Screen<br/>(Browse Streams)"]
            VS["Viewer Screen<br/>(Watch + Chat)"]
            CS["Creator Screen<br/>(Broadcast)"]
            PS["Profile Screen"]
            LS["Login/Register"]
        end
        
        subgraph "Core Hooks"
            ULK["useLiveKit()"]
            USIO["useSocket()"]
            UCH["useChat()"]
            UVC["useViewerCount()"]
            UOFF["useOfflineSync()"]
            UAUTH["useAuth()"]
        end
        
        subgraph "Services"
            APIS["API Client<br/>(axios)"]
            SIOC["Socket.IO Client"]
            LKC["LiveKit Client"]
            OQ["Offline Queue<br/>(MMKV)"]
            NI["NetInfo<br/>(Connectivity)"]
        end
        
        NAV --> HS & VS & CS & PS & LS
        VS --> ULK & USIO & UCH & UVC
        CS --> ULK & USIO & UCH & UVC
        HS --> UAUTH
        
        ULK --> LKC
        USIO --> SIOC
        UCH --> SIOC & OQ & NI
        UOFF --> OQ & NI & APIS
    end

    style NAV fill:#4F46E5,color:#fff
    style OQ fill:#D97706,color:#fff
```

### Key Custom Hooks

| Hook | Responsibility |
|:---|:---|
| `useLiveKit()` | Connect/disconnect from LiveKit room, manage video/audio tracks, handle reconnection |
| `useSocket()` | Manage Socket.IO connection lifecycle, auto-reconnect, auth token attachment |
| `useChat()` | Send messages (online or queue offline), receive messages, load history, handle optimistic UI |
| `useViewerCount()` | Subscribe to viewer count updates via Socket.IO, display current count |
| `useOfflineSync()` | Monitor NetInfo, flush MMKV outbox on reconnect, sequential FIFO processing |
| `useAuth()` | JWT token management, refresh logic, secure storage |

---

## 8. Offline Sync Architecture (Phase 2 — Deep Dive)

### 8.1 Outbox Pattern

```mermaid
stateDiagram-v2
    [*] --> Created: User sends message
    Created --> Queued: No network / Socket disconnected
    Created --> Sent: Network available
    
    Queued --> Syncing: Network restored (FIFO)
    Syncing --> Synced: Server ACK (200)
    Syncing --> Failed: Server error (5xx)
    Failed --> Syncing: Retry (exponential backoff)
    
    Sent --> Delivered: Server ACK via Socket.IO
    Synced --> Delivered: Server broadcasts to room
    
    Delivered --> [*]
```

### 8.2 MMKV Outbox Schema

```
Key: "outbox:{streamId}"
Value: JSON array of pending messages

[
  {
    "clientMessageId": "uuid-v4",
    "streamId": "stream-uuid",
    "content": "Hello from offline!",
    "clientTimestamp": "2026-07-02T15:30:00.000Z",
    "status": "pending",         // pending | syncing | failed
    "retryCount": 0,
    "createdAt": "2026-07-02T15:30:00.000Z"
  }
]
```

### 8.3 Conflict Resolution Strategy

| Scenario | Resolution |
|:---|:---|
| **Duplicate message** (same `clientMessageId`) | Server returns `409 Conflict` or `{status: "duplicate"}`. Client removes from outbox. No user-facing error. |
| **Message ordering** (offline msgs arrive late) | Server uses `clientTimestamp` for display ordering. `serverTimestamp` records actual receipt. UI sorts by `clientTimestamp`. |
| **Stream ended while offline** | Server rejects with `410 Gone`. Client removes from outbox and shows "Stream has ended" toast. |
| **User deleted while offline** | Server rejects with `401 Unauthorized`. Client clears outbox and redirects to login. |

### 8.4 Network State Machine

```mermaid
stateDiagram-v2
    [*] --> Online: App launch + network available
    [*] --> Offline: App launch + no network
    
    Online --> Offline: NetInfo disconnected
    Offline --> Reconnecting: NetInfo connected
    
    Reconnecting --> Online: Socket.IO reconnected + Outbox flushed
    Reconnecting --> Offline: Reconnection failed
    
    state Online {
        [*] --> Idle
        Idle --> Sending: User sends message
        Sending --> Idle: ACK received
    }
    
    state Offline {
        [*] --> Queueing
        Queueing --> Queueing: Messages go to MMKV outbox
    }
    
    state Reconnecting {
        [*] --> FlushingOutbox
        FlushingOutbox --> FlushingOutbox: Process next message (FIFO)
        FlushingOutbox --> [*]: Outbox empty
    }
```

---

## 9. n8n Automation Architecture (Phase 3)

### 9.1 Integration Pattern

The backend fires **one-way webhook POSTs** to n8n. n8n is a consumer of events, not a dependency — if n8n is down, the core platform still works.

```mermaid
graph LR
    subgraph "Express Backend"
        EV["Event Emitter"]
        NS["Notification Service"]
    end
    
    subgraph "n8n Workflows"
        W1["Stream Started<br/>→ Notify Followers"]
        W2["Viewer Milestone<br/>→ Alert Creator"]
        W3["Stream Ended<br/>→ Generate Highlight"]
        W4["Daily Digest<br/>(Cron Trigger)"]
    end
    
    EV -->|"stream.started"| NS
    EV -->|"viewer.milestone"| NS
    EV -->|"stream.ended"| NS
    
    NS -->|"POST /webhook/stream-started"| W1
    NS -->|"POST /webhook/viewer-milestone"| W2
    NS -->|"POST /webhook/stream-ended"| W3
    
    style NS fill:#D97706,color:#fff
    style W4 fill:#6366F1,color:#fff
```

### 9.2 Workflow Definitions

#### Workflow 1: Stream Started → Notify Followers

```
Trigger: Webhook (POST /webhook/stream-started)
Payload: { streamId, creatorId, creatorName, title, thumbnailUrl }

Steps:
1. Webhook Node (receive event)
2. HTTP Request → GET /api/users/{creatorId}/followers (from our API)
3. Split In Batches (process followers in groups of 50)
4. For each follower:
   - Format notification message: "{creatorName} is live: {title}"
   - Send push notification (or log to console for MVP)
5. Respond to webhook with 200 OK
```

#### Workflow 2: Viewer Count Milestone → Alert Creator

```
Trigger: Webhook (POST /webhook/viewer-milestone)
Payload: { streamId, creatorId, currentCount, milestone }

Steps:
1. Webhook Node (receive event)
2. IF node: Check milestone thresholds (100, 500, 1000, etc.)
3. Format congratulatory message
4. HTTP Request → POST to our API (which sends via Socket.IO to creator)
5. Log milestone event
```

#### Workflow 3: Stream Ended → Generate Highlight

```
Trigger: Webhook (POST /webhook/stream-ended)
Payload: { streamId, creatorId, duration, peakViewers, totalMessages }

Steps:
1. Webhook Node (receive event)
2. HTTP Request → GET /api/chat/{streamId}/messages?limit=1000
3. Aggregate stats (message frequency over time, peak chat moments)
4. Generate summary text (could use AI node or template)
5. HTTP Request → POST /api/streams/{streamId}/highlight (save to DB)
6. Respond with 200 OK
```

#### Workflow 4: Daily Digest

```
Trigger: Cron (every day at 9:00 AM)

Steps:
1. Schedule Trigger Node
2. HTTP Request → GET /api/streams?status=ENDED&since=24h (top streams)
3. Sort by peakViewerCount DESC, limit 10
4. Format digest (HTML template)
5. For each user who opted in:
   - Send digest notification
6. Log completion
```

### 9.3 n8n Integration Security

| Concern | Solution |
|:---|:---|
| **Webhook authentication** | Shared secret in `Authorization: Bearer {N8N_WEBHOOK_SECRET}` header |
| **n8n → API authentication** | n8n uses a service account JWT with limited permissions |
| **Idempotency** | n8n workflows include dedup logic using `streamId` + event type |
| **Failure handling** | Fire-and-forget from backend. n8n has built-in retry on failure. Backend logs webhook delivery status. |

---

## 10. API Contract Overview

### 10.1 REST Endpoints

#### Auth
| Method | Endpoint | Description |
|:---|:---|:---|
| POST | `/api/auth/register` | Create new user account |
| POST | `/api/auth/login` | Login, returns JWT tokens |
| POST | `/api/auth/refresh` | Refresh access token |

#### Streams
| Method | Endpoint | Description |
|:---|:---|:---|
| GET | `/api/streams` | List active streams (with filters) |
| POST | `/api/streams` | Create new stream (creator only) |
| GET | `/api/streams/:id` | Get stream details |
| POST | `/api/streams/:id/join` | Join stream (get LiveKit token) |
| POST | `/api/streams/:id/end` | End stream (creator only) |
| GET | `/api/streams/:id/highlight` | Get stream highlight |

#### Chat
| Method | Endpoint | Description |
|:---|:---|:---|
| GET | `/api/chat/:streamId/messages` | Get chat history (paginated) |
| POST | `/api/chat/sync` | Sync offline messages (batch) |

#### Users
| Method | Endpoint | Description |
|:---|:---|:---|
| GET | `/api/users/:id` | Get user profile |
| POST | `/api/users/:id/follow` | Follow a creator |
| DELETE | `/api/users/:id/follow` | Unfollow a creator |
| GET | `/api/users/:id/followers` | Get follower list |

#### Webhooks (Internal)
| Method | Endpoint | Description |
|:---|:---|:---|
| POST | `/webhooks/livekit` | Receive LiveKit webhook events |

### 10.2 Socket.IO Events

#### Client → Server
| Event | Payload | Description |
|:---|:---|:---|
| `room:join` | `{streamId}` | Join a stream's chat room |
| `room:leave` | `{streamId}` | Leave a stream's chat room |
| `chat:message` | `{streamId, content, clientMessageId, clientTimestamp}` | Send chat message |

#### Server → Client
| Event | Payload | Description |
|:---|:---|:---|
| `chat:new_message` | `{message}` | New chat message broadcast |
| `chat:error` | `{reason}` | Chat error (rate limit, etc.) |
| `viewer_count` | `{streamId, count}` | Updated viewer count |
| `stream:ended` | `{streamId}` | Stream has ended |
| `notification` | `{type, message}` | Push notification from n8n |

---

## 11. Deployment Architecture

```mermaid
graph TB
    subgraph "Development (Local)"
        direction TB
        DEV_API["Express Server<br/>localhost:3001"]
        DEV_PG["PostgreSQL<br/>localhost:5432"]
        DEV_REDIS["Redis<br/>localhost:6379"]
        DEV_N8N["n8n<br/>localhost:5678"]
        DEV_EXPO["Expo Dev Server<br/>localhost:8081"]
    end

    subgraph "External Services"
        LK_CLOUD["LiveKit Cloud<br/>(Managed)"]
    end

    DEV_EXPO -->|"API calls"| DEV_API
    DEV_API --> DEV_PG
    DEV_API --> DEV_REDIS
    DEV_API -->|"Webhooks"| DEV_N8N
    DEV_API <-->|"Tokens + Webhooks"| LK_CLOUD
    DEV_EXPO -->|"WebRTC"| LK_CLOUD

    style LK_CLOUD fill:#DC2626,color:#fff
    style DEV_EXPO fill:#4F46E5,color:#fff
    style DEV_N8N fill:#D97706,color:#fff
```

### Local Development Setup

| Service | How to Run | Port |
|:---|:---|:---|
| Express API | `npm run dev` (ts-node-dev / tsx) | 3001 |
| PostgreSQL | Docker: `docker run postgres:16` | 5432 |
| Redis | Docker: `docker run redis:7-alpine` | 6379 |
| n8n | Docker: `docker run n8nio/n8n` | 5678 |
| Expo | `npx expo start --dev-client` | 8081 |
| LiveKit | Cloud (no local setup needed) | — |

> [!NOTE]
> **LiveKit Webhooks in Development**
>
> LiveKit Cloud needs a public URL to send webhooks to our local server. We'll use `ngrok` or `cloudflared` to tunnel `localhost:3001` to a public URL, then configure that URL in LiveKit Cloud's webhook settings.

---

## 12. Phased Implementation Timeline (48 Hours)

### Phase 1: Core Streaming (Hours 0–24)

| Time Block | Task | Priority |
|:---|:---|:---|
| **H0–H2** | Project scaffolding: Expo app, Express server, Prisma schema, Docker Compose for PG/Redis | 🔴 Critical |
| **H2–H4** | Auth system: Register, Login, JWT middleware, Prisma User model | 🔴 Critical |
| **H4–H8** | Streaming core: LiveKit integration, token generation, room management, creator broadcast screen | 🔴 Critical |
| **H8–H12** | Viewer experience: Stream list, join stream, watch video, viewer count (Redis + Socket.IO) | 🔴 Critical |
| **H12–H16** | Chat system: Socket.IO setup, real-time messaging, message persistence, chat UI | 🔴 Critical |
| **H16–H20** | Polish Phase 1: Error handling, reconnection logic, basic UI styling, stream end flow | 🟡 Important |
| **H20–H24** | Testing + Buffer: Test all Phase 1 flows end-to-end, fix bugs, refine UI | 🟡 Important |

### Phase 2: Offline Support (Hours 24–36)

| Time Block | Task | Priority |
|:---|:---|:---|
| **H24–H28** | Offline queue: MMKV outbox, NetInfo listener, offline detection, message queueing | 🔴 Critical |
| **H28–H32** | Sync engine: FIFO processing, idempotency handling, `/api/chat/sync` endpoint, conflict resolution | 🔴 Critical |
| **H32–H36** | UI polish: Pending indicators, sync animations, error toasts, edge case handling | 🟡 Important |

### Phase 3: n8n Automation (Hours 36–46)

| Time Block | Task | Priority |
|:---|:---|:---|
| **H36–H38** | n8n setup: Docker container, webhook endpoints in Express, notification service | 🔴 Critical |
| **H38–H42** | Core workflows: Stream started → notify, Viewer milestone → alert, Stream ended → highlight | 🔴 Critical |
| **H42–H44** | Daily digest: Cron workflow, top streams aggregation | 🟢 Nice-to-have |
| **H44–H46** | Export workflows: JSON export for submission, documentation | 🟡 Important |

### Final Buffer (Hours 46–48)

| Time Block | Task | Priority |
|:---|:---|:---|
| **H46–H48** | README, cleanup, GitHub repo structure, final testing, submission | 🔴 Critical |

---

## 13. Risk Analysis & Mitigations

| Risk | Impact | Mitigation |
|:---|:---|:---|
| LiveKit Expo plugin incompatibility | 🔴 Blocks video | Test LiveKit + Expo dev build first (H0). Have fallback plan: bare React Native CLI. |
| Socket.IO + LiveKit dual connections drain mobile battery | 🟡 UX issue | Acceptable for MVP. In production, would optimize with connection pooling. |
| n8n Docker networking issues | 🟡 Blocks Phase 3 | Use `docker-compose` with shared network. Fallback: n8n Cloud free tier. |
| Offline sync race conditions | 🟡 Data issues | Sequential FIFO processing + idempotency keys. No parallel sync. |
| 48-hour time pressure | 🔴 Incomplete submission | Phases are prioritized. Phase 1 is the minimum viable submission. Phase 3 daily digest is explicitly "nice-to-have". |
| LiveKit Cloud free tier limits | 🟢 Low risk | 5,000 minutes is ~83 hours of streaming. More than enough for demo. |

---

## 14. Folder Structure (Preview)

> [!NOTE]
> This is a preview of the intended folder structure for orientation. Actual scaffolding happens during implementation.

```
buildai/
├── mobile/                    # React Native (Expo) app
│   ├── app/                   # Expo Router screens
│   ├── components/            # Reusable UI components
│   ├── hooks/                 # Custom hooks (useLiveKit, useChat, etc.)
│   ├── services/              # API client, Socket.IO client, offline queue
│   ├── stores/                # State management (Zustand recommended)
│   └── app.json               # Expo config with LiveKit plugin
│
├── backend/                   # Express.js + TypeScript
│   ├── src/
│   │   ├── routes/            # Express route handlers
│   │   ├── services/          # Business logic layer
│   │   ├── middleware/        # Auth, rate limiting, error handling
│   │   ├── socket/            # Socket.IO event handlers
│   │   ├── prisma/            # Prisma schema + migrations
│   │   └── config/            # Environment config
│   └── docker-compose.yml     # PostgreSQL + Redis + n8n
│
├── n8n-workflows/             # Exported n8n workflow JSONs
│   ├── stream-started.json
│   ├── viewer-milestone.json
│   ├── stream-ended.json
│   └── daily-digest.json
│
└── README.md
```

---

## Open Questions

> [!IMPORTANT]
> **Q1: State Management on Mobile**
>
> For the React Native app, do you prefer **Zustand** (lightweight, minimal boilerplate) or **React Context + useReducer** (no extra dependency)? I recommend Zustand — it's tiny (~1KB), works great with TypeScript, and handles the real-time state updates from Socket.IO cleanly.

> [!IMPORTANT]
> **Q2: Authentication Scope**
>
> The assignment doesn't specify authentication complexity. I'm planning **email + password with JWT** (simplest possible). No OAuth, no social login, no email verification. Is that acceptable, or do you want something more polished?

> [!IMPORTANT]
> **Q3: Push Notifications in n8n Workflows**
>
> The assignment says "notify followers" but doesn't specify the notification channel. For a 48-hour MVP, I'd **log notifications to console + store in DB** rather than integrating a real push notification service (which requires FCM/APNs setup, certificates, etc.). The n8n workflow would still be fully functional — just the final delivery step would be simulated. Thoughts?

> [!IMPORTANT]
> **Q4: Video Quality / Simulcast**
>
> LiveKit supports simulcast (multiple quality layers so viewers on poor connections get lower resolution). Should we enable this for the MVP, or keep it simple with a single video track? Simulcast adds ~3 lines of config but is a nice demo talking point.

> [!IMPORTANT]
> **Q5: Creator vs Viewer — Same App or Separate?**
>
> The assignment mentions "Creator App" and "Viewer App" but building two separate apps doubles the work. I'm planning a **single app with role-based UI** — any user can be both a creator and a viewer. The assignment seems to imply this too ("Creator (Mobile App)" and "Viewer (Mobile App)" likely refer to roles, not separate binaries). Confirm?

---

## Verification Plan

### Automated Tests
- **Backend**: Jest + Supertest for API route testing
- **Prisma**: Test migrations with `prisma migrate dev` 
- **Socket.IO**: Integration tests with `socket.io-client` in test harness

### Manual Verification
- End-to-end: Creator starts stream → Viewer joins → Chat works → Offline queue → Sync → Stream ends → n8n fires
- Test on physical device (Expo dev client build) for WebRTC performance
- Verify n8n workflows fire correctly via webhook test in n8n UI
- Test offline scenario: Enable airplane mode → send messages → disable → verify sync
