import { Router } from "express";
import { customerController } from "../controllers/customer.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";

const router = Router();
const ctrl = customerController;

router.get(
  "/",
  authenticate,
  authorize(UserRole.CEO),
  (req, res, next) => ctrl.findAllForCeo(req as any, res, next)
);

export default router;
