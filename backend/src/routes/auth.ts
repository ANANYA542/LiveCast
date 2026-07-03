import { Router, Request, Response } from "express";
import { prisma } from "../config/db";
import { hashPassword, verifyPassword } from "../utils/crypto";

export const authRouter = Router();

/**
 * POST /api/auth/register
 * Registers a new user with unique email and password hash.
 */
authRouter.post("/register", async (req: Request, res: Response) => {
  const { displayName, email, password } = req.body;

  if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
    return res.status(400).json({ error: "Display name is required." });
  }

  if (!email || typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ error: "Email is required." });
  }

  const cleanEmail = email.trim().toLowerCase();

  // Basic email regex format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  try {
    // Check if email already in use
    const existing = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    if (existing) {
      return res.status(409).json({ error: "This email is already registered." });
    }

    const passwordHash = hashPassword(password);

    const user = await prisma.user.create({
      data: {
        displayName: displayName.trim(),
        email: cleanEmail,
        passwordHash,
        createdAt: new Date().toISOString()
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        createdAt: true
      }
    });

    res.status(201).json({
      message: "Registration successful.",
      user
    });
  } catch (error: any) {
    console.error("[Register Error]:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});

/**
 * POST /api/auth/login
 * Validates credentials and returns user details.
 */
authRouter.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required." });
  }

  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "Password is required." });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const isValid = verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    res.status(200).json({
      message: "Login successful.",
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email
      }
    });
  } catch (error: any) {
    console.error("[Login Error]:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});
