import { AppDataSource } from "../config/data-source";
import { QuantitySurveyorTask } from "../entities/QuantitySurveyorTask";
import { QuantitySurveyorSubmission } from "../entities/QuantitySurveyorSubmission";
import { QuantitySurveyorReview } from "../entities/QuantitySurveyorReview";
import { User } from "../entities/User";
import { Notification } from "../entities/Notification";
import { ReviewOutcome } from "../enums/review-outcome.enum";
import { SubmissionReviewStatus } from "../enums/submission-review-status.enum";
import { TaskState } from "../enums/task-state.enum";
import { UserRole } from "../enums/user-role.enum";
import { ResourceType } from "../enums/resource-type.enum";
import { ParentType } from "../enums/parent-type.enum";
import { AppError } from "../middlewares/error.middleware";

interface PaginatedParams {
  page: number;
  limit: number;
  status?: string;
  assignedTo?: string;
  search?: string;
  currentUser: { id: string; role: UserRole };
}

interface CreateTaskParams {
  title: string;
  description: string;
  assigned_to_user_id: string;
  due_date: string;
  attachment_urls?: string[];
}

interface UpdateTaskParams {
  title?: string;
  description?: string;
  status?: ReviewOutcome;
  due_date?: string;
  attachment_urls?: string[];
}

export class QuantitySurveyorService {
  private taskRepo = AppDataSource.getRepository(QuantitySurveyorTask);
  private submissionRepo = AppDataSource.getRepository(QuantitySurveyorSubmission);
  private reviewRepo = AppDataSource.getRepository(QuantitySurveyorReview);
  private userRepo = AppDataSource.getRepository(User);
  private notificationRepo = AppDataSource.getRepository(Notification);

  private async createNotification(params: {
    user_id: string;
    from_user_id: string;
    resource_id: string;
    resource_type: ResourceType;
    parent_id: string;
    parent_type: ParentType;
    type: string;
  }) {
    const n = new Notification();
    n.user_id = params.user_id;
    n.from_user_id = params.from_user_id;
    n.resource_id = params.resource_id;
    n.resource_type = params.resource_type;
    n.parent_id = params.parent_id;
    n.parent_type = params.parent_type;
    n.type = params.type;
    n.viewed = false;
    return this.notificationRepo.save(n);
  }

  async findAllTasks(params: PaginatedParams) {
    const { page, limit, status, assignedTo, search, currentUser } = params;

    const qb = this.taskRepo.createQueryBuilder("t")
      .leftJoinAndSelect("t.assigned_to_user", "assigned_to_user")
      .leftJoinAndSelect("t.assigned_by_user", "assigned_by_user");

    const isQS = currentUser.role === UserRole.QUANTITY_SURVEYOR;
    if (isQS) {
      qb.andWhere("t.assigned_to_user_id = :userId", { userId: currentUser.id });
    }

    if (status) qb.andWhere("t.status = :status", { status });
    if (assignedTo) qb.andWhere("t.assigned_to_user_id = :assignedTo", { assignedTo });

    if (search) {
      qb.andWhere("(t.title ILIKE :search OR t.description ILIKE :search)", {
        search: `%${search}%`,
      });
    }

    qb.orderBy("t.created_at", "DESC");

    const skip = (page - 1) * limit;
    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      success: true,
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findTaskById(id: string) {
    const task = await this.taskRepo.findOne({
      where: { id },
      relations: ["assigned_to_user", "assigned_by_user"],
    });
    if (!task) throw new AppError(404, "Quantity surveyor task not found");

    const submissions = await this.submissionRepo.find({
      where: { quantity_surveyor_task_id: id },
      order: { created_at: "DESC" },
    });

    return { ...task, submissions };
  }

  async createTask(params: CreateTaskParams, assignedByUserId: string) {
    const task = new QuantitySurveyorTask();
    task.title = params.title;
    task.description = params.description;
    task.assigned_by_user_id = assignedByUserId;
    task.assigned_to_user_id = params.assigned_to_user_id;
    task.due_date = params.due_date;
    task.status = ReviewOutcome.PENDING;
    task.task_state = TaskState.ACTIVE;
    task.attachment_urls = (params.attachment_urls ?? null) as any;

    const saved = await this.taskRepo.save(task);

    await this.createNotification({
      user_id: saved.assigned_to_user_id,
      from_user_id: assignedByUserId,
      resource_id: saved.id,
      resource_type: ResourceType.TASK_ASSIGNED,
      parent_id: saved.id,
      parent_type: ParentType.QUANTITY_SURVEYOR_TASK,
      type: "New quantity surveyor task assigned",
    });

    return saved;
  }

  async updateTask(id: string, params: UpdateTaskParams) {
    const task = await this.taskRepo.findOneBy({ id });
    if (!task) throw new AppError(404, "Quantity surveyor task not found");

    if (params.title !== undefined) task.title = params.title;
    if (params.description !== undefined) task.description = params.description;
    if (params.status !== undefined) task.status = params.status;
    if (params.due_date !== undefined) task.due_date = params.due_date;
    if (params.attachment_urls !== undefined) task.attachment_urls = params.attachment_urls as any;

    return this.taskRepo.save(task);
  }

  async createSubmission(taskId: string, description: string, userId: string, attachmentUrls?: string[]) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Quantity surveyor task not found");

    if (task.task_state !== TaskState.ACTIVE) {
      throw new AppError(400, "Cannot submit to a deactive task");
    }

    const submission = new QuantitySurveyorSubmission();
    submission.quantity_surveyor_task_id = taskId;
    submission.description = description;
    submission.attachment_urls = attachmentUrls ?? null as any;
    submission.review_status = SubmissionReviewStatus.PENDING_REVIEW;

    const saved = await this.submissionRepo.save(submission);

    const ceoGm = await this.userRepo.find({
      where: [
        { role: UserRole.CEO, is_active: true },
        { role: UserRole.GENERAL_MANAGER, is_active: true },
      ],
    });

    for (const user of ceoGm) {
      await this.createNotification({
        user_id: user.id,
        from_user_id: userId,
        resource_id: saved.id,
        resource_type: ResourceType.SUBMISSION,
        parent_id: taskId,
        parent_type: ParentType.QUANTITY_SURVEYOR_TASK,
        type: "New quantity surveyor submission",
      });
    }

    return saved;
  }

