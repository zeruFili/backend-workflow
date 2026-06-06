import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { designerRatingService } from "../services/designer-rating.service";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AppError } from "../middlewares/error.middleware";
import { CreateDesignerRatingDto, UpdateDesignerRatingDto } from "../validators/designer-rating.dto";

export class DesignerRatingController {
  async findAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const designerId = req.query.designerId as string | undefined;
      const status = req.query.status as string | undefined;
      const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
      const quarter = req.query.quarter ? parseInt(req.query.quarter as string, 10) : undefined;
      const month = req.query.month ? parseInt(req.query.month as string, 10) : undefined;
      const week = req.query.week ? parseInt(req.query.week as string, 10) : undefined;
      const sort = req.query.sort as string | undefined;

      const result = await designerRatingService.findAll({
        page,
        limit,
        designerId,
        status,
        year,
        quarter,
        month,
        week,
        sort,
        currentUser: req.user!,
      });

      res.json({ success: true, ...result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("findAll designer ratings error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(CreateDesignerRatingDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat().join(", ");
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      const result = await designerRatingService.create(req.body, req.user!);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("create designer rating error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(UpdateDesignerRatingDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat().join(", ");
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      const result = await designerRatingService.update(req.params.id as string, req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("update designer rating error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async getSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
      const designerId = req.query.designerId as string | undefined;
      const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
      const quarter = req.query.quarter ? parseInt(req.query.quarter as string, 10) : undefined;
      const month = req.query.month ? parseInt(req.query.month as string, 10) : undefined;
      const week = req.query.week ? parseInt(req.query.week as string, 10) : undefined;

      const result = await designerRatingService.getSummary({
        designerId,
        year,
        quarter,
        month,
        week,
        currentUser: req.user!,
      });

      res.json({ success: true, ...result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("getSummary error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async getLeaderboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
      const quarter = req.query.quarter ? parseInt(req.query.quarter as string, 10) : undefined;
      const month = req.query.month ? parseInt(req.query.month as string, 10) : undefined;
      const week = req.query.week ? parseInt(req.query.week as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      const result = await designerRatingService.getLeaderboard({
        year,
        quarter,
        month,
        week,
        limit,
      });

      res.json({ success: true, ...result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("getLeaderboard error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
}

export const designerRatingController = new DesignerRatingController();
