import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import type { User } from "@prisma/client";
import { securityConfig } from "./securityConfig";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
if (JWT_SECRET.length < securityConfig.jwt.minSecretLength) {
  throw new Error(`JWT_SECRET must be at least ${securityConfig.jwt.minSecretLength} characters long`);
}
const JWT_SECRET_VALUE = JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || securityConfig.jwt.expiresIn;

export type JWTPayload = {
  userId: string;
  email: string;
  role: string;
};

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcryptjs.genSalt(10);
  return bcryptjs.hash(password, salt);
}

export async function comparePasswords(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

export function createToken(user: User): string {
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role
  };

  // Casts used to satisfy type differences between jwt types and our runtime values
  return jwt.sign(payload, JWT_SECRET_VALUE, { 
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    algorithm: securityConfig.jwt.algorithm,
    issuer: securityConfig.jwt.issuer
  });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET_VALUE) as JWTPayload;
  } catch {
    return null;
  }
}

export function decodeToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.decode(token);
    return decoded && typeof decoded === "object" ? (decoded as JWTPayload) : null;
  } catch {
    return null;
  }
}
