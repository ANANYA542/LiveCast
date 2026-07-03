# n8n Automation Workflows

This directory contains the exported JSON files for the four required n8n workflows of the Real-Time Live Event Broadcasting platform.

## 📋 Workflows Included

### 1. `stream-start-notification.json` — Stream Started → Notify Followers
- **Trigger:** Webhook from backend (`POST /webhook/stream-started`) when status transitions `SCHEDULED` → `LIVE`.
- **Pipeline:** Webhook → Postgres (query followers) → Split In Batches (50) → HTTP Request (simulates push notification via `httpbin.org/post`) → Loop back → Done.
- **Edge cases:** If the creator has zero followers, the Split In Batches node simply completes with zero iterations.

### 2. `viewer-milestone-alert.json` — Viewer Milestone → Alert Creator
- **Trigger:** Webhook from backend (`POST /webhook/viewer-milestone`) when viewer thresholds are crossed.
- **Anti-spam:** The backend uses Redis flags (`stream:{id}:milestone_{n}_sent`, TTL 24h) to ensure each milestone fires **exactly once**. Milestones are checked in **descending order** (1000 → 500 → 100 → 50 → 3) so only the highest unclaimed threshold fires.
- **Pipeline:** Webhook → Postgres (get creator email) → Switch on milestone value → Set (format alert message) → HTTP Request (simulate delivery).

### 3. `stream-end-highlights.json` — Stream Ended → Generate Highlights
- **Trigger:** Webhook from backend (`POST /webhook/stream-ended`) with payload including `streamId`, `peakViewers`, `durationSeconds`, and `streamStartedAt`.
- **Pipeline:** Webhook → Postgres (fetch all chat `serverTimestamp` records) → Code Node (sliding window analysis) → **IF Node** (guard: `hasHighlight === true`) → Postgres (INSERT into `StreamHighlight`) OR No-Op (skip if zero chat).

#### Highlight Detection Algorithm (Sliding Window)
The Code node uses a **sliding window** approach rather than fixed epoch-aligned buckets to avoid the bucket-boundary splitting problem:

```
For every message timestamp T[i]:
  Count how many messages fall within [T[i] - 15s, T[i] + 15s]
  Track the T[i] with the maximum count → this is the peak center
```

**Why sliding window over fixed buckets?**
Fixed 30-second buckets aligned to absolute time (`Math.floor(time / 30000) * 30000`) can split a real spike that straddles a boundary — e.g., 40 messages between `:15–:45` get split as 20 in one bucket and 20 in the next, so neither bucket looks like a peak. The sliding window centers on each message and checks its neighborhood, avoiding this artifact entirely.

**Relative offsets, not absolute timestamps:**
The output includes `startTimeOffset` and `endTimeOffset` in **seconds from stream start**, not absolute epoch values. This makes the highlights seekable in a future VOD player (e.g., "jump to 2m30s").

**Empty-chat guard:**
An IF node checks `hasHighlight === true` before the Postgres INSERT. Streams with zero chat messages return `hasHighlight: false` and the pipeline routes to a No-Op node, preventing garbage rows.

### 4. `daily-digest.json` — Daily Top Streams Report
- **Trigger:** Cron schedule (`0 5 * * *` — 5:00 AM daily).
- **Pipeline:** Cron → Postgres (top 10 ended streams by `peakViewerCount` from last 24h) → Aggregate → HTTP Request (simulate report delivery).

---

## 🛠️ How to Import and Setup

1. **Start n8n:**
   ```bash
   docker compose up -d   # or: docker run -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
   ```
   Navigate to `http://localhost:5678`.

2. **Register Postgres Credentials:**
   - Go to **Credentials** → **Add Credential** → **PostgreSQL**.
   - Enter your database connection details (Host, Database, User, Password, Port).
   - Name the credential **`Postgres Database Connection`** (must match exactly, or update the nodes after import).

3. **Import Workflows:**
   For each `.json` file:
   - Click **Workflows** → **New Workflow**.
   - In the dropdown menu, choose **Import from File** and upload the JSON.
   - Click **Save** and toggle **Active** in the top-right corner.

4. **Testing:**
   - **Stream Start:** Go live from the mobile app. The backend fires `stream-started` immediately.
   - **Milestone:** As viewers join and the count crosses thresholds (a test value of `3` is included), n8n receives the alert.
   - **Stream End:** Tap "End Broadcast" to fire `stream-ended`. n8n fetches chat logs, runs sliding window analysis, and persists the highlight to Postgres.
   - **Daily Digest:** Runs automatically at 5:00 AM, or manually trigger it from the n8n UI.

---

## 🔗 Backend Integration Points

| Backend Location | Webhook Fired | Payload |
|---|---|---|
| `streamService.ts` → `startStream()` | `stream-started` | `{ streamId, creatorId, title }` |
| `streamService.ts` → `endStream()` | `stream-ended` | `{ streamId, creatorId, peakViewers, durationSeconds, streamStartedAt }` |
| `chatHandlers.ts` → `room:join` | `viewer-milestone` | `{ streamId, creatorId, milestone, currentCount }` |
| `webhooks.ts` → `participant_joined` | `viewer-milestone` | `{ streamId, creatorId, milestone, currentCount }` |

All triggers use **fire-and-forget** semantics via `axios.post().catch()` — n8n failures never block stream operations.
