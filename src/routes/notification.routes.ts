import { Router } from "express";
import { notificationController } from "../controllers/notification.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/notifications", (req, res) => notificationController.getUserNotifications(req, res));
router.patch("/notifications/:id/read", (req, res) => notificationController.markRead(req, res));
router.patch("/notifications/read-all", (req, res) => notificationController.markAllRead(req, res));
router.get("/notifications/unread-count", (req, res) => notificationController.getUnreadCount(req, res));

export default router;
