import { In } from "typeorm";
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
  assigned_to_user_id?: string;
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
      qb.andWhere(
        "(t.assigned_to_user_id = :currentUserId OR (t.is_public = true AND t.assigned_to_user_id IS NULL))",
        { currentUserId: currentUser.id }
      );
      return;
    }

    throw new AppError(403, DESIGNER_TASK_LIST_FORBIDDEN_MESSAGE);
  }

  async findAllTasks(params: PaginatedParams) {
    const { page, limit, status, assignedTo, isPublic, isPaused, search, currentUser } = params;

    const qb = this.taskRepo.createQueryBuilder("t")
      .leftJoinAndSelect("t.assigned_to_user", "assigned_to_user")
      .leftJoinAndSelect("t.assigned_by_user", "assigned_by_user")
      .leftJoinAndSelect("t.updated_by_user", "updated_by_user");

    this.applyTaskListVisibilityScope(qb, currentUser);

    qb.andWhere("t.task_state = :activeState", { activeState: TaskState.ACTIVE });

    if (status) qb.andWhere("t.status = :status", { status });
    if (assignedTo === null) {
      qb.andWhere("t.assigned_to_user_id IS NULL");
    } else if (assignedTo) {
      qb.andWhere("t.assigned_to_user_id = :assignedTo", { assignedTo });
    }
    if (isPublic !== undefined) qb.andWhere("t.is_public = :isPublic", { isPublic });
    if (isPaused !== undefined) qb.andWhere("t.is_paused = :isPaused", { isPaused });

    if (search) {
      qb.andWhere("(t.title ILIKE :search OR t.description ILIKE :search)", {
        search: `%${search}%`,
      });
    }

    qb.orderBy("t.created_at", "DESC");

    const skip = (page - 1) * limit;
    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

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
        };
      }),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private async batchSubmissionsWithReviews(taskIds: string[], userId: string): Promise<Record<string, any>> {
    if (taskIds.length === 0) return {};

    const submissions = await this.submissionRepo.find({
      where: taskIds.map((id) => ({ designer_task_id: id } as any)),
    });

    const submissionIds = submissions.map((s) => s.id);

    const allReviews = submissionIds.length > 0
      ? await this.submissionReviewRepo.find({
          where: submissionIds.map((id) => ({ designer_submission_id: id } as any)),
          relations: ["reviewer_user"],
        })
      : [];

    const reviewsBySubmission: Record<string, DesignerSubmissionReview[]> = {};
    for (const r of allReviews) {
      if (!reviewsBySubmission[r.designer_submission_id]) {
        reviewsBySubmission[r.designer_submission_id] = [];
      }
      reviewsBySubmission[r.designer_submission_id].push(r);
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

  async findTaskById(id: string, currentUser?: { id: string; role: UserRole }) {
    const task = await this.taskRepo.findOne({
      where: { id },
      relations: ["assigned_to_user", "assigned_by_user", "updated_by_user"],
    });
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

    const applications = await this.applicationRepo.find({
      where: { designer_task_id: id },
      relations: ["applicant_user"],
      order: { created_at: "DESC" },
    });

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
    const task = await this.taskRepo.findOneBy({ id });
    if (!task) throw new AppError(404, "Designer task not found");

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

    if (params.title !== undefined) task.title = params.title;
    if (params.description !== undefined) task.description = params.description;
    if (params.status !== undefined) task.status = params.status;
    if (params.stage !== undefined) task.stage = params.stage;
    if (params.is_public !== undefined) task.is_public = params.is_public;
    if (params.story_point !== undefined) task.story_point = params.story_point;
    if (params.due_date !== undefined) task.due_date = params.due_date as any;
    if (params.assigned_to_user_id !== undefined) task.assigned_to_user_id = params.assigned_to_user_id as any;
    if (params.attachment_urls !== undefined) {
      task.attachment_urls = syncAttachments(task.attachment_urls, params.attachment_urls) as any;
    }

    task.updated_by = currentUser.id as any;
    task.updated_at = new Date();

    const saved = await this.taskRepo.save(task);

    if (
      params.assigned_to_user_id !== undefined &&
      params.assigned_to_user_id !== previousAssignee &&
      params.assigned_to_user_id
    ) {
      await this.notifyTaskAssignment(saved.id, params.assigned_to_user_id, currentUser.id);
    }

    await this.refreshResourceNotifications(id, currentUser.id);

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

    return saved;
  }

  async assignDesigner(taskId: string, designerUserId: string, assignedByUserId: string) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Designer task not found");

    const isReassignment = !!task.assigned_to_user_id;

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

    return task;
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

  async listApplications(params: ApplicationListParams) {
    const { page, limit, taskId, applicantId, currentUser } = params;

    const qb = this.applicationRepo.createQueryBuilder("a")
      .leftJoinAndSelect("a.applicant_user", "applicant_user")
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
      if (stageIdx < currentStageIdx) {
        throw new AppError(400, `Cannot submit to a previous stage. Current stage is "${task.stage}".`);
      }
    }

    const submission = new DesignerSubmission();
    submission.designer_task_id = taskId;
    submission.stage = resolvedStage;
    submission.description = description;
    submission.attachment_urls = (attachmentUrls ?? null) as any;

    const saved = await this.submissionRepo.save(submission);

    task.status = ReviewOutcome.PENDING;
    task.stage = resolvedStage;
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
      where: { designer_task_id: taskId },
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

    return saved;
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

    return saved;
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

    const reviews = await this.submissionReviewRepo.find({
      where: { designer_submission_id: submissionId },
      relations: ["reviewer_user"],
      order: { created_at: "DESC" },
    });

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
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Designer task not found");

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

    task.task_state = TaskState.DEACTIVE;
    task.updated_by = removedByUserId as any;
    task.updated_at = new Date();
    await this.taskRepo.save(task);

    return task;
  }
}

export const designerService = new DesignerService();
