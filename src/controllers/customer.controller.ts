import { Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { customerService } from "../services/customer.service";
import { CreateCustomerDto, UpdateCustomerDto } from "../validators/customer.dto";

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

export class CustomerController {
  async findAll(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const category = req.query.category as string | undefined;
      const paid = req.query.paid !== undefined ? req.query.paid === "true" : undefined;
      const search = req.query.search as string | undefined;

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const result = await customerService.findAll({
        page,
        limit,
        category,
        paid,
        search,
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

      const result = await customerService.findById(id);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = await validateDto(CreateCustomerDto, req.body);

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const result = await customerService.create(dto, req.user.id);

      res.status(201).json({ success: true, data: result, message: "Customer created" });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const dto = await validateDto(UpdateCustomerDto, req.body);

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const result = await customerService.update(id, dto, req.user.id, req.user.role);

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async markAsPaid(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const result = await customerService.markAsPaid(id, req.user.id, req.user.role);

      res.status(200).json({ success: true, data: result, message: "Customer marked as paid" });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      await customerService.delete(id, req.user.id, req.user.role);

      res.status(200).json({ success: true, message: "Customer deleted" });
    } catch (error) {
      next(error);
    }
  }
}

export const customerController = new CustomerController();
