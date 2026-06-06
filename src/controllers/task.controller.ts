import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { TaskService } from "../services/task.service";
import { CreateTaskDto, UpdateTaskDto, ChangeTaskStatusDto, ChangeTaskDescriptionDto, AddFeedbackDto } from "../validators/task.dto";
import { validate } from "class-validator";

const service = new TaskService();

export class TaskController {
  async findAll(req: AuthRequest, res: Response) {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const { status, assignedTo, assignedBy, projectId, taskType, search, sort } =
      req.query as Record<string, string | undefined>;

    const result = await service.findAll(
      { page, limit, status, assignedTo, assignedBy, projectId, taskType, search, sort },
      req.user!.id,
      req.user!.role
    );
    res.json({ success: true, ...result });
  }

  async findById(req: AuthRequest, res: Response) {
    const result = await service.findById(req.params.id as string);
    res.json({ success: true, data: result });
  }

  async create(req: AuthRequest, res: Response) {
    const dto = Object.assign(new CreateTaskDto(), req.body);
    const errors = await validate(dto);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: "Validation failed", errors });
      return;
    }

    const result = await service.create(req.body, req.user!.id, req.user!.name);
    res.status(201).json({ success: true, data: result });
  }

  async update(req: AuthRequest, res: Response) {
    const dto = Object.assign(new UpdateTaskDto(), req.body);
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

  async changeStatus(req: AuthRequest, res: Response) {
    const dto = Object.assign(new ChangeTaskStatusDto(), req.body);
    const errors = await validate(dto);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: "Validation failed", errors });
      return;
    }

    const result = await service.changeStatus(req.params.id as string, dto.status, req.user!.id, req.user!.role);
    res.json({ success: true, data: result });
  }

  async changeDescription(req: AuthRequest, res: Response) {
    const dto = Object.assign(new ChangeTaskDescriptionDto(), req.body);
    const errors = await validate(dto);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: "Validation failed", errors });
      return;
    }

    const task = await service.update(req.params.id as string, { description: dto.description });
    res.json({ success: true, data: task });
  }

  async approve(req: AuthRequest, res: Response) {
    const { feedback } = req.body as { feedback?: string };
    const result = await service.approve(req.params.id as string, req.user!.id, feedback);
    res.json({ success: true, data: result });
  }

  async reject(req: AuthRequest, res: Response) {
    const { feedback } = req.body as { feedback: string };
    const result = await service.reject(req.params.id as string, req.user!.id, feedback);
    res.json({ success: true, data: result });
  }

  async addFeedback(req: AuthRequest, res: Response) {
    const dto = Object.assign(new AddFeedbackDto(), req.body);
    const errors = await validate(dto);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: "Validation failed", errors });
      return;
    }

    const result = await service.addFeedback(req.params.id as string, dto.body, req.user!.id, req.user!.name);
    res.status(201).json({ success: true, data: result });
  }

  async uploadAttachment(req: AuthRequest, res: Response) {
    res.json({ success: true, data: null });
  }

  async getApproval(req: AuthRequest, res: Response) {
    const task = await service.findById(req.params.id as string);
    res.json({
      success: true,
      data: {
        approval_status: (task as any).approval_status,
        approved_by: (task as any).approved_by,
        approved_at: (task as any).approved_at,
        approval_feedback: (task as any).approval_feedback,
      },
    });
  }

  async createSubmission(req: AuthRequest, res: Response) {
    const { notes, metadata } = req.body as { notes?: string; metadata?: Record<string, any> };
    const result = await service.createSubmission(req.params.id as string, req.user!.id, req.user!.name, notes, metadata);
    res.status(201).json({ success: true, data: result });
  }

  async getSubmissions(req: AuthRequest, res: Response) {
    const result = await service.getSubmissions(req.params.id as string);
    res.json({ success: true, data: result });
  }

  async approveSubmission(req: AuthRequest, res: Response) {
    const result = await service.approveSubmission(req.params.submissionId as string, req.user!.id);
    res.json({ success: true, data: result });
  }

  async updateFeedback(req: AuthRequest, res: Response) {
    const { body } = req.body as { body: string };
    const result = await service.updateFeedback(req.params.id as string, body, req.user!.id);
    res.json({ success: true, data: result });
  }

  async deleteFeedback(req: AuthRequest, res: Response) {
    const result = await service.deleteFeedback(req.params.id as string, req.user!.id);
    res.json({ success: true, data: result });
  }
}
