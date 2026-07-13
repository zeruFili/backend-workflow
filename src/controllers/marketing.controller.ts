import { Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { marketingService } from "../services/marketing.service";
import { getFilePathsFromRequest, cleanupUploadedFiles } from "../utils/upload.utils";
import {
  CreateMarketingTaskDto,
  UpdateMarketingTaskDto,
  CreateMarketingSubmissionDto,
  CreateMarketingReviewDto,
  UpdateMarketingReviewDto,
} from "../validators/marketing.dto";

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

export class MarketingController {
  async findAllTasks(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      console.log('[MarketingController] findAllTasks called - user:', req.user.id, req.user.role);
      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = Math.min(100, parseInt((req.query.limit as string) || "20", 10));
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;

      const result = await marketingService.findAllTasks({
        page,
        limit,
        status,
        search,
        currentUser: req.user,
      });

      const submissionCounts = result.data?.map((t: any) => ({
        id: t.id,
        title: t.title,
        submissionsCount: t.submissionsWithReviews?.submissions?.length || 0,
      }));
      console.log('[MarketingController] findAllTasks returning:', JSON.stringify(submissionCounts, null, 2));

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async findTaskById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      console.log('[MarketingController] findTaskById called - id:', id);
      const task = await marketingService.findTaskById(id, req.user);
      console.log('[MarketingController] findTaskById returning - id:', id, 'submissions:', (task as any).submissions?.length || 0);
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

      const dto = await validateDto(CreateMarketingTaskDto, req.body, req);

      if (!dto.description?.trim() && !dto.service_description?.trim()) {
        cleanupUploadedFiles(req);
        throw new AppError(400, "Either description or service_description is required.");
      }

      const filePaths = getFilePathsFromRequest(req, "marketing_tasks");
      const mergedUrls = [...filePaths, ...(dto.attachment_urls || [])];

      const task = await marketingService.createTask(
        { ...dto, attachment_urls: mergedUrls.length > 0 ? mergedUrls : undefined },
        req.user.id
      );
      res.status(201).json({ success: true, data: task, message: "Marketing task created successfully" });
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

      const raw = req.body.attachment_urls;
      const bodyForValidation = { ...req.body } as any;
      delete bodyForValidation.attachment_urls;

      const dto = await validateDto(UpdateMarketingTaskDto, bodyForValidation, req);

      const filePaths = getFilePathsFromRequest(req, "marketing_tasks");

      let bodyAttachmentUrls: string[] | undefined;
      if (Array.isArray(raw)) {
        bodyAttachmentUrls = raw.filter((u: string) => u != null && u !== '' && String(u).trim() !== '');
      } else if (raw !== undefined && raw !== null && raw !== '' && String(raw).trim() !== '') {
        bodyAttachmentUrls = [raw];
      } else {
        bodyAttachmentUrls = [];
      }

      const hasAttachments = filePaths.length > 0 || (bodyAttachmentUrls ?? []).length > 0 || raw != null;
      const mergedUrls = hasAttachments ? [...filePaths, ...(bodyAttachmentUrls || [])] : undefined;

      const task = await marketingService.updateTask(
        id,
        { ...dto, attachment_urls: mergedUrls },
        req.user.id
      );
      res.status(200).json({ success: true, data: task, message: "Marketing task updated successfully" });
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
      const id = req.params.id as string;
      const task = await marketingService.removeTask(id, req.user.id);
      res.status(200).json({ success: true, data: task, message: "Marketing task deleted successfully" });
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
      const dto = await validateDto(CreateMarketingSubmissionDto, req.body, req);

      const filePaths = getFilePathsFromRequest(req, "marketing_submissions");
      const bodyAttachmentUrls = req.body.attachment_urls as string[] | undefined;
      const mergedUrls = [...filePaths, ...(bodyAttachmentUrls || [])];

      const submission = await marketingService.createSubmission(
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

      const filePaths = getFilePathsFromRequest(req, "marketing_submissions");

      const raw = req.body.attachment_urls;
      let bodyAttachmentUrls: string[] | undefined;
      if (Array.isArray(raw)) {
        bodyAttachmentUrls = raw.filter((u: string) => u != null && u !== '' && String(u).trim() !== '');
      } else if (raw !== undefined && raw !== null && raw !== '' && String(raw).trim() !== '') {
        bodyAttachmentUrls = [raw];
      } else {
        bodyAttachmentUrls = [];
      }

      const hasAttachments = filePaths.length > 0 || bodyAttachmentUrls.length > 0 || raw !== undefined;
      const mergedUrls = hasAttachments ? [...filePaths, ...(bodyAttachmentUrls || [])] : undefined;

      const submission = await marketingService.updateSubmission(submissionId, req.user.id, {
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
      const submissions = await marketingService.getSubmissions(taskId, req.user);
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
      const dto = await validateDto(CreateMarketingReviewDto, req.body, req);
      const review = await marketingService.createReview(
        submissionId,
        req.user.id,
        dto.review_outcome,
        dto.description
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
      const dto = await validateDto(UpdateMarketingReviewDto, req.body, req);
      const review = await marketingService.updateReview(
        reviewId,
        { review_outcome: dto.review_outcome, description: dto.description },
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
      const reviews = await marketingService.getReviews(submissionId);
      res.status(200).json({ success: true, data: reviews });
    } catch (error) {
      next(error);
    }
  }
}

export const marketingController = new MarketingController();
