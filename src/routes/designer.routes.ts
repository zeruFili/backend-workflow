import { Router } from "express";
import { authenticate, authorize, requireExactRole } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { designerController } from "../controllers/designer.controller";

const router = Router();

router.get("/designer-tasks", authenticate, (req, res, next) => designerController.findAllTasks(req, res, next));
router.post("/designer-tasks", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerController.createTask(req, res, next));
router.get("/designer-tasks/:id", authenticate, (req, res, next) => designerController.findTaskById(req, res, next));
router.patch("/designer-tasks/:id", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerController.updateTask(req, res, next));
router.post("/designer-tasks/:id/assign", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerController.assignDesigner(req, res, next));
router.post(
	"/designer-tasks/:id/apply",
	authenticate,
	requireExactRole(UserRole.DESIGNER, "Only designers can apply for designer tasks"),
	(req, res, next) => designerController.apply(req, res, next)
);
router.get("/designer-tasks/:id/applications", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerController.listApplications(req, res, next));
router.patch("/designer-applications/:id", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerController.reviewApplication(req, res, next));
router.get("/designer-tasks/:id/submissions", authenticate, (req, res, next) => designerController.getSubmissions(req, res, next));
router.post("/designer-tasks/:id/submissions", authenticate, authorize(UserRole.DESIGNER), (req, res, next) => designerController.createSubmission(req, res, next));
router.get("/designer-submissions/:id/reviews", authenticate, (req, res, next) => designerController.getSubmissionReviews(req, res, next));
router.post("/designer-submissions/:id/review", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerController.createSubmissionReview(req, res, next));
router.post("/designer-tasks/:id/review", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerController.createTaskReview(req, res, next));
router.post("/designer-tasks/:id/pause", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerController.pauseTask(req, res, next));
router.post("/designer-tasks/:id/resume", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerController.resumeTask(req, res, next));
router.delete("/designer-tasks/:id", authenticate, authorize(UserRole.CEO), (req, res, next) => designerController.removeTask(req, res, next));

export default router;
