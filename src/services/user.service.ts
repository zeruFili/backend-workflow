import { FindOptionsWhere, ILike, In } from "typeorm";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { RefreshToken } from "../entities/RefreshToken";
import { UserRole } from "../enums/user-role.enum";
import { AppError } from "../middlewares/error.middleware";

interface UserFilters {
  page?: number;
  limit?: number;
  username?: string;
  name?: string;
  email?: string;
  role?: UserRole;
  is_active?: boolean;
}

interface PaginatedUsers {
  data: Partial<User>[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface CreateUserInput {
  username: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
}

interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: UserRole;
  phone?: string;
  password?: string;
  is_active?: boolean;
}

const userRepo = () => AppDataSource.getRepository(User);
const refreshTokenRepo = () => AppDataSource.getRepository(RefreshToken);

function sanitizeUser(user: User): Partial<User> {
  const { password_hash, ...rest } = user;
  return rest;
}

export class UserService {
  async findAll(filters: UserFilters): Promise<PaginatedUsers> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const where: FindOptionsWhere<User>[] = [];
    const conditions: FindOptionsWhere<User> = {};

    if (filters.username) {
      conditions.username = ILike(`%${filters.username}%`);
    }
    if (filters.name) {
      conditions.name = ILike(`%${filters.name}%`);
    }
    if (filters.email) {
      conditions.email = ILike(`%${filters.email}%`);
    }
    if (filters.role) {
      conditions.role = filters.role;
    }
    if (filters.is_active !== undefined) {
      conditions.is_active = filters.is_active;
    }

    where.push(conditions);

    const [users, total] = await userRepo().findAndCount({
      where,
      order: { created_at: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: users.map(sanitizeUser),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string): Promise<Partial<User>> {
    const user = await userRepo().findOne({ where: { id } });
    if (!user) {
      throw new AppError(404, "User not found");
    }
    return sanitizeUser(user);
  }

  async create(dto: CreateUserInput): Promise<Partial<User>> {
    if (dto.role === UserRole.CEO) {
      throw new AppError(400, "Cannot create a user with CEO role");
    }

    const existingUsername = await userRepo().findOne({ where: { username: dto.username } });
    if (existingUsername) {
      throw new AppError(409, "Username already exists");
    }

    const existingEmail = await userRepo().findOne({ where: { email: dto.email } });
    if (existingEmail) {
      throw new AppError(409, "Email already exists");
    }

    const password_hash = await bcrypt.hash(dto.password, 12);

    const user = userRepo().create({
      username: dto.username,
      name: dto.name,
      email: dto.email,
      password_hash,
      role: dto.role,
      phone: dto.phone,
      force_password_change: true,
      is_active: true,
    });

    const saved = await userRepo().save(user);
    return sanitizeUser(saved);
  }

  async update(
    id: string,
    dto: UpdateUserInput,
    currentUser: { id: string; role: UserRole }
  ): Promise<Partial<User>> {
    const user = await userRepo().findOne({ where: { id } });
    if (!user) {
      throw new AppError(404, "User not found");
    }

    const isSelf = id === currentUser.id;

    if (dto.role !== undefined && isSelf) {
      throw new AppError(403, "Cannot change your own role");
    }

    if (dto.is_active !== undefined && isSelf) {
      throw new AppError(403, "Cannot change your own active status");
    }

    if (dto.email && dto.email !== user.email) {
      const existingEmail = await userRepo().findOne({ where: { email: dto.email } });
      if (existingEmail) {
        throw new AppError(409, "Email already exists");
      }
      user.email = dto.email;
    }

    if (dto.name !== undefined) {
      user.name = dto.name;
    }

    if (dto.role !== undefined) {
      user.role = dto.role;
    }

    if (dto.phone !== undefined) {
      user.phone = dto.phone;
    }

    if (dto.password) {
      user.password_hash = await bcrypt.hash(dto.password, 12);
      user.force_password_change = true;
    }

    if (dto.is_active !== undefined) {
      user.is_active = dto.is_active;
    }

    const saved = await userRepo().save(user);
    return sanitizeUser(saved);
  }

  async softDelete(
    id: string,
    currentUser: { id: string; role: UserRole }
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

    await refreshTokenRepo().update(
      { user_id: id, revoked: false },
      { revoked: true }
    );
  }
}

export const userService = new UserService();
