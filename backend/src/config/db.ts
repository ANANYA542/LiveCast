import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

export const prisma = new PrismaClient();

// Connect to Redis using env URL
export const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
