import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { userController } from "../controllers/user.controller";

const router = Router();

router.get("/", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER, UserRole.FINANCE), (req, res, next) => userController.findAll(req, res, next));
router.get("/:id", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER, UserRole.FINANCE), (req, res, next) => userController.findById(req, res, next));

router.use(authenticate, authorize(UserRole.CEO));

router.post("/", (req, res, next) => userController.create(req, res, next));
router.patch("/:id/status", (req, res, next) => userController.updateStatus(req, res, next));
router.patch("/:id", (req, res, next) => userController.update(req, res, next));
router.delete("/:id", (req, res, next) => userController.softDelete(req, res, next));

export default router;
