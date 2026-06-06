import { AppDataSource } from "../config/data-source";
import { PaidCustomer } from "../entities/PaidCustomer";
import { CustomerRequest } from "../entities/CustomerRequest";
import { PaymentProof } from "../entities/PaymentProof";
import { PaymentVerificationHistory } from "../entities/PaymentVerificationHistory";
import { MarketingClarificationResponse } from "../entities/MarketingClarificationResponse";
import { Notification } from "../entities/Notification";
import { User } from "../entities/User";
import { CustomerRequestStatus } from "../enums/customer-request-status.enum";
import { PaymentVerificationStatus } from "../enums/payment-verification-status.enum";
import { ReviewAction } from "../enums/review-action.enum";
import { UserRole } from "../enums/user-role.enum";
import { NotificationType } from "../enums/notification-type.enum";
import { AppError } from "../middlewares/error.middleware";
import { In } from "typeorm";

interface PaginatedParams {
  page: number;
  limit: number;
  payment_verification_status?: string;
  search?: string;
  sort?: string;
  userId: string;
  userRole: string;
}

interface ProofFile {
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
}

interface TransferParams {
  source_request_id: string;
  payment_note?: string;
}

interface VerifyParams {
  action: string;
  message?: string;
}

interface ClarifyParams {
  description: string;
  attachment_file_urls?: string[];
}

interface AuthUser {
  id: string;
  name: string;
  role: string;
}

export class PaidCustomerService {
  private repo = AppDataSource.getRepository(PaidCustomer);
  private customerRequestRepo = AppDataSource.getRepository(CustomerRequest);
  private paymentProofRepo = AppDataSource.getRepository(PaymentProof);
  private verificationHistoryRepo = AppDataSource.getRepository(PaymentVerificationHistory);
  private clarificationResponseRepo = AppDataSource.getRepository(MarketingClarificationResponse);
  private notificationRepo = AppDataSource.getRepository(Notification);
  private userRepo = AppDataSource.getRepository(User);

