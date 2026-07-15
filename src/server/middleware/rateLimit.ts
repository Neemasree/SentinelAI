import type { NextFunction, Request, Response } from "express";

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

export function rateLimitMiddleware(
  windowMs: number = 15 * 60 * 1000, // 15 minutes
  maxRequests: number = 100,
  keyGenerator: (req: Request) => string = (req) => req.ip || "unknown"
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();
    
    if (!store[key] || store[key].resetTime < now) {
      store[key] = { count: 1, resetTime: now + windowMs };
    } else {
      store[key].count++;
    }
    
    const remaining = Math.max(0, maxRequests - store[key].count);
    const reset = Math.ceil((store[key].resetTime - now) / 1000);
    
    res.setHeader("X-RateLimit-Limit", maxRequests.toString());
    res.setHeader("X-RateLimit-Remaining", remaining.toString());
    res.setHeader("X-RateLimit-Reset", reset.toString());
    
    if (store[key].count > maxRequests) {
      return res.status(429).json({
        error: "Too many requests",
        retryAfter: reset
      });
    }
    
    next();
  };
}

// Special rate limiter for authentication endpoints
export function authRateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const key = `auth:${req.ip || "unknown"}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequests = 10; // Lower limit for auth endpoints
  
  if (!store[key] || store[key].resetTime < now) {
    store[key] = { count: 1, resetTime: now + windowMs };
  } else {
    store[key].count++;
  }
  
  const remaining = Math.max(0, maxRequests - store[key].count);
  const reset = Math.ceil((store[key].resetTime - now) / 1000);
  
  res.setHeader("X-RateLimit-Limit", maxRequests.toString());
  res.setHeader("X-RateLimit-Remaining", remaining.toString());
  res.setHeader("X-RateLimit-Reset", reset.toString());
  
  if (store[key].count > maxRequests) {
    return res.status(429).json({
      error: "Too many authentication attempts",
      retryAfter: reset
    });
  }
  
  next();
}