import { AppDataSource } from "../config/data-source";
import { PaidCustomer } from "../entities/PaidCustomer";
import { Customer } from "../entities/Customer";
import { MarketingSubmission } from "../entities/MarketingSubmission";
import { MarketingReview } from "../entities/MarketingReview";
import { Notification } from "../entities/Notification";
import { User } from "../entities/User";
import { ReviewOutcome } from "../enums/review-outcome.enum";
import { UserRole } from "../enums/user-role.enum";
import { AppError } from "../middlewares/error.middleware";
import { In } from "typeorm";
import { pickSafeUserFields } from "../utils/response.utils";
import { syncAttachments } from "../utils/upload.utils";

interface PaginatedParams {
  page: number;
  limit: number;
  status?: string;
  search?: string;
}

interface CreateParams {
  customer_id: string;
  description: string;
  attachment_urls?: string[];
}

interface VerifyParams {
  review_outcome: ReviewOutcome;
  description?: string;
}

interface UpdateParams {
  description?: string;
  status?: ReviewOutcome;
  attachment_urls?: string[];
}

export class PaidCustomerService {
  private repo = AppDataSource.getRepository(PaidCustomer);
  private customerRepo = AppDataSource.getRepository(Customer);
  private submissionRepo = AppDataSource.getRepository(MarketingSubmission);
  private reviewRepo = AppDataSource.getRepository(MarketingReview);
  private notificationRepo = AppDataSource.getRepository(Notification);
  private userRepo = AppDataSource.getRepository(User);

  private async createNotifications(
    roles: UserRole[],
    fromUserId: string,
    resourceId: string,
    resourceType: string,
    parentId: string,
    parentType: string,
    typeLabel: string
  ) {
    const users = await this.userRepo.find({
      where: { role: In(roles), is_active: true },
    });

    const notifications = users.map((user) => {
      const n = new Notification();
      n.user_id = user.id;
      n.from_user_id = fromUserId;
      n.resource_id = resourceId;
      n.resource_type = resourceType as any;
      n.parent_id = parentId;
      n.parent_type = parentType as any;
      n.type = typeLabel;
      n.viewed = false;
      return n;
    });

    if (notifications.length > 0) {
      await this.notificationRepo.save(notifications);
    }
  }

  async findAll(params: PaginatedParams) {
    const { page, limit, status, search } = params;

    const qb = this.repo.createQueryBuilder("pc")
      .leftJoinAndSelect("pc.customer", "customer");

    if (status) {
      qb.andWhere("pc.status = :status", { status });
    }

    if (search) {
      qb.andWhere(
        "(customer.customer_name ILIKE :search OR customer.customer_phone ILIKE :search OR pc.description ILIKE :search)",
        { search: `%${search}%` }
      );
    }

    qb.orderBy("pc.created_at", "DESC");

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
    const paidCustomer = await this.repo.findOne({
      where: { id },
      relations: ["customer"],
    });

    if (!paidCustomer) {
      throw new AppError(404, "Paid customer not found");
    }

    return paidCustomer;
  }

  async create(params: CreateParams, userId: string) {
    const customer = await this.customerRepo.findOneBy({ id: params.customer_id });
    if (!customer) {
      throw new AppError(404, "Customer not found");
    }

    if (customer.paid) {
      throw new AppError(409, "Customer is already marked as paid");
    }

    const paidCustomer = new PaidCustomer();
    paidCustomer.customer_id = params.customer_id;
    paidCustomer.description = params.description;
    paidCustomer.status = ReviewOutcome.PENDING;
    paidCustomer.attachment_urls = params.attachment_urls ?? null as any;

    const saved = await this.repo.save(paidCustomer);

    customer.paid = true;
    await this.customerRepo.save(customer);

    await this.createNotifications(
      [UserRole.FINANCE, UserRole.CEO],
      userId,
      saved.id,
      "payment_submitted",
      customer.id,
      "customer",
      `Payment submitted for "${customer.customer_name}"`
    );

    return saved;
  }

