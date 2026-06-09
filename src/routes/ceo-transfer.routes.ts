import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { ceoTransferController } from "../controllers/ceo-transfer.controller";

const router = Router();

router.get(
  "/ceo-transfers",
  authenticate,
  authorize(UserRole.CEO, UserRole.FINANCE),
  (req, res, next) => ceoTransferController.findAll(req, res, next)
);

router.post(
  "/ceo-transfers",
  authenticate,
  authorize(UserRole.FINANCE, UserRole.CEO),
  (req, res, next) => ceoTransferController.create(req, res, next)
);

router.get(
  "/ceo-transfers/:id",
  authenticate,
  authorize(UserRole.CEO, UserRole.FINANCE),
  (req, res, next) => ceoTransferController.findById(req, res, next)
);

router.patch(
  "/ceo-transfers/:id",
  authenticate,
  authorize(UserRole.FINANCE, UserRole.CEO),
  (req, res, next) => ceoTransferController.update(req, res, next)
);

export default router;
