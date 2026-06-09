import { Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { paidCustomerService } from "../services/paid-customer.service";
import { CreatePaidCustomerDto, VerifyPaidCustomerDto, UpdatePaidCustomerDto } from "../validators/paid-customer.dto";
import { processUploadedFiles } from "../utils/upload.utils";

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

export class PaidCustomerController {
  async findAll(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const result = await paidCustomerService.findAll({
        page,
        limit,
        status,
        search,
      });

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;

      const result = await paidCustomerService.findById(id);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = await validateDto(CreatePaidCustomerDto, req.body);

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const filePaths = await processUploadedFiles(req, res, {
        fieldName: "proofFiles",
        maxCount: 5,
        subfolder: "paid_customer_attachments",
      });

      const result = await paidCustomerService.create({
        ...dto,
        attachment_urls: filePaths.length > 0 ? filePaths : undefined,
      }, req.user.id);

      res.status(201).json({ success: true, data: result, message: "Paid customer created" });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const dto = await validateDto(UpdatePaidCustomerDto, req.body);

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const filePaths = await processUploadedFiles(req, res, {
        fieldName: "proofFiles",
        maxCount: 5,
        subfolder: "paid_customer_attachments",
      });
      const bodyAttachmentUrls = req.body.attachment_urls as string[] | undefined;
      const mergedUrls = [...filePaths, ...(bodyAttachmentUrls || [])];

      const result = await paidCustomerService.update(id, {
        ...dto,
        attachment_urls: mergedUrls.length > 0 ? mergedUrls : undefined,
      });

      res.status(200).json({ success: true, data: result, message: "Paid customer updated" });
    } catch (error) {
      next(error);
    }
  }

  async clarify(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const { description } = req.body;

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      if (!description || typeof description !== "string") {
        res.status(400).json({ success: false, message: "Description is required" });
        return;
      }

      const filePaths = await processUploadedFiles(req, res, {
        fieldName: "attachmentFiles",
        maxCount: 5,
        subfolder: "paid_customer_clarifications",
      });

      const result = await paidCustomerService.clarify(id, {
        description,
        attachment_urls: filePaths.length > 0 ? filePaths : undefined,
      }, req.user.id);

      res.status(201).json({ success: true, data: result, message: "Clarification request created" });
    } catch (error) {
      next(error);
    }
  }

  async updateClarify(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const { description } = req.body;

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      if (!description || typeof description !== "string") {
        res.status(400).json({ success: false, message: "Description is required" });
        return;
      }

      const filePaths = await processUploadedFiles(req, res, {
        fieldName: "attachmentFiles",
        maxCount: 5,
        subfolder: "paid_customer_clarifications",
      });

      const result = await paidCustomerService.updateClarify(id, {
        description,
        attachment_urls: filePaths.length > 0 ? filePaths : undefined,
      }, req.user.id);

      res.status(200).json({ success: true, data: result, message: "Clarification response submitted" });
    } catch (error) {
      next(error);
    }
  }

  async verify(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const dto = await validateDto(VerifyPaidCustomerDto, req.body);

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const result = await paidCustomerService.verify(id, dto, req.user.id);

      res.status(200).json({ success: true, data: result, message: `Payment ${dto.review_outcome}` });
    } catch (error) {
      next(error);
    }
  }

  async getVerificationHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;

      const result = await paidCustomerService.getVerificationHistory(id);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const paidCustomerController = new PaidCustomerController();
