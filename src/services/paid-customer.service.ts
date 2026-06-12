import { AppDataSource } from "../config/data-source";
import { PaidCustomer } from "../entities/PaidCustomer";
import { Customer } from "../entities/Customer";
import { MarketingSubmission } from "../entities/MarketingSubmission";
import { MarketingReview } from "../entities/MarketingReview";
import { PaidCustomerReview } from "../entities/PaidCustomerReview";
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
  private paidCustomerReviewRepo = AppDataSource.getRepository(PaidCustomerReview);
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
    customer.updated_at = new Date();
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

    paidCustomer.updated_at = new Date();

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

  async reviewByPaidCustomerId(
    paidCustomerId: string,
    params: { review_outcome: ReviewOutcome; description?: string },
    userId: string
  ) {
    const paidCustomer = await this.repo.findOne({
      where: { id: paidCustomerId },
      relations: ["customer"],
    });
    if (!paidCustomer) {
      throw new AppError(404, "Paid customer not found");
    }

    const review = new PaidCustomerReview();
    review.paid_customer_id = paidCustomerId;
    review.reviewer_user_id = userId;
    review.description = params.description ?? "Verification review";
    review.review_outcome = params.review_outcome;
    const savedReview = await this.paidCustomerReviewRepo.save(review);

    paidCustomer.status = params.review_outcome;
    paidCustomer.updated_at = new Date();
    await this.repo.save(paidCustomer);

    let submission = await this.submissionRepo.findOne({
      where: { paid_customer_id: paidCustomerId },
      order: { created_at: "DESC" },
    });

    if (!submission) {
      submission = new MarketingSubmission();
      submission.paid_customer_id = paidCustomerId;
      submission.description = "Verification submission";
      submission = await this.submissionRepo.save(submission);
    }

    savedReview.marketing_submission_id = submission.id;
    await this.paidCustomerReviewRepo.save(savedReview);

    const customer = paidCustomer.customer;

    await this.createNotifications(
      [UserRole.MARKETING, UserRole.CEO],
      userId,
      savedReview.id,
      "review",
      submission.id,
      "paid_customer_submission",
      `Payment ${params.review_outcome} for "${customer?.customer_name || "customer"}"`
    );

    return savedReview;
  }

  async reviewBySubmissionId(
    submissionId: string,
    params: { review_outcome: ReviewOutcome; description?: string },
    userId: string
  ) {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ["paid_customer", "paid_customer.customer"],
    });
    if (!submission) {
      throw new AppError(404, "Submission not found");
    }

    const review = new PaidCustomerReview();
    review.marketing_submission_id = submissionId;
    review.reviewer_user_id = userId;
    review.description = params.description ?? "Verification review";
    review.review_outcome = params.review_outcome;
    const savedReview = await this.paidCustomerReviewRepo.save(review);

    const paidCustomer = submission.paid_customer;
    if (paidCustomer) {
      paidCustomer.status = params.review_outcome;
      paidCustomer.updated_at = new Date();
      await this.repo.save(paidCustomer);
    }

    const customer = paidCustomer?.customer;

    await this.createNotifications(
      [UserRole.MARKETING, UserRole.CEO],
      userId,
      savedReview.id,
      "review",
      submission.id,
      "paid_customer_submission",
      `Payment ${params.review_outcome} for "${customer?.customer_name || "customer"}"`
    );

    return savedReview;
  }

  async getSubmissionReviews(submissionId: string) {
    const submission = await this.submissionRepo.findOneBy({ id: submissionId });
    if (!submission) throw new AppError(404, "Submission not found");

    const reviews = await this.paidCustomerReviewRepo.find({
      where: { marketing_submission_id: submissionId },
      relations: ["reviewer"],
      order: { created_at: "DESC" },
    });

    return reviews.map((r) => ({
      ...r,
      reviewer: pickSafeUserFields(r.reviewer),
    }));
  }

  async getSubmissionsWithReviews(paidCustomerId: string, userId: string) {
    const paidCustomer = await this.repo.findOne({
      where: { id: paidCustomerId },
      relations: ["customer"],
    });
    if (!paidCustomer) throw new AppError(404, "Paid customer not found");

    const submissions = await this.submissionRepo.find({
      where: { paid_customer_id: paidCustomerId },
    });

    const allReviews = submissions.length > 0
      ? await this.paidCustomerReviewRepo.find({
          where: submissions.map((s) => ({ marketing_submission_id: s.id } as any)),
          relations: ["reviewer"],
        })
      : [];

    const reviewsBySubmission: Record<string, PaidCustomerReview[]> = {};
    for (const r of allReviews) {
      if (!reviewsBySubmission[r.marketing_submission_id]) {
        reviewsBySubmission[r.marketing_submission_id] = [];
      }
      reviewsBySubmission[r.marketing_submission_id].push(r);
    }

    const relevantParentIds = [paidCustomerId, ...submissions.map((s) => s.id)];

    const unreadNotifications = await this.notificationRepo.find({
      where: {
        user_id: userId,
        parent_id: In(relevantParentIds),
        viewed: false,
      },
    });

    const notificationMap = new Map<string, string>();
    for (const n of unreadNotifications) {
      if (!notificationMap.has(n.resource_id)) {
        notificationMap.set(n.resource_id, n.id);
      }
    }

    const hasPaidCustomerNotification = notificationMap.has(paidCustomerId)
      ? { hasNotification: true, notificationId: notificationMap.get(paidCustomerId) }
      : { hasNotification: false, notificationId: null };

    const submissionsWithReviews = submissions.map((submission) => {
      const rawReviews = (reviewsBySubmission[submission.id] || []).map((r) => {
        const earliest = new Date(
          Math.min(
            r.created_at?.getTime() ?? r.updated_at?.getTime() ?? 0,
            r.updated_at?.getTime() ?? r.created_at?.getTime() ?? 0
          )
        );
        return { ...r, reviewer: pickSafeUserFields(r.reviewer), _sortTime: earliest };
      });

      rawReviews.sort((a, b) => a._sortTime.getTime() - b._sortTime.getTime());

      const reviews = rawReviews.map(({ _sortTime, ...r }) => {
        const hasNotif = notificationMap.has(r.id)
          ? { hasNotification: true, notificationId: notificationMap.get(r.id) }
          : { hasNotification: false, notificationId: null };
        return { ...r, ...hasNotif };
      });

      const earliestSubmission = new Date(
        Math.min(
          submission.created_at?.getTime() ?? submission.updated_at?.getTime() ?? 0,
          submission.updated_at?.getTime() ?? submission.created_at?.getTime() ?? 0
        )
      );

      const subNotif = notificationMap.has(submission.id)
        ? { hasNotification: true, notificationId: notificationMap.get(submission.id) }
        : { hasNotification: false, notificationId: null };

      return {
        ...submission,
        ...subNotif,
        reviews,
        _sortTime: earliestSubmission,
      };
    });

    submissionsWithReviews.sort((a, b) => a._sortTime.getTime() - b._sortTime.getTime());

    return {
      paidCustomerId,
      ...hasPaidCustomerNotification,
      submissions: submissionsWithReviews.map(({ _sortTime, ...rest }) => rest),
    };
  }
}

export const paidCustomerService = new PaidCustomerService();
