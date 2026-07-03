import { Router, Request, Response } from "express";
import { prisma } from "../config/db";

export const automationsRouter = Router();

/**
 * GET /api/automations
 * Returns connection parameters, active statistics, and workflow entries.
 * Seeds initial workflows if database has none.
 */
automationsRouter.get("/", async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    let workflows = await prisma.automationWorkflow.findMany();

    // If database is unseeded, populate default n8n workflow entries matching mockup screenshots
    if (workflows.length === 0) {
      const seedWorkflows = [
        {
          name: "Stream Started — Social Blast",
          description: "Auto-post to Twitter & Instagram when you go live.",
          type: "Webhook",
          status: "ACTIVE",
          lastRun: "2 min ago",
          runsToday: 3,
        },
        {
          name: "New Follower Welcome Flow",
          description: "Send a personalised DM and add them to mail list.",
          type: "Event",
          status: "ACTIVE",
          lastRun: "8 min ago",
          runsToday: 24,
        },
        {
          name: "Viewer Milestone Celebration",
          description: "Push overlay & notification when viewers hit milestone.",
          type: "Condition",
          status: "ACTIVE",
          lastRun: "1h ago",
          runsToday: 7,
        },
        {
          name: "Stream Ended — AI Pipeline",
          description: "Trigger highlights generation, summary email, and post VOD.",
          type: "Webhook",
          status: "ACTIVE",
          lastRun: "3h ago",
          runsToday: 2,
        },
        {
          name: "Live Chat Moderation",
          description: "Keyword filtering, spam detection, and auto-muting.",
          type: "Event",
          status: "ACTIVE",
          lastRun: "Just now",
          runsToday: 89,
        },
        {
          name: "Pre-Stream Reminder Broadcast",
          description: "Send push notifications & emails to followers 30m before.",
          type: "Schedule",
          status: "ACTIVE",
          lastRun: "12h ago",
          runsToday: 0,
        },
        {
          name: "Weekly Creator Digest",
          description: "Summarize weekly streaming statistics and metrics.",
          type: "Schedule",
          status: "ACTIVE",
          lastRun: "2d ago",
          runsToday: 1,
        },
        {
          name: "User Feedback Survey",
          description: "Collect stream rating feedback from viewers.",
          type: "Webhook",
          status: "PAUSED",
          lastRun: "3d ago",
          runsToday: 0,
        },
        {
          name: "Error Notification Alert",
          description: "Trigger slack alert on API failure or stream crash.",
          type: "Event",
          status: "FAILED",
          lastRun: "5 min ago",
          runsToday: 1,
        },
      ];

      await prisma.automationWorkflow.createMany({ data: seedWorkflows });
      workflows = await prisma.automationWorkflow.findMany();
    }

    // Calculate dynamic stats
    const activeCount = workflows.filter((w) => w.status === "ACTIVE").length;
    const errorCount = workflows.filter((w) => w.status === "FAILED").length;
    const runsTodaySum = workflows.reduce((sum, w) => sum + w.runsToday, 0);

    res.status(200).json({
      connection: {
        service: "n8n Cloud",
        host: "livecast.app.n8n.cloud",
        version: "v1.41.3",
        status: "Live",
      },
      stats: {
        activeWorkflows: activeCount,
        totalWorkflows: workflows.length,
        runsToday: runsTodaySum,
        errors: errorCount,
      },
      workflows,
    });
  } catch (error: any) {
    console.error("[Get Automations Error]:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});

/**
 * POST /api/automations/:id/toggle
 * Toggles a workflow status between ACTIVE and PAUSED.
 */
automationsRouter.post("/:id/toggle", async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const workflow = await prisma.automationWorkflow.findUnique({ where: { id } });
    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found." });
    }

    const nextStatus = workflow.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    const updated = await prisma.automationWorkflow.update({
      where: { id },
      data: { status: nextStatus },
    });

    res.status(200).json(updated);
  } catch (error: any) {
    console.error("[Toggle Automation Error]:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});
