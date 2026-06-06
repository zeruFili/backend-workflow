import { Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { DesignerPhase } from "../enums/designer-phase.enum";
import { ReviewAction } from "../enums/review-action.enum";
import { designerTaskService } from "../services/designer-task.service";
import {
  CreateDesignerTaskDto,
  AssignDesignerDto,
  SubmitPhaseDto,
  ReviewPhaseDto,
} from "../validators/designer-task.dto";

async function validateDto<T extends object>(dtoClass: new () => T, plain: object): Promise<T> {
  const instance = plainToInstance(dtoClass, plain);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints || {}))
      .flat()
      .join(", ");
    throw new AppError(400, messages);
  }

  return instance;
}

function parsePhase(param: string): DesignerPhase {
  const values: string[] = Object.values(DesignerPhase);
  if (!values.includes(param)) {
    throw new AppError(400, `Invalid phase: ${param}. Must be one of: ${values.join(", ")}`);
  }
  return param as DesignerPhase;
}

export class DesignerTaskController {
  async findAll(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = Math.min(100, parseInt((req.query.limit as string) || "20", 10));
      const status = req.query.status as string | undefined;
      const assignedTo = req.query.assignedTo as string | undefined;
      const assignedBy = req.query.assignedBy as string | undefined;
      const isPublic = req.query.isPublic !== undefined ? req.query.isPublic === "true" : undefined;
      const isPaused = req.query.isPaused !== undefined ? req.query.isPaused === "true" : undefined;
      const search = req.query.search as string | undefined;
      const sort = req.query.sort as string | undefined;

      const result = await designerTaskService.findAll({
        page,
        limit,
        status,
        assignedTo,
        assignedBy,
        isPublic,
        isPaused,
        search,
        sort,
        currentUser: req.user,
      });

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const task = await designerTaskService.findById(id);
      res.status(200).json({ success: true, data: task });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const dto = await validateDto(CreateDesignerTaskDto, req.body);
      const task = await designerTaskService.create(dto, req.user.id);
      res.status(201).json({ success: true, data: task, message: "Designer task created successfully" });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const task = await designerTaskService.update(id, req.body);
      res.status(200).json({ success: true, data: task, message: "Designer task updated successfully" });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      await designerTaskService.delete(id);
      res.status(200).json({ success: true, message: "Designer task deleted successfully" });
    } catch (error) {
      next(error);
    }
  }

  async assignDesigner(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const id = req.params.id as string;
      const dto = await validateDto(AssignDesignerDto, req.body);
      const task = await designerTaskService.assignDesigner(id, dto.designer_id, dto.review_note, {
        id: req.user.id,
        name: req.user.name,
      });
      res.status(200).json({ success: true, data: task, message: "Designer assigned successfully" });
    } catch (error) {
      next(error);
    }
  }

  async pauseTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const id = req.params.id as string;
      const reason = req.body.reason as string | undefined;
      const task = await designerTaskService.pauseTask(id, reason, {
        id: req.user.id,
        name: req.user.name,
      });
      res.status(200).json({ success: true, data: task, message: "Task paused successfully" });
    } catch (error) {
      next(error);
    }
  }

  async resumeTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const id = req.params.id as string;
      const task = await designerTaskService.resumeTask(id, {
        id: req.user.id,
        name: req.user.name,
      });
      res.status(200).json({ success: true, data: task, message: "Task resumed successfully" });
    } catch (error) {
      next(error);
    }
  }

  async getPhases(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const phases = await designerTaskService.getPhases(id);
      res.status(200).json({ success: true, data: phases });
    } catch (error) {
      next(error);
    }
  }

  async submitPhase(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const id = req.params.id as string;
      const phaseParam = req.params.phase as string;
      const phase = parsePhase(phaseParam);

      const dto = await validateDto(SubmitPhaseDto, req.body);
      const file = req.file as Express.Multer.File | undefined;
      const screenshotPath = file ? `/uploads/${file.filename}` : null;

      const submission = await designerTaskService.submitPhase(
        id,
        phase,
        dto.note,
        screenshotPath,
        { id: req.user.id, name: req.user.name }
      );

      res.status(201).json({ success: true, data: submission, message: "Phase submitted successfully" });
    } catch (error) {
      next(error);
    }
  }

  async reviewPhase(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const id = req.params.id as string;
      const phaseParam = req.params.phase as string;
      const phase = parsePhase(phaseParam);

      const dto = await validateDto(ReviewPhaseDto, req.body);
      const action = dto.action as ReviewAction;

      const entry = await designerTaskService.reviewPhase(
        id,
        phase,
        action,
        dto.message,
        { id: req.user.id, name: req.user.name }
      );

      res.status(201).json({ success: true, data: entry, message: "Phase reviewed successfully" });
    } catch (error) {
      next(error);
    }
  }

  async updatePhaseNotes(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const id = req.params.id as string;
      const phaseParam = req.params.phase as string;
      const phase = parsePhase(phaseParam);

      const { note } = req.body;
      if (!note || typeof note !== "string" || note.trim().length === 0) {
        res.status(400).json({ success: false, message: "Note is required" });
        return;
      }

      const entry = await designerTaskService.updatePhaseNotes(id, phase, note.trim(), req.user.id);
      res.status(200).json({ success: true, data: entry, message: "Phase notes updated successfully" });
    } catch (error) {
      next(error);
    }
  }
}

export const designerTaskController = new DesignerTaskController();
