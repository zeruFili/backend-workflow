import { Router } from "express";
import { qsController } from "../controllers/qs.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";

const router = Router();

router.get("/qs-review-tasks", authenticate, (req, res) => qsController.findAllReviewTasks(req, res));
router.post("/qs-review-tasks", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res) => qsController.createReviewTask(req, res));
router.patch("/qs-review-tasks/:id/status", authenticate, authorize(UserRole.QUANTITY_SURVEYOR), (req, res) => qsController.updateTaskStatus(req, res));
router.patch("/qs-review-tasks/:id/assign", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res) => qsController.assignTask(req, res));

router.get("/qs-evaluations", authenticate, (req, res) => qsController.findEvaluations(req, res));
router.post("/qs-evaluations", authenticate, authorize(UserRole.QUANTITY_SURVEYOR), (req, res) => qsController.createEvaluation(req, res));
router.put("/qs-evaluations/:id", authenticate, authorize(UserRole.QUANTITY_SURVEYOR), (req, res) => qsController.updateEvaluation(req, res));
router.post("/qs-evaluations/:id/decide", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res) => qsController.decide(req, res));

router.get("/qs-notifications", authenticate, (req, res) => qsController.getNotifications(req, res));
router.patch("/qs-notifications/read-all", authenticate, (req, res) => qsController.markNotificationsRead(req, res));

export default router;
