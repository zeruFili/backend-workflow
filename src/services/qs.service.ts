import { In } from "typeorm";
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
  status?: ReviewOutcome;
  due_date?: string;
  attachment_urls?: string[];
  assigned_to_user_id?: string | null;
}

export class QuantitySurveyorService {
  private taskRepo = AppDataSource.getRepository(QuantitySurveyorTask);
  private submissionRepo = AppDataSource.getRepository(QuantitySurveyorSubmission);
  private reviewRepo = AppDataSource.getRepository(QuantitySurveyorReview);
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

  private async refreshResourceNotifications(resourceId: string, fromUserId: string) {
    const notifications = await this.notificationRepo.find({
      where: { resource_id: resourceId },
    });

    for (const n of notifications) {
      n.viewed = false;
      n.from_user_id = fromUserId;
    }

    if (notifications.length > 0) {
      await this.notificationRepo.save(notifications);
    }
  }

  private async notifyTaskAssignment(taskId: string, assignedUserId: string, fromUserId: string) {
    const ceoGm = await this.userRepo.find({
      where: [
        { role: UserRole.CEO, is_active: true },
        { role: UserRole.GENERAL_MANAGER, is_active: true },
      ],
    });

    const recipients = new Set<string>();
    recipients.add(assignedUserId);
    for (const user of ceoGm) {
      recipients.add(user.id);
    }
    recipients.delete(fromUserId);

    const notifications = Array.from(recipients).map((recipientId) => ({
      user_id: recipientId,
      from_user_id: fromUserId,
      resource_id: taskId,
      resource_type: ResourceType.TASK_ASSIGNED,
      parent_id: taskId,
      parent_type: ParentType.QUANTITY_SURVEYOR_TASK,
      type: "New quantity surveyor task assigned",
    }));

    for (const n of notifications) {
      await this.createNotification(n);
    }
  }

