import express from "express";
import type { Request, Response } from "express";
import { db } from "./db";
import { comparePasswords, createToken, hashPassword } from "./auth";
import { authMiddleware } from "./middleware/auth";
import type { UserRecord, LoginRequest, RegisterRequest } from "../shared/types";

const router = express.Router();

function userToRecord(user: any): UserRecord {
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

// Register
router.post("/register", async (req: Request<{}, {}, RegisterRequest>, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "Missing required fields: email, password, name" });
    }

    // Check if user already exists
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: "User already exists" });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await db.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        role: "DEVELOPER"
      }
    });

    // Create JWT token
    const token = createToken(user);

    return res.status(201).json({
      token,
      user: userToRecord(user)
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ error: "Failed to register user" });
  }
});

// Login
router.post("/login", async (req: Request<{}, {}, LoginRequest>, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    // Find user
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.enabled) {
      return res.status(401).json({ error: "User account is disabled" });
    }

    // Compare password
    const isValid = await comparePasswords(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Create JWT token
    const token = createToken(user);

    return res.json({
      token,
      user: userToRecord(user)
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Failed to login" });
  }
});

// Get current user
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

// Update user profile
router.patch("/me", authMiddleware, async (req: Request, res: Response) => {
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

// Change password
router.post("/change-password", authMiddleware, async (req: Request, res: Response) => {
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

    // Verify old password
    const isValid = await comparePasswords(oldPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update user
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
