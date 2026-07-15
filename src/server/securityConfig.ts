// Security configuration for SentinelAI Gateway

export const securityConfig = {
  // JWT configuration
  jwt: {
    minSecretLength: 32,
    algorithm: "HS256" as const,
    expiresIn: "7d",
    issuer: "sentinelai-gateway"
  },
  
  // Password policy
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: false,
    maxAgeDays: 90,
    historySize: 5
  },
  
  // Rate limiting
  rateLimiting: {
    general: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100
    },
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 10
    },
    api: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 60
    }
  },
  
  // CORS configuration
  cors: {
    // Parse comma-separated origins and trim whitespace.
    // In dev, fall back to localhost:5173 if env var is missing.
    allowedOrigins: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean)
      : ["http://127.0.0.1:5173", "http://localhost:5173"],
    allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // Must include all headers the browser may send during preflight.
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-CSRF-Token"],
    exposedHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    maxAge: 86400, // 24 hours
    credentials: true
  },
  
  // CSRF configuration
  csrf: {
    tokenLength: 32,
    cookieName: "csrfToken",
    headerName: "X-CSRF-Token",
    expiresIn: 24 * 60 * 60 * 1000 // 24 hours
  },
  
  // Session security
  session: {
    cookieName: "sessionId",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  },
  
  // Input validation
  validation: {
    maxStringLength: 1000,
    maxArraySize: 100,
    maxNumberValue: 1000000,
    minNumberValue: -1000000
  },
  
  // Logging security
  logging: {
    redactFields: ["password", "token", "authorization", "apiKey", "secret", "key"],
    maxLogSize: 10000,
    logLevel: process.env.NODE_ENV === "production" ? "warn" : "info"
  },
  
  // HTTP security headers
  headers: {
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: false
    },
    csp: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", "ws://127.0.0.1:4000"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  }
};

// Security utility functions
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function shouldEnforceStrictSecurity(): boolean {
  return isProduction() || process.env.FORCE_SECURITY === "true";
}

export function getRequiredEnvVars(): string[] {
  return [
    "JWT_SECRET",
    "DATABASE_URL",
    "NODE_ENV"
  ];
}

export function validateEnvironment(): string[] {
  const missing: string[] = [];
  const required = getRequiredEnvVars();
  
  for (const envVar of required) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }
  
  return missing;
}