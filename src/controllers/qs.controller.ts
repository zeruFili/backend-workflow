import { Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { quantitySurveyorService } from "../services/qs.service";
import { getFilePathsFromRequest, cleanupUploadedFiles } from "../utils/upload.utils";
import {
  CreateQSTaskDto,
  UpdateQSTaskDto,
  CreateQSSubmissionDto,
  CreateQSReviewDto,
  UpdateQSReviewDto,
} from "../validators/qs.dto";

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

export class QuantitySurveyorController {
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
      const search = req.query.search as string | undefined;

      const result = await quantitySurveyorService.findAllTasks({
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
      const task = await quantitySurveyorService.findTaskById(id, req.user);
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

      const dto = await validateDto(CreateQSTaskDto, req.body, req);

      const filePaths = getFilePathsFromRequest(req, "qs_tasks");
      const mergedUrls = [...filePaths, ...(dto.attachment_urls || [])];

      const task = await quantitySurveyorService.createTask(
        { ...dto, attachment_urls: mergedUrls.length > 0 ? mergedUrls : undefined },
        req.user.id
      );
      res.status(201).json({ success: true, data: task, message: "QS task created successfully" });
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

      // Handle assigned_to_user_id null conversion (like designer controller)
      const bodyForValidation = { ...req.body } as any;
      let assignedTo: string | null | undefined;
      if (bodyForValidation.assigned_to_user_id !== undefined) {
        const raw = bodyForValidation.assigned_to_user_id;
        if (raw === 'null' || raw === '' || raw === null) {
          assignedTo = null;
        } else if (typeof raw === 'string' && raw.length > 0) {
          assignedTo = raw;
        } else {
          assignedTo = undefined;
        }
      }
      delete bodyForValidation.assigned_to_user_id;

      const dto = await validateDto(UpdateQSTaskDto, bodyForValidation, req);
      req.body = bodyForValidation;

      const filePaths = getFilePathsFromRequest(req, "qs_tasks");
      const bodyAttachmentUrls = req.body.attachment_urls as string[] | undefined;
      const hasAttachments = filePaths.length > 0 || bodyAttachmentUrls !== undefined;
      const mergedUrls = hasAttachments ? [...filePaths, ...(bodyAttachmentUrls || [])] : undefined;

      const task = await quantitySurveyorService.updateTask(
        id,
        { ...dto, attachment_urls: mergedUrls, assigned_to_user_id: assignedTo },
        req.user.id
      );
      res.status(200).json({ success: true, data: task, message: "QS task updated successfully" });
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
      const dto = await validateDto(CreateQSSubmissionDto, req.body, req);

      const filePaths = getFilePathsFromRequest(req, "qs_submissions");
      const bodyAttachmentUrls = req.body.attachment_urls as string[] | undefined;
      const mergedUrls = [...filePaths, ...(bodyAttachmentUrls || [])];

      const submission = await quantitySurveyorService.createSubmission(
        taskId,
        dto.description,
        req.user.id,
        mergedUrls.length > 0 ? mergedUrls : undefined,
        dto.status
      );
      res.status(201).json({ success: true, data: submission, message: "Submission created successfully" });
    } catch (error) {
      next(error);
    }
  }

  async getSubmissions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const taskId = req.params.id as string;
      const submissions = await quantitySurveyorService.getSubmissions(taskId, req.user);
      res.status(200).json({ success: true, data: submissions });
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
      const { description, status } = req.body;

      const filePaths = getFilePathsFromRequest(req, "qs_submissions");
      const bodyAttachmentUrls = req.body.attachment_urls as string[] | undefined;
      const hasAttachments = filePaths.length > 0 || bodyAttachmentUrls !== undefined;
      const mergedUrls = hasAttachments ? [...filePaths, ...(bodyAttachmentUrls || [])] : undefined;

      const submission = await quantitySurveyorService.updateSubmission(submissionId, req.user.id, {
        description,
        attachment_urls: mergedUrls,
        status,
      });

      res.status(200).json({ success: true, data: submission, message: "Submission updated successfully" });
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
      const dto = await validateDto(CreateQSReviewDto, req.body, req);
      const review = await quantitySurveyorService.createReview(
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

  async evaluate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const id = req.params.id as string;
      const { description, review_outcome } = req.body;

      if (!description || !review_outcome) {
        cleanupUploadedFiles(req);
        res.status(400).json({ success: false, message: "Description and review_outcome are required" });
        return;
      }

      const filePaths = getFilePathsFromRequest(req, "qs_evaluations");
      const bodyAttachmentUrls = req.body.attachment_urls as string[] | undefined;
      const mergedUrls = [...filePaths, ...(bodyAttachmentUrls || [])];

      const evaluation = await quantitySurveyorService.evaluate(id, {
        description,
        review_outcome,
        attachment_urls: mergedUrls.length > 0 ? mergedUrls : undefined,
      }, req.user.id);

      res.status(201).json({ success: true, data: evaluation, message: "Evaluation created" });
    } catch (error) {
      next(error);
    }
  }

  async updateEvaluate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const id = req.params.id as string;
      const { description, review_outcome } = req.body;

      const filePaths = getFilePathsFromRequest(req, "qs_evaluations");
      const bodyAttachmentUrls = req.body.attachment_urls as string[] | undefined;
      const hasAttachments = filePaths.length > 0 || bodyAttachmentUrls !== undefined;
      const mergedUrls = hasAttachments ? [...filePaths, ...(bodyAttachmentUrls || [])] : undefined;

      const evaluation = await quantitySurveyorService.updateEvaluate(id, {
        description,
        review_outcome,
        attachment_urls: mergedUrls,
      }, req.user.id);

      res.status(200).json({ success: true, data: evaluation, message: "Evaluation updated" });
    } catch (error) {
      next(error);
    }
  }

  async decide(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const id = req.params.id as string;
      const { decision, description } = req.body;

      if (!decision) {
        res.status(400).json({ success: false, message: "Decision is required" });
        return;
      }

      const result = await quantitySurveyorService.decide(id, decision, description, req.user.id);
      res.status(200).json({ success: true, data: result, message: "Decision recorded" });
    } catch (error) {
      next(error);
    }
  }

  async getReviews(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const submissionId = req.params.id as string;
      const reviews = await quantitySurveyorService.getReviews(submissionId);
      res.status(200).json({ success: true, data: reviews });
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
      const dto = await validateDto(UpdateQSReviewDto, req.body, req);
      const review = await quantitySurveyorService.updateReview(
        reviewId,
        { review_outcome: dto.review_outcome, description: dto.description },
        req.user.id
      );
      res.status(200).json({ success: true, data: review, message: "Review updated successfully" });
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
      const task = await quantitySurveyorService.removeTask(taskId);
      res.status(200).json({ success: true, data: task, message: "Quantity surveyor task deleted successfully" });
    } catch (error) {
      next(error);
    }
  }
}

export const quantitySurveyorController = new QuantitySurveyorController();
