import { Router } from "express";
import { paidCustomerController } from "../controllers/paid-customer.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";

const router = Router();
const ctrl = paidCustomerController;

router.post(
  "/:id/reviews",
  authenticate,
  authorize(UserRole.FINANCE, UserRole.CEO),
  (req, res, next) => ctrl.reviewBySubmissionId(req as any, res, next)
);

router.get(
  "/:id/reviews",
  authenticate,
  (req, res, next) => ctrl.getSubmissionReviews(req as any, res, next)
);

export default router;
