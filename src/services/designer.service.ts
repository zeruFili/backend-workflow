import { In, Not } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { DesignerTask } from "../entities/DesignerTask";
import { DesignerApplication } from "../entities/DesignerApplication";
import { DesignerSubmission } from "../entities/DesignerSubmission";
import { DesignerSubmissionReview } from "../entities/DesignerSubmissionReview";
import { DesignerTaskReview } from "../entities/DesignerTaskReview";
import { PausedTask } from "../entities/PausedTask";
import { DesignerTaskRemoval } from "../entities/DesignerTaskRemoval";
import { User } from "../entities/User";
import { Notification } from "../entities/Notification";
import { ReviewOutcome } from "../enums/review-outcome.enum";
import { TaskState } from "../enums/task-state.enum";
import { DesignerStage } from "../enums/designer-stage.enum";
import { UserRole } from "../enums/user-role.enum";
import { ResourceType } from "../enums/resource-type.enum";
import { ParentType } from "../enums/parent-type.enum";
import { AppError } from "../middlewares/error.middleware";
import { pickSafeUserFields } from "../utils/response.utils";
import { safeUserColumns } from "../utils/user-columns.utils";
import { syncAttachments } from "../utils/upload.utils";

interface PaginatedParams {
  page: number;
  limit: number;
  status?: string;
  assignedTo?: string | null;
  isPublic?: boolean;
  isPaused?: boolean;
  search?: string;
  currentUser: { id: string; role: UserRole };
}

interface CreateTaskParams {
  title: string;
  description: string;
  story_point: number;
  is_public?: boolean;
  due_date?: string;
  assigned_to_user_id?: string;
  attachment_urls?: string[];
}

interface UpdateTaskParams {
  title?: string;
  description?: string;
  status?: ReviewOutcome;
  stage?: DesignerStage;
  is_public?: boolean;
  story_point?: number;
  due_date?: string;
  assigned_to_user_id?: string | null;
  attachment_urls?: string[];
}

interface UpdateTaskActor {
  id: string;
  role: UserRole;
}

interface ApplicationListParams {
  page: number;
  limit: number;
  taskId?: string;
  applicantId?: string;
  currentUser: { id: string; role: UserRole };
}

interface AssignedByUserSummary {
  id: string;
  full_name: string;
  role: UserRole;
}

const DESIGNER_TASK_LIST_FORBIDDEN_MESSAGE = "You are not authorized to view designer tasks.";

const STAGE_ORDER: DesignerStage[] = [
  DesignerStage.CASE_STUDY,
  DesignerStage.DESIGNING,
  DesignerStage.RENDERING,
  DesignerStage.FINAL_STAGE,
];

export class DesignerService {
  private taskRepo = AppDataSource.getRepository(DesignerTask);
  private applicationRepo = AppDataSource.getRepository(DesignerApplication);
  private submissionRepo = AppDataSource.getRepository(DesignerSubmission);
  private submissionReviewRepo = AppDataSource.getRepository(DesignerSubmissionReview);
  private taskReviewRepo = AppDataSource.getRepository(DesignerTaskReview);
  private pausedTaskRepo = AppDataSource.getRepository(PausedTask);
  private removalRepo = AppDataSource.getRepository(DesignerTaskRemoval);
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

