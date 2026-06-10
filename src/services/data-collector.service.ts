import { AppDataSource } from "../config/data-source";
import { DataCollectorTask } from "../entities/DataCollectorTask";
import { DataCollectorSubmission } from "../entities/DataCollectorSubmission";
import { DataCollectorReview } from "../entities/DataCollectorReview";
import { User } from "../entities/User";
import { Notification } from "../entities/Notification";
import { DataCollectorTaskStatus } from "../enums/data-collector-task-status.enum";
import { TaskState } from "../enums/task-state.enum";
import { ReviewOutcome } from "../enums/review-outcome.enum";
import { UserRole } from "../enums/user-role.enum";
import { ResourceType } from "../enums/resource-type.enum";
import { ParentType } from "../enums/parent-type.enum";
import { AppError } from "../middlewares/error.middleware";
import { pickSafeUserFields } from "../utils/response.utils";
import { syncAttachments } from "../utils/upload.utils";

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
  assigned_to_user_id?: string;
  due_date?: string;
  attachment_urls?: string[];
}

interface UpdateTaskParams {
  title?: string;
  description?: string;
  status?: DataCollectorTaskStatus;
  task_state?: TaskState;
  due_date?: string;
  assigned_to_user_id?: string;
  attachment_urls?: string[];
}

export class DataCollectorService {
  private taskRepo = AppDataSource.getRepository(DataCollectorTask);
  private submissionRepo = AppDataSource.getRepository(DataCollectorSubmission);
  private reviewRepo = AppDataSource.getRepository(DataCollectorReview);
  private userRepo = AppDataSource.getRepository(User);
  private notificationRepo = AppDataSource.getRepository(Notification);

  private sanitizeTask(task: any) {
    return {
      ...task,
      assigned_to_user: pickSafeUserFields(task.assigned_to_user),
      assigned_by_user: pickSafeUserFields(task.assigned_by_user),
      updated_by_user: pickSafeUserFields(task.updated_by_user),
    };
  }

  private async createNotification(data: {
    user_id: string;
    from_user_id: string;
    resource_id: string;
    resource_type: ResourceType;
    parent_id: string;
    parent_type: ParentType;
    type: string;
  }) {
    const n = new Notification();
    n.user_id = data.user_id;
    n.from_user_id = data.from_user_id;
    n.resource_id = data.resource_id;
    n.resource_type = data.resource_type;
    n.parent_id = data.parent_id;
    n.parent_type = data.parent_type;
    n.type = data.type;
    n.viewed = false;
    return this.notificationRepo.save(n);
  }

