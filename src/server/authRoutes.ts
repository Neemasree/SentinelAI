import express from "express";
import type { Request, Response } from "express";
import { db } from "./db";
import { comparePasswords, createToken, hashPassword } from "./auth";
import { authMiddleware } from "./middleware/auth";
import { csrfMiddleware } from "./middleware/csrf";
import { validateRegistration, validateLogin } from "./middleware/validation";
import type { UserRecord, LoginRequest, RegisterRequest, UserRole } from "../shared/types";

const router = express.Router();

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

type PrismaUser = { id: string; email: string; name: string; role: UserRole; enabled: boolean; createdAt: Date; updatedAt: Date };

function userToRecord(user: PrismaUser): UserRecord {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    enabled: user.enabled,
    createdAt: user.createdAt.getTime(),
    updatedAt: user.updatedAt.getTime()
  };
}

router.post("/register", validateRegistration, async (req: Request<{}, {}, RegisterRequest>, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "Missing required fields: email, password, name" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: "User already exists" });
    }

    const hashedPassword = await hashPassword(password);
    const user = await db.user.create({
      data: { email, name, password: hashedPassword, role: "DEVELOPER" }
    });

    const token = createToken(user);
    return res.status(201).json({ token, user: userToRecord(user) });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ error: "Failed to register user" });
  }
});

router.post("/login", validateLogin, async (req: Request<{}, {}, LoginRequest>, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    const ip = req.ip ?? "unknown";
    if (!checkLoginRateLimit(ip)) {
      return res.status(429).json({ error: "Too many login attempts. Try again in a minute." });
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.enabled) {
      return res.status(401).json({ error: "User account is disabled" });
    }

    const isValid = await comparePasswords(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = createToken(user);
    return res.json({ token, user: userToRecord(user) });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Failed to login" });
  }
});

router.get("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await db.user.findUnique({ where: { id: req.user.userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(userToRecord(user));
  } catch (error) {
    console.error("Get user error:", error);
    return res.status(500).json({ error: "Failed to get user" });
  }
});

router.patch("/me", authMiddleware, csrfMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const user = await db.user.update({
      where: { id: req.user.userId },
      data: { name }
    });

    return res.json(userToRecord(user));
  } catch (error) {
    console.error("Update user error:", error);
    return res.status(500).json({ error: "Failed to update user" });
  }
});

router.post("/change-password", authMiddleware, csrfMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Missing oldPassword or newPassword" });
    }

    const user = await db.user.findUnique({ where: { id: req.user.userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isValid = await comparePasswords(oldPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const hashedPassword = await hashPassword(newPassword);
    await db.user.update({
      where: { id: req.user.userId },
      data: { password: hashedPassword }
    });

    return res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ error: "Failed to change password" });
  }
});

export default router;
