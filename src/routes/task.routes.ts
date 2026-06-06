import { Router } from "express";
import { TaskController } from "../controllers/task.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";

const router = Router();
const ctrl = new TaskController();

router.get("/", authenticate, (req, res, next) => ctrl.findAll(req as any, res).catch(next));
router.post("/", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => ctrl.create(req as any, res).catch(next));
router.get("/:id", authenticate, (req, res, next) => ctrl.findById(req as any, res).catch(next));
router.put("/:id", authenticate, (req, res, next) => ctrl.update(req as any, res).catch(next));
router.patch("/:id/status", authenticate, (req, res, next) => ctrl.changeStatus(req as any, res).catch(next));
router.patch("/:id/description", authenticate, (req, res, next) => ctrl.changeDescription(req as any, res).catch(next));
router.post("/:id/attachments", authenticate, (req, res, next) => ctrl.uploadAttachment(req as any, res).catch(next));
router.get("/:id/approval", authenticate, (req, res, next) => ctrl.getApproval(req as any, res).catch(next));
router.post("/:id/approve", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => ctrl.approve(req as any, res).catch(next));
router.post("/:id/reject", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => ctrl.reject(req as any, res).catch(next));
router.post("/:id/feedbacks", authenticate, (req, res, next) => ctrl.addFeedback(req as any, res).catch(next));
router.get("/:id/submissions", authenticate, (req, res, next) => ctrl.getSubmissions(req as any, res).catch(next));
router.post("/:id/submissions", authenticate, (req, res, next) => ctrl.createSubmission(req as any, res).catch(next));
router.post("/:id/submissions/:submissionId/approve", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => ctrl.approveSubmission(req as any, res).catch(next));

router.patch("/feedbacks/:id", authenticate, (req, res, next) => ctrl.updateFeedback(req as any, res).catch(next));
router.delete("/feedbacks/:id", authenticate, (req, res, next) => ctrl.deleteFeedback(req as any, res).catch(next));

export default router;