  async findAllTasks(params: PaginatedParams) {
    const { page, limit, status, assignedTo, search, currentUser } = params;

    const qb = this.taskRepo.createQueryBuilder("t")
      .leftJoinAndSelect("t.assigned_to_user", "assigned_to_user")
      .leftJoinAndSelect("t.assigned_by_user", "assigned_by_user")
      .leftJoinAndSelect("t.updated_by_user", "updated_by_user");

    if (currentUser.role === UserRole.CEO || currentUser.role === UserRole.GENERAL_MANAGER) {
      // CEO and GM see all tasks
    } else if (currentUser.role === UserRole.DATA_COLLECTOR) {
      qb.andWhere("t.assigned_to_user_id = :userId", { userId: currentUser.id });
    } else {
      throw new AppError(403, "You are not authorized to view data collector tasks.");
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
      data: data.map((task) => this.sanitizeTask(task)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findTaskById(id: string) {
    const task = await this.taskRepo.findOne({
      where: { id },
      relations: ["assigned_to_user", "assigned_by_user", "updated_by_user"],
    });
    if (!task) throw new AppError(404, "Data collector task not found");

    const submissions = await this.submissionRepo.find({
      where: { data_collector_task_id: id },
      order: { created_at: "DESC" },
    });

    return this.sanitizeTask({ ...task, submissions });
  }

  async createTask(params: CreateTaskParams, assignedByUserId: string) {
    const task = new DataCollectorTask();
    task.title = params.title;
    task.description = params.description;
    task.assigned_by_user_id = assignedByUserId;
    task.assigned_to_user_id = params.assigned_to_user_id ?? null as any;
    task.due_date = params.due_date ?? null as any;
    task.status = DataCollectorTaskStatus.PENDING;
    task.task_state = TaskState.ACTIVE;
    task.attachment_urls = (params.attachment_urls ?? null) as any;

    const saved = await this.taskRepo.save(task);

    if (saved.assigned_to_user_id) {
      await this.createNotification({
        user_id: saved.assigned_to_user_id,
        from_user_id: assignedByUserId,
        resource_id: saved.id,
        resource_type: ResourceType.TASK_ASSIGNED,
        parent_id: saved.id,
        parent_type: ParentType.DATA_COLLECTOR_TASK,
        type: "New data collector task assigned",
      });
    }

    return saved;
  }

  async updateTask(id: string, params: UpdateTaskParams, userId: string) {
    const task = await this.taskRepo.findOneBy({ id });
    if (!task) throw new AppError(404, "Data collector task not found");

    if (params.title !== undefined) task.title = params.title;
    if (params.description !== undefined) task.description = params.description;
    if (params.status !== undefined) task.status = params.status;
    if (params.task_state !== undefined) task.task_state = params.task_state;
    if (params.due_date !== undefined) task.due_date = params.due_date as any;
    if (params.assigned_to_user_id !== undefined) task.assigned_to_user_id = params.assigned_to_user_id as any;
    if (params.attachment_urls !== undefined) {
      task.attachment_urls = syncAttachments(task.attachment_urls, params.attachment_urls) as any;
    }
    task.updated_by = userId as any;

    return this.taskRepo.save(task);
  }

  async createSubmission(taskId: string, description: string, userId: string, attachmentUrls?: string[]) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Data collector task not found");

    if (task.task_state !== TaskState.ACTIVE) {
      throw new AppError(400, "Cannot submit to a deactive task");
    }

    const submission = new DataCollectorSubmission();
    submission.data_collector_task_id = taskId;
    submission.description = description;
    submission.attachment_urls = attachmentUrls ?? null as any;

    const saved = await this.submissionRepo.save(submission);

    task.status = DataCollectorTaskStatus.PENDING;
    await this.taskRepo.save(task);

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
        parent_type: ParentType.DATA_COLLECTOR_TASK,
        type: "New data collector submission",
      });
    }

