import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { notificationService } from "../services/notification.service";
import { AppError } from "../middlewares/error.middleware";

export class NotificationController {
  async getUserNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const isReadParam = req.query.isRead as string | undefined;
      const isRead = isReadParam === "true" ? true : isReadParam === "false" ? false : undefined;
      const type = req.query.type as string | undefined;
      const entityType = req.query.entityType as string | undefined;
      const sort = req.query.sort as string | undefined;

      const result = await notificationService.getUserNotifications({
        page,
        limit,
        isRead,
        type,
        entityType,
        sort,
        currentUser: req.user!,
      });

      res.json({ success: true, ...result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("getUserNotifications error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async markRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await notificationService.markRead(req.params.id as string, req.user!);
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
      const types = req.body.types as string[] | undefined;

      const result = await notificationService.markAllRead({
        types,
        currentUser: req.user!,
      });

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

  async getUnreadCount(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await notificationService.getUnreadCount({
        currentUser: req.user!,
      });

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
}

export const notificationController = new NotificationController();
