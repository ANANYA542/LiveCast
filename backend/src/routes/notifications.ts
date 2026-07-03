import { Router, Request, Response } from "express";
import { prisma } from "../config/db";

export const notificationsRouter = Router();

/**
 * GET /api/notifications
 * Fetches notifications for the logged-in user.
 * Seeds default mockup notifications if the database has none.
 */
notificationsRouter.get("/", async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    let notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });



    res.status(200).json(notifications);
  } catch (error: any) {
    console.error("[Get Notifications Error]:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});

/**
 * POST /api/notifications/read-all
 * Marks all notifications for this user as read.
 */
notificationsRouter.post("/read-all", async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
    res.status(200).json({ message: "All notifications marked as read." });
  } catch (error: any) {
    console.error("[Mark Read Notifications Error]:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});
