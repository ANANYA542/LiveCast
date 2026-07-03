import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

export const prisma = new PrismaClient();

// In-Memory Redis Mock Fallback for local runs without a Redis server
class RedisMock {
  private store: Map<string, string> = new Map();
  private sets: Map<string, Set<string>> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: any, option?: string, expiry?: number): Promise<string> {
    this.store.set(key, String(value));
    return "OK";
  }

  async del(key: string): Promise<number> {
    let deleted = 0;
    if (this.store.delete(key)) deleted++;
    if (this.sets.delete(key)) deleted++;
    return deleted;
  }

  async sadd(key: string, member: string): Promise<number> {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    const set = this.sets.get(key)!;
    const sizeBefore = set.size;
    set.add(member);
    return set.size > sizeBefore ? 1 : 0;
  }

  async srem(key: string, member: string): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    const sizeBefore = set.size;
    set.delete(member);
    return set.size < sizeBefore ? 1 : 0;
  }

  async scard(key: string): Promise<number> {
    const set = this.sets.get(key);
    return set ? set.size : 0;
  }

  async incr(key: string): Promise<number> {
    const val = this.store.get(key);
    const num = val ? parseInt(val, 10) + 1 : 1;
    this.store.set(key, String(num));
    return num;
  }

  async expire(key: string, seconds: number): Promise<number> {
    return 1;
  }

  async ping(): Promise<string> {
    return "PONG";
  }
}

// Initialize Redis client, falling back to mock if no connection is active
let redisClient: any;

try {
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  
  // Set minimal connection retries so it falls back immediately if server is down
  const rawClient = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
    retryStrategy: () => null // Stop attempting reconnects
  });

  rawClient.on("error", (err) => {
    console.warn(`[Redis Connection Error]: ${err.message}. Falling back to In-Memory Redis Mock.`);
    // Dynamically re-assign helper functions to the mock client
    Object.assign(redis, new RedisMock());
  });

  redisClient = rawClient;
} catch (error: any) {
  console.warn(`[Redis Initialization Failed]: ${error.message}. Using In-Memory Redis Mock.`);
  redisClient = new RedisMock();
}

export const redis = redisClient;
