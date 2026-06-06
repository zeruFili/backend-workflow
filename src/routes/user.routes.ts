import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { userController } from "../controllers/user.controller";

const router = Router();

router.use(authenticate, authorize(UserRole.CEO));

router.get("/", (req, res, next) => userController.findAll(req, res, next));
router.post("/", (req, res, next) => userController.create(req, res, next));
router.get("/:id", (req, res, next) => userController.findById(req, res, next));
router.patch("/:id", (req, res, next) => userController.update(req, res, next));
router.delete("/:id", (req, res, next) => userController.softDelete(req, res, next));

export default router;
