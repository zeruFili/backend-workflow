import { Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { designerService } from "../services/designer.service";
import { ReviewOutcome } from "../enums/review-outcome.enum";
import { getFilePathsFromRequest, cleanupUploadedFiles } from "../utils/upload.utils";
import {
  CreateDesignerTaskDto,
  UpdateDesignerTaskDto,
  AssignDesignerDto,
  CreateDesignerSubmissionDto,
  CreateSubmissionReviewDto,
  UpdateSubmissionReviewDto,
  CreateTaskReviewDto,
  DesignApplicationDto,
  PauseTaskDto,
} from "../validators/designer.dto";

async function validateDto<T extends object>(dtoClass: new () => T, plain: object, req: AuthRequest): Promise<T> {
  const instance = plainToInstance(dtoClass, plain);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  if (errors.length > 0) {
    cleanupUploadedFiles(req);
    const messages = errors
      .map((e) => Object.values(e.constraints || {}))
      .flat()
      .join(", ");
    throw new AppError(400, messages);
  }

  return instance;
}

function parseReviewOutcome(param: string): ReviewOutcome {
  const values: string[] = Object.values(ReviewOutcome);
  if (!values.includes(param)) {
    throw new AppError(400, `Invalid review outcome: ${param}. Must be one of: ${values.join(", ")}`);
  }
  return param as ReviewOutcome;
}

export class DesignerController {
  async findAllTasks(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = Math.min(100, parseInt((req.query.limit as string) || "20", 10));
      const status = req.query.status as string | undefined;
      const assignedTo = req.query.assignedTo as string | undefined;
      const isPublic = req.query.isPublic !== undefined ? req.query.isPublic === "true" : undefined;
      const isPaused = req.query.isPaused !== undefined ? req.query.isPaused === "true" : undefined;
      const search = req.query.search as string | undefined;

      const result = await designerService.findAllTasks({
        page,
        limit,
        status,
        assignedTo,
        isPublic,
        isPaused,
        search,
        currentUser: req.user,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async findTaskById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const task = await designerService.findTaskById(id);
      res.status(200).json({ success: true, data: task });
    } catch (error) {
      next(error);
    }
  }

  async createTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const bodyForValidation = { ...req.body } as any;
      if (bodyForValidation.story_point !== undefined) {
        bodyForValidation.story_point = parseInt(bodyForValidation.story_point as any, 10);
      }
      const dto = await validateDto(CreateDesignerTaskDto, bodyForValidation, req);

      const filePaths = getFilePathsFromRequest(req, "designer_tasks");
      const bodyAttachmentUrls = req.body.attachment_urls as string[] | undefined;
      const mergedUrls = [...filePaths, ...(bodyAttachmentUrls || [])];

      const task = await designerService.createTask(
        {
          ...dto,
          attachment_urls: mergedUrls.length > 0 ? mergedUrls : undefined,
        },
        req.user.id
      );
      res.status(201).json({ success: true, data: task, message: "Designer task created successfully" });
    } catch (error) {
      next(error);
    }
  }

  async updateTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const id = req.params.id as string;
      const bodyForValidation = { ...req.body } as any;
      if (bodyForValidation.story_point !== undefined) {
        bodyForValidation.story_point = parseInt(bodyForValidation.story_point as any, 10);
      }
      const dto = await validateDto(UpdateDesignerTaskDto, bodyForValidation, req);

      const filePaths = getFilePathsFromRequest(req, "designer_tasks");
      const bodyAttachmentUrls = req.body.attachment_urls as string[] | undefined;
      const hasAttachments = filePaths.length > 0 || bodyAttachmentUrls !== undefined;
      const mergedUrls = hasAttachments ? [...filePaths, ...(bodyAttachmentUrls || [])] : undefined;

      const task = await designerService.updateTask(
        id,
        { ...dto, attachment_urls: mergedUrls },
        req.user
      );
      res.status(200).json({ success: true, data: task, message: "Designer task updated successfully" });
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

      const taskId = req.params.id as string;
      const dto = await validateDto(AssignDesignerDto, req.body, req);
      const task = await designerService.assignDesigner(taskId, dto.designer_id, req.user.id);
      res.status(200).json({ success: true, data: task, message: "Designer assigned successfully" });
    } catch (error) {
      next(error);
    }
  }

  async apply(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const taskId = req.params.id as string;
      const dto = await validateDto(DesignApplicationDto, { designer_task_id: taskId, ...req.body }, req);
      const application = await designerService.apply(taskId, req.user.id, dto.cover_note);
      res.status(201).json({ success: true, data: application, message: "Application submitted successfully" });
    } catch (error) {
      next(error);
    }
  }

  async listApplications(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = Math.min(100, parseInt((req.query.limit as string) || "20", 10));
      const taskId = req.params.id as string | undefined;
      const applicantId = req.query.applicantId as string | undefined;
      const status = req.query.status as string | undefined;

      const result = await designerService.listApplications({
        page,
        limit,
        taskId,
        applicantId,
        currentUser: req.user,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async createSubmission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const taskId = req.params.id as string;
      const dto = await validateDto(CreateDesignerSubmissionDto, req.body, req);

      const filePaths = getFilePathsFromRequest(req, "designer_submissions");
      const bodyAttachmentUrls = req.body.attachment_urls as string[] | undefined;
      const mergedUrls = [...filePaths, ...(bodyAttachmentUrls || [])];

      const submission = await designerService.createSubmission(
        taskId,
        req.user.id,
        dto.stage,
        dto.description,
        mergedUrls.length > 0 ? mergedUrls : undefined
      );
      res.status(201).json({ success: true, data: submission, message: "Submission created successfully" });
    } catch (error) {
      next(error);
    }
  }

  async updateSubmission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const submissionId = req.params.id as string;
      const { description, stage } = req.body;

      const filePaths = getFilePathsFromRequest(req, "designer_submissions");
      const bodyAttachmentUrls = req.body.attachment_urls as string[] | undefined;
      const hasAttachments = filePaths.length > 0 || bodyAttachmentUrls !== undefined;
      const mergedUrls = hasAttachments ? [...filePaths, ...(bodyAttachmentUrls || [])] : undefined;

      const submission = await designerService.updateSubmission(submissionId, {
        description,
        stage,
        attachment_urls: mergedUrls,
      });

      res.status(200).json({ success: true, data: submission, message: "Submission updated successfully" });
    } catch (error) {
      next(error);
    }
  }

  async createSubmissionReview(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const submissionId = req.params.id as string;
      const dto = await validateDto(CreateSubmissionReviewDto, req.body, req);
      const review = await designerService.createSubmissionReview(
        submissionId,
        req.user.id,
        dto.review_outcome,
        dto.description
      );
      res.status(201).json({ success: true, data: review, message: "Submission reviewed successfully" });
    } catch (error) {
      next(error);
    }
  }

  async updateSubmissionReview(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const reviewId = req.params.id as string;
      const dto = await validateDto(UpdateSubmissionReviewDto, req.body, req);
      const review = await designerService.updateSubmissionReview(
        reviewId,
        req.user.id,
        { review_outcome: dto.review_outcome, description: dto.description }
      );
      res.status(200).json({ success: true, data: review, message: "Review updated successfully" });
    } catch (error) {
      next(error);
    }
  }

  async createTaskReview(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const taskId = req.params.id as string;
      const dto = await validateDto(CreateTaskReviewDto, req.body, req);
      const review = await designerService.createTaskReview(
        taskId,
        req.user.id,
        dto.Creativity,
        dto.Timeliness,
        dto.Rendering_quality,
        dto.Client_understanding,
        dto.description
      );
      res.status(201).json({ success: true, data: review, message: "Task review created successfully" });
    } catch (error) {
      next(error);
    }
  }

  async getSubmissions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const taskId = req.params.id as string;
      const submissions = await designerService.getSubmissions(taskId);
      res.status(200).json({ success: true, data: submissions });
    } catch (error) {
      next(error);
    }
  }

  async getSubmissionReviews(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const submissionId = req.params.id as string;
      const reviews = await designerService.getSubmissionReviews(submissionId);
      res.status(200).json({ success: true, data: reviews });
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

      const taskId = req.params.id as string;
      const dto = await validateDto(PauseTaskDto, req.body, req);
      const task = await designerService.pauseTask(taskId, dto.reason, req.user.id);
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

      const taskId = req.params.id as string;
      const task = await designerService.resumeTask(taskId, req.user.id);
      res.status(200).json({ success: true, data: task, message: "Task resumed successfully" });
    } catch (error) {
      next(error);
    }
  }

  async removeTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const taskId = req.params.id as string;
      const { reason } = req.body as { reason: string };
      if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
        res.status(400).json({ success: false, message: "Reason is required" });
        return;
      }

      const task = await designerService.removeTask(taskId, req.user.id, reason.trim());
      res.status(200).json({ success: true, data: task, message: "Task removed successfully" });
    } catch (error) {
      next(error);
    }
  }
}

export const designerController = new DesignerController();
