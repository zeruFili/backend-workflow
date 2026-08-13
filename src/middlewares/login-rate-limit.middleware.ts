import { Request, Response, NextFunction } from "express";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;
const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes

interface AttemptRecord {
  timestamps: number[];
  lockedUntil: number | null;
}

const attempts = new Map<string, AttemptRecord>();

function getIdentifier(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const email = req.body?.email ? String(req.body.email).toLowerCase() : "unknown";
  return `${ip}:${email}`;
}

function getRecord(identifier: string): AttemptRecord {
  let record = attempts.get(identifier);
  if (!record) {
    record = { timestamps: [], lockedUntil: null };
    attempts.set(identifier, record);
  }
  return record;
}

function filterWindow(record: AttemptRecord, now: number): void {
  record.timestamps = record.timestamps.filter((t) => now - t < WINDOW_MS);
  if (record.lockedUntil !== null && now >= record.lockedUntil) {
    record.lockedUntil = null;
    record.timestamps = [];
  }
}

// Periodic cleanup of expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [identifier, record] of attempts) {
    filterWindow(record, now);
    if (record.timestamps.length === 0 && record.lockedUntil === null) {
      attempts.delete(identifier);
    }
  }
}, 10 * 60 * 1000);

export const loginLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const identifier = getIdentifier(req);
  const now = Date.now();
  const record = getRecord(identifier);

  filterWindow(record, now);

  if (record.lockedUntil !== null && now < record.lockedUntil) {
    const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000);
    res.status(429).json({
      success: false,
      message: `Too many failed login attempts. Please try again in ${remainingMinutes} minute(s).`,
    });
    return;
  }

  next();
};

// Called only when a login attempt actually fails. Successful logins do not
// increment the counter, so they never contribute to a lockout.
export const recordLoginFailure = (req: Request): void => {
  const identifier = getIdentifier(req);
  const now = Date.now();
  const record = getRecord(identifier);

  filterWindow(record, now);

  record.timestamps.push(now);

  if (record.timestamps.length >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
  }
};
