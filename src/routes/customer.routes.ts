import { Router } from "express";
import { customerController } from "../controllers/customer.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { auditLog } from "../middlewares/audit.middleware";
import { UserRole } from "../enums/user-role.enum";

const router = Router();
const ctrl = customerController;

router.get(
  "/",
  authenticate,
  authorize(UserRole.MARKETING, UserRole.CEO),
  (req, res, next) => ctrl.findAll(req as any, res, next)
);

router.post(
  "/",
  authenticate,
  authorize(UserRole.MARKETING, UserRole.CEO),
  auditLog("customer_request_created", "customer_requests"),
  (req, res, next) => ctrl.create(req as any, res, next)
);

router.get(
  "/:id",
  authenticate,
  authorize(UserRole.MARKETING, UserRole.CEO),
  (req, res, next) => ctrl.findById(req as any, res, next)
);

router.patch(
  "/:id",
  authenticate,
  authorize(UserRole.MARKETING, UserRole.CEO),
  auditLog("customer_request_updated", "customer_requests"),
  (req, res, next) => ctrl.update(req as any, res, next)
);

router.delete(
  "/:id",
  authenticate,
  authorize(UserRole.MARKETING, UserRole.CEO),
  auditLog("customer_request_deleted", "customer_requests"),
  (req, res, next) => ctrl.delete(req as any, res, next)
);

export default router;
