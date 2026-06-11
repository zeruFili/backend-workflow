import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { quantitySurveyorController } from "../controllers/qs.controller";
import { createUploadFileMiddleware } from "../utils/upload.utils";

const router = Router();

const taskUploadMiddleware = createUploadFileMiddleware({
  fieldName: "attachmentFiles",
  maxCount: 10,
  subfolder: "qs_tasks",
});

const submissionUploadMiddleware = createUploadFileMiddleware({
  fieldName: "attachmentFiles",
  maxCount: 10,
  subfolder: "qs_submissions",
});

const evaluateUploadMiddleware = createUploadFileMiddleware({
  fieldName: "attachmentFiles",
  maxCount: 10,
  subfolder: "qs_evaluations",
});

router.get("/qs-tasks", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER, UserRole.QUANTITY_SURVEYOR), (req, res, next) => quantitySurveyorController.findAllTasks(req, res, next));
router.post(
  "/qs-tasks",
  authenticate,
  authorize(UserRole.CEO, UserRole.GENERAL_MANAGER),
  taskUploadMiddleware,
  (req, res, next) => quantitySurveyorController.createTask(req, res, next)
);
router.get("/qs-tasks/:id", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER, UserRole.QUANTITY_SURVEYOR), (req, res, next) => quantitySurveyorController.findTaskById(req, res, next));
router.patch(
  "/qs-tasks/:id",
  authenticate,
  authorize(UserRole.CEO, UserRole.GENERAL_MANAGER),
  taskUploadMiddleware,
  (req, res, next) => quantitySurveyorController.updateTask(req, res, next)
);
router.get("/qs-tasks/:id/submissions", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER, UserRole.QUANTITY_SURVEYOR), (req, res, next) => quantitySurveyorController.getSubmissions(req, res, next));
router.get("/qs-tasks/:id/submissions-with-reviews", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER, UserRole.QUANTITY_SURVEYOR), (req, res, next) => quantitySurveyorController.getSubmissionsWithReviews(req, res, next));
router.post(
  "/qs-tasks/:id/submissions",
  authenticate,
  authorize(UserRole.QUANTITY_SURVEYOR),
  submissionUploadMiddleware,
  (req, res, next) => quantitySurveyorController.createSubmission(req, res, next)
);
router.patch(
  "/qs-tasks/submit/:id",
  authenticate,
  authorize(UserRole.QUANTITY_SURVEYOR),
  submissionUploadMiddleware,
  (req, res, next) => quantitySurveyorController.updateSubmission(req, res, next)
);
router.post(
  "/qs-tasks/evaluate/:id",
  authenticate,
  authorize(UserRole.CEO, UserRole.GENERAL_MANAGER),
  evaluateUploadMiddleware,
  (req, res, next) => quantitySurveyorController.evaluate(req, res, next)
);
router.patch(
  "/qs-tasks/evaluate/:id",
  authenticate,
  authorize(UserRole.CEO, UserRole.GENERAL_MANAGER),
  evaluateUploadMiddleware,
  (req, res, next) => quantitySurveyorController.updateEvaluate(req, res, next)
);
router.post(
  "/qs-evaluations/:id/decide",
  authenticate,
  authorize(UserRole.CEO, UserRole.GENERAL_MANAGER),
  (req, res, next) => quantitySurveyorController.decide(req, res, next)
);
router.get("/qs-submissions/:id/reviews", authenticate, (req, res, next) => quantitySurveyorController.getReviews(req, res, next));
router.post("/qs-submissions/:id/review", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => quantitySurveyorController.createReview(req, res, next));
router.patch("/qs-reviews/:id", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => quantitySurveyorController.updateReview(req, res, next));

export default router;
