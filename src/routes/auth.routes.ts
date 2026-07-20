import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { authController } from "../controllers/auth.controller";
import { forgotPasswordLimiter, resetPasswordLimiter, loginLimiter } from "../middlewares/rate-limit.middleware";

const router = Router();

router.post("/login", loginLimiter, (req, res) => authController.login(req, res));
router.post("/forgot-password", forgotPasswordLimiter, (req, res) => authController.forgotPassword(req, res));
router.post("/reset-password/:token", resetPasswordLimiter, (req, res) => authController.resetPassword(req, res));
router.get("/me", authenticate, (req, res) => authController.getMe(req, res));

export default router;
