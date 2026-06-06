import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { designerApplicationController } from "../controllers/designer-application.controller";

const router = Router();

router.get("/", authenticate, (req, res, next) => designerApplicationController.findAll(req, res, next));
router.post("/", authenticate, authorize(UserRole.DESIGNER), (req, res, next) => designerApplicationController.apply(req, res, next));
router.patch("/:id", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerApplicationController.review(req, res, next));

export default router;
