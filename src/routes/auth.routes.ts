import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { authController } from "../controllers/auth.controller";

const router = Router();

router.post("/login", (req, res) => authController.login(req, res));
router.post("/forgot-password", (req, res) => authController.forgotPassword(req, res));
router.post("/reset-password", authenticate, (req, res) => authController.resetPassword(req, res));
router.get("/me", authenticate, (req, res) => authController.getMe(req, res));

export default router;
