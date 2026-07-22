import { Request, Response, NextFunction } from "express";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;
const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes

interface AttemptRecord {
  timestamps: number[];
  lockedUntil: number | null;
}

const attempts = new Map<string, AttemptRecord>();

// Periodic cleanup of expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of attempts) {
    record.timestamps = record.timestamps.filter((t) => now - t < WINDOW_MS);
    if (record.lockedUntil !== null && now >= record.lockedUntil) {
      record.lockedUntil = null;
      record.timestamps = [];
    }
    if (record.timestamps.length === 0 && record.lockedUntil === null) {
      attempts.delete(ip);
    }
  }
}, 10 * 60 * 1000);

export const loginLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();

  let record = attempts.get(ip);

  if (!record) {
    record = { timestamps: [], lockedUntil: null };
    attempts.set(ip, record);
  }

  // Check if currently locked out
  if (record.lockedUntil !== null) {
    if (now < record.lockedUntil) {
      const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000);
      res.status(429).json({
        success: false,
        message: `Too many login attempts. Please try again in ${remainingMinutes} minute(s).`,
      });
      return;
    }
    // Lockout has expired — reset
    record.lockedUntil = null;
    record.timestamps = [];
  }

  // Filter attempts to current window
  record.timestamps = record.timestamps.filter((t) => now - t < WINDOW_MS);

  if (record.timestamps.length < MAX_ATTEMPTS) {
    record.timestamps.push(now);
    next();
    return;
  }

  // Exceeded limit — lock out
  record.lockedUntil = now + LOCKOUT_MS;
  res.status(429).json({
    success: false,
    message: "Too many login attempts. Please try again in 30 minutes.",
  });
};
