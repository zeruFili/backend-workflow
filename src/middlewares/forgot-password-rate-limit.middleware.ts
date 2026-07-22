import { Request, Response, NextFunction } from "express";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes

interface AttemptRecord {
  timestamps: number[];
  lockedUntil: number | null;
}

const attempts = new Map<string, AttemptRecord>();

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

export const forgotPasswordLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();

  let record = attempts.get(ip);

  if (!record) {
    record = { timestamps: [], lockedUntil: null };
    attempts.set(ip, record);
  }

  if (record.lockedUntil !== null) {
    if (now < record.lockedUntil) {
      const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000);
      res.status(429).json({
        success: false,
        message: `Too many Forgot Password attempts. Please try again in ${remainingMinutes} minute(s).`,
      });
      return;
    }
    record.lockedUntil = null;
    record.timestamps = [];
  }

  record.timestamps = record.timestamps.filter((t) => now - t < WINDOW_MS);

  if (record.timestamps.length < MAX_ATTEMPTS) {
    record.timestamps.push(now);
    next();
    return;
  }

  record.lockedUntil = now + LOCKOUT_MS;
  res.status(429).json({
    success: false,
    message: "Too many Forgot Password attempts. Please try again in 30 minutes.",
  });
};
