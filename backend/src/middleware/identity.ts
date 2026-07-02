import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Extend Request type to include user information
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        displayName: string;
      };
    }
  }
}

// In-memory cache to save verified user IDs, avoiding redundant database lookups
const verifiedUsers = new Set<string>();

export async function identityMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.header("X-User-Id");
  const displayName = req.header("X-Display-Name");

  // Bypass identity check for health check endpoint
  if (req.path === "/health") {
    return next();
  }

  if (!userId || !displayName) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing identity headers: X-User-Id and X-Display-Name are required.",
    });
  }

  // If user is already verified and cached in memory, bypass DB lookup
  if (verifiedUsers.has(userId)) {
    req.user = {
      id: userId,
      displayName,
    };
    return next();
  }

  try {
    // Find the user to ensure they registered/logged in and exist in the DB
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "User identity not found in database. Please register/login.",
      });
    }

    // Add to cache Set
    verifiedUsers.add(userId);

    // Attach user to Request context
    req.user = {
      id: user.id,
      displayName: user.displayName,
    };

    next();
  } catch (error: any) {
    console.error("[Identity Middleware Error]:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to verify or register identity.",
    });
  }
}