  async verify(id: string, params: VerifyParams, userId: string) {
    const paidCustomer = await this.repo.findOne({
      where: { id },
      relations: ["customer"],
    });
    if (!paidCustomer) {
      throw new AppError(404, "Paid customer not found");
    }

    paidCustomer.status = params.review_outcome;
    await this.repo.save(paidCustomer);

    let submission = await this.submissionRepo.findOne({
      where: { paid_customer_id: id },
      order: { created_at: "DESC" },
    });

    if (!submission) {
      submission = new MarketingSubmission();
      submission.paid_customer_id = id;
      submission.description = "Verification submission";
      submission = await this.submissionRepo.save(submission);
    }

    const review = new MarketingReview();
    review.marketing_submission_id = submission.id;
    review.reviewer_user_id = userId;
    review.description = params.description ?? "Verification review";
    review.review_outcome = params.review_outcome;
    await this.reviewRepo.save(review);

    const customer = paidCustomer.customer;

    await this.createNotifications(
      [UserRole.MARKETING, UserRole.CEO],
      userId,
      paidCustomer.id,
      "payment_reviewed",
      customer?.id ?? paidCustomer.customer_id,
      "customer",
      `Payment ${params.review_outcome} for "${customer?.customer_name || "customer"}"`
    );

    return paidCustomer;
  }

  async clarify(id: string, params: { description: string; attachment_urls?: string[] }, userId: string) {
    const paidCustomer = await this.repo.findOne({
      where: { id },
      relations: ["customer"],
    });
    if (!paidCustomer) throw new AppError(404, "Paid customer not found");

    const submission = new MarketingSubmission();
    submission.paid_customer_id = id;
    submission.description = params.description;
    submission.attachment_urls = (params.attachment_urls ?? null) as any;
    const saved = await this.submissionRepo.save(submission);

    const customer = paidCustomer.customer;
    await this.createNotifications(
      [UserRole.MARKETING],
      userId,
      saved.id,
      "clarification_requested",
      customer?.id ?? paidCustomer.customer_id,
      "customer",
      `Clarification requested for "${customer?.customer_name || "customer"}"`
    );

    return saved;
  }

  async updateClarify(id: string, params: { description: string; attachment_urls?: string[] }, userId: string) {
    const paidCustomer = await this.repo.findOne({
      where: { id },
      relations: ["customer"],
    });
    if (!paidCustomer) throw new AppError(404, "Paid customer not found");

    const submission = new MarketingSubmission();
    submission.paid_customer_id = id;
    submission.description = params.description;
    submission.attachment_urls = (params.attachment_urls ?? null) as any;
    const saved = await this.submissionRepo.save(submission);

    const customer = paidCustomer.customer;
    await this.createNotifications(
      [UserRole.FINANCE, UserRole.CEO],
      userId,
      saved.id,
      "clarification_response",
      customer?.id ?? paidCustomer.customer_id,
      "customer",
      `Clarification response for "${customer?.customer_name || "customer"}"`
    );

    return saved;
  }

  async getVerificationHistory(id: string) {
    const paidCustomer = await this.repo.findOneBy({ id });
    if (!paidCustomer) {
      throw new AppError(404, "Paid customer not found");
    }

    const submissions = await this.submissionRepo.find({
      where: { paid_customer_id: id },
      order: { created_at: "ASC" },
    });

    const submissionIds = submissions.map((s) => s.id);

    if (submissionIds.length === 0) {
      return [];
    }

    const reviews = await this.reviewRepo.find({
      where: { marketing_submission_id: In(submissionIds) },
      relations: ["reviewer"],
      order: { created_at: "ASC" },
    });

    return reviews.map((r) => ({
      ...r,
      reviewer: pickSafeUserFields(r.reviewer as any),
    }));
  }

  async update(id: string, params: UpdateParams) {
    const paidCustomer = await this.repo.findOneBy({ id });
    if (!paidCustomer) {
      throw new AppError(404, "Paid customer not found");
    }

    if (params.description !== undefined) paidCustomer.description = params.description;
    if (params.status !== undefined) paidCustomer.status = params.status;
    if (params.attachment_urls !== undefined) {
      paidCustomer.attachment_urls = syncAttachments(paidCustomer.attachment_urls, params.attachment_urls) as any;
    }

    return this.repo.save(paidCustomer);
  }

  async createSubmission(paidCustomerId: string, description: string, attachmentUrls?: string[]) {
    const paidCustomer = await this.repo.findOneBy({ id: paidCustomerId });
    if (!paidCustomer) {
      throw new AppError(404, "Paid customer not found");
    }

    const submission = new MarketingSubmission();
    submission.paid_customer_id = paidCustomerId;
    submission.description = description;
    submission.attachment_urls = attachmentUrls ?? null as any;

    return this.submissionRepo.save(submission);
  }
}

export const paidCustomerService = new PaidCustomerService();
