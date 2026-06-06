import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { qsService } from "../services/qs.service";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AppError } from "../middlewares/error.middleware";
import {
  CreateQsReviewTaskDto,
  UpdateQsReviewTaskStatusDto,
  AssignQsTaskDto,
  CreateQsEvaluationDto,
  UpdateQsEvaluationDto,
  DecideQsEvaluationDto,
} from "../validators/qs.dto";

export class QsController {
  async findAllReviewTasks(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const { status, assignedTo, search, sort } = req.query as Record<string, string | undefined>;

      const result = await qsService.findAllReviewTasks({
        page,
        limit,
        status,
        assignedTo,
        search,
        sort,
        currentUser: req.user!,
      });

      res.json({ success: true, ...result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("findAllReviewTasks error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async createReviewTask(req: AuthRequest, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(CreateQsReviewTaskDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat().join(", ");
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      const result = await qsService.createReviewTask(req.body, req.user!.id);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("createReviewTask error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async updateTaskStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(UpdateQsReviewTaskStatusDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat().join(", ");
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      const result = await qsService.updateTaskStatus(req.params.id as string, dto.status, req.user!);
      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("updateTaskStatus error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async assignTask(req: AuthRequest, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(AssignQsTaskDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat().join(", ");
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      const result = await qsService.assignTask(req.params.id as string, dto.assigned_to);
      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("assignTask error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async findEvaluations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const { surveyorId, decisionStatus, recommendation, sort } = req.query as Record<string, string | undefined>;

      const result = await qsService.findEvaluations({
        page,
        limit,
        surveyorId,
        decisionStatus,
        recommendation,
        sort,
        currentUser: req.user!,
      });

      res.json({ success: true, ...result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("findEvaluations error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async createEvaluation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(CreateQsEvaluationDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat().join(", ");
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      const result = await qsService.createEvaluation(req.body, req.user!);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("createEvaluation error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async updateEvaluation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(UpdateQsEvaluationDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat().join(", ");
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      const result = await qsService.updateEvaluation(req.params.id as string, req.body, req.user!);
      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("updateEvaluation error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async decide(req: AuthRequest, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(DecideQsEvaluationDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat().join(", ");
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      const result = await qsService.decide(req.params.id as string, req.body, req.user!);
      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("decide error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async getNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const type = req.query.type as string | undefined;

      const result = await qsService.getQsNotifications({
        page,
        limit,
        type,
        currentUser: req.user!,
      });

      res.json({ success: true, ...result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("getNotifications error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async markNotificationsRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { type } = req.body;
      if (!type || typeof type !== "string") {
        res.status(400).json({ success: false, message: "type is required" });
        return;
      }

      const result = await qsService.markQsNotificationsRead(type, req.user!);
      res.json({ success: true, ...result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("markNotificationsRead error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
}

export const qsController = new QsController();
