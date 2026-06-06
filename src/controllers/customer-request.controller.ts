import { Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { customerRequestService } from "../services/customer-request.service";
import { CreateCustomerRequestDto, UpdateCustomerRequestDto } from "../validators/customer-request.dto";

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

export class CustomerRequestController {
  async findAll(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const status = req.query.status as string | undefined;
      const category = req.query.category as string | undefined;
      const search = req.query.search as string | undefined;
      const sort = req.query.sort as string | undefined;

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const result = await customerRequestService.findAll({
        page,
        limit,
        status,
        category,
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

      const result = await customerRequestService.findById(id);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = await validateDto(CreateCustomerRequestDto, req.body);

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const result = await customerRequestService.create(dto, {
        id: req.user.id,
        name: req.user.name,
        role: req.user.role,
      });

      res.status(201).json({ success: true, data: result, message: "Customer request created" });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const dto = await validateDto(UpdateCustomerRequestDto, req.body);

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const result = await customerRequestService.update(id, dto, {
        id: req.user.id,
        name: req.user.name,
        role: req.user.role,
      });

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const force = req.query.force === "true";

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      await customerRequestService.delete(id, {
        id: req.user.id,
        name: req.user.name,
        role: req.user.role,
      }, force);

      res.status(200).json({ success: true, message: "Customer request deleted" });
    } catch (error) {
      next(error);
    }
  }
}

export const customerRequestController = new CustomerRequestController();
