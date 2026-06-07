import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { quantitySurveyorController } from "../controllers/qs.controller";

const router = Router();

router.get("/qs-tasks", authenticate, (req, res, next) => quantitySurveyorController.findAllTasks(req, res, next));
router.post("/qs-tasks", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => quantitySurveyorController.createTask(req, res, next));
router.get("/qs-tasks/:id", authenticate, (req, res, next) => quantitySurveyorController.findTaskById(req, res, next));
router.patch("/qs-tasks/:id", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => quantitySurveyorController.updateTask(req, res, next));
router.get("/qs-tasks/:id/submissions", authenticate, (req, res, next) => quantitySurveyorController.getSubmissions(req, res, next));
router.post("/qs-tasks/:id/submissions", authenticate, authorize(UserRole.QUANTITY_SURVEYOR), (req, res, next) => quantitySurveyorController.createSubmission(req, res, next));
router.get("/qs-submissions/:id/reviews", authenticate, (req, res, next) => quantitySurveyorController.getReviews(req, res, next));
router.post("/qs-submissions/:id/review", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => quantitySurveyorController.createReview(req, res, next));

export default router;