  async findAllTasks(params: PaginatedParams) {
    const { page, limit, status, assignedTo, search, currentUser } = params;

    const qb = this.taskRepo.createQueryBuilder("t")
      .leftJoinAndSelect("t.assigned_to_user", "assigned_to_user")
      .leftJoinAndSelect("t.assigned_by_user", "assigned_by_user")
      .leftJoinAndSelect("t.updated_by_user", "updated_by_user");

    if (currentUser.role === UserRole.CEO || currentUser.role === UserRole.GENERAL_MANAGER) {
      // CEO and GM see all tasks
    } else if (currentUser.role === UserRole.QUANTITY_SURVEYOR) {
      qb.andWhere("t.assigned_to_user_id = :userId", { userId: currentUser.id });
    } else {
      throw new AppError(403, "You are not authorized to view quantity surveyor tasks.");
    }

    qb.andWhere("t.task_state = :activeState", { activeState: TaskState.ACTIVE });

    if (status) qb.andWhere("t.status = :status", { status });
    if (assignedTo) qb.andWhere("t.assigned_to_user_id = :assignedTo", { assignedTo });

    if (search) {
      qb.andWhere("(t.title ILIKE :search OR t.description ILIKE :search)", {
        search: `%${search}%`,
      });
    }

    qb.orderBy("t.created_at", "DESC");

    const [data, total] = await qb.getManyAndCount();

    const taskIds = data.map((t) => t.id);
    const submissionsByTask = await this.batchSubmissionsWithReviews(taskIds, currentUser.id);

    // Sort by latest activity (task, submission, or review timestamps) descending
    data.sort((a, b) => {
      const aTs = Math.max(
        a.created_at.getTime(),
        a.updated_at?.getTime() ?? 0,
        submissionsByTask[a.id]?.latestActivityTs ?? 0
      );
      const bTs = Math.max(
        b.created_at.getTime(),
        b.updated_at?.getTime() ?? 0,
        submissionsByTask[b.id]?.latestActivityTs ?? 0
      );
      return bTs - aTs;
    });

    // Apply pagination AFTER sorting by latest activity
    const skip = (page - 1) * limit;
    const paged = data.slice(skip, skip + limit);

    return {
      success: true,
      data: paged.map((task) => {
        const swr = submissionsByTask[task.id] || {
          taskNotification: { hasNotification: false, notificationId: null },
          submissions: [],
        };
        const { taskNotification, ...restSwr } = swr;
        const hasNestedNotification = (swr.submissions || []).some(
          (s: any) => s.hasNotification || (s.submission?.reviews || []).some((r: any) => r.hasNotification)
        );
        return {
          ...this.sanitizeTask(task),
          taskNotification,
          submissionsWithReviews: restSwr,
          hasNestedNotification,
        };
      }),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private async batchSubmissionsWithReviews(taskIds: string[], userId: string): Promise<Record<string, any>> {
    if (taskIds.length === 0) return {};

    const submissions = await this.submissionRepo.find({
      where: taskIds.map((id) => ({ quantity_surveyor_task_id: id } as any)),
    });

    const allReviews = submissions.length > 0
      ? await this.reviewRepo.find({
          where: submissions.map((s) => ({ quantity_surveyor_submission_id: s.id } as any)),
          relations: ["reviewer_user"],
        })
      : [];

    const reviewsBySubmission: Record<string, QuantitySurveyorReview[]> = {};
    for (const r of allReviews) {
      if (!reviewsBySubmission[r.quantity_surveyor_submission_id]) {
        reviewsBySubmission[r.quantity_surveyor_submission_id] = [];
      }
      reviewsBySubmission[r.quantity_surveyor_submission_id].push(r);
    }

    const unreadNotifications = await this.notificationRepo.find({
      where: {
        user_id: userId,
        parent_id: In(taskIds) as any,
        viewed: false,
      },
    });

    const notificationMap = new Map<string, string>();
    for (const n of unreadNotifications) {
      if (!notificationMap.has(n.resource_id)) {
        notificationMap.set(n.resource_id, n.id);
      }
    }

    const submissionsByTask: Record<string, QuantitySurveyorSubmission[]> = {};
    for (const s of submissions) {
      if (!submissionsByTask[s.quantity_surveyor_task_id]) {
        submissionsByTask[s.quantity_surveyor_task_id] = [];
      }
      submissionsByTask[s.quantity_surveyor_task_id].push(s);
    }

    const result: Record<string, any> = {};

    for (const taskId of taskIds) {
      const taskSubmissions = submissionsByTask[taskId] || [];

      const hasTaskNotification = notificationMap.has(taskId)
        ? { hasNotification: true, notificationId: notificationMap.get(taskId) }
        : { hasNotification: false, notificationId: null };

      const submissionsWithReviews = taskSubmissions.map((submission) => {
        const rawReviews = (reviewsBySubmission[submission.id] || []).map((r) => {
          const earliest = new Date(
            Math.min(
              r.created_at?.getTime() ?? r.updated_at?.getTime() ?? 0,
              r.updated_at?.getTime() ?? r.created_at?.getTime() ?? 0
            )
          );
          return { ...r, reviewer_user: pickSafeUserFields(r.reviewer_user), _sortTime: earliest };
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
          submissionId: submission.id,
          ...subNotif,
          submission: {
            ...submission,
            reviews,
          },
          _sortTime: earliestSubmission,
        };
      });

      submissionsWithReviews.sort((a, b) => a._sortTime.getTime() - b._sortTime.getTime());

      result[taskId] = {
        taskNotification: hasTaskNotification,
        submissions: submissionsWithReviews.map(({ _sortTime, ...rest }) => rest),
        latestActivityTs: Math.max(
          ...taskSubmissions.flatMap((sub) => [
            sub.created_at?.getTime() ?? 0,
            sub.updated_at?.getTime() ?? 0,
            ...(reviewsBySubmission[sub.id] || []).flatMap((r) => [
              r.created_at?.getTime() ?? 0,
              r.updated_at?.getTime() ?? 0,
            ]),
          ]),
          0
        ),
      };
    }

    return result;
  }

  async findTaskById(id: string, currentUser?: { id: string; role: UserRole }) {
    const task = await this.taskRepo.findOne({
      where: { id },
      relations: ["assigned_to_user", "assigned_by_user", "updated_by_user"],
    });
    if (!task) throw new AppError(404, "Quantity surveyor task not found");

    if (currentUser) {
      if (currentUser.role === UserRole.CEO || currentUser.role === UserRole.GENERAL_MANAGER) {
        // CEO and GM can view any task
      } else if (currentUser.role === UserRole.QUANTITY_SURVEYOR) {
        if (task.assigned_to_user_id !== currentUser.id) {
          throw new AppError(403, "You are not authorized to view this quantity surveyor task.");
        }
      } else {
        throw new AppError(403, "You are not authorized to view quantity surveyor tasks.");
      }
    }

    const submissions = await this.submissionRepo.find({
      where: { quantity_surveyor_task_id: id },
      order: { created_at: "DESC" },
    });

    return this.sanitizeTask({ ...task, submissions });
  }

  async createTask(params: CreateTaskParams, assignedByUserId: string) {
    const task = new QuantitySurveyorTask();
    task.title = params.title;
    task.description = params.description;
    task.assigned_by_user_id = assignedByUserId;
    task.assigned_to_user_id = (params.assigned_to_user_id ?? null) as any;
    task.due_date = (params.due_date ?? null) as any;
    task.status = ReviewOutcome.PENDING;
    task.task_state = TaskState.ACTIVE;
    task.attachment_urls = (params.attachment_urls ?? null) as any;

    const saved = await this.taskRepo.save(task);

    if (saved.assigned_to_user_id) {
      await this.notifyTaskAssignment(saved.id, saved.assigned_to_user_id, assignedByUserId);
    }

    return saved;
  }

  async updateTask(id: string, params: UpdateTaskParams, userId: string) {
    const task = await this.taskRepo.findOneBy({ id });
    if (!task) throw new AppError(404, "Quantity surveyor task not found");

    const existingSubmission = await this.submissionRepo.findOne({
      where: { quantity_surveyor_task_id: id },
    });
    if (existingSubmission) {
      throw new AppError(400, "This task can no longer be edited because a submission has already been created. Please refresh the page.");
    }

    const previousAssignee = task.assigned_to_user_id;

    if (params.title !== undefined) task.title = params.title;
    if (params.description !== undefined) task.description = params.description;
    if (params.status !== undefined) task.status = params.status;
    if (params.due_date !== undefined) task.due_date = params.due_date;
    if (params.assigned_to_user_id !== undefined) task.assigned_to_user_id = params.assigned_to_user_id as any;
    if (params.attachment_urls !== undefined) {
      task.attachment_urls = syncAttachments(task.attachment_urls, params.attachment_urls) as any;
    }

    task.updated_by = userId as any;
    task.updated_at = new Date();

    const saved = await this.taskRepo.save(task);

    if (
      params.assigned_to_user_id !== undefined &&
      params.assigned_to_user_id !== previousAssignee
    ) {
      if (previousAssignee) {
        await this.notificationRepo.delete({
          parent_id: id,
          resource_type: ResourceType.TASK_ASSIGNED,
          user_id: previousAssignee,
        });
      }
      if (params.assigned_to_user_id) {
        await this.notifyTaskAssignment(saved.id, params.assigned_to_user_id, userId);
      }
    }

    await this.refreshResourceNotifications(id, userId);

    const ceoGmUsers = await this.userRepo.find({
      where: [
        { role: UserRole.CEO, is_active: true },
        { role: UserRole.GENERAL_MANAGER, is_active: true },
      ],
    });
    for (const leader of ceoGmUsers) {
      if (leader.id === userId) continue;
      await this.createNotification({
        user_id: leader.id,
        from_user_id: userId,
        resource_id: id,
        resource_type: ResourceType.TASK_ASSIGNED,
        parent_id: id,
        parent_type: ParentType.QUANTITY_SURVEYOR_TASK,
        type: "Quantity surveyor task updated",
      });
    }

    return saved;
  }

  async createSubmission(taskId: string, description: string, userId: string, attachmentUrls?: string[], status?: SubmissionReviewStatus) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Quantity surveyor task not found");

    if (task.assigned_to_user_id !== userId) {
      throw new AppError(403, "Only the assigned Quantity Surveyor can create submissions for this task.");
    }

    if (task.task_state !== TaskState.ACTIVE) {
      throw new AppError(400, "Cannot submit to a deactive task");
    }

    if (task.status === ReviewOutcome.REJECTED) {
      throw new AppError(400, "Submission is not allowed because the parent task has been rejected.");
    }

    const submission = new QuantitySurveyorSubmission();
    submission.quantity_surveyor_task_id = taskId;
    submission.description = description;
    submission.attachment_urls = attachmentUrls ?? null as any;
    submission.review_status = status || SubmissionReviewStatus.PENDING_REVIEW;

    const saved = await this.submissionRepo.save(submission);

    task.status = ReviewOutcome.PENDING;
    task.updated_by = userId as any;
    task.updated_at = new Date();
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
        parent_type: ParentType.QUANTITY_SURVEYOR_TASK,
        type: "New quantity surveyor submission",
      });
    }

