import { AppStorage, StorageKeys } from "./storage";

export interface OutboxMessage {
  streamId: string;
  content: string;
  clientMessageId: string;
  clientTimestamp: string;
}

export const OutboxService = {
  /**
   * Retrieves all queued messages saved in MMKV offline storage.
   */
  getQueue: (): OutboxMessage[] => {
    const raw = AppStorage.getString(StorageKeys.OUTBOX);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  /**
   * Appends a new message to the local offline outbox.
   */
  enqueue: (msg: OutboxMessage): void => {
    const queue = OutboxService.getQueue();
    queue.push(msg);
    AppStorage.setString(StorageKeys.OUTBOX, JSON.stringify(queue));
    console.log(`[OutboxService]: Message ${msg.clientMessageId} enqueued. Queue length: ${queue.length}`);
  },

  /**
   * Removes sent messages from the local outbox.
   * Compares by unique clientMessageId to prevent deleting messages queued while the sync request was in-flight.
   */
  dequeue: (sentIds: string[]): void => {
    const queue = OutboxService.getQueue();
    const filtered = queue.filter((m) => !sentIds.includes(m.clientMessageId));
    AppStorage.setString(StorageKeys.OUTBOX, JSON.stringify(filtered));
    console.log(`[OutboxService]: Cleared ${sentIds.length} confirmed messages. Remaining: ${filtered.length}`);
  },

  /**
   * Purges the entire outbox.
   */
  clearQueue: (): void => {
    AppStorage.delete(StorageKeys.OUTBOX);
  },
};