  async findAll(params: PaginatedParams) {
    const { page, limit, payment_verification_status, search, sort, userId, userRole } = params;

    const qb = this.repo.createQueryBuilder("pc")
      .leftJoinAndSelect("pc.source_request", "source_request")
      .leftJoinAndSelect("pc.transferrer", "transferrer")
      .leftJoinAndSelect("pc.verifier", "verifier");

    if (userRole === UserRole.MARKETING_LEAD) {
      qb.andWhere("pc.transferred_by = :userId", { userId });
    }

    if (payment_verification_status) {
      qb.andWhere("pc.payment_verification_status = :payment_verification_status", { payment_verification_status });
    }

    if (search) {
      qb.andWhere(
        "(pc.customer_name ILIKE :search OR pc.customer_phone ILIKE :search OR pc.service_description ILIKE :search)",
        { search: `%${search}%` }
      );
    }

    const allowedSortFields = ["customer_name", "payment_verification_status", "transferred_at", "created_at", "updated_at", "budget"];
    if (sort && allowedSortFields.includes(sort.replace("-", ""))) {
      const direction = sort.startsWith("-") ? "DESC" : "ASC";
      const field = sort.replace("-", "");
      qb.orderBy(`pc.${field}`, direction);
    } else {
      qb.orderBy("pc.created_at", "DESC");
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
    const paidCustomer = await this.repo.findOne({
      where: { id },
      relations: [
        "source_request",
        "transferrer",
        "verifier",
      ],
    });

    if (!paidCustomer) {
      throw new AppError(404, "Paid customer not found");
    }

    const proofOfPayment = await this.paymentProofRepo.find({
      where: { paid_customer_id: id },
      order: { uploaded_at: "ASC" },
    });

    const verificationHistory = await this.verificationHistoryRepo.find({
      where: { paid_customer_id: id },
      relations: ["reviewer"],
      order: { reviewed_at: "ASC" },
    });

    const clarificationResponses = await this.clarificationResponseRepo.find({
      where: { paid_customer_id: id },
      relations: ["responder"],
      order: { responded_at: "ASC" },
    });

    return {
      ...paidCustomer,
      proofOfPayment,
      verificationHistory,
      clarificationResponses,
    };
  }

  async transfer(
    params: TransferParams,
    proofFiles: ProofFile[],
    authUser: AuthUser
  ) {
    const sourceRequest = await this.customerRequestRepo.findOneBy({ id: params.source_request_id });
    if (!sourceRequest) {
      throw new AppError(404, "Source customer request not found");
    }

    if (sourceRequest.status === CustomerRequestStatus.CLOSED) {
      throw new AppError(409, "This customer request has already been closed");
    }

    const existingPaidCustomer = await this.repo.findOne({
      where: { source_request_id: params.source_request_id },
    });

    if (existingPaidCustomer) {
      throw new AppError(409, "This customer request has already been transferred");
    }

    if (authUser.role !== UserRole.CEO && proofFiles.length === 0) {
      throw new AppError(400, "At least one payment proof file is required");
    }

    sourceRequest.status = CustomerRequestStatus.CLOSED;
    await this.customerRequestRepo.save(sourceRequest);

    const paidCustomer = new PaidCustomer();
    paidCustomer.source_request_id = sourceRequest.id;
    paidCustomer.customer_name = sourceRequest.customer_name;
    paidCustomer.customer_phone = sourceRequest.customer_phone;
    paidCustomer.customer_email = sourceRequest.customer_email;
    paidCustomer.customer_address = sourceRequest.customer_address;
    paidCustomer.category = sourceRequest.category;
    paidCustomer.service_description = sourceRequest.service_description;
    paidCustomer.preferred_start_date = sourceRequest.preferred_start_date;
    paidCustomer.budget = sourceRequest.budget;
    paidCustomer.notes = sourceRequest.notes;
    paidCustomer.transferred_by = authUser.id;
    paidCustomer.transferred_by_name = authUser.name;
    paidCustomer.payment_note = params.payment_note ?? null as any;
    paidCustomer.payment_verification_status = PaymentVerificationStatus.PENDING;

    const savedPaidCustomer = await this.repo.save(paidCustomer);

    if (proofFiles.length > 0) {
      const proofEntities = proofFiles.map((file) => {
        const proof = new PaymentProof();
        proof.paid_customer_id = savedPaidCustomer.id;
        proof.file_url = file.file_url;
        proof.file_name = file.file_name;
        proof.file_type = file.file_type;
        proof.file_size = file.file_size;
        return proof;
      });
      await this.paymentProofRepo.save(proofEntities);
    }

    await this.createNotification(
      [UserRole.FINANCE_OFFICER, UserRole.CEO],
      {
        type: NotificationType.PAYMENT_SUBMITTED,
        title: "New Payment Submitted",
        body: `Payment submitted for customer "${savedPaidCustomer.customer_name}". Awaiting verification.`,
        entity_type: "paid_customer",
        entity_id: savedPaidCustomer.id,
      }
    );

    const proofRecords = await this.paymentProofRepo.find({
      where: { paid_customer_id: savedPaidCustomer.id },
      order: { uploaded_at: "ASC" },
    });

    return {
      ...savedPaidCustomer,
      proofOfPayment: proofRecords,
    };
  }

  async verify(id: string, params: VerifyParams, authUser: AuthUser) {
    const paidCustomer = await this.repo.findOneBy({ id });
    if (!paidCustomer) {
      throw new AppError(404, "Paid customer not found");
    }

    if (
      paidCustomer.payment_verification_status === PaymentVerificationStatus.APPROVED &&
      authUser.role !== UserRole.CEO
    ) {
      throw new AppError(403, "Only the CEO can change an already approved payment");
    }

    if (params.action === "reject" || params.action === "request_clarification") {
      if (!params.message || params.message.trim().length === 0) {
        throw new AppError(400, "A message is required for rejection or clarification requests");
      }
    }

    let newStatus: PaymentVerificationStatus;
    let reviewAction: ReviewAction;

    switch (params.action) {
      case "approve":
        newStatus = PaymentVerificationStatus.APPROVED;
        reviewAction = ReviewAction.APPROVED;
        break;
      case "reject":
        newStatus = PaymentVerificationStatus.REJECTED;
        reviewAction = ReviewAction.REJECTED;
        break;
      case "request_clarification":
        newStatus = PaymentVerificationStatus.REQUEST_CLARIFICATION;
        reviewAction = ReviewAction.REQUEST_CLARIFICATION;
        break;
      default:
        throw new AppError(400, "Invalid action. Must be: approve, reject, or request_clarification");
    }

    paidCustomer.payment_verification_status = newStatus;
    paidCustomer.payment_verification_message = params.message ?? null as any;
    paidCustomer.payment_verified_at = new Date();
    paidCustomer.payment_verified_by = authUser.id;
    paidCustomer.payment_verified_by_name = authUser.name;

    await this.repo.save(paidCustomer);

    const historyEntry = new PaymentVerificationHistory();
    historyEntry.paid_customer_id = paidCustomer.id;
    historyEntry.action = reviewAction;
    historyEntry.reviewer_id = authUser.id;
    historyEntry.reviewer_name = authUser.name;
    historyEntry.message = params.message ?? null as any;
    await this.verificationHistoryRepo.save(historyEntry);

    let notificationType: NotificationType;
    let notificationTitle: string;
    let notificationBody: string;
    let targetRoles: UserRole[];

    if (params.action === "request_clarification") {
      notificationType = NotificationType.PAYMENT_CLARIFICATION_REQUESTED;
      notificationTitle = "Payment Clarification Requested";
      notificationBody = `Clarification requested for payment by "${paidCustomer.customer_name}": ${params.message || ""}`;
      targetRoles = [UserRole.MARKETING_LEAD];
    } else {
      notificationType = NotificationType.PAYMENT_REVIEWED;
      notificationTitle = `Payment ${params.action === "approve" ? "Approved" : "Rejected"}`;
      notificationBody = `Payment for "${paidCustomer.customer_name}" has been ${params.action === "approve" ? "approved" : "rejected"}.${params.message ? ` Message: ${params.message}` : ""}`;
      targetRoles = [UserRole.MARKETING_LEAD, UserRole.CEO, UserRole.GENERAL_MANAGER];
    }

    await this.createNotification(targetRoles, {
      type: notificationType,
      title: notificationTitle,
      body: notificationBody,
      entity_type: "paid_customer",
      entity_id: paidCustomer.id,
    });

    return paidCustomer;
  }

  async clarify(id: string, params: ClarifyParams, authUser: AuthUser) {
    const paidCustomer = await this.repo.findOneBy({ id });
    if (!paidCustomer) {
      throw new AppError(404, "Paid customer not found");
    }

    if (paidCustomer.payment_verification_status !== PaymentVerificationStatus.REQUEST_CLARIFICATION) {
      throw new AppError(409, "Clarification responses are only allowed when status is 'request_clarification'");
    }

    const clarificationResponse = new MarketingClarificationResponse();
    clarificationResponse.paid_customer_id = paidCustomer.id;
    clarificationResponse.description = params.description;
    clarificationResponse.responded_by = authUser.id;
    clarificationResponse.responded_by_name = authUser.name;
    await this.clarificationResponseRepo.save(clarificationResponse);

    paidCustomer.payment_verification_status = PaymentVerificationStatus.PENDING;
    paidCustomer.payment_verification_message = null as any;
    paidCustomer.payment_verified_by_name = null as any;
    paidCustomer.payment_verified_by = null as any;
    paidCustomer.payment_verified_at = null as any;

    await this.repo.save(paidCustomer);

    await this.createNotification(
      [UserRole.FINANCE_OFFICER, UserRole.CEO],
      {
        type: NotificationType.PAYMENT_CLARIFICATION_RESPONDED,
        title: "Payment Clarification Responded",
        body: `Clarification provided for "${paidCustomer.customer_name}". Ready for re-verification.`,
        entity_type: "paid_customer",
        entity_id: paidCustomer.id,
      }
    );

    return {
      ...paidCustomer,
      clarificationResponse,
    };
  }

  async getVerificationHistory(id: string) {
    const paidCustomer = await this.repo.findOneBy({ id });
    if (!paidCustomer) {
      throw new AppError(404, "Paid customer not found");
    }

    const history = await this.verificationHistoryRepo.find({
      where: { paid_customer_id: id },
      relations: ["reviewer"],
      order: { reviewed_at: "ASC" },
    });

    return history;
  }

  async createNotification(
    roles: UserRole[],
    notificationData: {
      type: NotificationType;
      title: string;
      body?: string;
      entity_type?: string;
      entity_id?: string;
    }
  ) {
    const users = await this.userRepo.find({
      where: { role: In(roles), is_active: true },
    });

    if (users.length === 0) return;

    const notifications = users.map((user) => {
      const notification = new Notification();
      notification.user_id = user.id;
      notification.type = notificationData.type;
      notification.title = notificationData.title;
      notification.body = notificationData.body ?? null as any;
      notification.entity_type = notificationData.entity_type ?? null as any;
      notification.entity_id = notificationData.entity_id ?? null as any;
      notification.is_read = false;
      return notification;
    });

    await this.notificationRepo.save(notifications);
  }
}

export const paidCustomerService = new PaidCustomerService();
