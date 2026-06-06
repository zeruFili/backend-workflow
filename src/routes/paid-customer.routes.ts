import { Router } from "express";
import multer from "multer";
import { paidCustomerController } from "../controllers/paid-customer.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";

const router = Router();
const ctrl = paidCustomerController;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get(
  "/",
  authenticate,
  authorize(UserRole.CEO, UserRole.GENERAL_MANAGER, UserRole.MARKETING_LEAD, UserRole.FINANCE_OFFICER),
  (req, res, next) => ctrl.findAll(req as any, res, next)
);

router.post(
  "/",
  authenticate,
  authorize(UserRole.MARKETING_LEAD, UserRole.CEO),
  upload.array("proofFiles", 10),
  (req, res, next) => ctrl.transfer(req as any, res, next)
);

router.post(
  "/:id/verify",
  authenticate,
  authorize(UserRole.FINANCE_OFFICER, UserRole.CEO),
  (req, res, next) => ctrl.verify(req as any, res, next)
);

router.post(
  "/:id/clarify",
  authenticate,
  authorize(UserRole.MARKETING_LEAD, UserRole.CEO),
  upload.array("attachments", 10),
  (req, res, next) => ctrl.clarify(req as any, res, next)
);

router.get(
  "/:id/verification-history",
  authenticate,
  authorize(UserRole.FINANCE_OFFICER, UserRole.CEO, UserRole.GENERAL_MANAGER, UserRole.MARKETING_LEAD),
  (req, res, next) => ctrl.verificationHistory(req as any, res, next)
);

router.get(
  "/:id",
  authenticate,
  authorize(UserRole.CEO, UserRole.GENERAL_MANAGER, UserRole.MARKETING_LEAD, UserRole.FINANCE_OFFICER),
  (req, res, next) => ctrl.findById(req as any, res, next)
);

export default router;
