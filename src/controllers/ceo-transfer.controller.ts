import { Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { ceoTransferService } from "../services/ceo-transfer.service";
import { CreateCeoTransferDto, UpdateCeoTransferDto } from "../validators/ceo-transfer.dto";
import { getFilePathsFromRequest, cleanupUploadedFiles } from "../utils/upload.utils";

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

export class CeoTransferController {
  async findAll(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await ceoTransferService.findAll(page, limit);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const transfer = await ceoTransferService.findById(id);
      res.status(200).json({ success: true, data: transfer });
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

      const dto = await validateDto(CreateCeoTransferDto, req.body, req);

      const filePaths = getFilePathsFromRequest(req, "ceo_transfers");
      const mergedUrls = [...filePaths, ...(dto.attachment_urls || [])];

      const result = await ceoTransferService.create(
        { ...dto, attachment_urls: mergedUrls.length > 0 ? mergedUrls : undefined },
        req.user.id
      );

      res.status(201).json({ success: true, data: result, message: "CEO transfer created" });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const id = req.params.id as string;
      const dto = await validateDto(UpdateCeoTransferDto, req.body, req);

      const filePaths = getFilePathsFromRequest(req, "ceo_transfers");
      const bodyAttachmentUrls = req.body.attachment_urls as string[] | undefined;
      const hasAttachments = filePaths.length > 0 || bodyAttachmentUrls !== undefined;
      const mergedUrls = hasAttachments ? [...filePaths, ...(bodyAttachmentUrls || [])] : undefined;

      const result = await ceoTransferService.update(id, {
        ...dto,
        attachment_urls: mergedUrls,
      });

      res.status(200).json({ success: true, data: result, message: "CEO transfer updated" });
    } catch (error) {
      next(error);
    }
  }
}

export const ceoTransferController = new CeoTransferController();
