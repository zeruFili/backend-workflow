import { Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { paidCustomerService } from "../services/paid-customer.service";
import { VerifyPaymentDto, ClarifyPaymentDto } from "../validators/paid-customer.dto";
import { UserRole } from "../enums/user-role.enum";
import path from "path";
import fs from "fs";

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

function ensureUploadsDir(): string {
  const dir = path.resolve(process.cwd(), "uploads", "payment_proofs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function extractProofFiles(req: AuthRequest): Array<{
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
}> {
  const files = (req as any).files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) return [];

  const uploadDir = ensureUploadsDir();

  return files.map((file) => {
    const destPath = path.join(uploadDir, `${Date.now()}-${file.originalname}`);
    fs.writeFileSync(destPath, file.buffer);
    return {
      file_url: destPath,
      file_name: file.originalname,
      file_type: file.mimetype,
      file_size: file.size,
    };
  });
}

export class PaidCustomerController {
  async findAll(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const payment_verification_status = req.query.payment_verification_status as string | undefined;
      const search = req.query.search as string | undefined;
      const sort = req.query.sort as string | undefined;

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const result = await paidCustomerService.findAll({
        page,
        limit,
        payment_verification_status,
        search,
        sort,
        userId: req.user.id,
        userRole: req.user.role,
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

  async transfer(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const source_request_id = req.body.source_request_id;
      const payment_note = req.body.payment_note as string | undefined;

      if (!source_request_id) {
        res.status(400).json({ success: false, message: "source_request_id is required" });
        return;
      }

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const proofFiles = extractProofFiles(req);

      const result = await paidCustomerService.transfer(
        { source_request_id, payment_note },
        proofFiles,
        {
          id: req.user.id,
          name: req.user.name,
          role: req.user.role,
        }
      );

      res.status(201).json({ success: true, data: result, message: "Customer transferred to paid customers" });
    } catch (error) {
      next(error);
    }
  }

  async verify(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const dto = await validateDto(VerifyPaymentDto, req.body);

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const result = await paidCustomerService.verify(id, dto, {
        id: req.user.id,
        name: req.user.name,
        role: req.user.role,
      });

      res.status(200).json({ success: true, data: result, message: `Payment ${dto.action === "approve" ? "approved" : dto.action === "reject" ? "rejected" : "clarification requested"}` });
    } catch (error) {
      next(error);
    }
  }

  async clarify(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const description = req.body.description as string | undefined;

      if (!description) {
        res.status(400).json({ success: false, message: "description is required" });
        return;
      }

      await validateDto(ClarifyPaymentDto, { description });

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const attachmentFiles = extractProofFiles(req);
      const attachment_file_urls = attachmentFiles.map((f) => f.file_url);

      const result = await paidCustomerService.clarify(id, {
        description,
        attachment_file_urls: attachment_file_urls.length > 0 ? attachment_file_urls : undefined,
      }, {
        id: req.user.id,
        name: req.user.name,
        role: req.user.role,
      });

      res.status(200).json({ success: true, data: result, message: "Clarification submitted" });
    } catch (error) {
      next(error);
    }
  }

  async verificationHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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
