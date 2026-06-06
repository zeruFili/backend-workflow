import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { authController } from "../controllers/auth.controller";

const router = Router();

// POST /login - public
router.post("/login", (req, res) => authController.login(req, res));

// POST /refresh - public
router.post("/refresh", (req, res) => authController.refresh(req, res));

// POST /logout - authenticated
router.post("/logout", authenticate, (req, res) => authController.logout(req, res));

// POST /forgot-password - public
router.post("/forgot-password", (req, res) => authController.forgotPassword(req, res));

// POST /reset-password - public
router.post("/reset-password", (req, res) => authController.resetPassword(req, res));

// GET /me - authenticated
router.get("/me", authenticate, (req, res) => authController.getMe(req, res));

export default router;