    return saved;
  }

  async getSubmissions(taskId: string, currentUser?: { id: string; role: UserRole }) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Quantity surveyor task not found");

    if (currentUser) {
      if (currentUser.role === UserRole.CEO || currentUser.role === UserRole.GENERAL_MANAGER) {
        // CEO and GM can view all submissions
      } else if (currentUser.role === UserRole.QUANTITY_SURVEYOR) {
        if (task.assigned_to_user_id !== currentUser.id) {
          throw new AppError(403, "You are not authorized to view these submissions.");
        }
      } else {
        throw new AppError(403, "You are not authorized to view quantity surveyor submissions.");
      }
    }

    return this.submissionRepo.find({
      where: { quantity_surveyor_task_id: taskId },
      order: { created_at: "DESC" },
    });
  }

  async updateSubmission(
    submissionId: string,
    userId: string,
    params: { description?: string; attachment_urls?: string[]; status?: SubmissionReviewStatus }
  ) {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ["quantity_surveyor_task"],
    });
    if (!submission) throw new AppError(404, "Quantity surveyor submission not found");

    const task = submission.quantity_surveyor_task;
    if (task) {
      if (task.assigned_to_user_id !== userId) {
        throw new AppError(403, "Only the assigned Quantity Surveyor can update this submission.");
      }

      if (task.task_state !== TaskState.ACTIVE) {
        throw new AppError(400, "Cannot update submission for a deactive task.");
      }

      if (task.status === ReviewOutcome.REJECTED) {
        throw new AppError(400, "This submission cannot be updated because the parent task has been rejected.");
      }
    }

    const existingReview = await this.reviewRepo.findOneBy({ quantity_surveyor_submission_id: submissionId });
    if (existingReview) {
      throw new AppError(400, "Cannot update submission that has already been reviewed.");
    }

    if (params.description !== undefined) submission.description = params.description;
    if (params.attachment_urls !== undefined) {
      submission.attachment_urls = syncAttachments(submission.attachment_urls, params.attachment_urls) as any;
    }
    if (params.status !== undefined) submission.review_status = params.status;
    submission.updated_at = new Date();

    const saved = await this.submissionRepo.save(submission);

    if (task) {
      task.status = ReviewOutcome.PENDING;
      task.updated_by = userId as any;
    task.updated_at = new Date();
      await this.taskRepo.save(task);
    }

    await this.refreshResourceNotifications(submissionId, userId);

    return saved;
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

    const task = submission.quantity_surveyor_task;
    if (!task) throw new AppError(404, "Associated quantity surveyor task not found");
    if (task.task_state === TaskState.DEACTIVE) {
      throw new AppError(400, "Cannot review a submission for a deactivated task");
    }

    const review = new QuantitySurveyorReview();
    review.quantity_surveyor_submission_id = submissionId;
    review.reviewer_user_id = reviewerUserId;
    review.review_outcome = reviewOutcome;
    review.description = description;

    const saved = await this.reviewRepo.save(review);

    task.status = reviewOutcome;
    task.updated_by = reviewerUserId as any;
    task.updated_at = new Date();
    await this.taskRepo.save(task);

    submission.review_status = reviewOutcome === ReviewOutcome.APPROVED
      ? SubmissionReviewStatus.APPROVED
      : SubmissionReviewStatus.REVISION_REQUIRED;
    await this.submissionRepo.save(submission);

    if (task.assigned_to_user_id) {
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

    const ceoGmUsers = await this.userRepo.find({
      where: [
        { role: UserRole.CEO, is_active: true },
        { role: UserRole.GENERAL_MANAGER, is_active: true },
      ],
    });
    for (const leader of ceoGmUsers) {
      if (leader.id === reviewerUserId) continue;
      await this.createNotification({
        user_id: leader.id,
        from_user_id: reviewerUserId,
        resource_id: saved.id,
        resource_type: ResourceType.REVIEW,
        parent_id: task.id,
        parent_type: ParentType.QUANTITY_SURVEYOR_TASK,
        type: `Quantity surveyor review: ${reviewOutcome}`,
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
      relations: ["quantity_surveyor_submission", "quantity_surveyor_submission.quantity_surveyor_task"],
    });
    if (!review) throw new AppError(404, "Quantity surveyor review not found");

    if (review.reviewer_user_id !== currentUserId) {
      throw new AppError(403, "Only the original reviewer can update this review.");
    }

    const submission = review.quantity_surveyor_submission;
    if (!submission) throw new AppError(404, "Associated submission not found");

    const task = submission.quantity_surveyor_task;
    if (!task) throw new AppError(404, "Associated quantity surveyor task not found");
    if (task.task_state === TaskState.DEACTIVE) {
      throw new AppError(400, "Cannot update review for a deactivated task");
    }

    const taskId = submission.quantity_surveyor_task_id;

    const latestSubmission = await this.submissionRepo.findOne({
      where: { quantity_surveyor_task_id: taskId },
      order: { created_at: "DESC" },
    });

    if (latestSubmission && latestSubmission.id !== submission.id) {
      throw new AppError(400, "A newer submission exists for this task. Cannot update review.");
    }

    const newerReview = await this.reviewRepo
      .createQueryBuilder("qsr")
      .where("qsr.quantity_surveyor_submission_id = :subId", { subId: submission.id })
      .andWhere("qsr.id != :revId", { revId: reviewId })
      .andWhere("qsr.created_at > :reviewCreatedAt", { reviewCreatedAt: review.created_at })
      .getOne();
    if (newerReview) {
      throw new AppError(400, "A newer review already exists for this submission. This review cannot be edited.");
    }

    const twentyFourHours = 24 * 60 * 60 * 1000;
    const reviewAge = Date.now() - review.created_at.getTime();
    if (reviewAge > twentyFourHours) {
      throw new AppError(400, "Reviews can only be updated within 24 hours of creation.");
    }

    if (params.review_outcome !== undefined) {
      review.review_outcome = params.review_outcome;
      task.status = params.review_outcome;
      task.updated_by = currentUserId as any;
      task.updated_at = new Date();
      await this.taskRepo.save(task);
    }
    if (params.description !== undefined) {
      review.description = params.description;
    }
    review.updated_at = new Date();

    const saved = await this.reviewRepo.save(review);

    await this.refreshResourceNotifications(reviewId, currentUserId);

    return saved;
  }

  async getReviews(submissionId: string) {
    const submission = await this.submissionRepo.findOneBy({ id: submissionId });
    if (!submission) throw new AppError(404, "Quantity surveyor submission not found");

    const reviews = await this.reviewRepo.find({
      where: { quantity_surveyor_submission_id: submissionId },
      relations: ["reviewer_user"],
      order: { created_at: "DESC" },
    });

    return reviews.map((r) => ({
      ...r,
      reviewer_user: pickSafeUserFields(r.reviewer_user),
    }));
  }

  async evaluate(
    taskId: string,
    params: { description: string; review_outcome: string; attachment_urls?: string[] },
    userId: string
  ) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Quantity surveyor task not found");

    if (task.task_state !== TaskState.ACTIVE) {
      throw new AppError(400, "Cannot evaluate a deactive task");
    }

    if (task.status === ReviewOutcome.REJECTED) {
      throw new AppError(400, "Cannot evaluate a rejected task.");
    }

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

    if (task.task_state !== TaskState.ACTIVE) {
      throw new AppError(400, "Cannot evaluate a deactive task");
    }

    if (task.status === ReviewOutcome.REJECTED) {
      throw new AppError(400, "Cannot evaluate a rejected task.");
    }

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
    const submission = await this.submissionRepo.findOne({
      where: { id: evaluationId },
      relations: ["quantity_surveyor_task"],
    });
    if (!submission) throw new AppError(404, "Evaluation not found");

    const review = new QuantitySurveyorReview();
    review.quantity_surveyor_submission_id = evaluationId;
    review.reviewer_user_id = userId || "system";
    review.review_outcome = decision as any;
    review.description = description || `Decision: ${decision}`;
    await this.reviewRepo.save(review);

    if (decision === "APPROVED" || decision === "approved") {
      const task = submission.quantity_surveyor_task;
      if (task) {
        task.status = ReviewOutcome.APPROVED;
        task.updated_by = userId as any;
    task.updated_at = new Date();
        await this.taskRepo.save(task);
      }
    }

    return submission;
  }

  async removeTask(taskId: string) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Quantity surveyor task not found");

    const submissions = await this.submissionRepo.find({
      where: { quantity_surveyor_task_id: taskId },
    });
    if (submissions.length > 0) {
      throw new AppError(400, "Cannot delete task: one or more submissions exist for this task");
    }

    if (task.assigned_to_user_id) {
      const assignmentDate = task.updated_at ? new Date(task.updated_at) : null;
      if (assignmentDate) {
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        if (Date.now() - assignmentDate.getTime() > threeDaysMs) {
          throw new AppError(400, "Cannot delete task: more than 3 days have passed since assignment");
        }
      }
    }

    await this.notificationRepo.delete({ parent_id: taskId });

    task.task_state = TaskState.DEACTIVE;
    task.updated_at = new Date();
    await this.taskRepo.save(task);
    return task;
  }
}

export const quantitySurveyorService = new QuantitySurveyorService();