  async getSubmissions(taskId: string) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Quantity surveyor task not found");

    return this.submissionRepo.find({
      where: { quantity_surveyor_task_id: taskId },
      order: { created_at: "DESC" },
    });
  }

  async createReview(
    submissionId: string,
    reviewerUserId: string,
    reviewOutcome: ReviewOutcome,
    description: string
  ) {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ["quantity_surveyor_task"],
    });
    if (!submission) throw new AppError(404, "Quantity surveyor submission not found");

    const review = new QuantitySurveyorReview();
    review.quantity_surveyor_submission_id = submissionId;
    review.reviewer_user_id = reviewerUserId;
    review.review_outcome = reviewOutcome;
    review.description = description;

    const saved = await this.reviewRepo.save(review);

    const task = submission.quantity_surveyor_task;
    if (task) {
      task.status = reviewOutcome;
      await this.taskRepo.save(task);
    }

    submission.review_status = reviewOutcome === ReviewOutcome.APPROVED
      ? SubmissionReviewStatus.APPROVED
      : SubmissionReviewStatus.REVISION_REQUIRED;
    await this.submissionRepo.save(submission);

    if (task?.assigned_to_user_id) {
      await this.createNotification({
        user_id: task.assigned_to_user_id,
        from_user_id: reviewerUserId,
        resource_id: saved.id,
        resource_type: ResourceType.REVIEW,
        parent_id: task.id,
        parent_type: ParentType.QUANTITY_SURVEYOR_TASK,
        type: `Your submission was ${reviewOutcome}`,
      });
    }

    return saved;
  }

  async getReviews(submissionId: string) {
    const submission = await this.submissionRepo.findOneBy({ id: submissionId });
    if (!submission) throw new AppError(404, "Quantity surveyor submission not found");

    return this.reviewRepo.find({
      where: { quantity_surveyor_submission_id: submissionId },
      relations: ["reviewer_user"],
      order: { created_at: "DESC" },
    });
  }

  async evaluate(
    taskId: string,
    params: { description: string; review_outcome: string; attachment_urls?: string[] },
    userId: string
  ) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Quantity surveyor task not found");

    const submission = new QuantitySurveyorSubmission();
    submission.quantity_surveyor_task_id = taskId;
    submission.description = params.description;
    submission.attachment_urls = (params.attachment_urls ?? null) as any;
    submission.review_status = SubmissionReviewStatus.PENDING_REVIEW;
    const savedSubmission = await this.submissionRepo.save(submission);

    const review = new QuantitySurveyorReview();
    review.quantity_surveyor_submission_id = savedSubmission.id;
    review.reviewer_user_id = userId;
    review.review_outcome = params.review_outcome as any;
    review.description = params.description;
    await this.reviewRepo.save(review);

    return savedSubmission;
  }

  async updateEvaluate(
    taskId: string,
    params: { description?: string; review_outcome?: string; attachment_urls?: string[] },
    userId: string
  ) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Quantity surveyor task not found");

    const submission = new QuantitySurveyorSubmission();
    submission.quantity_surveyor_task_id = taskId;
    submission.description = params.description || "Evaluation update";
    submission.attachment_urls = (params.attachment_urls ?? null) as any;
    submission.review_status = SubmissionReviewStatus.PENDING_REVIEW;
    const savedSubmission = await this.submissionRepo.save(submission);

    if (params.review_outcome) {
      const review = new QuantitySurveyorReview();
      review.quantity_surveyor_submission_id = savedSubmission.id;
      review.reviewer_user_id = userId;
      review.review_outcome = params.review_outcome as any;
      review.description = params.description || "Evaluation update";
      await this.reviewRepo.save(review);
    }

    return savedSubmission;
  }

  async decide(evaluationId: string, decision: string, description?: string, userId?: string) {
    const submission = await this.submissionRepo.findOneBy({ id: evaluationId });
    if (!submission) throw new AppError(404, "Evaluation not found");

    const review = new QuantitySurveyorReview();
    review.quantity_surveyor_submission_id = evaluationId;
    review.reviewer_user_id = userId || "system";
    review.review_outcome = decision as any;
    review.description = description || `Decision: ${decision}`;
    await this.reviewRepo.save(review);

    if (decision === "APPROVED" || decision === "approved") {
      const task = await this.taskRepo.findOneBy({ id: submission.quantity_surveyor_task_id });
      if (task) {
        task.status = ReviewOutcome.APPROVED;
        await this.taskRepo.save(task);
      }
    }

    return submission;
  }
}

export const quantitySurveyorService = new QuantitySurveyorService();
