import { Router, Request, Response } from "express";
import { prisma } from "../config/db";

export const usersRouter = Router();

/**
 * POST /api/users/:id/follow - Follow a creator
 */
usersRouter.post("/:id/follow", async (req: Request, res: Response) => {
  const targetId = req.params.id;
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (user.id === targetId) {
    return res.status(400).json({ error: "You cannot follow yourself." });
  }

  try {
    const follow = await prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: user.id,
          followingId: targetId,
        },
      },
      update: {},
      create: {
        followerId: user.id,
        followingId: targetId,
      },
    });

    // Generate follower notification for the target creator
    await prisma.notification.create({
      data: {
        userId: targetId,
        type: "new_follower",
        title: `👋 ${user.displayName} started following you`,
        message: "Say hello and welcome them to your channel!",
        createdAt: new Date().toISOString(),
      },
    });

    res.status(200).json({ message: "Successfully followed creator.", follow });
  } catch (error: any) {
    console.error("[Follow Error]:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});

/**
 * DELETE /api/users/:id/follow - Unfollow a creator
 */
usersRouter.delete("/:id/follow", async (req: Request, res: Response) => {
  const targetId = req.params.id;
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await prisma.follow.delete({
      where: {
        followerId_followingId: {
          followerId: user.id,
          followingId: targetId,
        },
      },
    });

    res.status(200).json({ message: "Successfully unfollowed creator." });
  } catch (error: any) {
    console.error("[Unfollow Error]:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});

/**
 * GET /api/users/recommended - Get list of recommended creators with live status and follower counts
 */
usersRouter.get("/recommended", async (req: Request, res: Response) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Retrieve other users to recommend with enriched data
    const creators = await prisma.user.findMany({
      where: {
        id: { not: user.id },
      },
      take: 20,
      select: {
        id: true,
        displayName: true,
        // Check if the current user already follows each creator
        followers: {
          where: { followerId: user.id },
          select: { id: true },
        },
        // Count total followers this creator has
        _count: {
          select: { followers: true, streams: true }
        },
        // Check if they have a currently LIVE stream
        streams: {
          where: { status: "LIVE" },
          select: { id: true },
          take: 1,
        },
      },
    });

    // Format payload with enriched follower counts and live status
    const formatted = creators.map((creator) => ({
      id: creator.id,
      displayName: creator.displayName,
      isFollowing: creator.followers.length > 0,
      followerCount: creator._count.followers,
      streamCount: creator._count.streams,
      isLive: creator.streams.length > 0,
    }));

    res.status(200).json(formatted);
  } catch (error: any) {
    console.error("[Get Recommended Error]:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});

/**
 * GET /api/users/following - Get creators followed by the authenticated user
 */
usersRouter.get("/following", async (req: Request, res: Response) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const following = await prisma.follow.findMany({
      where: { followerId: user.id },
      include: {
        following: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    res.status(200).json(following.map((f) => f.following));
  } catch (error: any) {
    console.error("[Get Following Error]:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});

/**
 * GET /api/users/followers - Get profiles following the authenticated user
 */
usersRouter.get("/followers", async (req: Request, res: Response) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const followers = await prisma.follow.findMany({
      where: { followingId: user.id },
      include: {
        follower: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    res.status(200).json(followers.map((f) => f.follower));
  } catch (error: any) {
    console.error("[Get Followers Error]:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});
