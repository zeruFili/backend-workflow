import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { dataCollectorController } from "../controllers/data-collector.controller";
import { createUploadFileMiddleware } from "../utils/upload.utils";

const router = Router();

const taskUploadMiddleware = createUploadFileMiddleware({
  fieldName: "attachmentFiles",
  maxCount: 10,
  subfolder: "dc_tasks",
});

const submissionUploadMiddleware = createUploadFileMiddleware({
  fieldName: "attachmentFiles",
  maxCount: 10,
  subfolder: "dc_submissions",
});

router.get("/data-collector-tasks", authenticate, (req, res, next) => dataCollectorController.findAllTasks(req, res, next));
router.post(
  "/data-collector-tasks",
  authenticate,
  authorize(UserRole.CEO, UserRole.GENERAL_MANAGER),
  taskUploadMiddleware,
  (req, res, next) => dataCollectorController.createTask(req, res, next)
);
router.get("/data-collector-tasks/:id", authenticate, (req, res, next) => dataCollectorController.findTaskById(req, res, next));
router.patch("/data-collector-tasks/:id", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), taskUploadMiddleware, (req, res, next) => dataCollectorController.updateTask(req, res, next));
router.get("/data-collector-tasks/:id/submissions", authenticate, (req, res, next) => dataCollectorController.getSubmissions(req, res, next));
router.post(
  "/data-collector-tasks/:id/submissions",
  authenticate,
  authorize(UserRole.DATA_COLLECTOR),
  submissionUploadMiddleware,
  (req, res, next) => dataCollectorController.createSubmission(req, res, next)
);
router.patch(
  "/data-collector-tasks/submit/:id",
  authenticate,
  authorize(UserRole.DATA_COLLECTOR, UserRole.CEO, UserRole.GENERAL_MANAGER),
  submissionUploadMiddleware,
  (req, res, next) => dataCollectorController.updateSubmission(req, res, next)
);
router.get("/data-collector-submissions/:id/reviews", authenticate, (req, res, next) => dataCollectorController.getReviews(req, res, next));
router.post("/data-collector-submissions/:id/review", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => dataCollectorController.createReview(req, res, next));

export default router;
