import axios from "axios";

// Centralized n8n webhook trigger URL, checking both possible environment keys
const N8N_BASE = process.env.N8N_WEBHOOK_BASE_URL || process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook";

export const n8nTriggers = {
  /**
   * Fires webhook when creator goes LIVE
   */
  streamStarted: (data: { streamId: string; creatorId: string; title: string }) => {
    axios.post(`${N8N_BASE}/stream-started`, data, { timeout: 4000 })
      .catch((err) => {
        console.error(`[n8n] Trigger stream-started failed: ${err.message}`);
      });
  },

  /**
   * Fires webhook when stream is ENDED with final stats
   */
  streamEnded: (data: { streamId: string; creatorId: string; peakViewers: number; durationSeconds: number; streamStartedAt: string }) => {
    axios.post(`${N8N_BASE}/stream-ended`, data, { timeout: 4000 })
      .catch((err) => {
        console.error(`[n8n] Trigger stream-ended failed: ${err.message}`);
      });
  },

  /**
   * Fires webhook when viewer count crosses specific thresholds
   */
  viewerMilestone: (data: { streamId: string; creatorId: string; milestone: number; currentCount: number }) => {
    axios.post(`${N8N_BASE}/viewer-milestone`, data, { timeout: 4000 })
      .catch((err) => {
        console.error(`[n8n] Trigger viewer-milestone failed: ${err.message}`);
      });
  }
};
