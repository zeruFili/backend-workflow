import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { marketingController } from "../controllers/marketing.controller";
import { createUploadFileMiddleware } from "../utils/upload.utils";

const router = Router();

const taskUploadMiddleware = createUploadFileMiddleware({
  fieldName: "attachmentFiles",
  maxCount: 10,
  subfolder: "marketing_tasks",
});

const submissionUploadMiddleware = createUploadFileMiddleware({
  fieldName: "attachmentFiles",
  maxCount: 10,
  subfolder: "marketing_submissions",
});

router.get(
  "/marketing-tasks",
  authenticate,
  authorize(UserRole.CEO, UserRole.FINANCE, UserRole.MARKETING, UserRole.GENERAL_MANAGER),
  (req, res, next) => marketingController.findAllTasks(req as any, res, next)
);

router.post(
  "/marketing-tasks",
  authenticate,
  authorize(UserRole.CEO, UserRole.MARKETING),
  taskUploadMiddleware,
  (req, res, next) => marketingController.createTask(req as any, res, next)
);

router.get(
  "/marketing-tasks/:id",
  authenticate,
  authorize(UserRole.CEO, UserRole.FINANCE, UserRole.MARKETING, UserRole.GENERAL_MANAGER),
  (req, res, next) => marketingController.findTaskById(req as any, res, next)
);

router.patch(
  "/marketing-tasks/:id",
  authenticate,
  authorize(UserRole.CEO, UserRole.MARKETING),
  taskUploadMiddleware,
  (req, res, next) => marketingController.updateTask(req as any, res, next)
);

router.delete(
  "/marketing-tasks/:id",
  authenticate,
  authorize(UserRole.CEO, UserRole.MARKETING),
  (req, res, next) => marketingController.removeTask(req as any, res, next)
);

router.get(
  "/marketing-tasks/:id/submissions",
  authenticate,
  authorize(UserRole.CEO, UserRole.FINANCE, UserRole.MARKETING, UserRole.GENERAL_MANAGER),
  (req, res, next) => marketingController.getSubmissions(req as any, res, next)
);

router.post(
  "/marketing-tasks/:id/submissions",
  authenticate,
  authorize(UserRole.MARKETING, UserRole.CEO),
  submissionUploadMiddleware,
  (req, res, next) => marketingController.createSubmission(req as any, res, next)
);

router.patch(
  "/marketing-tasks/submit/:id",
  authenticate,
  authorize(UserRole.MARKETING, UserRole.CEO),
  submissionUploadMiddleware,
  (req, res, next) => marketingController.updateSubmission(req as any, res, next)
);

router.get(
  "/marketing-submissions/:id/reviews",
  authenticate,
  authorize(UserRole.CEO, UserRole.FINANCE, UserRole.MARKETING, UserRole.GENERAL_MANAGER),
  (req, res, next) => marketingController.getReviews(req as any, res, next)
);

router.post(
  "/marketing-submissions/:id/review",
  authenticate,
  authorize(UserRole.CEO, UserRole.FINANCE),
  (req, res, next) => marketingController.createReview(req as any, res, next)
);

router.patch(
  "/marketing-reviews/:id",
  authenticate,
  authorize(UserRole.CEO, UserRole.FINANCE),
  (req, res, next) => marketingController.updateReview(req as any, res, next)
);

export default router;
