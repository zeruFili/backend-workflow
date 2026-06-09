import { Router } from "express";
import { paidCustomerController } from "../controllers/paid-customer.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";

const router = Router();
const ctrl = paidCustomerController;

router.get(
  "/",
  authenticate,
  authorize(UserRole.CEO, UserRole.GENERAL_MANAGER, UserRole.MARKETING, UserRole.FINANCE),
  (req, res, next) => ctrl.findAll(req as any, res, next)
);

router.post(
  "/",
  authenticate,
  authorize(UserRole.MARKETING, UserRole.CEO),
  (req, res, next) => ctrl.create(req as any, res, next)
);

router.patch(
  "/:id",
  authenticate,
  authorize(UserRole.MARKETING, UserRole.CEO),
  (req, res, next) => ctrl.update(req as any, res, next)
);

router.post(
  "/:id/clarify",
  authenticate,
  authorize(UserRole.FINANCE, UserRole.CEO),
  (req, res, next) => ctrl.clarify(req as any, res, next)
);

router.patch(
  "/:id/clarify",
  authenticate,
  authorize(UserRole.MARKETING, UserRole.CEO),
  (req, res, next) => ctrl.updateClarify(req as any, res, next)
);

router.post(
  "/:id/verify",
  authenticate,
  authorize(UserRole.FINANCE, UserRole.CEO),
  (req, res, next) => ctrl.verify(req as any, res, next)
);

router.get(
  "/:id/verification-history",
  authenticate,
  authorize(UserRole.FINANCE, UserRole.CEO, UserRole.GENERAL_MANAGER, UserRole.MARKETING),
  (req, res, next) => ctrl.getVerificationHistory(req as any, res, next)
);

router.get(
  "/:id",
  authenticate,
  authorize(UserRole.CEO, UserRole.GENERAL_MANAGER, UserRole.MARKETING, UserRole.FINANCE),
  (req, res, next) => ctrl.findById(req as any, res, next)
);

export default router;
