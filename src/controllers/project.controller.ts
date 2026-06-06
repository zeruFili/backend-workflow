import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { ProjectService } from "../services/project.service";
import { TaskService } from "../services/task.service";
import { CreateProjectDto, UpdateProjectDto } from "../validators/project.dto";
import { validate } from "class-validator";
import { AppError } from "../middlewares/error.middleware";

const service = new ProjectService();
const taskService = new TaskService();

export class ProjectController {
  async findAll(req: AuthRequest, res: Response) {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const { stage, status, assigned_to, search, sort } = req.query as Record<string, string | undefined>;

    const result = await service.findAll({ page, limit, stage, status, assigned_to, search, sort });
    res.json({ success: true, ...result });
  }

  async findById(req: AuthRequest, res: Response) {
    const result = await service.findById(req.params.id as string);
    res.json({ success: true, data: result });
  }

  async create(req: AuthRequest, res: Response) {
    const dto = Object.assign(new CreateProjectDto(), req.body);
    const errors = await validate(dto);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: "Validation failed", errors });
      return;
    }

    const result = await service.create(req.body, req.user!.id);
    res.status(201).json({ success: true, data: result });
  }

  async update(req: AuthRequest, res: Response) {
    const dto = Object.assign(new UpdateProjectDto(), req.body);
    const errors = await validate(dto);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: "Validation failed", errors });
      return;
    }

    const result = await service.update(req.params.id as string, req.body);
    res.json({ success: true, data: result });
  }

  async delete(req: AuthRequest, res: Response) {
    const result = await service.delete(req.params.id as string);
    res.json({ success: true, data: result });
  }

  async getTasks(req: AuthRequest, res: Response) {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const { status, assignedTo, assignedBy, taskType, search, sort } =
      req.query as Record<string, string | undefined>;

    const result = await taskService.findAll(
      { page, limit, status, assignedTo, assignedBy, projectId: req.params.id as string, taskType, search, sort },
      req.user!.id,
      req.user!.role
    );
    res.json({ success: true, ...result });
  }
}