    return saved;
  }

  async updateSubmission(
    submissionId: string,
    params: { description?: string; attachment_urls?: string[] }
  ) {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ["data_collector_task"],
    });
    if (!submission) throw new AppError(404, "Data collector submission not found");

    if (params.description !== undefined) submission.description = params.description;
    if (params.attachment_urls !== undefined) {
      submission.attachment_urls = syncAttachments(submission.attachment_urls, params.attachment_urls) as any;
    }

    const saved = await this.submissionRepo.save(submission);

    if (submission.data_collector_task) {
      submission.data_collector_task.status = DataCollectorTaskStatus.PENDING;
      await this.taskRepo.save(submission.data_collector_task);
    }

    return saved;
  }

  async getSubmissions(taskId: string) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Data collector task not found");

    return this.submissionRepo.find({
      where: { data_collector_task_id: taskId },
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
      relations: ["data_collector_task"],
    });
    if (!submission) throw new AppError(404, "Data collector submission not found");

    const review = new DataCollectorReview();
    review.data_collector_submission_id = submissionId;
    review.reviewer_user_id = reviewerUserId;
    review.review_outcome = reviewOutcome;
    review.description = description;

    const saved = await this.reviewRepo.save(review);

    const task = submission.data_collector_task;
    if (task) {
      const mappedStatus = reviewOutcome === ReviewOutcome.APPROVED
        ? DataCollectorTaskStatus.APPROVE
        : reviewOutcome as unknown as DataCollectorTaskStatus;
      task.status = mappedStatus;
      task.updated_by = reviewerUserId as any;
      await this.taskRepo.save(task);
    }

    if (task?.assigned_to_user_id) {
      await this.createNotification({
        user_id: task.assigned_to_user_id,
        from_user_id: reviewerUserId,
        resource_id: saved.id,
        resource_type: ResourceType.REVIEW,
        parent_id: task.id,
        parent_type: ParentType.DATA_COLLECTOR_TASK,
        type: `Submission ${reviewOutcome}`,
      });
    }

    return saved;
  }

  async updateReview(
    reviewId: string,
    params: { review_outcome?: ReviewOutcome; description?: string },
    currentUserId: string
  ) {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId },
      relations: ["data_collector_submission"],
    });
    if (!review) throw new AppError(404, "Data collector review not found");

    if (review.reviewer_user_id !== currentUserId) {
      throw new AppError(403, "Only the original reviewer can update this review.");
    }

    const submission = review.data_collector_submission;
    if (!submission) throw new AppError(404, "Associated submission not found");

    const taskId = submission.data_collector_task_id;

    const latestSubmission = await this.submissionRepo.findOne({
      where: { data_collector_task_id: taskId },
      order: { created_at: "DESC" },
    });

    if (latestSubmission && latestSubmission.id !== submission.id) {
      throw new AppError(400, "A newer submission exists for this task. Cannot update review.");
    }

    const twentyFourHours = 24 * 60 * 60 * 1000;
    const reviewAge = Date.now() - review.created_at.getTime();
    if (reviewAge > twentyFourHours) {
      throw new AppError(400, "Reviews can only be updated within 24 hours of creation.");
    }

    if (params.review_outcome !== undefined) {
      review.review_outcome = params.review_outcome;
    }
    if (params.description !== undefined) {
      review.description = params.description;
    }

    const saved = await this.reviewRepo.save(review);

    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (task && params.review_outcome !== undefined) {
      const mappedStatus = params.review_outcome === ReviewOutcome.APPROVED
        ? DataCollectorTaskStatus.APPROVE
        : params.review_outcome as unknown as DataCollectorTaskStatus;
      task.status = mappedStatus;
      task.updated_by = currentUserId as any;
      await this.taskRepo.save(task);
    }

    await this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ viewed: true })
      .where("parent_id = :taskId", { taskId })
      .andWhere("resource_type = :resourceType", { resourceType: ResourceType.REVIEW })
      .andWhere("viewed = false")
      .execute();

    const ceoGmUsers = await this.userRepo.find({
      where: [
        { role: UserRole.CEO, is_active: true },
        { role: UserRole.GENERAL_MANAGER, is_active: true },
      ],
    });

    const notifyUserIds = new Set<string>();
    for (const u of ceoGmUsers) {
      if (u.id !== currentUserId) {
        notifyUserIds.add(u.id);
      }
    }

    const dataCollectorUserId = task?.assigned_to_user_id;
    if (dataCollectorUserId && dataCollectorUserId !== currentUserId) {
      notifyUserIds.add(dataCollectorUserId);
    }

    for (const userId of notifyUserIds) {
      await this.createNotification({
        user_id: userId,
        from_user_id: currentUserId,
        resource_id: saved.id,
        resource_type: ResourceType.REVIEW,
        parent_id: taskId,
        parent_type: ParentType.DATA_COLLECTOR_TASK,
        type: `Review updated: ${saved.review_outcome}`,
      });
    }

    return saved;
  }

  async getReviews(submissionId: string) {
    const submission = await this.submissionRepo.findOneBy({ id: submissionId });
    if (!submission) throw new AppError(404, "Data collector submission not found");

    const reviews = await this.reviewRepo.find({
      where: { data_collector_submission_id: submissionId },
      relations: ["reviewer_user"],
      order: { created_at: "DESC" },
    });

    return reviews.map((r) => ({
      ...r,
      reviewer_user: pickSafeUserFields(r.reviewer_user),
    }));
  }
}

export const dataCollectorService = new DataCollectorService();
