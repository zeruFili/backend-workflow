import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { notificationService } from "../services/notification.service";
import { AppError } from "../middlewares/error.middleware";

export class NotificationController {
  async getUserNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const userId = req.user!.id;

      const result = await notificationService.getUserNotifications(userId, page, limit);
      res.json(result);
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("getUserNotifications error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async getUnreadCount(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const result = await notificationService.getUnreadCount(userId);
      res.json({ success: true, ...result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("getUnreadCount error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async markRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      const notificationId = req.params.id as string;
      const userId = req.user!.id;
      const result = await notificationService.markRead(notificationId, userId);
      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("markRead error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async markAllRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const result = await notificationService.markAllRead(userId);
      res.json({ success: true, ...result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("markAllRead error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
}

export const notificationController = new NotificationController();
