import { Router } from "express";
import { designerRatingController } from "../controllers/designer-rating.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";

const router = Router();

router.get("/designer-ratings", authenticate, (req, res) => designerRatingController.findAll(req, res));
router.post("/designer-ratings", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res) => designerRatingController.create(req, res));
router.patch("/designer-ratings/:id", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res) => designerRatingController.update(req, res));
router.get("/designer-ratings/summary", authenticate, (req, res) => designerRatingController.getSummary(req, res));
router.get("/designer-ratings/leaderboard", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res) => designerRatingController.getLeaderboard(req, res));

export default router;
