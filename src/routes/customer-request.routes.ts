import { Router } from "express";
import { customerRequestController } from "../controllers/customer-request.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";

const router = Router();
const ctrl = customerRequestController;

router.get("/", authenticate, authorize(UserRole.MARKETING_LEAD, UserRole.CEO), (req, res, next) => ctrl.findAll(req as any, res, next));
router.post("/", authenticate, authorize(UserRole.MARKETING_LEAD, UserRole.CEO), (req, res, next) => ctrl.create(req as any, res, next));
router.patch("/:id", authenticate, authorize(UserRole.MARKETING_LEAD, UserRole.CEO), (req, res, next) => ctrl.update(req as any, res, next));
router.delete("/:id", authenticate, authorize(UserRole.MARKETING_LEAD, UserRole.CEO), (req, res, next) => ctrl.delete(req as any, res, next));

export default router;
