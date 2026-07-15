import express from "express";
import type { Request, Response } from "express";
import { db } from "./db";
import { authMiddleware } from "./middleware/auth";
import { csrfMiddleware } from "./middleware/csrf";
import { validateApiKeyCreation } from "./middleware/validation";
import type { ApiKeyRecord } from "../shared/types";
import crypto from "crypto";

const router = express.Router();

// Generate a random API key
function generateApiKey(): string {
  return `sk_${crypto.randomBytes(24).toString("hex")}`;
}

function maskKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 8)}...${key.slice(-4)}` : key;
}

type PrismaApiKey = { id: string; name: string; key: string; enabled: boolean; createdAt: Date; lastUsedAt?: Date | null; usageCount: number; currentLimit: number; remainingTokens: number };

function keyToRecord(key: PrismaApiKey, showFull = false): ApiKeyRecord {
  return {
    id: key.id,
    name: key.name,
    key: showFull ? key.key : maskKey(key.key),
    role: "client",
    enabled: key.enabled,
    createdAt: key.createdAt.getTime(),
    lastUsedAt: key.lastUsedAt?.getTime(),
    usageCount: key.usageCount,
    currentLimit: key.currentLimit,
    remainingTokens: key.remainingTokens
  };
}

// List API keys for current user
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const keys = await db.apiKey.findMany({
      where: { userId: req.user.userId }
    });

    return res.json(keys.map((k) => keyToRecord(k)));
  } catch (error) {
    console.error("List API keys error:", error);
    return res.status(500).json({ error: "Failed to list API keys" });
  }
});

// Create API key
router.post("/", authMiddleware, csrfMiddleware, validateApiKeyCreation, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const key = await db.apiKey.create({
      data: {
        userId: req.user.userId,
        name,
        key: generateApiKey()
      }
    });

    return res.status(201).json(keyToRecord(key, true));
  } catch (error) {
    console.error("Create API key error:", error);
    return res.status(500).json({ error: "Failed to create API key" });
  }
});

// Get API key details
router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const key = await db.apiKey.findUnique({
      where: { id: String(req.params.id) }
    });

    if (!key) {
      return res.status(404).json({ error: "API key not found" });
    }

    // Verify ownership
    if (key.userId !== req.user.userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    return res.json(keyToRecord(key));
  } catch (error) {
    console.error("Get API key error:", error);
    return res.status(500).json({ error: "Failed to get API key" });
  }
});

// Update API key
router.patch("/:id", authMiddleware, csrfMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const key = await db.apiKey.findUnique({
      where: { id: String(req.params.id) }
    });

    if (!key) {
      return res.status(404).json({ error: "API key not found" });
    }

    // Verify ownership
    if (key.userId !== req.user.userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { name, enabled, currentLimit } = req.body;

    if (currentLimit !== undefined && (typeof currentLimit !== "number" || currentLimit < 1 || currentLimit > 10000)) {
      return res.status(400).json({ error: "currentLimit must be a number between 1 and 10000" });
    }

    const updated = await db.apiKey.update({
      where: { id: String(req.params.id) },
      data: {
        ...(name && { name }),
        ...(enabled !== undefined && { enabled }),
        ...(currentLimit && { currentLimit })
      }
    });

    return res.json(keyToRecord(updated));
  } catch (error) {
    console.error("Update API key error:", error);
    return res.status(500).json({ error: "Failed to update API key" });
  }
});

// Delete API key
router.delete("/:id", authMiddleware, csrfMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const key = await db.apiKey.findUnique({
      where: { id: String(req.params.id) }
    });

    if (!key) {
      return res.status(404).json({ error: "API key not found" });
    }

    // Verify ownership
    if (key.userId !== req.user.userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    await db.apiKey.delete({
      where: { id: String(req.params.id) }
    });

    return res.status(204).end();
  } catch (error) {
    console.error("Delete API key error:", error);
    return res.status(500).json({ error: "Failed to delete API key" });
  }
});

export default router;
