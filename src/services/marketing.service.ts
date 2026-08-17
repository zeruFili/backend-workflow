import { AppDataSource } from "../config/data-source";
import { MarketingTask } from "../entities/MarketingTask";
import { MarketingSubmission } from "../entities/MarketingSubmission";
import { MarketingReview } from "../entities/MarketingReview";
import { User } from "../entities/User";
import { Notification } from "../entities/Notification";
import { ReviewOutcome } from "../enums/review-outcome.enum";
import { TaskState } from "../enums/task-state.enum";
import { UserRole } from "../enums/user-role.enum";
import { ResourceType } from "../enums/resource-type.enum";
import { ParentType } from "../enums/parent-type.enum";
import { AppError } from "../middlewares/error.middleware";
import { pickSafeUserFields } from "../utils/response.utils";
import { safeUserColumns } from "../utils/user-columns.utils";
import { syncAttachments } from "../utils/upload.utils";
import { In } from "typeorm";

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

interface PaginatedParams {
  page: number;
  limit: number;
  status?: string;
  search?: string;
  currentUser: { id: string; role: UserRole };
}

interface CreateTaskParams {
  title: string;
  description?: string;
  due_date?: string;
  attachment_urls?: string[];
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  customer_address: string;
  category: string;
  service_description?: string;
  preferred_start_date?: string;
  budget?: number;
  notes?: string;
}

interface UpdateTaskParams {
  title?: string;
  description?: string;
  status?: ReviewOutcome;
  task_state?: TaskState;
  due_date?: string;
  attachment_urls?: string[];
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  category?: string;
  service_description?: string;
  preferred_start_date?: string;
  budget?: number;
  notes?: string;
}

export class MarketingService {
  private taskRepo = AppDataSource.getRepository(MarketingTask);
  private submissionRepo = AppDataSource.getRepository(MarketingSubmission);
  private reviewRepo = AppDataSource.getRepository(MarketingReview);
  private userRepo = AppDataSource.getRepository(User);
  private notificationRepo = AppDataSource.getRepository(Notification);