  private async refreshResourceNotifications(resourceId: string, fromUserId: string, excludeTypes?: ResourceType[]) {
    const query: any = { resource_id: resourceId };
    if (excludeTypes && excludeTypes.length > 0) {
      query.resource_type = Not(In(excludeTypes));
    }
    const notifications = await this.notificationRepo.find({ where: query });

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
      parent_type: ParentType.DESIGNER_TASK,
      type: "New designer task assigned",
    }));

    for (const n of notifications) {
      await this.createNotification(n);
    }
  }

  private summarizeAssignedByUser(user?: User | null): AssignedByUserSummary | null {
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      full_name: user.full_name,
      role: user.role,
    };
  }

  private summarizeApplicantUser(user?: User | null): AssignedByUserSummary | null {
    return this.summarizeAssignedByUser(user);
  }

  private sanitizeDesignerTask<T extends { assigned_by_user?: User | null; assigned_to_user?: User | null; updated_by_user?: User | null }>(task: T) {
    return {
      ...task,
      assigned_by_user: this.summarizeAssignedByUser(task.assigned_by_user),
      assigned_to_user: pickSafeUserFields(task.assigned_to_user ?? null),
      updated_by_user: pickSafeUserFields(task.updated_by_user ?? null),
    };
  }

  private applyTaskListVisibilityScope(
    qb: ReturnType<typeof this.taskRepo.createQueryBuilder>,
    currentUser: { id: string; role: UserRole }
  ) {
    if (currentUser.role === UserRole.CEO || currentUser.role === UserRole.GENERAL_MANAGER) {
      return;
    }

    if (currentUser.role === UserRole.DESIGNER) {
      qb.andWhere("t.assigned_to_user_id = :currentUserId", { currentUserId: currentUser.id });
      return;
    }

    throw new AppError(403, DESIGNER_TASK_LIST_FORBIDDEN_MESSAGE);
  }

  async findAllTasks(params: PaginatedParams) {
    const { page, limit, status, assignedTo, isPublic, isPaused, search, currentUser } = params;
    const skip = (page - 1) * limit;

    // Phase 1: Paginated ID query (DB-level LIMIT/OFFSET sorted by activity)
    const { sql: idSql, params: idParams } = this.buildPaginatedIdQuery({
      status,
      assignedTo,
      isPublic,
      isPaused,
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
      assignedTo,
      isPublic,
      isPaused,
      search,
      currentUser,
    });
    const countResult = await this.taskRepo.query(countSql, countParams);
    const total: number = parseInt(countResult[0]?.count ?? "0", 10);

    // Phase 3: Load full task entities for the page subset only
    let data: DesignerTask[];
    if (taskIds.length > 0) {
      data = await this.taskRepo
        .createQueryBuilder("t")
        .leftJoin("t.assigned_to_user", "assigned_to_user")
        .leftJoin("t.assigned_by_user", "assigned_by_user")
        .leftJoin("t.updated_by_user", "updated_by_user")
        .addSelect(safeUserColumns("assigned_to_user"))
        .addSelect(safeUserColumns("assigned_by_user"))
        .addSelect(safeUserColumns("updated_by_user"))
        .where("t.id IN (:...taskIds)", { taskIds })
        .getMany();

      // Restore SQL sort order
      const idOrder: Record<string, number> = {};
      for (let i = 0; i < taskIds.length; i++) {
        idOrder[taskIds[i]] = i;
      }
      data.sort((a, b) => (idOrder[a.id] ?? 0) - (idOrder[b.id] ?? 0));
    } else {
      data = [];
    }

    // Phase 4: Batch-fetch relations (only for page-sized subset)
    const unreadNotifications = taskIds.length > 0
      ? await this.notificationRepo.find({
          where: { user_id: currentUser.id, parent_id: In(taskIds) as any, viewed: false },
        })
      : [];

    const notificationMap = new Map<string, string>();
    const rateNotifByReviewId = new Map<string, { notificationId: string }>();

    for (const n of unreadNotifications) {
      if (n.resource_type === ResourceType.POSTED_JOB) continue;
      if (n.resource_type === ResourceType.RATE) {
        rateNotifByReviewId.set(n.resource_id, { notificationId: n.id });
      } else {
        if (!notificationMap.has(n.resource_id)) {
          notificationMap.set(n.resource_id, n.id);
        }
      }
    }

    const submissionsByTask = await this.batchSubmissionsWithReviews(taskIds, notificationMap);
    const taskReviews = await this.batchTaskReviews(taskIds);

    const appliedStatuses = currentUser.role === UserRole.DESIGNER
      ? await this.batchApplicationDetails(taskIds, currentUser.id)
      : {};

    // Phase 5: Build response
    return {
      success: true,
      data: data.map((task) => {
        const swr = submissionsByTask[task.id] || {
          taskNotification: { hasNotification: false, notificationId: null },
          caseStudy: [],
          designing: [],
          rendering: [],
          finalStage: [],
        };
        const { taskNotification, ...restSwr } = swr;
        const hasNestedNotification =
          swr.caseStudy?.some((s: any) => s.hasNotification || (s.reviews || []).some((r: any) => r.hasNotification)) ||
          swr.designing?.some((s: any) => s.hasNotification || (s.reviews || []).some((r: any) => r.hasNotification)) ||
          swr.rendering?.some((s: any) => s.hasNotification || (s.reviews || []).some((r: any) => r.hasNotification)) ||
          swr.finalStage?.some((s: any) => s.hasNotification || (s.reviews || []).some((r: any) => r.hasNotification));
        return {
          ...this.sanitizeDesignerTask(task),
          taskNotification,
          submissionsWithReviews: restSwr,
          hasNestedNotification,
          taskReview: taskReviews[task.id]
            ? {
                id: taskReviews[task.id].id,
                reviewerName: taskReviews[task.id].reviewerName,
                reviewer_user: taskReviews[task.id].reviewer_user,
                reviewText: taskReviews[task.id].reviewText,
                ratings: taskReviews[task.id].ratings,
                submittedAt: taskReviews[task.id].submittedAt,
                updatedAt: taskReviews[task.id].updatedAt,
                hasNotification: rateNotifByReviewId.has(taskReviews[task.id].id),
                notificationId: rateNotifByReviewId.get(taskReviews[task.id].id)?.notificationId ?? null,
              }
            : null,
          applied: appliedStatuses[task.id]?.applied || false,
          coverNote: appliedStatuses[task.id]?.coverNote || null,
          applicationId: appliedStatuses[task.id]?.applicationId || null,
        };
      }),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private buildPaginatedIdQuery(args: {
    status?: string;
    assignedTo?: string | null;
    isPublic?: boolean;
    isPaused?: boolean;
    search?: string;
    currentUser: { id: string; role: UserRole };
    skip: number;
    limit: number;
  }): { sql: string; params: any[] } {
    const { status, assignedTo, isPublic, isPaused, search, currentUser, skip, limit } = args;
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 0;
    const p = (val: any) => { pIdx++; params.push(val); return `$${pIdx}`; };

    const hasExplicitFilter = assignedTo !== undefined || isPublic !== undefined;

    if (currentUser.role === UserRole.DESIGNER) {
      if (!hasExplicitFilter) {
        conditions.push(`t.assigned_to_user_id = ${p(currentUser.id)}`);
      }
    } else if (currentUser.role !== UserRole.CEO && currentUser.role !== UserRole.GENERAL_MANAGER) {
      throw new AppError(403, DESIGNER_TASK_LIST_FORBIDDEN_MESSAGE);
    }

    if (status) conditions.push(`t.status = ${p(status)}`);
    if (assignedTo === null) {
      conditions.push(`t.assigned_to_user_id IS NULL`);
    } else if (assignedTo) {
      conditions.push(`t.assigned_to_user_id = ${p(assignedTo)}`);
    }
    if (isPublic !== undefined) conditions.push(`t.is_public = ${p(isPublic)}`);
    if (isPaused !== undefined) conditions.push(`t.is_paused = ${p(isPaused)}`);

    let selectExprs = "t.id";
    let orderBy: string;
    if (search) {
      const searchPatternParam = p(`%${search}%`);
      const searchTermParam = p(search);
      conditions.push(
        `(t.title ILIKE ${searchPatternParam} OR t.description ILIKE ${searchPatternParam} ` +
        `OR word_similarity(${searchTermParam}::text, t.title) > 0.2 ` +
        `OR word_similarity(${searchTermParam}::text, t.description) > 0.2)`,
      );
      selectExprs = `t.id, GREATEST(word_similarity(${searchTermParam}::text, t.title), word_similarity(${searchTermParam}::text, t.description)) AS search_relevance`;
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
        COALESCE(subrev.max_ts, t.created_at),
        COALESCE(rev.max_ts, t.created_at)
      ) AS last_activity_at
      FROM designer_task t
      LEFT JOIN LATERAL (
        SELECT MAX(GREATEST(s.created_at, COALESCE(s.updated_at, s.created_at))) AS max_ts
        FROM designer_submission s
        WHERE s.designer_task_id = t.id
      ) sub ON true
      LEFT JOIN LATERAL (
        SELECT MAX(GREATEST(sr.created_at, COALESCE(sr.updated_at, sr.created_at))) AS max_ts
        FROM designer_submission s
        INNER JOIN designer_submission_review sr ON sr.designer_submission_id = s.id
        WHERE s.designer_task_id = t.id
      ) subrev ON true
      LEFT JOIN LATERAL (
        SELECT MAX(GREATEST(r.created_at, COALESCE(r.updated_at, r.created_at))) AS max_ts
        FROM designer_task_review r
        WHERE r.designer_task_id = t.id
      ) rev ON true
      ${where}
      ${orderBy}
      LIMIT ${p(limit)} OFFSET ${p(skip)}
    `;

    return { sql, params };
  }

  private buildCountQuery(args: {
    status?: string;
    assignedTo?: string | null;
    isPublic?: boolean;
    isPaused?: boolean;
    search?: string;
    currentUser: { id: string; role: UserRole };
  }): { sql: string; params: any[] } {
    const { status, assignedTo, isPublic, isPaused, search, currentUser } = args;
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 0;
    const p = (val: any) => { pIdx++; params.push(val); return `$${pIdx}`; };

    const hasExplicitFilter = assignedTo !== undefined || isPublic !== undefined;

    if (currentUser.role === UserRole.DESIGNER) {
      if (!hasExplicitFilter) {
        conditions.push(`t.assigned_to_user_id = ${p(currentUser.id)}`);
      }
    } else if (currentUser.role !== UserRole.CEO && currentUser.role !== UserRole.GENERAL_MANAGER) {
      throw new AppError(403, DESIGNER_TASK_LIST_FORBIDDEN_MESSAGE);
    }

    if (status) conditions.push(`t.status = ${p(status)}`);
    if (assignedTo === null) {
      conditions.push(`t.assigned_to_user_id IS NULL`);
    } else if (assignedTo) {
      conditions.push(`t.assigned_to_user_id = ${p(assignedTo)}`);
    }
    if (isPublic !== undefined) conditions.push(`t.is_public = ${p(isPublic)}`);
    if (isPaused !== undefined) conditions.push(`t.is_paused = ${p(isPaused)}`);

    if (search) {
      const sp = p(`%${search}%`);
      const st = p(search);
      conditions.push(
        `(t.title ILIKE ${sp} OR t.description ILIKE ${sp} ` +
        `OR word_similarity(${st}::text, t.title) > 0.2 ` +
        `OR word_similarity(${st}::text, t.description) > 0.2)`,
      );
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT COUNT(*) AS count FROM designer_task t ${where}`;

    return { sql, params };
  }

  private async batchSubmissionsWithReviews(
    taskIds: string[],
    notificationMap: Map<string, string>,
  ): Promise<Record<string, any>> {
    if (taskIds.length === 0) return {};

    const submissions = await this.submissionRepo.find({
      where: { designer_task_id: In(taskIds) },
    });

    const submissionIds = submissions.map((s) => s.id);

    const allReviews = submissionIds.length > 0
      ? await this.submissionReviewRepo
          .createQueryBuilder("r")
          .leftJoin("r.reviewer_user", "reviewer_user")
          .addSelect(safeUserColumns("reviewer_user"))
          .where("r.designer_submission_id IN (:...submissionIds)", { submissionIds })
          .getMany()
      : [];

    const reviewsBySubmission: Record<string, DesignerSubmissionReview[]> = {};
    for (const r of allReviews) {
      if (!reviewsBySubmission[r.designer_submission_id]) {
        reviewsBySubmission[r.designer_submission_id] = [];
      }
      reviewsBySubmission[r.designer_submission_id].push(r);
    }

    const submissionsByTask: Record<string, DesignerSubmission[]> = {};
    for (const s of submissions) {
      if (!submissionsByTask[s.designer_task_id]) {
        submissionsByTask[s.designer_task_id] = [];
      }
      submissionsByTask[s.designer_task_id].push(s);
    }

    const stageKeyMap: Record<string, string> = {
      [DesignerStage.CASE_STUDY]: "caseStudy",
      [DesignerStage.DESIGNING]: "designing",
      [DesignerStage.RENDERING]: "rendering",
      [DesignerStage.FINAL_STAGE]: "finalStage",
    };

    const result: Record<string, any> = {};

    for (const taskId of taskIds) {
      const taskSubmissions = submissionsByTask[taskId] || [];

      const hasTaskNotification = notificationMap.has(taskId)
        ? { hasNotification: true, notificationId: notificationMap.get(taskId) }
        : { hasNotification: false, notificationId: null };

      const submissionsWithNotification = taskSubmissions.map((submission) => {
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
          ...submission,
          ...subNotif,
          reviews,
          _sortTime: earliestSubmission,
        };
      });

      submissionsWithNotification.sort((a, b) => a._sortTime.getTime() - b._sortTime.getTime());

      const grouped: Record<string, any[]> = {
        caseStudy: [],
        designing: [],
        rendering: [],
        finalStage: [],
      };

      for (const item of submissionsWithNotification) {
        const { _sortTime, ...rest } = item;
        const stage = rest.stage;
        const key = stageKeyMap[stage] || "caseStudy";
        grouped[key].push(rest);
      }

      result[taskId] = {
        taskNotification: hasTaskNotification,
        caseStudy: grouped.caseStudy,
        designing: grouped.designing,
        rendering: grouped.rendering,
        finalStage: grouped.finalStage,
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

  private async batchTaskReviews(taskIds: string[]): Promise<Record<string, any>> {
    if (taskIds.length === 0) return {};

    const reviews = await this.taskReviewRepo
      .createQueryBuilder("r")
      .leftJoin("r.reviewer_user", "reviewer_user")
      .addSelect(safeUserColumns("reviewer_user"))
      .where("r.designer_task_id IN (:...taskIds)", { taskIds })
      .getMany();

    const result: Record<string, any> = {};
    for (const review of reviews) {
      result[review.designer_task_id] = {
        id: review.id,
        reviewerName: review.reviewer_user?.full_name ?? "Unknown",
        reviewer_user: pickSafeUserFields(review.reviewer_user ?? null),
        reviewText: review.description ?? "",
        ratings: {
          creativity: review.creativity,
          timeliness: review.timeliness,
          rendering: review.rendering_quality,
          clientUnderstanding: review.client_understanding,
        },
        submittedAt: review.created_at?.toISOString() ?? null,
        updatedAt: review.updated_at?.toISOString() ?? null,
        _submittedAtTs: review.created_at?.getTime() ?? 0,
        _updatedAtTs: review.updated_at?.getTime() ?? 0,
      };
    }
    return result;
  }

  private async batchApplicationDetails(taskIds: string[], userId: string): Promise<Record<string, { applied: boolean; coverNote: string | null; applicationId: string }>> {
    if (taskIds.length === 0) return {};

    const apps = await this.applicationRepo.find({
      where: { designer_task_id: In(taskIds), applicant_user_id: userId, is_withdrawn: false },
    });

    const result: Record<string, { applied: boolean; coverNote: string | null; applicationId: string }> = {};
    for (const app of apps) {
      result[app.designer_task_id] = { applied: true, coverNote: app.cover_note, applicationId: app.id };
    }
    return result;
  }

  async findTaskById(id: string, currentUser?: { id: string; role: UserRole }) {
    const task = await this.taskRepo
      .createQueryBuilder("t")
      .leftJoin("t.assigned_to_user", "assigned_to_user")
      .leftJoin("t.assigned_by_user", "assigned_by_user")
      .leftJoin("t.updated_by_user", "updated_by_user")
      .addSelect(safeUserColumns("assigned_to_user"))
      .addSelect(safeUserColumns("assigned_by_user"))
      .addSelect(safeUserColumns("updated_by_user"))
      .where("t.id = :id", { id })
      .getOne();
    if (!task) throw new AppError(404, "Designer task not found");

    if (currentUser) {
      if (currentUser.role === UserRole.CEO || currentUser.role === UserRole.GENERAL_MANAGER) {
        // CEO and GM can view any task
      } else if (currentUser.role === UserRole.DESIGNER) {
        if (task.assigned_to_user_id !== currentUser.id) {
          throw new AppError(403, "You are not authorized to view this designer task.");
        }
      } else {
        throw new AppError(403, DESIGNER_TASK_LIST_FORBIDDEN_MESSAGE);
      }
    }

    const submissions = await this.submissionRepo.find({
      where: { designer_task_id: id },
      order: { created_at: "ASC" },
    });

    const applications = await this.applicationRepo
      .createQueryBuilder("a")
      .leftJoin("a.applicant_user", "applicant_user")
      .addSelect(safeUserColumns("applicant_user"))
      .where("a.designer_task_id = :taskId", { taskId: id })
      .orderBy("a.created_at", "DESC")
      .getMany();

    const sanitizedApplications = applications.map((a) => ({
      ...a,
      applicant_user: this.summarizeApplicantUser(a.applicant_user as any),
    }));

    return {
      ...this.sanitizeDesignerTask(task),
      submissions,
      applications: sanitizedApplications,
    };
  }

  async createTask(params: CreateTaskParams, assignedByUserId: string) {
    const task = new DesignerTask();
    task.title = params.title;
    task.description = params.description;
    task.assigned_by_user_id = assignedByUserId;
    task.assigned_to_user_id = (params.assigned_to_user_id ?? null) as any;
    task.story_point = params.story_point;
    task.is_public = params.is_public ?? false;
    task.due_date = (params.due_date ?? null) as any;
    task.attachment_urls = (params.attachment_urls ?? null) as any;
    task.status = ReviewOutcome.PENDING;
    task.task_state = TaskState.ACTIVE;
    task.is_paused = false;

    const saved = await this.taskRepo.save(task);

    // Notify CEO and General Manager (unless they are the creator)
    const ceoGmUsers = await this.userRepo.find({
      where: [
        { role: UserRole.CEO, is_active: true },
        { role: UserRole.GENERAL_MANAGER, is_active: true },
      ],
    });

    for (const leader of ceoGmUsers) {
      if (leader.id === assignedByUserId) continue;
      await this.createNotification({
        user_id: leader.id,
        from_user_id: assignedByUserId,
        resource_id: saved.id,
        resource_type: ResourceType.POSTED_JOB,
        parent_id: saved.id,
        parent_type: ParentType.DESIGNER_TASK,
        type: "New designer task created",
      });
    }

    // Notify all active designers if the task is public and unassigned
    if (saved.is_public && !saved.assigned_to_user_id) {
      const designers = await this.userRepo.find({
        where: { role: UserRole.DESIGNER, is_active: true },
      });

      for (const designer of designers) {
        await this.createNotification({
          user_id: designer.id,
          from_user_id: assignedByUserId,
          resource_id: saved.id,
          resource_type: ResourceType.POSTED_JOB,
          parent_id: saved.id,
          parent_type: ParentType.DESIGNER_TASK,
          type: "New public designer task available",
        });
      }
    }

    if (saved.assigned_to_user_id) {
      await this.notifyTaskAssignment(saved.id, saved.assigned_to_user_id, assignedByUserId);
    }

    return saved;
  }

  async updateTask(id: string, params: UpdateTaskParams, currentUser: UpdateTaskActor) {
    console.log('[DesignerService.updateTask] ========== UPDATE TASK SERVICE ==========');
    console.log('[DesignerService.updateTask] Task ID:', id);
    console.log('[DesignerService.updateTask] Params:', JSON.stringify(params, null, 2));
    console.log('[DesignerService.updateTask] Current user:', { id: currentUser.id, role: currentUser.role });

    const task = await this.taskRepo.findOneBy({ id });
    if (!task) throw new AppError(404, "Designer task not found");

    console.log('[DesignerService.updateTask] TASK BEFORE UPDATE:');
    console.log('[DesignerService.updateTask]   - title:', task.title);
    console.log('[DesignerService.updateTask]   - description:', task.description ? task.description.substring(0, 100) + '...' : 'null');
    console.log('[DesignerService.updateTask]   - story_point:', task.story_point);
    console.log('[DesignerService.updateTask]   - is_public:', task.is_public);
    console.log('[DesignerService.updateTask]   - due_date:', task.due_date);
    console.log('[DesignerService.updateTask]   - assigned_to_user_id:', task.assigned_to_user_id);
    console.log('[DesignerService.updateTask]   - assigned_at:', task.assigned_at);
    console.log('[DesignerService.updateTask]   - stage:', task.stage);
    console.log('[DesignerService.updateTask]   - status:', task.status);
    console.log('[DesignerService.updateTask]   - is_paused:', task.is_paused);
    console.log('[DesignerService.updateTask]   - attachment_urls:', task.attachment_urls);

    if (currentUser.role === UserRole.GENERAL_MANAGER) {
      if (task.assigned_by_user_id !== currentUser.id) {
        throw new AppError(403, "Only the General Manager who created this task can update it");
      }
    } else if (currentUser.role === UserRole.CEO) {
      // CEO can update any task
    } else {
      throw new AppError(403, DESIGNER_TASK_LIST_FORBIDDEN_MESSAGE);
    }

    const existingSubmission = await this.submissionRepo.findOne({
      where: { designer_task_id: id },
    });
    if (existingSubmission) {
      throw new AppError(400, "This task can no longer be edited because a submission has already been created. Please refresh the page.");
    }

    if (task.assigned_to_user_id && task.assigned_at) {
      const hoursSinceAssignment = (Date.now() - task.assigned_at.getTime()) / (1000 * 60 * 60);
      if (hoursSinceAssignment > 48) {
        throw new AppError(400, "This task can no longer be edited because the 2-day editing window has expired since assignment.");
      }
    }

    const previousAssignee = task.assigned_to_user_id;
    const previousIsPublic = task.is_public;

    console.log('[DesignerService.updateTask] VALUES BEING UPDATED:');
    if (params.title !== undefined) { task.title = params.title; console.log('[DesignerService.updateTask]   - title:', params.title); }
    if (params.description !== undefined) { task.description = params.description; console.log('[DesignerService.updateTask]   - description:', params.description?.substring(0, 80) + '...'); }
    if (params.status !== undefined) { task.status = params.status; console.log('[DesignerService.updateTask]   - status:', params.status); }
    if (params.stage !== undefined) { task.stage = params.stage; console.log('[DesignerService.updateTask]   - stage:', params.stage); }
    if (params.is_public !== undefined) { task.is_public = params.is_public; console.log('[DesignerService.updateTask]   - is_public:', params.is_public); }
    if (params.story_point !== undefined) { task.story_point = params.story_point; console.log('[DesignerService.updateTask]   - story_point:', params.story_point); }
    if (params.due_date !== undefined) { task.due_date = params.due_date as any; console.log('[DesignerService.updateTask]   - due_date:', params.due_date); }
    if (params.assigned_to_user_id !== undefined) {
      task.assigned_to_user_id = params.assigned_to_user_id as any;
      task.assigned_at = params.assigned_to_user_id ? (previousAssignee ? task.assigned_at : new Date()) : null;
      console.log('[DesignerService.updateTask]   - assigned_to_user_id:', params.assigned_to_user_id, '(was:', previousAssignee, ')');
      console.log('[DesignerService.updateTask]   - assigned_at set to:', task.assigned_at);
    }
    if (params.attachment_urls !== undefined) {
      task.attachment_urls = syncAttachments(task.attachment_urls, params.attachment_urls) as any;
      console.log('[DesignerService.updateTask]   - attachment_urls:', task.attachment_urls);
    }

    task.updated_by = currentUser.id as any;
    task.updated_at = new Date();

    const saved = await this.taskRepo.save(task);

    await this.refreshResourceNotifications(id, currentUser.id, [ResourceType.POSTED_JOB]);

    // Handle is_public changes
    if (params.is_public !== undefined && params.is_public !== previousIsPublic) {
      if (params.is_public && !saved.assigned_to_user_id) {
        // Task changed to Public → notify all active designers
        const designers = await this.userRepo.find({
          where: { role: UserRole.DESIGNER, is_active: true },
        });
        for (const designer of designers) {
          await this.createNotification({
            user_id: designer.id,
            from_user_id: currentUser.id,
            resource_id: saved.id,
            resource_type: ResourceType.POSTED_JOB,
            parent_id: saved.id,
            parent_type: ParentType.DESIGNER_TASK,
            type: "New public designer task available",
          });
        }
      } else {
        // Task changed to Not Public → clear Designer-specific public-task notifications
        const designerUsers = await this.userRepo.find({
          where: { role: UserRole.DESIGNER, is_active: true },
          select: ["id"],
        });
        if (designerUsers.length > 0) {
          const designerIds = designerUsers.map((d) => d.id);
          await this.notificationRepo.update(
            {
              user_id: In(designerIds),
              parent_id: id,
              resource_type: ResourceType.POSTED_JOB,
              viewed: false,
            },
            { viewed: true }
          );
        }
      }
    }

    if (params.assigned_to_user_id !== undefined && params.assigned_to_user_id !== previousAssignee) {
      if (previousAssignee) {
        await this.notificationRepo.delete({
          parent_id: id,
          resource_type: ResourceType.TASK_ASSIGNED,
          user_id: previousAssignee,
        });
      }
      if (params.assigned_to_user_id) {
        await this.notifyTaskAssignment(saved.id, params.assigned_to_user_id, currentUser.id);
        // Clear Designer-specific public-task notifications since the task is now assigned
        const designerUsers = await this.userRepo.find({
          where: { role: UserRole.DESIGNER, is_active: true },
          select: ["id"],
        });
        if (designerUsers.length > 0) {
          const designerIds = designerUsers.map((d) => d.id);
          await this.notificationRepo.update(
            {
              user_id: In(designerIds),
              parent_id: id,
              resource_type: ResourceType.POSTED_JOB,
              viewed: false,
            },
            { viewed: true }
          );
        }
      }
    }

    const ceoGmUsers = await this.userRepo.find({
      where: [
        { role: UserRole.CEO, is_active: true },
        { role: UserRole.GENERAL_MANAGER, is_active: true },
      ],
    });
    for (const leader of ceoGmUsers) {
      if (leader.id === currentUser.id) continue;
      await this.createNotification({
        user_id: leader.id,
        from_user_id: currentUser.id,
        resource_id: id,
        resource_type: ResourceType.TASK_ASSIGNED,
        parent_id: id,
        parent_type: ParentType.DESIGNER_TASK,
        type: "Designer task updated",
      });
    }

    const enriched = await this.taskRepo
      .createQueryBuilder("t")
      .leftJoin("t.assigned_to_user", "assigned_to_user")
      .leftJoin("t.assigned_by_user", "assigned_by_user")
      .leftJoin("t.updated_by_user", "updated_by_user")
      .addSelect(safeUserColumns("assigned_to_user"))
      .addSelect(safeUserColumns("assigned_by_user"))
      .addSelect(safeUserColumns("updated_by_user"))
      .where("t.id = :id", { id })
      .getOne();
    if (!enriched) throw new AppError(404, "Designer task not found after update");
    return this.sanitizeDesignerTask(enriched);
  }

  async assignDesigner(taskId: string, designerUserId: string, assignedByUserId: string) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Designer task not found");

    const isReassignment = !!task.assigned_to_user_id;
    const previousAssigneeId = task.assigned_to_user_id;

    if (isReassignment) {
      const submissionCount = await this.submissionRepo.count({
        where: { designer_task_id: taskId },
      });

      if (submissionCount > 0) {
        throw new AppError(
          409,
          "Cannot reassign: the assigned designer has already made submissions for this task."
        );
      }

      const assignedAt = task.assigned_at;
      if (assignedAt) {
        const hoursSinceAssignment =
          (Date.now() - assignedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceAssignment > 48) {
          throw new AppError(
            409,
            "Cannot reassign: the 2-day editing window has expired. Task updates are no longer allowed after 2 days from assignment."
          );
        }
      }

      if (previousAssigneeId) {
        await this.notificationRepo.delete({
          parent_id: taskId,
          resource_type: ResourceType.TASK_ASSIGNED,
          user_id: previousAssigneeId,
        });
      }
    }

    const designer = await this.userRepo.findOne({
      where: { id: designerUserId, role: UserRole.DESIGNER, is_active: true },
    });
    if (!designer) throw new AppError(404, "Designer not found or not active");

    task.assigned_to_user_id = designerUserId as any;
    task.assigned_at = new Date();
    task.updated_by = assignedByUserId as any;
    task.updated_at = new Date();
    await this.taskRepo.save(task);

    const pendingApplications = await this.applicationRepo.find({
      where: { designer_task_id: taskId },
    });

    for (const app of pendingApplications) {
      if (app.applicant_user_id !== designerUserId) {
        await this.applicationRepo.delete({ id: app.id });
      }
    }

    await this.notifyTaskAssignment(taskId, designerUserId, assignedByUserId);

    // Clear Designer-specific public-task notifications since the task is now assigned
    const designerUsers = await this.userRepo.find({
      where: { role: UserRole.DESIGNER, is_active: true },
      select: ["id"],
    });
    if (designerUsers.length > 0) {
      const designerIds = designerUsers.map((d) => d.id);
      await this.notificationRepo.update(
        {
          user_id: In(designerIds),
          parent_id: taskId,
          resource_type: ResourceType.POSTED_JOB,
          viewed: false,
        },
        { viewed: true }
      );
    }

    const saved = await this.taskRepo
      .createQueryBuilder("t")
      .leftJoin("t.assigned_to_user", "assigned_to_user")
      .leftJoin("t.assigned_by_user", "assigned_by_user")
      .leftJoin("t.updated_by_user", "updated_by_user")
      .addSelect(safeUserColumns("assigned_to_user"))
      .addSelect(safeUserColumns("assigned_by_user"))
      .addSelect(safeUserColumns("updated_by_user"))
      .where("t.id = :id", { id: taskId })
      .getOne();
    if (!saved) throw new AppError(404, "Designer task not found after update");
    return saved;
  }

  async apply(taskId: string, applicantUserId: string, coverNote?: string) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Designer task not found");

    if (!task.is_public) {
      throw new AppError(400, "This task is not open for applications");
    }

    if (task.assigned_to_user_id) {
      throw new AppError(400, "This task is already assigned");
    }

    const existing = await this.applicationRepo.findOne({
      where: { designer_task_id: taskId, applicant_user_id: applicantUserId },
    });
    if (existing) {
      if (existing.is_withdrawn) {
        existing.is_withdrawn = false;
        existing.cover_note = coverNote ?? existing.cover_note;
        existing.updated_at = new Date();
        const saved = await this.applicationRepo.save(existing);

        const ceoGm = await this.userRepo.find({
          where: [
            { role: UserRole.CEO, is_active: true },
            { role: UserRole.GENERAL_MANAGER, is_active: true },
          ],
        });
        for (const reviewer of ceoGm) {
          await this.createNotification({
            user_id: reviewer.id,
            from_user_id: applicantUserId,
            resource_id: saved.id,
            resource_type: ResourceType.APPLY,
            parent_id: taskId,
            parent_type: ParentType.DESIGNER_TASK,
            type: "New designer application submitted",
          });
        }
    return saved;

    const reloaded = await this.taskReviewRepo.findOne({
      where: { id: saved.id },
      relations: ["reviewer_user"],
    });
    return {
      id: reloaded!.id,
      reviewerName: reloaded!.reviewer_user?.full_name ?? "Unknown",
      reviewer_user: pickSafeUserFields(reloaded!.reviewer_user ?? null),
      reviewText: reloaded!.description ?? "",
      ratings: {
        creativity: reloaded!.creativity,
        timeliness: reloaded!.timeliness,
        rendering: reloaded!.rendering_quality,
        clientUnderstanding: reloaded!.client_understanding,
      },
      submittedAt: reloaded!.created_at?.toISOString() ?? null,
      updatedAt: reloaded!.updated_at?.toISOString() ?? null,
    };
      }
      throw new AppError(409, "You have already applied for this task");
    }

    const application = new DesignerApplication();
    application.designer_task_id = taskId;
    application.applicant_user_id = applicantUserId;
    application.cover_note = coverNote ?? null as any;

    const saved = await this.applicationRepo.save(application);

    const ceoGm = await this.userRepo.find({
      where: [
        { role: UserRole.CEO, is_active: true },
        { role: UserRole.GENERAL_MANAGER, is_active: true },
      ],
    });

    for (const reviewer of ceoGm) {
      await this.createNotification({
        user_id: reviewer.id,
        from_user_id: applicantUserId,
        resource_id: saved.id,
        resource_type: ResourceType.APPLY,
        parent_id: taskId,
        parent_type: ParentType.DESIGNER_TASK,
        type: "New designer application submitted",
      });
    }

    return saved;
  }

  async withdrawApplication(taskId: string, applicantUserId: string) {
    console.log('[DesignerService.withdrawApplication] ========== WITHDRAW APPLICATION ==========');
    console.log('[DesignerService.withdrawApplication] Task ID:', taskId);
    console.log('[DesignerService.withdrawApplication] Applicant user ID:', applicantUserId);

    const application = await this.applicationRepo.findOne({
      where: { designer_task_id: taskId, applicant_user_id: applicantUserId },
    });
    console.log('[DesignerService.withdrawApplication] Application found:', application ? `yes (id=${application.id}, is_withdrawn=${application.is_withdrawn})` : 'NO');
    if (!application) {
      console.log('[DesignerService.withdrawApplication] ERROR: Application not found');
      throw new AppError(404, "Application not found");
    }
    if (application.is_withdrawn) {
      console.log('[DesignerService.withdrawApplication] ERROR: Application already withdrawn');
      throw new AppError(400, "Application is already withdrawn");
    }

    application.is_withdrawn = true;
    application.updated_at = new Date();
    console.log('[DesignerService.withdrawApplication] Marking as withdrawn, updated_at:', application.updated_at);
    const saved = await this.applicationRepo.save(application);
    console.log('[DesignerService.withdrawApplication] Saved successfully, is_withdrawn:', saved.is_withdrawn);

    const deleteResult = await this.notificationRepo.delete({
      resource_type: ResourceType.APPLY,
      parent_id: taskId,
      from_user_id: applicantUserId,
      viewed: false,
    });
    console.log('[DesignerService.withdrawApplication] Notifications deleted:', deleteResult.affected);

    console.log('[DesignerService.withdrawApplication] ========== WITHDRAW COMPLETE ==========');
    return saved;
  }

  async updateApplication(taskId: string, applicantUserId: string, coverNote: string) {
    const application = await this.applicationRepo.findOne({
      where: { designer_task_id: taskId, applicant_user_id: applicantUserId },
    });
    if (!application) throw new AppError(404, "Application not found");
    if (application.is_withdrawn) throw new AppError(400, "Cannot update a withdrawn application");

    application.cover_note = coverNote;
    application.updated_at = new Date();
    return await this.applicationRepo.save(application);
  }

  async listApplications(params: ApplicationListParams) {
    const { page, limit, taskId, applicantId, currentUser } = params;

    const qb = this.applicationRepo.createQueryBuilder("a")
      .leftJoin("a.applicant_user", "applicant_user")
      .addSelect(safeUserColumns("applicant_user"))
      .leftJoinAndSelect("a.designer_task", "designer_task");

    const isDesigner = currentUser.role === UserRole.DESIGNER;
    if (isDesigner) {
      qb.andWhere("a.applicant_user_id = :userId", { userId: currentUser.id });
    }

    if (taskId) qb.andWhere("a.designer_task_id = :taskId", { taskId });
    if (applicantId) qb.andWhere("a.applicant_user_id = :applicantId", { applicantId });

    qb.orderBy("a.created_at", "DESC");

    const skip = (page - 1) * limit;
    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    const sanitized = data.map((a) => ({
      ...a,
      applicant_user: this.summarizeApplicantUser((a as any).applicant_user),
      is_withdrawn: a.is_withdrawn,
    }));

    return {
      success: true,
      data: sanitized,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async createSubmission(
    taskId: string,
    userId: string,
    stage: DesignerStage | undefined,
    description: string,
    attachmentUrls?: string[]
  ) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Designer task not found");

    if (task.assigned_to_user_id !== userId) {
      throw new AppError(403, "Only the assigned Designer can create submissions for this task.");
    }

    if (task.task_state !== TaskState.ACTIVE) {
      throw new AppError(400, "Cannot submit to a deactive task");
    }

    if (task.is_paused) {
      throw new AppError(409, "Cannot submit to a paused task");
    }

    if (task.status === ReviewOutcome.REJECTED) {
      throw new AppError(400, "Submission is not allowed because the parent task has been rejected.");
    }

    const resolvedStage = stage ?? task.stage ?? DesignerStage.CASE_STUDY;
    const stageIdx = STAGE_ORDER.indexOf(resolvedStage);
    if (stageIdx === -1) {
      throw new AppError(400, `Invalid stage: ${resolvedStage}`);
    }

    if (task.stage) {
      const currentStageIdx = STAGE_ORDER.indexOf(task.stage);
      if (stageIdx > currentStageIdx + 1) {
        throw new AppError(
          400,
          `Cannot skip stages. Current stage is "${task.stage}".`
        );
      }
      // Allow submissions to previous stages (no rejection for stageIdx < currentStageIdx)
    }

    const submission = new DesignerSubmission();
    submission.designer_task_id = taskId;
    submission.stage = resolvedStage;
    submission.description = description;
    submission.attachment_urls = (attachmentUrls ?? null) as any;

    const saved = await this.submissionRepo.save(submission);

    task.status = ReviewOutcome.PENDING;
    // Only advance the stage forward, never roll back to a previous stage
    if (!task.stage || stageIdx >= STAGE_ORDER.indexOf(task.stage)) {
      task.stage = resolvedStage;
    }
    task.updated_by = userId as any;
    task.updated_at = new Date();
    await this.taskRepo.save(task);

    const ceoGm = await this.userRepo.find({
      where: [
        { role: UserRole.CEO, is_active: true },
        { role: UserRole.GENERAL_MANAGER, is_active: true },
      ],
    });

    for (const reviewer of ceoGm) {
      await this.createNotification({
        user_id: reviewer.id,
        from_user_id: userId,
        resource_id: saved.id,
        resource_type: ResourceType.SUBMISSION,
        parent_id: taskId,
        parent_type: ParentType.DESIGNER_TASK,
        type: `Designer submission for stage "${resolvedStage}"`,
      });
    }

    return saved;
  }

  async updateSubmission(
    submissionId: string,
    userId: string,
    params: { description?: string; stage?: DesignerStage; attachment_urls?: string[] }
  ) {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ["designer_task"],
    });
    if (!submission) throw new AppError(404, "Designer submission not found");

    const task = submission.designer_task;
    if (task) {
      if (task.assigned_to_user_id !== userId) {
        throw new AppError(403, "Only the assigned Designer can update this submission.");
      }

      if (task.status === ReviewOutcome.REJECTED) {
        throw new AppError(400, "This submission cannot be updated because the parent task has been rejected.");
      }

      if (task.task_state !== TaskState.ACTIVE) {
        throw new AppError(400, "Cannot update submission for a deactive task.");
      }
    }

    const existingReview = await this.submissionReviewRepo.findOneBy({ designer_submission_id: submissionId });
    if (existingReview) {
      throw new AppError(400, "Cannot update submission that has already been reviewed.");
    }

    if (params.description !== undefined) submission.description = params.description;
    if (params.stage !== undefined) submission.stage = params.stage;
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

  async createSubmissionReview(
    submissionId: string,
    reviewerUserId: string,
    reviewOutcome: ReviewOutcome,
    description: string,
    taskState?: string
  ) {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ["designer_task"],
    });
    if (!submission) throw new AppError(404, "Designer submission not found");

    const task = submission.designer_task;
    if (!task) throw new AppError(404, "Associated designer task not found for this submission");
    if (taskState === TaskState.DEACTIVE || task.task_state === TaskState.DEACTIVE) {
      throw new AppError(400, "Cannot review a submission for a deactivated task");
    }

    if (
      task.stage === DesignerStage.FINAL_STAGE &&
      task.status === ReviewOutcome.APPROVED
    ) {
      throw new AppError(
        400,
        "Reviews cannot be submitted for a final task that has already been approved."
      );
    }

    task.status = reviewOutcome;
    task.updated_by = reviewerUserId as any;
    task.updated_at = new Date();
    await this.taskRepo.save(task);

    const review = new DesignerSubmissionReview();
    review.designer_submission_id = submissionId;
    review.reviewer_user_id = reviewerUserId;
    review.review_outcome = reviewOutcome;
    review.description = description;

    const saved = await this.submissionReviewRepo.save(review);

    if (task.assigned_to_user_id) {
      await this.createNotification({
        user_id: task.assigned_to_user_id,
        from_user_id: reviewerUserId,
        resource_id: saved.id,
        resource_type: ResourceType.REVIEW,
        parent_id: task.id,
        parent_type: ParentType.DESIGNER_TASK,
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
        parent_type: ParentType.DESIGNER_TASK,
        type: `Designer review: ${reviewOutcome}`,
      });
    }

    return saved;
  }

  async updateSubmissionReview(
    reviewId: string,
    reviewerUserId: string,
    submissionId: string,
    taskId: string,
    params: { review_outcome?: ReviewOutcome; description?: string; task_state?: string }
  ) {
    const review = await this.submissionReviewRepo.findOne({
      where: { id: reviewId },
    });
    if (!review) throw new AppError(404, "Designer submission review not found");

    if (review.reviewer_user_id !== reviewerUserId) {
      throw new AppError(403, "You are not authorized to update this review.");
    }

    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId, designer_task_id: taskId },
    });
    if (!submission) {
      throw new AppError(404, "Submission not found for the given task");
    }

    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new AppError(404, "Designer task not found");

    const effectiveTaskState = params.task_state || task.task_state;
    if (effectiveTaskState === TaskState.DEACTIVE) {
      throw new AppError(400, "Cannot update review for a deactivated task");
    }

    const hoursSinceCreation = (Date.now() - review.created_at.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreation > 24) {
      throw new AppError(400, "Reviews can only be updated within 24 hours of creation");
    }

    const latestSubmission = await this.submissionRepo.findOne({
      where: { designer_task_id: taskId, stage: submission.stage },
      order: { created_at: "DESC" },
    });

    if (latestSubmission && latestSubmission.id !== submissionId) {
      throw new AppError(400, "A newer submission exists for this task. Cannot update this review.");
    }

    const newerReview = await this.submissionReviewRepo
      .createQueryBuilder("sr")
      .where("sr.designer_submission_id = :subId", { subId: review.designer_submission_id })
      .andWhere("sr.id != :revId", { revId: reviewId })
      .andWhere("sr.created_at > :reviewCreatedAt", { reviewCreatedAt: review.created_at })
      .getOne();
    if (newerReview) {
      throw new AppError(400, "A newer review already exists for this submission. This review cannot be edited.");
    }

    if (params.review_outcome !== undefined) {
      review.review_outcome = params.review_outcome;
      task.status = params.review_outcome;
      task.updated_by = reviewerUserId as any;
      task.updated_at = new Date();
      await this.taskRepo.save(task);
    }

    if (params.description !== undefined) {
      review.description = params.description;
    }
    review.updated_at = new Date();

    const saved = await this.submissionReviewRepo.save(review);

    await this.refreshResourceNotifications(reviewId, reviewerUserId);

    return saved;
  }

  async createTaskReview(
    taskId: string,
    reviewerUserId: string,
    creativity: number,
    timeliness: number,
    renderingQuality: number,
    clientUnderstanding: number,
    description?: string
  ) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Designer task not found");

    if (task.stage !== DesignerStage.FINAL_STAGE || task.status !== ReviewOutcome.APPROVED) {
      throw new AppError(
        400,
        "A designer's performance can only be rated after the task reaches the final stage and has been approved."
      );
    }

    const existingReview = await this.taskReviewRepo.findOneBy({ designer_task_id: taskId });
    if (existingReview) {
      throw new AppError(409, "This designer task has already been rated and cannot be rated again.");
    }

    const review = new DesignerTaskReview();
    review.designer_task_id = taskId;
    review.reviewer_user_id = reviewerUserId;
    review.creativity = creativity;
    review.timeliness = timeliness;
    review.rendering_quality = renderingQuality;
    review.client_understanding = clientUnderstanding;
    review.description = (description ?? null) as any;

    const saved = await this.taskReviewRepo.save(review);

    if (task.assigned_to_user_id) {
      await this.createNotification({
        user_id: task.assigned_to_user_id,
        from_user_id: reviewerUserId,
        resource_id: saved.id,
        resource_type: ResourceType.RATE,
        parent_id: taskId,
        parent_type: ParentType.DESIGNER_TASK,
        type: "Your task has received a final evaluation",
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
      if (leader.id === task.assigned_to_user_id) continue;
      await this.createNotification({
        user_id: leader.id,
        from_user_id: reviewerUserId,
        resource_id: saved.id,
        resource_type: ResourceType.RATE,
        parent_id: taskId,
        parent_type: ParentType.DESIGNER_TASK,
        type: "A designer task rating has been updated",
      });
    }

    const reloaded = await this.taskReviewRepo
      .createQueryBuilder("r")
      .leftJoin("r.reviewer_user", "reviewer_user")
      .addSelect(safeUserColumns("reviewer_user"))
      .where("r.id = :id", { id: saved.id })
      .getOne();
    return {
      id: reloaded!.id,
      reviewerName: reloaded!.reviewer_user?.full_name ?? "Unknown",
      reviewer_user: pickSafeUserFields(reloaded!.reviewer_user ?? null),
      reviewText: reloaded!.description ?? "",
      ratings: {
        creativity: reloaded!.creativity,
        timeliness: reloaded!.timeliness,
        rendering: reloaded!.rendering_quality,
        clientUnderstanding: reloaded!.client_understanding,
      },
      submittedAt: reloaded!.created_at?.toISOString() ?? null,
      updatedAt: reloaded!.updated_at?.toISOString() ?? null,
    };
  }

  async updateTaskReview(
    reviewId: string,
    currentUserId: string,
    currentUserRole: UserRole,
    params: { creativity?: number; timeliness?: number; renderingQuality?: number; clientUnderstanding?: number; description?: string }
  ) {
    const review = await this.taskReviewRepo.findOne({
      where: { id: reviewId },
      relations: ["designer_task"],
    });
    if (!review) throw new AppError(404, "Designer task review not found");

    if (currentUserRole !== UserRole.CEO && review.reviewer_user_id !== currentUserId) {
      throw new AppError(403, "You are not authorized to update this rating.");
    }

    const daysSinceCreation = (Date.now() - review.created_at.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreation > 7) {
      throw new AppError(400, "This rating can no longer be updated. Ratings may only be modified within 7 days of creation.");
    }

    if (params.creativity !== undefined) review.creativity = params.creativity;
    if (params.timeliness !== undefined) review.timeliness = params.timeliness;
    if (params.renderingQuality !== undefined) review.rendering_quality = params.renderingQuality;
    if (params.clientUnderstanding !== undefined) review.client_understanding = params.clientUnderstanding;
    if (params.description !== undefined) review.description = params.description;

    if (currentUserRole === UserRole.CEO) {
      review.reviewer_user_id = currentUserId;
    }

    review.updated_at = new Date();

    const saved = await this.taskReviewRepo.save(review);

    const task = review.designer_task;

    const notifications = await this.notificationRepo.find({
      where: { resource_id: reviewId },
    });

    for (const n of notifications) {
      n.viewed = false;
      n.from_user_id = currentUserId;
      n.updated_at = new Date();
    }

    if (notifications.length > 0) {
      await this.notificationRepo.save(notifications);
    }

    const existingRecipientIds = new Set(notifications.map((n) => n.user_id));

    const ceoGm = await this.userRepo.find({
      where: [
        { role: UserRole.CEO, is_active: true },
        { role: UserRole.GENERAL_MANAGER, is_active: true },
      ],
    });

    for (const user of ceoGm) {
      if (user.id === currentUserId) continue;
      if (existingRecipientIds.has(user.id)) continue;
      await this.createNotification({
        user_id: user.id,
        from_user_id: currentUserId,
        resource_id: saved.id,
        resource_type: ResourceType.RATE,
        parent_id: review.designer_task_id,
        parent_type: ParentType.DESIGNER_TASK,
        type: "A designer task rating has been updated",
      });
    }

    if (task?.assigned_to_user_id && task.assigned_to_user_id !== currentUserId && !existingRecipientIds.has(task.assigned_to_user_id)) {
      await this.createNotification({
        user_id: task.assigned_to_user_id,
        from_user_id: currentUserId,
        resource_id: saved.id,
        resource_type: ResourceType.RATE,
        parent_id: review.designer_task_id,
        parent_type: ParentType.DESIGNER_TASK,
        type: "Your task rating has been updated",
      });
    }

    const reloaded = await this.taskReviewRepo
      .createQueryBuilder("r")
      .leftJoin("r.reviewer_user", "reviewer_user")
      .addSelect(safeUserColumns("reviewer_user"))
      .where("r.id = :id", { id: saved.id })
      .getOne();
    return {
      id: reloaded!.id,
      reviewerName: reloaded!.reviewer_user?.full_name ?? "Unknown",
      reviewer_user: pickSafeUserFields(reloaded!.reviewer_user ?? null),
      reviewText: reloaded!.description ?? "",
      ratings: {
        creativity: reloaded!.creativity,
        timeliness: reloaded!.timeliness,
        rendering: reloaded!.rendering_quality,
        clientUnderstanding: reloaded!.client_understanding,
      },
      submittedAt: reloaded!.created_at?.toISOString() ?? null,
      updatedAt: reloaded!.updated_at?.toISOString() ?? null,
    };
  }

  async getDesignerPerformance(query: {
    userId?: string;
    mode: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    year: number;
    periodValue: number;
    currentUser: { id: string; role: UserRole };
  }) {
    const { userId, mode, year, periodValue, currentUser } = query;

    const isCEO_GM = currentUser.role === UserRole.CEO || currentUser.role === UserRole.GENERAL_MANAGER;
    const isDesigner = currentUser.role === UserRole.DESIGNER;

    const allDesignersResult = await this.userRepo.find({
      where: { role: UserRole.DESIGNER, is_active: true },
      select: ['id', 'full_name', 'email'],
    });
    const allDesigners = allDesignersResult.map((d) => ({
      id: d.id,
      full_name: d.full_name,
      email: d.email,
      initials: d.full_name
        .split(' ')
        .map((w) => w.charAt(0))
        .join('')
        .toUpperCase()
        .substring(0, 2),
    }));

    const targetUserId = isDesigner
      ? currentUser.id
      : (userId || allDesigners[0]?.id || '');
    if (!targetUserId) {
      return { designers: allDesigners, selected: null, periodLabel: '', periodRange: null, kpis: null, ratingBreakdown: null, storyPointBreakdown: null, previousPeriodLabel: '', previousKpis: null, previousRatingBreakdown: null, previousStoryPointBreakdown: null, trend: [], assignedTasks: [], ratedTasks: [] };
    }

    if (mode === 'yearly') {
      const { start, end } = this.periodToRange('yearly', year, 0);
      const prev = this.periodToRange('yearly', year - 1, 0);

      const [currentMetrics, previousMetrics] = await Promise.all([
        this.queryPerformanceForDesigner(targetUserId, start, end),
        this.queryPerformanceForDesigner(targetUserId, prev.start, prev.end),
      ]);

      const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const trend = await Promise.all(
        Array.from({ length: 12 }, (_, i) => {
          const t = this.periodToRange('monthly', year, i + 1);
          return this.queryPerformanceForDesigner(targetUserId, t.start, t.end).then((m) => ({
            label: MONTHS_SHORT[i],
            rating: m.ratingAvg,
            storyPoints: m.totalSp,
            compliancePercent: m.deadlinePercent,
          }));
        })
      );

      const { assignedTasks, ratedTasks } = await this.queryAssignedAndRatedTasks(targetUserId, start, end);

      return {
        designers: allDesigners,
        selected: allDesigners.find((d) => d.id === targetUserId) || null,
        periodLabel: start.getUTCFullYear().toString(),
        periodRange: { start: start.toISOString(), end: end.toISOString() },
        kpis: currentMetrics,
        ratingBreakdown: {
          creativity: currentMetrics.avgCreativity,
          timeliness: currentMetrics.avgTimeliness,
          clientUnderstanding: currentMetrics.avgClientUnderstanding,
          renderingQuality: currentMetrics.avgRenderingQuality,
        },
        storyPointBreakdown: {
          completed: currentMetrics.completedSp,
          pending: currentMetrics.pendingSp,
          rejected: currentMetrics.rejectedSp,
          total: currentMetrics.totalSp,
        },
        previousPeriodLabel: prev.start.getUTCFullYear().toString(),
        previousKpis: previousMetrics,
        previousRatingBreakdown: previousMetrics
          ? {
              creativity: previousMetrics.avgCreativity,
              timeliness: previousMetrics.avgTimeliness,
              clientUnderstanding: previousMetrics.avgClientUnderstanding,
              renderingQuality: previousMetrics.avgRenderingQuality,
            }
          : null,
        previousStoryPointBreakdown: previousMetrics
          ? {
              completed: previousMetrics.completedSp,
              pending: previousMetrics.pendingSp,
              rejected: previousMetrics.rejectedSp,
              total: previousMetrics.totalSp,
            }
          : null,
        trend,
        assignedTasks,
        ratedTasks,
      };
    }

    const { start, end } = this.periodToRange(mode, year, periodValue);
    const prev = this.periodToRange(mode, year, periodValue - 1);

    const [currentMetrics, previousMetrics] = await Promise.all([
      this.queryPerformanceForDesigner(targetUserId, start, end),
      this.queryPerformanceForDesigner(targetUserId, prev.start, prev.end),
    ]);

    const trend = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const t = this.periodToRange(mode, year, periodValue - (5 - i));
        return this.queryPerformanceForDesigner(targetUserId, t.start, t.end).then((m) => ({
          label: this.periodLabel(mode, t.start, t.end),
          rating: m.ratingAvg,
          storyPoints: m.totalSp,
          compliancePercent: m.deadlinePercent,
        }));
      })
    );

    const { assignedTasks, ratedTasks } = await this.queryAssignedAndRatedTasks(targetUserId, start, end);

    return {
      designers: allDesigners,
      selected: allDesigners.find((d) => d.id === targetUserId) || null,
      periodLabel: this.periodLabel(mode, start, end),
      periodRange: { start: start.toISOString(), end: end.toISOString() },
      kpis: currentMetrics,
      ratingBreakdown: {
        creativity: currentMetrics.avgCreativity,
        timeliness: currentMetrics.avgTimeliness,
        clientUnderstanding: currentMetrics.avgClientUnderstanding,
        renderingQuality: currentMetrics.avgRenderingQuality,
      },
      storyPointBreakdown: {
        completed: currentMetrics.completedSp,
        pending: currentMetrics.pendingSp,
        rejected: currentMetrics.rejectedSp,
        total: currentMetrics.totalSp,
      },
      previousPeriodLabel: this.periodLabel(mode, prev.start, prev.end),
      previousKpis: previousMetrics,
      previousRatingBreakdown: previousMetrics
        ? {
            creativity: previousMetrics.avgCreativity,
            timeliness: previousMetrics.avgTimeliness,
            clientUnderstanding: previousMetrics.avgClientUnderstanding,
            renderingQuality: previousMetrics.avgRenderingQuality,
          }
        : null,
      previousStoryPointBreakdown: previousMetrics
        ? {
            completed: previousMetrics.completedSp,
            pending: previousMetrics.pendingSp,
            rejected: previousMetrics.rejectedSp,
            total: previousMetrics.totalSp,
          }
        : null,
      trend,
      assignedTasks,
      ratedTasks,
    };
  }

  private async queryAssignedAndRatedTasks(
    designerId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ assignedTasks: any[]; ratedTasks: any[] }> {
    const startIso = periodStart.toISOString();
    const endIso = periodEnd.toISOString();

    const assignedTasksRaw = await this.taskRepo
      .createQueryBuilder('dt')
      .select([
        'dt.id AS id',
        'dt.title AS title',
        'dt.status AS status',
        'dt.story_point AS story_point',
        'dt.assigned_at AS assigned_at',
      ])
      .where('dt.assigned_to_user_id = :designerId', { designerId })
      .andWhere('dt.task_state = :taskState', { taskState: TaskState.ACTIVE })
      .andWhere('dt.assigned_at >= :start', { start: startIso })
      .andWhere('dt.assigned_at < :end', { end: endIso })
      .orderBy('dt.assigned_at', 'DESC')
      .getRawMany();

    const ratedTasksRaw = await this.taskReviewRepo
      .createQueryBuilder('dtr')
      .leftJoin('designer_task', 'dt', 'dt.id = dtr.designer_task_id')
      .select([
        'dt.id AS id',
        'dt.title AS title',
        'dt.story_point AS story_point',
        'dtr.creativity AS creativity',
        'dtr.timeliness AS timeliness',
        'dtr.rendering_quality AS rendering_quality',
        'dtr.client_understanding AS client_understanding',
        'dtr.created_at AS reviewed_at',
      ])
      .where('dt.assigned_to_user_id = :designerId', { designerId })
      .andWhere('dtr.created_at >= :start', { start: startIso })
      .andWhere('dtr.created_at < :end', { end: endIso })
      .orderBy('dtr.created_at', 'DESC')
      .getRawMany();

    const assignedTasks = assignedTasksRaw.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status ?? null,
      storyPoint: parseInt(row.story_point ?? '0', 10),
      assignedAt: row.assigned_at ?? null,
    }));

    const ratedTasks = ratedTasksRaw.map((row) => {
      const c = parseFloat(row.creativity) || 0;
      const t = parseFloat(row.timeliness) || 0;
      const r = parseFloat(row.rendering_quality) || 0;
      const cu = parseFloat(row.client_understanding) || 0;
      return {
        id: row.id,
        title: row.title,
        storyPoint: parseInt(row.story_point ?? '0', 10),
        rating: parseFloat(((c + t + r + cu) / 4).toFixed(1)),
        reviewedAt: row.reviewed_at ?? null,
      };
    });

    return { assignedTasks, ratedTasks };
  }

  private periodToRange(
    mode: 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    year: number,
    periodValue: number,
  ): { start: Date; end: Date } {
    if (mode === 'yearly') {
      return {
        start: new Date(Date.UTC(year, 0, 1)),
        end: new Date(Date.UTC(year + 1, 0, 1)),
      };
    }
    if (mode === 'monthly') {
      const m = periodValue - 1;
      return {
        start: new Date(Date.UTC(year, m, 1)),
        end: new Date(Date.UTC(year, m + 1, 1)),
      };
    }
    if (mode === 'quarterly') {
      const startMonth = (periodValue - 1) * 3;
      return {
        start: new Date(Date.UTC(year, startMonth, 1)),
        end: new Date(Date.UTC(year, startMonth + 3, 1)),
      };
    }
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const dayOfWeek = jan1.getUTCDay();
    const offset = dayOfWeek <= 4 ? 1 - dayOfWeek : 8 - dayOfWeek;
    const weekOneStart = new Date(Date.UTC(year, 0, 1 + offset));
    const start = new Date(weekOneStart.getTime() + (periodValue - 1) * 7 * 86400000);
    const end = new Date(start.getTime() + 7 * 86400000);
    return { start, end };
  }

  private periodLabel(
    mode: 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    start: Date,
    end: Date,
  ): string {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (mode === 'yearly') {
      return `${start.getUTCFullYear()}`;
    }
    if (mode === 'monthly') {
      return `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
    }
    if (mode === 'quarterly') {
      const q = Math.floor(start.getUTCMonth() / 3) + 1;
      return `Q${q} ${start.getUTCFullYear()}`;
    }
    const jan1 = new Date(Date.UTC(start.getUTCFullYear(), 0, 1));
    const weekNum = Math.floor((start.getTime() - jan1.getTime()) / (7 * 86400000)) + 1;
    return `Week ${weekNum} — ${start.getUTCFullYear()}`;
  }

  private async queryPerformanceForDesigner(
    designerId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const raw = await this.taskRepo
      .createQueryBuilder('dt')
      .leftJoin('designer_task_review', 'dtr', 'dtr.designer_task_id = dt.id')
      .leftJoin(
        'paused_task',
        'pt',
        'pt.designer_task_id = dt.id AND pt.resumed_at IS NULL',
      )
      .select([
        'COUNT(dt.id) AS total_tasks',
        `COUNT(dt.id) FILTER (WHERE dt.status = 'approved') AS completed`,
        `COUNT(dt.id) FILTER (WHERE dt.status = 'rejected') AS rejected`,
        `COUNT(dt.id) FILTER (WHERE dt.status IN ('pending','feedback')) AS in_review`,
        'COUNT(DISTINCT pt.id) AS paused',
        'COALESCE(SUM(dt.story_point), 0) AS total_sp',
        `COALESCE(SUM(dt.story_point) FILTER (WHERE dt.status = 'approved'), 0) AS completed_sp`,
        `COALESCE(SUM(dt.story_point) FILTER (WHERE dt.status = 'rejected'), 0) AS rejected_sp`,
        `COALESCE(SUM(dt.story_point) FILTER (WHERE dt.status IN ('pending','feedback')), 0) AS pending_sp`,
        'ROUND(AVG(dtr.creativity), 1) AS avg_creativity',
        'ROUND(AVG(dtr.timeliness), 1) AS avg_timeliness',
        'ROUND(AVG(dtr.client_understanding), 1) AS avg_client_understanding',
        'ROUND(AVG(dtr.rendering_quality), 1) AS avg_rendering_quality',
        `CASE WHEN COUNT(dt.id) > 0 THEN ROUND(COUNT(dt.id) FILTER (WHERE dt.status = 'approved') * 100.0 / COUNT(dt.id)) ELSE 0 END AS deadline_percent`,
      ])
      .where('dt.assigned_to_user_id = :designerId', { designerId })
      .andWhere('dt.task_state = :taskState', { taskState: TaskState.ACTIVE })
      .andWhere('COALESCE(dt.updated_at, dt.created_at) >= :start', {
        start: periodStart.toISOString(),
      })
      .andWhere('COALESCE(dt.updated_at, dt.created_at) < :end', { end: periodEnd.toISOString() })
      .getRawOne<{
        total_tasks: string;
        completed: string;
        rejected: string;
        in_review: string;
        paused: string;
        total_sp: string;
        completed_sp: string;
        rejected_sp: string;
        pending_sp: string;
        avg_creativity: string | null;
        avg_timeliness: string | null;
        avg_client_understanding: string | null;
        avg_rendering_quality: string | null;
        deadline_percent: string;
      }>();

    const ac = parseFloat(raw?.avg_creativity ?? '') || 0;
    const at = parseFloat(raw?.avg_timeliness ?? '') || 0;
    const au = parseFloat(raw?.avg_client_understanding ?? '') || 0;
    const ar = parseFloat(raw?.avg_rendering_quality ?? '') || 0;
    const hasRatings = ac + at + au + ar > 0;
    const ratingAvg = hasRatings ? parseFloat(((ac + at + au + ar) / 4).toFixed(1)) : 0;

    return {
      totalTasks: parseInt(raw?.total_tasks ?? '0'),
      completed: parseInt(raw?.completed ?? '0'),
      rejected: parseInt(raw?.rejected ?? '0'),
      inReview: parseInt(raw?.in_review ?? '0'),
      paused: parseInt(raw?.paused ?? '0'),
      totalSp: parseInt(raw?.total_sp ?? '0'),
      completedSp: parseInt(raw?.completed_sp ?? '0'),
      rejectedSp: parseInt(raw?.rejected_sp ?? '0'),
      pendingSp: parseInt(raw?.pending_sp ?? '0'),
      avgCreativity: ac || null,
      avgTimeliness: at || null,
      avgClientUnderstanding: au || null,
      avgRenderingQuality: ar || null,
      deadlinePercent: parseInt(raw?.deadline_percent ?? '0'),
      ratingAvg: ratingAvg || null,
    };
  }

  async getSubmissions(taskId: string, currentUser?: { id: string; role: UserRole }) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Designer task not found");

    if (currentUser) {
      if (currentUser.role === UserRole.CEO || currentUser.role === UserRole.GENERAL_MANAGER) {
        // CEO and GM can view all submissions
      } else if (currentUser.role === UserRole.DESIGNER) {
        if (task.assigned_to_user_id !== currentUser.id) {
          throw new AppError(403, "You are not authorized to view these submissions.");
        }
      } else {
        throw new AppError(403, DESIGNER_TASK_LIST_FORBIDDEN_MESSAGE);
      }
    }

    return this.submissionRepo.find({
      where: { designer_task_id: taskId },
      order: { created_at: "DESC" },
    });
  }

  async getSubmissionReviews(submissionId: string) {
    const submission = await this.submissionRepo.findOneBy({ id: submissionId });
    if (!submission) throw new AppError(404, "Designer submission not found");

    const reviews = await this.submissionReviewRepo
      .createQueryBuilder("r")
      .leftJoin("r.reviewer_user", "reviewer_user")
      .addSelect(safeUserColumns("reviewer_user"))
      .where("r.designer_submission_id = :submissionId", { submissionId })
      .orderBy("r.created_at", "DESC")
      .getMany();

    return reviews.map((r) => ({
      ...r,
      reviewer_user: pickSafeUserFields(r.reviewer_user),
    }));
  }

  async pauseTask(taskId: string, reason: string, userId: string) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Designer task not found");

    if (task.is_paused) {
      throw new AppError(409, "Task is already paused");
    }

    if (task.assigned_to_user_id !== userId) {
      throw new AppError(403, "Only the assigned designer can pause this task");
    }

    const pausedTask = new PausedTask();
    pausedTask.designer_task_id = taskId;
    pausedTask.reason = reason;
    await this.pausedTaskRepo.save(pausedTask);

    task.is_paused = true;
    task.updated_by = userId as any;
    task.updated_at = new Date();
    await this.taskRepo.save(task);

    if (task.assigned_to_user_id) {
      await this.createNotification({
        user_id: task.assigned_to_user_id,
        from_user_id: userId,
        resource_id: taskId,
        resource_type: ResourceType.PAUSED,
        parent_id: taskId,
        parent_type: ParentType.DESIGNER_TASK,
        type: `Task paused: ${reason}`,
      });
    }

    return task;
  }

  async resumeTask(taskId: string, userId: string) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Designer task not found");

    if (!task.is_paused) {
      throw new AppError(409, "Task is not paused");
    }

    if (task.assigned_to_user_id !== userId) {
      throw new AppError(403, "Only the assigned designer can resume this task");
    }

    const pausedTask = await this.pausedTaskRepo.findOne({
      where: { designer_task_id: taskId },
      order: { paused_at: "DESC" },
    });

    if (pausedTask) {
      pausedTask.resumed_at = new Date();
      await this.pausedTaskRepo.save(pausedTask);
    }

    task.is_paused = false;
    task.updated_by = userId as any;
    task.updated_at = new Date();
    await this.taskRepo.save(task);

    if (task.assigned_to_user_id) {
      await this.createNotification({
        user_id: task.assigned_to_user_id,
        from_user_id: userId,
        resource_id: taskId,
        resource_type: ResourceType.PAUSED,
        parent_id: taskId,
        parent_type: ParentType.DESIGNER_TASK,
        type: "Task resumed",
      });
    }

    return task;
  }

  async removeTask(taskId: string, removedByUserId: string, reason: string) {
    console.log('[DesignerService.removeTask] ========== DELETE TASK SERVICE ==========');
    console.log('[DesignerService.removeTask] Task ID:', taskId);
    console.log('[DesignerService.removeTask] Removed by:', removedByUserId);
    console.log('[DesignerService.removeTask] Reason:', reason);

    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Designer task not found");

    console.log('[DesignerService.removeTask] Task found - title:', task.title);
    console.log('[DesignerService.removeTask] Task found - assigned_to_user_id:', task.assigned_to_user_id);
    console.log('[DesignerService.removeTask] Task found - task_state:', task.task_state);

    const submissions = await this.submissionRepo.find({
      where: { designer_task_id: taskId },
    });
    if (submissions.length > 0) {
      throw new AppError(400, "Cannot delete task: one or more submissions exist for this task");
    }

    if (task.assigned_to_user_id) {
      const assignmentDate = task.assigned_at ? new Date(task.assigned_at) : (task.updated_at ? new Date(task.updated_at) : null);
      if (assignmentDate) {
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        if (Date.now() - assignmentDate.getTime() > threeDaysMs) {
          throw new AppError(400, "Cannot delete task: more than 3 days have passed since assignment");
        }
      }
    }

    const removal = new DesignerTaskRemoval();
    removal.designer_task_id = taskId;
    removal.removed_by_user_id = removedByUserId;
    removal.removed_user_id = task.assigned_to_user_id ?? removedByUserId;
    removal.reason = reason;
    await this.removalRepo.save(removal);

    await this.notificationRepo.delete({ parent_id: taskId });
    await this.notificationRepo.delete({ resource_id: taskId });

    console.log('[DesignerService.removeTask] Deleted notifications for parent_id and resource_id:', taskId);
    console.log('[DesignerService.removeTask] Setting task_state to DEACTIVE');

    task.task_state = TaskState.DEACTIVE;
    task.updated_by = removedByUserId as any;
    task.updated_at = new Date();
    await this.taskRepo.save(task);

    console.log('[DesignerService.removeTask] Task saved with task_state:', task.task_state);
    console.log('[DesignerService.removeTask] ========== DELETE TASK COMPLETE ==========');

    return task;
  }

  async deactivateTask(taskId: string, userId: string): Promise<DesignerTask> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) {
      throw new AppError(404, "Designer task not found");
    }
    if (task.task_state === TaskState.DEACTIVE) {
      throw new AppError(400, "Task is already deactivated");
    }
    task.task_state = TaskState.DEACTIVE;
    task.updated_by = userId as any;
    task.updated_at = new Date();
    const saved = await this.taskRepo.save(task);

    const updated = await this.taskRepo
      .createQueryBuilder("t")
      .leftJoin("t.assigned_to_user", "assigned_to_user")
      .leftJoin("t.assigned_by_user", "assigned_by_user")
      .leftJoin("t.updated_by_user", "updated_by_user")
      .addSelect(safeUserColumns("assigned_to_user"))
      .addSelect(safeUserColumns("assigned_by_user"))
      .addSelect(safeUserColumns("updated_by_user"))
      .where("t.id = :id", { id: taskId })
      .getOne();
    if (!updated) throw new AppError(404, "Designer task not found");

    const taskIds = [updated.id];

    const unreadNotifications = await this.notificationRepo.find({
      where: {
        user_id: userId,
        parent_id: In(taskIds) as any,
        viewed: false,
      },
    });

    const notificationMap = new Map<string, string>();
    const rateNotifByReviewId = new Map<string, { notificationId: string }>();
    for (const n of unreadNotifications) {
      if (n.resource_type === ResourceType.POSTED_JOB) continue;
      if (n.resource_type === ResourceType.RATE) {
        rateNotifByReviewId.set(n.resource_id, { notificationId: n.id });
      } else {
        if (!notificationMap.has(n.resource_id)) {
          notificationMap.set(n.resource_id, n.id);
        }
      }
    }

    const submissionsByTask = await this.batchSubmissionsWithReviews(taskIds, notificationMap);
    const taskReviews = await this.batchTaskReviews(taskIds);

    const swr = submissionsByTask[updated.id] || { taskNotification: { hasNotification: false, notificationId: null }, caseStudy: [], designing: [], rendering: [], finalStage: [] };
    const { taskNotification, ...restSwr } = swr;
    const hasNestedNotification =
      swr.caseStudy?.some((s: any) => s.hasNotification || (s.reviews || []).some((r: any) => r.hasNotification)) ||
      swr.designing?.some((s: any) => s.hasNotification || (s.reviews || []).some((r: any) => r.hasNotification)) ||
      swr.rendering?.some((s: any) => s.hasNotification || (s.reviews || []).some((r: any) => r.hasNotification)) ||
      swr.finalStage?.some((s: any) => s.hasNotification || (s.reviews || []).some((r: any) => r.hasNotification));

    return {
      ...this.sanitizeDesignerTask(updated),
      taskNotification,
      submissionsWithReviews: restSwr,
      hasNestedNotification,
      taskReview: taskReviews[updated.id]
        ? { ...taskReviews[updated.id], hasNotification: rateNotifByReviewId.has(taskReviews[updated.id].id), notificationId: rateNotifByReviewId.get(taskReviews[updated.id].id)?.notificationId ?? null }
        : null,
    } as any;
  }

  async reactivateTask(taskId: string, userId: string): Promise<DesignerTask> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) {
      throw new AppError(404, "Designer task not found");
    }
    if (task.task_state === TaskState.ACTIVE) {
      throw new AppError(400, "Task is already active");
    }
    task.task_state = TaskState.ACTIVE;
    task.updated_by = userId as any;
    task.updated_at = new Date();
    const saved = await this.taskRepo.save(task);

    const updated = await this.taskRepo
      .createQueryBuilder("t")
      .leftJoin("t.assigned_to_user", "assigned_to_user")
      .leftJoin("t.assigned_by_user", "assigned_by_user")
      .leftJoin("t.updated_by_user", "updated_by_user")
      .addSelect(safeUserColumns("assigned_to_user"))
      .addSelect(safeUserColumns("assigned_by_user"))
      .addSelect(safeUserColumns("updated_by_user"))
      .where("t.id = :id", { id: taskId })
      .getOne();
    if (!updated) throw new AppError(404, "Designer task not found");

    const taskIds = [updated.id];

    const unreadNotifications = await this.notificationRepo.find({
      where: {
        user_id: userId,
        parent_id: In(taskIds) as any,
        viewed: false,
      },
    });

    const notificationMap = new Map<string, string>();
    const rateNotifByReviewId = new Map<string, { notificationId: string }>();
    for (const n of unreadNotifications) {
      if (n.resource_type === ResourceType.POSTED_JOB) continue;
      if (n.resource_type === ResourceType.RATE) {
        rateNotifByReviewId.set(n.resource_id, { notificationId: n.id });
      } else {
        if (!notificationMap.has(n.resource_id)) {
          notificationMap.set(n.resource_id, n.id);
        }
      }
    }

    const submissionsByTask = await this.batchSubmissionsWithReviews(taskIds, notificationMap);
    const taskReviews = await this.batchTaskReviews(taskIds);

    const swr = submissionsByTask[updated.id] || { taskNotification: { hasNotification: false, notificationId: null }, caseStudy: [], designing: [], rendering: [], finalStage: [] };
    const { taskNotification, ...restSwr } = swr;
    const hasNestedNotification =
      swr.caseStudy?.some((s: any) => s.hasNotification || (s.reviews || []).some((r: any) => r.hasNotification)) ||
      swr.designing?.some((s: any) => s.hasNotification || (s.reviews || []).some((r: any) => r.hasNotification)) ||
      swr.rendering?.some((s: any) => s.hasNotification || (s.reviews || []).some((r: any) => r.hasNotification)) ||
      swr.finalStage?.some((s: any) => s.hasNotification || (s.reviews || []).some((r: any) => r.hasNotification));

    return {
      ...this.sanitizeDesignerTask(updated),
      taskNotification,
      submissionsWithReviews: restSwr,
      hasNestedNotification,
      taskReview: taskReviews[updated.id]
        ? { ...taskReviews[updated.id], hasNotification: rateNotifByReviewId.has(taskReviews[updated.id].id), notificationId: rateNotifByReviewId.get(taskReviews[updated.id].id)?.notificationId ?? null }
        : null,
    } as any;
  }
}

export const designerService = new DesignerService();
