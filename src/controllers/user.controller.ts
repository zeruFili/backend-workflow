import { Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { CreateUserDto, UpdateUserDto } from "../validators/user.dto";
import { UserRole } from "../enums/user-role.enum";
import { userService } from "../services/user.service";

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

export class UserController {
  async findAll(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const role = req.query.role as UserRole | undefined;
      const isActiveParam = req.query.is_active as string | undefined;
      const is_active = isActiveParam !== undefined ? isActiveParam === "true" : undefined;
      const search = req.query.search as string | undefined;

      if (role && !Object.values(UserRole).includes(role)) {
        res.status(400).json({ success: false, message: `Invalid role: ${role}` });
        return;
      }

      const result = await userService.findAll(page, limit, role, is_active, search);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const user = await userService.findById(id);
      res.status(200).json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = await validateDto(CreateUserDto, req.body);
      const user = await userService.create({ ...dto, createdBy: req.user?.id || "" });
      res.status(201).json({ success: true, data: user, message: "User created successfully" });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const dto = await validateDto(UpdateUserDto, req.body);

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const user = await userService.update(id, dto, { id: req.user.id, role: req.user.role });
      res.status(200).json({ success: true, data: user, message: "User updated successfully" });
    } catch (error) {
      next(error);
    }
  }

  async softDelete(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      await userService.softDelete(id, { id: req.user.id, role: req.user.role });
      res.status(200).json({ success: true, message: "User deleted successfully" });
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
