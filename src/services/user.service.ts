import { FindOptionsWhere, ILike } from "typeorm";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { UserRole } from "../enums/user-role.enum";
import { AppError } from "../middlewares/error.middleware";
import { pickSafeUserFields, pickCeoUserFields, SafeUserOutput, CeoUserOutput } from "../utils/response.utils";

interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface CreateUserInput {
  full_name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
  createdBy: string;
}

interface UpdateUserInput {
  full_name?: string;
  email?: string;
  role?: UserRole;
  phone?: string;
  password?: string;
  is_active?: boolean;
}

interface UpdateUserStatusInput {
  is_active: boolean;
  role?: UserRole;
}

interface CurrentUser {
  id: string;
  role: UserRole;
}

const userRepo = () => AppDataSource.getRepository(User);
const parsedBcryptCost = Number(process.env.BCRYPT_COST);
const BCRYPT_COST = Number.isFinite(parsedBcryptCost) && parsedBcryptCost > 0 ? parsedBcryptCost : 12;

function sanitizeUser(user: User): SafeUserOutput {
  return pickSafeUserFields(user)!;
}

export class UserService {
  async findAll(
    page: number = 1,
    limit: number = 20,
    role?: UserRole,
    is_active?: boolean,
    search?: string
  ): Promise<PaginatedResult<CeoUserOutput>> {
    const p = Math.max(1, page);
    const l = Math.min(100, Math.max(1, limit));
    const where: FindOptionsWhere<User> = {};

    if (role) {
      where.role = role;
      where.is_active = true;
    } else if (is_active !== undefined) {
      where.is_active = is_active;
    }

    const whereConditions: FindOptionsWhere<User>[] = [];

    if (search) {
      whereConditions.push(
        { ...where, email: ILike(`%${search}%`) },
        { ...where, full_name: ILike(`%${search}%`) }
      );
    } else {
      whereConditions.push(where);
    }

    const [users, total] = await userRepo().findAndCount({
      where: whereConditions,
      order: { created_at: "DESC" },
      skip: (p - 1) * l,
      take: l,
    });

    return {
      data: users.map((u) => pickCeoUserFields(u)!),
      meta: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
      },
    };
  }

  async findById(id: string): Promise<SafeUserOutput> {
    const user = await userRepo().findOne({ where: { id } });
    if (!user) {
      throw new AppError(404, "User not found");
    }
    return sanitizeUser(user);
  }

  async create(dto: CreateUserInput): Promise<SafeUserOutput> {
    if (dto.role === UserRole.CEO) {
      throw new AppError(400, "Cannot create a user with CEO role");
    }

    const existingEmail = await userRepo().findOne({ where: { email: dto.email } });
    if (existingEmail) {
      throw new AppError(409, "Email already exists");
    }

    const password_hash = await bcrypt.hash(dto.password, BCRYPT_COST);

    const user = userRepo().create({
      full_name: dto.full_name,
      email: dto.email,
      password_hash,
      role: dto.role,
      phone: (dto.phone || undefined) as any,
      is_active: true,
      created_by: dto.createdBy,
    });

    const saved = await userRepo().save(user);
    return sanitizeUser(saved);
  }

  async update(
    id: string,
    dto: UpdateUserInput,
    currentUser: CurrentUser
  ): Promise<SafeUserOutput> {
    const user = await userRepo().findOne({ where: { id } });
    if (!user) {
      throw new AppError(404, "User not found");
    }

    const isSelf = id === currentUser.id;

    if (dto.role !== undefined && isSelf) {
      throw new AppError(403, "Cannot change your own role");
    }

    if (dto.is_active === false && isSelf) {
      throw new AppError(403, "Cannot deactivate your own account");
    }

    if (dto.email && dto.email !== user.email) {
      const existingEmail = await userRepo().findOne({ where: { email: dto.email } });
      if (existingEmail) {
        throw new AppError(409, "Email already exists");
      }
      user.email = dto.email;
    }

    if (dto.full_name !== undefined) {
      user.full_name = dto.full_name;
    }

    if (dto.role !== undefined) {
      user.role = dto.role;
    }

    if (dto.phone !== undefined) {
      user.phone = dto.phone;
    }

    if (dto.password) {
      user.password_hash = await bcrypt.hash(dto.password, BCRYPT_COST);
    }

    if (dto.is_active !== undefined) {
      user.is_active = dto.is_active;
    }

    const saved = await userRepo().save(user);
    return sanitizeUser(saved);
  }

  async softDelete(
    id: string,
    currentUser: CurrentUser
  ): Promise<void> {
    if (id === currentUser.id) {
      throw new AppError(403, "Cannot delete your own account");
    }

    const user = await userRepo().findOne({ where: { id } });
    if (!user) {
      throw new AppError(404, "User not found");
    }

    user.is_active = false;
    await userRepo().save(user);
  }

  async updateStatus(
    id: string,
    dto: UpdateUserStatusInput,
    currentUser: CurrentUser
  ): Promise<SafeUserOutput> {
    const user = await userRepo().findOne({ where: { id } });
    if (!user) {
      throw new AppError(404, "User not found");
    }

    const isSelf = id === currentUser.id;

    if (dto.is_active === false && isSelf) {
      throw new AppError(403, "Cannot deactivate your own account");
    }

    if (dto.role !== undefined && isSelf) {
      throw new AppError(403, "Cannot change your own role");
    }

    user.is_active = dto.is_active;

    if (dto.role !== undefined) {
      user.role = dto.role;
    }

    const saved = await userRepo().save(user);
    return sanitizeUser(saved);
  }
}

export const userService = new UserService();