  private sanitizeTask(task: any) {
    return {
      ...task,
      marketing_user: pickSafeUserFields(task.marketing_user),
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

  async findAllTasks(params: PaginatedParams) {
    const { page, limit, status, search, currentUser } = params;
    const skip = (page - 1) * limit;

    // Phase 1: Paginated ID query (DB-level LIMIT/OFFSET sorted by activity)
    const { sql: idSql, params: idParams } = this.buildPaginatedIdQuery({
      status,
      search,
      currentUser,
      skip,
      limit,
    });

    const idRows: { id: string; search_relevance?: number }[] = await this.taskRepo.query(idSql, idParams);
    const taskIds: string[] = [];
    const similarityScores: Record<string, number> = {};
    for (const row of idRows) {
      taskIds.push(row.id);
      if (search && row.search_relevance != null) {
        similarityScores[row.id] = Number(row.search_relevance) || 0;
      }
    }

    // Phase 2: Total count (lightweight, no LATERAL joins)
    const { sql: countSql, params: countParams } = this.buildCountQuery({
      status,
      search,
      currentUser,
    });
    const countResult = await this.taskRepo.query(countSql, countParams);
    const total: number = parseInt(countResult[0]?.count ?? "0", 10);

    // Phase 3: Load full task entities for the page subset only
    let data: MarketingTask[];
    if (taskIds.length > 0) {
      data = await this.taskRepo
        .createQueryBuilder("t")
        .leftJoin("t.marketing_user", "marketing_user")
        .leftJoin("t.updated_by_user", "updated_by_user")
        .addSelect(safeUserColumns("marketing_user"))
        .addSelect(safeUserColumns("updated_by_user"))
        .where("t.id IN (:...taskIds)", { taskIds })
        .getMany();

      const idOrder: Record<string, number> = {};
      for (let i = 0; i < taskIds.length; i++) {
        idOrder[taskIds[i]] = i;
      }
      data.sort((a, b) => (idOrder[a.id] ?? 0) - (idOrder[b.id] ?? 0));
    } else {
      data = [];
    }

    // Phase 4: Batch-fetch relations (only for page-sized subset)
    const submissionsByTask = await this.batchSubmissionsWithReviews(taskIds, currentUser.id);

    // Phase 5: Build response
    return {
      success: true,
      data: data.map((task) => {
        const swr = submissionsByTask[task.id] || {
          taskNotification: { hasNotification: false, notificationId: null },
          submissions: [],
        };
        const { taskNotification, ...restSwr } = swr;
        const hasNestedNotification = (swr.submissions || []).some(
          (s: any) => s.hasNotification || (s.reviews || []).some((r: any) => r.hasNotification)
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

  private buildPaginatedIdQuery(args: {
    status?: string;
    search?: string;
    currentUser: { id: string; role: UserRole };
    skip: number;
    limit: number;
  }): { sql: string; params: any[] } {
    const { status, search, currentUser, skip, limit } = args;
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 0;
    const p = (val: any) => { pIdx++; params.push(val); return `$${pIdx}`; };

    // Visibility scope
    if (currentUser.role === UserRole.CEO || currentUser.role === UserRole.FINANCE) {
      // CEO and Finance see all tasks
    } else if (currentUser.role === UserRole.GENERAL_MANAGER) {
      conditions.push(`t.status = ${p(ReviewOutcome.APPROVED)}`);
    } else if (currentUser.role === UserRole.MARKETING) {
      conditions.push(`t.marketing_user_id = ${p(currentUser.id)}`);
    } else {
      throw new AppError(403, "You are not authorized to view marketing tasks.");
    }

    conditions.push(`t.task_state = ${p(TaskState.ACTIVE)}`);

    if (status) conditions.push(`t.status = ${p(status)}`);

    let selectExprs = "t.id";
    let orderBy: string;
    if (search) {
      const searchPatternParam = p(`%${search}%`);
      const searchTermParam = p(search);
      conditions.push(
        `(t.title ILIKE ${searchPatternParam} OR t.description ILIKE ${searchPatternParam} ` +
        `OR t.customer_name ILIKE ${searchPatternParam} OR t.customer_phone ILIKE ${searchPatternParam} ` +
        `OR word_similarity(${searchTermParam}::text, t.title) > 0.2 ` +
        `OR word_similarity(${searchTermParam}::text, t.description) > 0.2 ` +
        `OR word_similarity(${searchTermParam}::text, t.customer_name::text) > 0.2 ` +
        `OR word_similarity(${searchTermParam}::text, t.customer_phone::text) > 0.2)`,
      );
      selectExprs = `t.id, GREATEST(` +
        `word_similarity(${searchTermParam}::text, t.title), ` +
        `word_similarity(${searchTermParam}::text, t.description), ` +
        `word_similarity(${searchTermParam}::text, t.customer_name::text), ` +
        `word_similarity(${searchTermParam}::text, t.customer_phone::text)` +
        `) AS search_relevance`;
      orderBy = `ORDER BY search_relevance DESC, last_activity_at DESC`;
    } else {
      orderBy = `ORDER BY last_activity_at DESC`;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT ${selectExprs}, GREATEST(
        t.created_at,
        COALESCE(t.updated_at, t.created_at),
        COALESCE(sub.max_ts, t.created_at),
        COALESCE(subrev.max_ts, t.created_at)
      ) AS last_activity_at
      FROM marketing_task t
      LEFT JOIN LATERAL (
        SELECT MAX(GREATEST(s.created_at, COALESCE(s.updated_at, s.created_at))) AS max_ts
        FROM marketing_submission s
        WHERE s.marketing_task_id = t.id
      ) sub ON true
      LEFT JOIN LATERAL (
        SELECT MAX(GREATEST(sr.created_at, COALESCE(sr.updated_at, sr.created_at))) AS max_ts
        FROM marketing_submission s
        INNER JOIN marketing_review sr ON sr.marketing_submission_id = s.id
        WHERE s.marketing_task_id = t.id
      ) subrev ON true
      ${where}
      ${orderBy}
      LIMIT ${p(limit)} OFFSET ${p(skip)}
    `;

    return { sql, params };
  }

  private buildCountQuery(args: {
    status?: string;
    search?: string;
    currentUser: { id: string; role: UserRole };
  }): { sql: string; params: any[] } {
    const { status, search, currentUser } = args;
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 0;
    const p = (val: any) => { pIdx++; params.push(val); return `$${pIdx}`; };

    if (currentUser.role === UserRole.CEO || currentUser.role === UserRole.FINANCE) {
      // CEO and Finance see all tasks
    } else if (currentUser.role === UserRole.GENERAL_MANAGER) {
      conditions.push(`t.status = ${p(ReviewOutcome.APPROVED)}`);
    } else if (currentUser.role === UserRole.MARKETING) {
      conditions.push(`t.marketing_user_id = ${p(currentUser.id)}`);
    } else {
      throw new AppError(403, "You are not authorized to view marketing tasks.");
    }

    conditions.push(`t.task_state = ${p(TaskState.ACTIVE)}`);

    if (status) conditions.push(`t.status = ${p(status)}`);

    if (search) {
      const sp = p(`%${search}%`);
      const st = p(search);
      conditions.push(
        `(t.title ILIKE ${sp} OR t.description ILIKE ${sp} ` +
        `OR t.customer_name ILIKE ${sp} OR t.customer_phone ILIKE ${sp} ` +
        `OR word_similarity(${st}::text, t.title) > 0.2 ` +
        `OR word_similarity(${st}::text, t.description) > 0.2 ` +
        `OR word_similarity(${st}::text, t.customer_name::text) > 0.2 ` +
        `OR word_similarity(${st}::text, t.customer_phone::text) > 0.2)`,
      );
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT COUNT(*) AS count FROM marketing_task t ${where}`;

    return { sql, params };
  }

  private async batchSubmissionsWithReviews(taskIds: string[], userId: string): Promise<Record<string, any>> {
    if (taskIds.length === 0) return {};

    const submissions = await this.submissionRepo.find({
      where: { marketing_task_id: In(taskIds) },
    });

    const allReviews = submissions.length > 0
      ? await this.reviewRepo
          .createQueryBuilder("r")
          .leftJoin("r.reviewer_user", "reviewer_user")
          .addSelect(safeUserColumns("reviewer_user"))
          .where("r.marketing_submission_id IN (:...submissionIds)", {
            submissionIds: submissions.map((s) => s.id),
          })
          .getMany()
      : [];

    const reviewsBySubmission: Record<string, MarketingReview[]> = {};
    for (const r of allReviews) {
      if (!reviewsBySubmission[r.marketing_submission_id]) {
        reviewsBySubmission[r.marketing_submission_id] = [];
      }
      reviewsBySubmission[r.marketing_submission_id].push(r);
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

    const submissionsByTask: Record<string, MarketingSubmission[]> = {};
    for (const s of submissions) {
      if (!submissionsByTask[s.marketing_task_id]) {
        submissionsByTask[s.marketing_task_id] = [];
      }
      submissionsByTask[s.marketing_task_id].push(s);
    }

    const result: Record<string, any> = {};

    for (const taskId of taskIds) {
      const taskSubmissions = submissionsByTask[taskId] || [];

      const taskNotification = notificationMap.has(taskId)
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
        taskNotification,
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
    const task = await this.taskRepo
      .createQueryBuilder("t")
      .leftJoin("t.marketing_user", "marketing_user")
      .leftJoin("t.updated_by_user", "updated_by_user")
      .addSelect(safeUserColumns("marketing_user"))
      .addSelect(safeUserColumns("updated_by_user"))
      .where("t.id = :id", { id })
      .getOne();
    if (!task) throw new AppError(404, "Marketing task not found");

    if (currentUser) {
      if (currentUser.role === UserRole.CEO || currentUser.role === UserRole.FINANCE) {
        // CEO and Finance can view any task
      } else if (currentUser.role === UserRole.GENERAL_MANAGER) {
        if (task.status !== ReviewOutcome.APPROVED) {
          throw new AppError(403, "General Manager can only view approved marketing tasks.");
        }
      } else if (currentUser.role === UserRole.MARKETING) {
        if (task.marketing_user_id !== currentUser.id) {
          throw new AppError(403, "You are not authorized to view this marketing task.");
        }
      } else {
        throw new AppError(403, "You are not authorized to view marketing tasks.");
      }
    }

    const submissions = await this.submissionRepo.find({
      where: { marketing_task_id: id },
      order: { created_at: "DESC" },
    });

    const reviewRepo = this.reviewRepo;
    const allReviews = submissions.length > 0
      ? await reviewRepo
          .createQueryBuilder("r")
          .leftJoin("r.reviewer_user", "reviewer_user")
          .addSelect(safeUserColumns("reviewer_user"))
          .where("r.marketing_submission_id IN (:...submissionIds)", {
            submissionIds: submissions.map((s) => s.id),
          })
          .getMany()
      : [];

    const reviewsBySubmission: Record<string, any[]> = {};
    for (const r of allReviews) {
      if (!reviewsBySubmission[r.marketing_submission_id]) reviewsBySubmission[r.marketing_submission_id] = [];
      reviewsBySubmission[r.marketing_submission_id].push(r);
    }

    const submissionsWithReviews = submissions.map((s) => ({
      ...s,
      reviews: reviewsBySubmission[s.id] || [],
    }));

    return this.sanitizeTask({ ...task, submissions: submissionsWithReviews });
  }

  async createTask(params: CreateTaskParams, marketingUserId: string) {
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

    const task = new MarketingTask();
    task.marketing_user_id = marketingUserId;
    task.title = params.title;
    task.description = params.description || '';
    task.due_date = params.due_date ?? null as any;
    task.status = ReviewOutcome.PENDING;
    task.task_state = TaskState.ACTIVE;
    task.attachment_urls = (params.attachment_urls ?? null) as any;
    task.customer_name = params.customer_name;
    task.customer_phone = params.customer_phone;
    task.customer_email = params.customer_email ?? null as any;
    task.customer_address = params.customer_address;
    task.category = params.category;
    task.service_description = params.service_description || '';
    task.preferred_start_date = params.preferred_start_date ?? null as any;
    task.budget = params.budget ?? null as any;
    task.notes = params.notes ?? null as any;

    const saved = await this.taskRepo.save(task);

    return saved;
  }

  async updateTask(id: string, params: UpdateTaskParams, userId: string) {
    const task = await this.taskRepo.findOneBy({ id });
    if (!task) throw new AppError(404, "Marketing task not found");

    if (task.marketing_user_id !== userId) {
      throw new AppError(403, "Only the creator can update this marketing task.");
    }

    if (params.customer_phone !== undefined) {
      if (!E164_REGEX.test(params.customer_phone)) {
        throw new AppError(400, "Phone number must be in E.164 format (e.g., +251911234567)");
      }
      task.customer_phone = params.customer_phone;
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
      task.preferred_start_date = params.preferred_start_date;
    }

    if (params.title !== undefined) task.title = params.title;
    if (params.description !== undefined) task.description = params.description;
    if (params.status !== undefined) task.status = params.status;
    if (params.task_state !== undefined) task.task_state = params.task_state;
    if (params.due_date !== undefined) task.due_date = params.due_date as any;
    if (params.attachment_urls !== undefined) {
      task.attachment_urls = syncAttachments(task.attachment_urls, params.attachment_urls) as any;
    }
    if (params.customer_name !== undefined) task.customer_name = params.customer_name;
    if (params.customer_email !== undefined) task.customer_email = params.customer_email || null as any;
    if (params.customer_address !== undefined) task.customer_address = params.customer_address;
    if (params.category !== undefined) task.category = params.category;
    if (params.service_description !== undefined) task.service_description = params.service_description;
    if (params.budget !== undefined) task.budget = params.budget;
    if (params.notes !== undefined) task.notes = params.notes;

    task.updated_by = userId as any;
    task.updated_at = new Date();

    const saved = await this.taskRepo.save(task);

    await this.refreshResourceNotifications(id, userId);

    return saved;
  }

  async removeTask(id: string, userId: string) {
    const task = await this.taskRepo.findOneBy({ id });
    if (!task) throw new AppError(404, "Marketing task not found");

    if (task.marketing_user_id !== userId) {
      throw new AppError(403, "Only the creator can delete this marketing task.");
    }

    const submissions = await this.submissionRepo.find({
      where: { marketing_task_id: id },
    });
    if (submissions.length > 0) {
      throw new AppError(400, "Cannot delete a task that has submissions.");
    }

    task.task_state = TaskState.DEACTIVE;
    task.updated_by = userId as any;
    task.updated_at = new Date();

    await this.notificationRepo.delete({ parent_id: id });

    return this.taskRepo.save(task);
  }

  async createSubmission(taskId: string, description: string, userId: string, attachmentUrls?: string[]) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Marketing task not found");

    if (task.marketing_user_id !== userId) {
      throw new AppError(403, "Only the owner Marketing user can create submissions for this task.");
    }

    if (task.task_state !== TaskState.ACTIVE) {
      throw new AppError(400, "Cannot submit to a deactive task");
    }

    if (task.status === ReviewOutcome.REJECTED) {
      throw new AppError(400, "Submission is not allowed because the parent task has been rejected.");
    }

    const submission = new MarketingSubmission();
    submission.marketing_task_id = taskId;
    submission.description = description;
    submission.attachment_urls = attachmentUrls ?? null as any;

    const saved = await this.submissionRepo.save(submission);

    task.status = ReviewOutcome.PENDING;
    task.updated_by = userId as any;
    task.updated_at = new Date();
    await this.taskRepo.save(task);

    const ceoFinance = await this.userRepo.find({
      where: [
        { role: UserRole.CEO, is_active: true },
        { role: UserRole.FINANCE, is_active: true },
      ],
    });

    for (const user of ceoFinance) {
      await this.createNotification({
        user_id: user.id,
        from_user_id: userId,
        resource_id: saved.id,
        resource_type: ResourceType.SUBMISSION,
        parent_id: taskId,
        parent_type: ParentType.MARKETING_TASK,
        type: "New marketing submission",
      });
    }

    return saved;
  }

  async updateSubmission(
    submissionId: string,
    userId: string,
    params: { description?: string; attachment_urls?: string[] }
  ) {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ["marketing_task"],
    });
    if (!submission) throw new AppError(404, "Marketing submission not found");

    const task = submission.marketing_task;
    if (task) {
      if (task.marketing_user_id !== userId) {
        throw new AppError(403, "Only the owner Marketing user can update this submission.");
      }

      if (task.task_state !== TaskState.ACTIVE) {
        throw new AppError(400, "Cannot update submission for a deactive task.");
      }

      if (task.status === ReviewOutcome.REJECTED) {
        throw new AppError(400, "This submission cannot be updated because the parent task has been rejected.");
      }
    }

    const existingReview = await this.reviewRepo.findOneBy({ marketing_submission_id: submissionId });
    if (existingReview) {
      throw new AppError(400, "Cannot update submission that has already been reviewed.");
    }

    if (params.description !== undefined) submission.description = params.description;
    if (params.attachment_urls !== undefined) {
      submission.attachment_urls = syncAttachments(submission.attachment_urls, params.attachment_urls) as any;
    }
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

  async getSubmissions(taskId: string, currentUser?: { id: string; role: UserRole }) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Marketing task not found");

    if (currentUser) {
      if (currentUser.role === UserRole.CEO || currentUser.role === UserRole.FINANCE) {
        // CEO and Finance can view all submissions
      } else if (currentUser.role === UserRole.MARKETING) {
        if (task.marketing_user_id !== currentUser.id) {
          throw new AppError(403, "You are not authorized to view these submissions.");
        }
      } else {
        throw new AppError(403, "You are not authorized to view marketing submissions.");
      }
    }

    return this.submissionRepo.find({
      where: { marketing_task_id: taskId },
      order: { created_at: "ASC" },
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
      relations: ["marketing_task"],
    });
    if (!submission) throw new AppError(404, "Marketing submission not found");

    const task = submission.marketing_task;
    if (!task) throw new AppError(404, "Associated marketing task not found");
    if (task.task_state === TaskState.DEACTIVE) {
      throw new AppError(400, "Cannot review a submission for a deactivated task");
    }

    const review = new MarketingReview();
    review.marketing_submission_id = submissionId;
    review.reviewer_user_id = reviewerUserId;
    review.review_outcome = reviewOutcome;
    review.description = description;

    const saved = await this.reviewRepo.save(review);

    task.status = reviewOutcome;
    task.updated_by = reviewerUserId as any;
    task.updated_at = new Date();
    await this.taskRepo.save(task);

    const notifiedUserIds = new Set<string>([reviewerUserId]);

    if (task.marketing_user_id) {
      await this.createNotification({
        user_id: task.marketing_user_id,
        from_user_id: reviewerUserId,
        resource_id: saved.id,
        resource_type: ResourceType.REVIEW,
        parent_id: task.id,
        parent_type: ParentType.MARKETING_TASK,
        type: `Your submission was ${reviewOutcome}`,
      });
      notifiedUserIds.add(task.marketing_user_id);
    }

    const ceoFinance = await this.userRepo.find({
      where: [
        { role: UserRole.CEO, is_active: true },
        { role: UserRole.FINANCE, is_active: true },
      ],
    });

    for (const user of ceoFinance) {
      if (!notifiedUserIds.has(user.id)) {
        await this.createNotification({
          user_id: user.id,
          from_user_id: reviewerUserId,
          resource_id: saved.id,
          resource_type: ResourceType.REVIEW,
          parent_id: task.id,
          parent_type: ParentType.MARKETING_TASK,
          type: `Marketing submission was ${reviewOutcome}`,
        });
      }
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
      relations: ["marketing_submission", "marketing_submission.marketing_task"],
    });
    if (!review) throw new AppError(404, "Marketing review not found");

    if (review.reviewer_user_id !== currentUserId) {
      throw new AppError(403, "Only the original reviewer can update this review.");
    }

    const submission = review.marketing_submission;
    if (!submission) throw new AppError(404, "Associated submission not found");

    const task = submission.marketing_task;
    if (!task) throw new AppError(404, "Associated marketing task not found");
    if (task.task_state === TaskState.DEACTIVE) {
      throw new AppError(400, "Cannot update review for a deactivated task");
    }

    const taskId = submission.marketing_task_id;

    const latestSubmission = await this.submissionRepo.findOne({
      where: { marketing_task_id: taskId },
      order: { created_at: "DESC" },
    });

    if (latestSubmission && latestSubmission.id !== submission.id) {
      throw new AppError(400, "A newer submission exists for this task. Cannot update review.");
    }

    const newerReview = await this.reviewRepo
      .createQueryBuilder("mr")
      .where("mr.marketing_submission_id = :subId", { subId: submission.id })
      .andWhere("mr.id != :revId", { revId: reviewId })
      .andWhere("mr.created_at > :reviewCreatedAt", { reviewCreatedAt: review.created_at })
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
    }
    if (params.description !== undefined) {
      review.description = params.description;
    }
    review.updated_at = new Date();

    const saved = await this.reviewRepo.save(review);

    if (params.review_outcome !== undefined) {
      task.status = params.review_outcome;
      task.updated_by = currentUserId as any;
      task.updated_at = new Date();
      await this.taskRepo.save(task);
    }

    await this.refreshResourceNotifications(reviewId, currentUserId);

    return saved;
  }

  async getReviews(submissionId: string) {
    const submission = await this.submissionRepo.findOneBy({ id: submissionId });
    if (!submission) throw new AppError(404, "Marketing submission not found");

    const reviews = await this.reviewRepo
      .createQueryBuilder("r")
      .leftJoin("r.reviewer_user", "reviewer_user")
      .addSelect(safeUserColumns("reviewer_user"))
      .where("r.marketing_submission_id = :submissionId", { submissionId })
      .orderBy("r.created_at", "DESC")
      .getMany();

    return reviews.map((r) => ({
      ...r,
      reviewer_user: pickSafeUserFields(r.reviewer_user),
    }));
  }
}

export const marketingService = new MarketingService();
