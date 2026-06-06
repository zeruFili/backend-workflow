import { Router } from "express";
import { ProjectController } from "../controllers/project.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";

const router = Router();
const ctrl = new ProjectController();

router.get("/", authenticate, (req, res, next) => ctrl.findAll(req as any, res).catch(next));
router.post("/", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => ctrl.create(req as any, res).catch(next));
router.get("/:id", authenticate, (req, res, next) => ctrl.findById(req as any, res).catch(next));
router.put("/:id", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => ctrl.update(req as any, res).catch(next));
router.delete("/:id", authenticate, authorize(UserRole.CEO), (req, res, next) => ctrl.delete(req as any, res).catch(next));
router.get("/:id/tasks", authenticate, (req, res, next) => ctrl.getTasks(req as any, res).catch(next));

export default router;
