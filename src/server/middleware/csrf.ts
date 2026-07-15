import type { NextFunction, Request, Response } from "express";
import crypto from "crypto";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Store CSRF tokens in memory (in production, use Redis)
const csrfTokens = new Map<string, { token: string; expiresAt: number }>();

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  
  // Check for X-Requested-With header (for AJAX requests)
  if (req.headers["x-requested-with"] === "XMLHttpRequest") {
    // For AJAX requests, also verify CSRF token
    const token = req.headers["x-csrf-token"] || req.body._csrf;
    const sessionId = req.headers["x-session-id"] || req.cookies?.sessionId;
    
    if (!token || !sessionId) {
      return res.status(403).json({ error: "CSRF token required for AJAX requests" });
    }
    
    const stored = csrfTokens.get(sessionId);
    if (!stored || stored.token !== token || stored.expiresAt < Date.now()) {
      return res.status(403).json({ error: "Invalid or expired CSRF token" });
    }
    
    return next();
  }
  
  // For non-AJAX requests, require proper CSRF token
  const token = req.body._csrf;
  const sessionId = req.cookies?.sessionId;
  
  if (!token || !sessionId) {
    return res.status(403).json({ error: "CSRF token required" });
  }
  
  const stored = csrfTokens.get(sessionId);
  if (!stored || stored.token !== token || stored.expiresAt < Date.now()) {
    return res.status(403).json({ error: "Invalid or expired CSRF token" });
  }
  
  next();
}

export function generateCsrfToken(sessionId: string): string {
  const token = generateToken();
  csrfTokens.set(sessionId, {
    token,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  });
  
  // Cleanup expired tokens
  for (const [key, value] of csrfTokens.entries()) {
    if (value.expiresAt < Date.now()) {
      csrfTokens.delete(key);
    }
  }
  
  return token;
}

export function validateCsrfToken(sessionId: string, token: string): boolean {
  const stored = csrfTokens.get(sessionId);
  if (!stored) return false;
  
  const isValid = stored.token === token && stored.expiresAt > Date.now();
  if (!isValid) {
    csrfTokens.delete(sessionId);
  }
  
  return isValid;
}
