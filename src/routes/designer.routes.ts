import { Router } from "express";
import { authenticate, authorize, requireExactRole } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { designerController } from "../controllers/designer.controller";
import { createUploadFileMiddleware } from "../utils/upload.utils";

const router = Router();

const taskUploadMiddleware = createUploadFileMiddleware({
  fieldName: "attachmentFiles",
  maxCount: 10,
  subfolder: "designer_tasks",
});

const submissionUploadMiddleware = createUploadFileMiddleware({
  fieldName: "attachmentFiles",
  maxCount: 10,
  subfolder: "designer_submissions",
});

router.get("/designer-tasks", authenticate, (req, res, next) => designerController.findAllTasks(req, res, next));
router.post(
  "/designer-tasks",
  authenticate,
  authorize(UserRole.CEO, UserRole.GENERAL_MANAGER),
  taskUploadMiddleware,
  (req, res, next) => designerController.createTask(req, res, next)
);
router.get("/designer-tasks/:id", authenticate, (req, res, next) => designerController.findTaskById(req, res, next));
router.patch("/designer-tasks/:id", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), taskUploadMiddleware, (req, res, next) => designerController.updateTask(req, res, next));
router.post("/designer-tasks/:id/assign", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerController.assignDesigner(req, res, next));
router.post(
  "/designer-tasks/:id/apply",
  authenticate,
  requireExactRole(UserRole.DESIGNER, "Only designers can apply for designer tasks"),
  (req, res, next) => designerController.apply(req, res, next)
);
router.get("/designer-tasks/:id/applications", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerController.listApplications(req, res, next));
router.get("/designer-tasks/:id/submissions", authenticate, (req, res, next) => designerController.getSubmissions(req, res, next));
router.post(
  "/designer-tasks/:id/submissions",
  authenticate,
  authorize(UserRole.DESIGNER),
  submissionUploadMiddleware,
  (req, res, next) => designerController.createSubmission(req, res, next)
);
router.patch(
  "/designer-tasks/submit/:id",
  authenticate,
  authorize(UserRole.DESIGNER, UserRole.CEO, UserRole.GENERAL_MANAGER),
  submissionUploadMiddleware,
  (req, res, next) => designerController.updateSubmission(req, res, next)
);
router.get("/designer-submissions/:id/reviews", authenticate, (req, res, next) => designerController.getSubmissionReviews(req, res, next));
router.post("/designer-submissions/:id/review", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerController.createSubmissionReview(req, res, next));
router.post("/designer-tasks/:id/review", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerController.createTaskReview(req, res, next));
router.post("/designer-tasks/:id/pause", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerController.pauseTask(req, res, next));
router.post("/designer-tasks/:id/resume", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerController.resumeTask(req, res, next));
router.delete("/designer-tasks/:id", authenticate, authorize(UserRole.CEO), (req, res, next) => designerController.removeTask(req, res, next));

export default router;
