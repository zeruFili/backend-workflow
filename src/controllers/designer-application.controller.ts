import { Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { designerApplicationService } from "../services/designer-application.service";
import { ApplyForTaskDto, ReviewApplicationDto } from "../validators/designer-task.dto";

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

export class DesignerApplicationController {
  async findAll(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = Math.min(100, parseInt((req.query.limit as string) || "20", 10));
      const taskId = req.query.taskId as string | undefined;
      const applicantId = req.query.applicantId as string | undefined;
      const status = req.query.status as string | undefined;

      const result = await designerApplicationService.findAll({
        page,
        limit,
        taskId,
        applicantId,
        status,
        currentUser: req.user,
      });

      res.status(200).json({ success: true, ...result });
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

      const dto = await validateDto(ApplyForTaskDto, req.body);
      const application = await designerApplicationService.apply(dto, {
        id: req.user.id,
        name: req.user.name,
      });

      res.status(201).json({ success: true, data: application, message: "Application submitted successfully" });
    } catch (error) {
      next(error);
    }
  }

  async review(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const id = req.params.id as string;
      const dto = await validateDto(ReviewApplicationDto, req.body);

      const application = await designerApplicationService.review(id, dto, {
        id: req.user.id,
        name: req.user.name,
      });

      res.status(200).json({ success: true, data: application, message: "Application reviewed successfully" });
    } catch (error) {
      next(error);
    }
  }
}

export const designerApplicationController = new DesignerApplicationController();
