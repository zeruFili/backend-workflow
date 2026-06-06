import { AppDataSource } from "../config/data-source";
import { CustomerRequest } from "../entities/CustomerRequest";
import { PaidCustomer } from "../entities/PaidCustomer";
import { CustomerRequestStatus } from "../enums/customer-request-status.enum";
import { CustomerRequestCategory } from "../enums/customer-request-category.enum";
import { UserRole } from "../enums/user-role.enum";
import { AppError } from "../middlewares/error.middleware";

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

interface PaginatedParams {
  page: number;
  limit: number;
  status?: string;
  category?: string;
  search?: string;
  sort?: string;
  userId: string;
  userRole: string;
}

interface CreateParams {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  customer_address: string;
  category: CustomerRequestCategory;
  service_description: string;
  preferred_start_date?: string;
  budget?: number;
  notes?: string;
}

interface UpdateParams {
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  category?: CustomerRequestCategory;
  service_description?: string;
  preferred_start_date?: string;
  budget?: number;
  notes?: string;
}

interface AuthUser {
  id: string;
  name: string;
  role: string;
}

export class CustomerRequestService {
  private repo = AppDataSource.getRepository(CustomerRequest);
  private paidCustomerRepo = AppDataSource.getRepository(PaidCustomer);

  async findAll(params: PaginatedParams) {
    const { page, limit, status, category, search, sort, userId, userRole } = params;

    const qb = this.repo.createQueryBuilder("cr")
      .leftJoinAndSelect("cr.creator", "creator");

    if (userRole === UserRole.MARKETING_LEAD) {
      qb.andWhere("cr.created_by = :userId", { userId });
    }

    if (status) {
      qb.andWhere("cr.status = :status", { status });
    }
    if (category) {
      qb.andWhere("cr.category = :category", { category });
    }
    if (search) {
      qb.andWhere(
        "(cr.customer_name ILIKE :search OR cr.customer_phone ILIKE :search OR cr.service_description ILIKE :search)",
        { search: `%${search}%` }
      );
    }

    const allowedSortFields = ["customer_name", "category", "status", "created_at", "updated_at", "budget"];
    if (sort && allowedSortFields.includes(sort.replace("-", ""))) {
      const direction = sort.startsWith("-") ? "DESC" : "ASC";
      const field = sort.replace("-", "");
      qb.orderBy(`cr.${field}`, direction);
    } else {
      qb.orderBy("cr.created_at", "DESC");
    }

    const skip = (page - 1) * limit;
    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string) {
    const request = await this.repo.findOne({
      where: { id },
      relations: ["creator"],
    });
    if (!request) {
      throw new AppError(404, "Customer request not found");
    }
    return request;
  }

  async create(params: CreateParams, authUser: AuthUser) {
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

    const request = new CustomerRequest();
    request.customer_name = params.customer_name;
    request.customer_phone = params.customer_phone;
    request.customer_email = params.customer_email ?? null as any;
    request.customer_address = params.customer_address;
    request.category = params.category;
    request.service_description = params.service_description;
    request.preferred_start_date = params.preferred_start_date ?? null as any;
    request.budget = params.budget ?? null as any;
    request.notes = params.notes ?? null as any;
    request.status = CustomerRequestStatus.NEW;
    request.created_by = authUser.id;
    request.created_by_name = authUser.name;

    return this.repo.save(request);
  }

  async update(id: string, params: UpdateParams, authUser: AuthUser) {
    const request = await this.repo.findOneBy({ id });
    if (!request) {
      throw new AppError(404, "Customer request not found");
    }

    if (request.status === CustomerRequestStatus.SCHEDULED || request.status === CustomerRequestStatus.CLOSED) {
      throw new AppError(409, "Cannot update a request that is scheduled or closed");
    }

    if (request.created_by !== authUser.id && authUser.role !== UserRole.CEO) {
      throw new AppError(403, "Only the creator or CEO can update this request");
    }

    if (params.customer_phone !== undefined) {
      if (!E164_REGEX.test(params.customer_phone)) {
        throw new AppError(400, "Phone number must be in E.164 format (e.g., +251911234567)");
      }
      request.customer_phone = params.customer_phone;
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
      request.preferred_start_date = params.preferred_start_date;
    }

    let budgetFlagged = false;
    if (params.budget !== undefined) {
      if (request.budget != null && request.budget > 0) {
        const change = Math.abs(params.budget - request.budget) / request.budget;
        if (change > 0.5) {
          budgetFlagged = true;
        }
      }
      request.budget = params.budget;
    }

    if (params.customer_name !== undefined) request.customer_name = params.customer_name;
    if (params.customer_email !== undefined) request.customer_email = params.customer_email || null as any;
    if (params.customer_address !== undefined) request.customer_address = params.customer_address;
    if (params.category !== undefined) request.category = params.category;
    if (params.service_description !== undefined) request.service_description = params.service_description;
    if (params.notes !== undefined) request.notes = params.notes;

    const saved = await this.repo.save(request);
    return { ...saved, budgetFlagged };
  }

  async delete(id: string, authUser: AuthUser, force = false) {
    const request = await this.repo.findOneBy({ id });
    if (!request) {
      throw new AppError(404, "Customer request not found");
    }

    const paidCustomer = await this.paidCustomerRepo.findOne({
      where: { source_request_id: id },
    });

    if (paidCustomer) {
      if (!force) {
        throw new AppError(409, "Cannot delete a request that has been transferred to a paid customer");
      }
      if (authUser.role !== UserRole.CEO) {
        throw new AppError(403, "Only the CEO can force-delete a transferred request");
      }
      await this.paidCustomerRepo.remove(paidCustomer);
    }

    await this.repo.remove(request);
  }
}

export const customerRequestService = new CustomerRequestService();
