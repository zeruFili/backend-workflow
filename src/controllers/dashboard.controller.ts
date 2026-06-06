import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { dashboardService } from "../services/dashboard.service";
import { AppError } from "../middlewares/error.middleware";

export class DashboardController {
  async getOverview(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await dashboardService.getOverview(req.user!);
      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("getOverview error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async getDesignerPerformance(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await dashboardService.getDesignerPerformance();
      res.json({ success: true, ...result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("getDesignerPerformance error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async getSiteEngineerDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await dashboardService.getSiteEngineerDashboard(req.user!);
      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("getSiteEngineerDashboard error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
}

export const dashboardController = new DashboardController();
