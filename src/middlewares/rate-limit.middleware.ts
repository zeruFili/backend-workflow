import rateLimit from "express-rate-limit";

export const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many reset attempts. Please wait a minute before trying again.",
  },
});
