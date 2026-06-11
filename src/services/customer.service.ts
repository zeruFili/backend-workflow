import { AppDataSource } from "../config/data-source";
import { Customer } from "../entities/Customer";
import { UserRole } from "../enums/user-role.enum";
import { AppError } from "../middlewares/error.middleware";
import { pickSafeUserFields } from "../utils/response.utils";

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

interface PaginatedParams {
  page: number;
  limit: number;
  category?: string;
  paid?: boolean;
  search?: string;
  sortBy?: string;
  order?: string;
  userId: string;
  userRole: string;
}

interface CreateParams {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  customer_address: string;
  category: string;
  service_description: string;
  preferred_start_date?: string;
  budget?: number;
  notes?: string;
  status?: string;
}

interface UpdateParams {
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  category?: string;
  service_description?: string;
  preferred_start_date?: string;
  budget?: number;
  notes?: string;
  status?: string;
}

export class CustomerService {
  private repo = AppDataSource.getRepository(Customer);

  async findAll(params: PaginatedParams) {
    const { page, limit, category, paid, search, sortBy, order, userId, userRole } = params;

    const qb = this.repo.createQueryBuilder("c")
      .leftJoinAndSelect("c.marketing_user", "marketing_user");

    if (userRole !== UserRole.CEO) {
      qb.andWhere("c.marketing_user_id = :userId", { userId });
    }

    if (category) {
      qb.andWhere("c.category = :category", { category });
    }
    if (paid !== undefined) {
      qb.andWhere("c.paid = :paid", { paid });
    }
    if (search) {
      qb.andWhere(
        "(c.customer_name ILIKE :search OR c.customer_phone ILIKE :search OR c.service_description ILIKE :search)",
        { search: `%${search}%` }
      );
    }

    const sortColumn = sortBy === "customerName" ? "c.customer_name" : "c.created_at";
    const sortOrder = order === "asc" ? "ASC" : "DESC";
    qb.orderBy(sortColumn, sortOrder);

    const skip = (page - 1) * limit;
    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    const sanitized = data.map((c) => ({
      ...c,
      marketing_user: pickSafeUserFields(c.marketing_user),
    }));

    return {
      data: sanitized,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string) {
    const customer = await this.repo.findOne({
      where: { id },
      relations: ["marketing_user"],
    });
    if (!customer) {
      throw new AppError(404, "Customer not found");
    }
    return {
      ...customer,
      marketing_user: pickSafeUserFields(customer.marketing_user),
    };
  }

  async create(params: CreateParams, userId: string) {
    if (!E164_REGEX.test(params.customer_phone)) {
      throw new AppError(400, "Phone number must be in E.164 format (e.g., +251911234567)");
    }

    if (params.preferred_start_date) {
      const date = new Date(params.preferred_start_date);
      if (isNaN(date.getTime())) {
        throw new AppError(400, "Invalid preferred start date");
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (date < today) {
        throw new AppError(400, "Preferred start date cannot be in the past");
      }
    }

    const customer = new Customer();
    customer.marketing_user_id = userId;
    customer.customer_name = params.customer_name;
    customer.customer_phone = params.customer_phone;
    customer.customer_email = params.customer_email ?? null as any;
    customer.customer_address = params.customer_address;
    customer.category = params.category;
    customer.service_description = params.service_description;
    customer.preferred_start_date = params.preferred_start_date ?? null as any;
    customer.budget = params.budget ?? null as any;
    customer.notes = params.notes ?? null as any;
    customer.paid = false;
    customer.status = "new";

    return this.repo.save(customer);
  }

  async update(id: string, params: UpdateParams, userId: string, userRole: string) {
    const customer = await this.repo.findOneBy({ id });
    if (!customer) {
      throw new AppError(404, "Customer not found");
    }

    if (customer.paid) {
      throw new AppError(409, "Cannot update a paid customer request");
    }

    if (customer.marketing_user_id !== userId && userRole !== UserRole.CEO) {
      throw new AppError(403, "Only the creator or CEO can update this customer");
    }

    if (params.customer_phone !== undefined) {
      if (!E164_REGEX.test(params.customer_phone)) {
        throw new AppError(400, "Phone number must be in E.164 format (e.g., +251911234567)");
      }
      customer.customer_phone = params.customer_phone;
    }

    if (params.preferred_start_date !== undefined) {
      const date = new Date(params.preferred_start_date);
      if (isNaN(date.getTime())) {
        throw new AppError(400, "Invalid preferred start date");
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (date < today) {
        throw new AppError(400, "Preferred start date cannot be in the past");
      }
      customer.preferred_start_date = params.preferred_start_date;
    }

    if (params.customer_name !== undefined) customer.customer_name = params.customer_name;
    if (params.customer_email !== undefined) customer.customer_email = params.customer_email || null as any;
    if (params.customer_address !== undefined) customer.customer_address = params.customer_address;
    if (params.category !== undefined) customer.category = params.category;
    if (params.service_description !== undefined) customer.service_description = params.service_description;
    if (params.budget !== undefined) customer.budget = params.budget;
    if (params.notes !== undefined) customer.notes = params.notes;
    if (params.status !== undefined) customer.status = params.status;

    return this.repo.save(customer);
  }

  async markAsPaid(id: string, userId: string, userRole: string) {
    const customer = await this.repo.findOneBy({ id });
    if (!customer) {
      throw new AppError(404, "Customer not found");
    }

    if (customer.marketing_user_id !== userId && userRole !== UserRole.CEO) {
      throw new AppError(403, "Only the creator or CEO can mark this customer as paid");
    }

    if (customer.paid) {
      throw new AppError(409, "Customer is already marked as paid");
    }

    customer.paid = true;
    customer.status = "paid";
    return this.repo.save(customer);
  }

  async delete(id: string, userId: string, userRole: string) {
    const customer = await this.repo.findOneBy({ id });
    if (!customer) {
      throw new AppError(404, "Customer not found");
    }

    if (customer.paid) {
      throw new AppError(409, "Cannot delete a paid customer request");
    }

    if (customer.marketing_user_id !== userId && userRole !== UserRole.CEO) {
      throw new AppError(403, "Only the creator or CEO can delete this customer");
    }

    await this.repo.remove(customer);
  }
}

export const customerService = new CustomerService();
