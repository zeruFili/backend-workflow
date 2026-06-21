import { Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { dataCollectorService } from "../services/data-collector.service";
import { getFilePathsFromRequest, cleanupUploadedFiles } from "../utils/upload.utils";
import {
  CreateDCTaskDto,
  UpdateDCTaskDto,
  CreateDCSubmissionDto,
  CreateDCReviewDto,
  UpdateDCReviewDto,
} from "../validators/data-collector.dto";

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

export class DataCollectorController {
  async findAllTasks(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      console.log("findAllTasks called with query:i have been called ");
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = Math.min(100, parseInt((req.query.limit as string) || "20", 10));
      const status = req.query.status as string | undefined;
      const assignedTo = req.query.assignedTo as string | undefined;
      const search = req.query.search as string | undefined;

      const result = await dataCollectorService.findAllTasks({
        page,
        limit,
        status,
        assignedTo,
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
      const task = await dataCollectorService.findTaskById(id, req.user);
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

      const dto = await validateDto(CreateDCTaskDto, req.body, req);

      const filePaths = getFilePathsFromRequest(req, "dc_tasks");
      const mergedUrls = [...filePaths, ...(dto.attachment_urls || [])];

      const task = await dataCollectorService.createTask(
        { ...dto, attachment_urls: mergedUrls.length > 0 ? mergedUrls : undefined },
        req.user.id
      );
      res.status(201).json({ success: true, data: task, message: "Data collector task created successfully" });
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
      const dto = await validateDto(UpdateDCTaskDto, req.body, req);

      const filePaths = getFilePathsFromRequest(req, "dc_tasks");
      const bodyAttachmentUrls = req.body.attachment_urls as string[] | undefined;
      const hasAttachments = filePaths.length > 0 || bodyAttachmentUrls !== undefined;
      const mergedUrls = hasAttachments ? [...filePaths, ...(bodyAttachmentUrls || [])] : undefined;

      const task = await dataCollectorService.updateTask(
        id,
        { ...dto, attachment_urls: mergedUrls },
        req.user.id
      );
      res.status(200).json({ success: true, data: task, message: "Data collector task updated successfully" });
    } catch (error) {
      next(error);
    }
  }

  async createSubmission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      console.log("createSubmission called");
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const taskId = req.params.id as string;
      const dto = await validateDto(CreateDCSubmissionDto, req.body, req);

      const filePaths = getFilePathsFromRequest(req, "dc_submissions");

      const bodyAttachmentUrls = req.body.attachment_urls as string[] | undefined;
      const mergedUrls = [...filePaths, ...(bodyAttachmentUrls || [])];

      const submission = await dataCollectorService.createSubmission(
        taskId,
        dto.description,
        req.user.id,
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
      const { description } = req.body;

      const filePaths = getFilePathsFromRequest(req, "dc_submissions");
      const bodyAttachmentUrls = req.body.attachment_urls as string[] | undefined;
      const hasAttachments = filePaths.length > 0 || bodyAttachmentUrls !== undefined;
      const mergedUrls = hasAttachments ? [...filePaths, ...(bodyAttachmentUrls || [])] : undefined;

      const submission = await dataCollectorService.updateSubmission(submissionId, req.user.id, {
        description,
        attachment_urls: mergedUrls,
      });

      res.status(200).json({ success: true, data: submission, message: "Submission updated successfully" });
    } catch (error) {
      next(error);
    }
  }

  async getSubmissions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const taskId = req.params.id as string;
      const submissions = await dataCollectorService.getSubmissions(taskId, req.user);
      res.status(200).json({ success: true, data: submissions });
    } catch (error) {
      next(error);
    }
  }

  async createReview(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const submissionId = req.params.id as string;
      const dto = await validateDto(CreateDCReviewDto, req.body, req);
      const review = await dataCollectorService.createReview(
        submissionId,
        req.user.id,
        dto.review_outcome,
        dto.description,
        dto.task_state
      );
      res.status(201).json({ success: true, data: review, message: "Review created successfully" });
    } catch (error) {
      next(error);
    }
  }

  async updateReview(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const reviewId = req.params.id as string;
      const dto = await validateDto(UpdateDCReviewDto, req.body, req);
      const review = await dataCollectorService.updateReview(
        reviewId,
        { review_outcome: dto.review_outcome, description: dto.description, task_state: dto.task_state },
        req.user.id
      );
      res.status(200).json({ success: true, data: review, message: "Review updated successfully" });
    } catch (error) {
      next(error);
    }
  }

  async getReviews(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const submissionId = req.params.id as string;
      const reviews = await dataCollectorService.getReviews(submissionId);
      res.status(200).json({ success: true, data: reviews });
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
      const task = await dataCollectorService.removeTask(taskId);
      res.status(200).json({ success: true, data: task, message: "Data collector task deleted successfully" });
    } catch (error) {
      next(error);
    }
  }
}

export const dataCollectorController = new DataCollectorController();
