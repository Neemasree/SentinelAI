import type { NextFunction, Request, Response } from "express";

export function validateRegistration(req: Request, res: Response, next: NextFunction) {
  const { email, password, name } = req.body;
  
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }
  
  // Password validation
  if (!password || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  
  // Check for common weak passwords
  const weakPasswords = ["password", "12345678", "qwerty123", "admin123"];
  if (weakPasswords.includes(password.toLowerCase())) {
    return res.status(400).json({ error: "Password is too weak" });
  }
  
  // Name validation
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: "Name must be at least 2 characters" });
  }
  
  // Sanitize inputs
  req.body.email = email.toLowerCase().trim();
  req.body.name = name.trim().replace(/[<>]/g, "");
  
  next();
}

export function validateLogin(req: Request, res: Response, next: NextFunction) {
  const { email, password } = req.body;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }
  
  if (!password || password.length < 1) {
    return res.status(400).json({ error: "Password is required" });
  }
  
  req.body.email = email.toLowerCase().trim();
  
  next();
}

export function validateApiKeyCreation(req: Request, res: Response, next: NextFunction) {
  const { name, role } = req.body;
  
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: "API key name must be at least 2 characters" });
  }
  
  if (role && !["admin", "client"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }
  
  req.body.name = name.trim().replace(/[<>]/g, "");
  
  next();
}

export function validateSettingsUpdate(req: Request, res: Response, next: NextFunction) {
  const settings = req.body;
  
  // Validate numeric ranges
  const validations = [
    { field: "defaultLimit", min: 1, max: 10000 },
    { field: "forecastIntervalSeconds", min: 1, max: 300 },
    { field: "predictionHorizonSeconds", min: 1, max: 300 },
    { field: "adjustmentThreshold", min: 0.1, max: 1 },
    { field: "adjustmentRatio", min: 0.1, max: 1 },
    { field: "circuitFailureThreshold", min: 0.1, max: 1 },
    { field: "circuitCooldownSeconds", min: 1, max: 300 }
  ];
  
  for (const validation of validations) {
    if (settings[validation.field] !== undefined) {
      const value = Number(settings[validation.field]);
      if (isNaN(value) || value < validation.min || value > validation.max) {
        return res.status(400).json({ 
          error: `${validation.field} must be between ${validation.min} and ${validation.max}` 
        });
      }
    }
  }
  
  next();
}

export function sanitizeString(input: string): string {
  if (!input) return "";
  return input
    .replace(/[<>\"']/g, "")
    .trim()
    .substring(0, 1000); // Limit length
}

export function sanitizeNumber(input: any, defaultValue: number = 0): number {
  const num = Number(input);
  return isNaN(num) ? defaultValue : num;
}