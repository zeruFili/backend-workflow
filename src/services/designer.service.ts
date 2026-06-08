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

interface PaginatedParams {
  page: number;
  limit: number;
  status?: string;
  assignedTo?: string;
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
}

interface ApplicationListParams {
  page: number;
  limit: number;
  taskId?: string;
  applicantId?: string;
  currentUser: { id: string; role: UserRole };
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

  private applyTaskListVisibilityScope(
    qb: ReturnType<typeof this.taskRepo.createQueryBuilder>,
    currentUser: { id: string; role: UserRole }
  ) {
    if (currentUser.role === UserRole.CEO || currentUser.role === UserRole.GENERAL_MANAGER) {
      return;
    }

    if (currentUser.role === UserRole.DESIGNER) {
      qb.andWhere("t.is_public = TRUE");
      return;
    }

    throw new AppError(403, DESIGNER_TASK_LIST_FORBIDDEN_MESSAGE);
  }

  async findAllTasks(params: PaginatedParams) {
    const { page, limit, status, assignedTo, isPublic, isPaused, search, currentUser } = params;

    const qb = this.taskRepo.createQueryBuilder("t")
      .leftJoinAndSelect("t.assigned_to_user", "assigned_to_user")
      .leftJoinAndSelect("t.assigned_by_user", "assigned_by_user");

    this.applyTaskListVisibilityScope(qb, currentUser);

    if (status) qb.andWhere("t.status = :status", { status });
    if (assignedTo) qb.andWhere("t.assigned_to_user_id = :assignedTo", { assignedTo });
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
    if (!task) throw new AppError(404, "Designer task not found");

    const submissions = await this.submissionRepo.find({
      where: { designer_task_id: id },
      order: { created_at: "ASC" },
    });

    const applications = await this.applicationRepo.find({
      where: { designer_task_id: id },
      relations: ["applicant_user"],
      order: { created_at: "DESC" },
    });

    return { ...task, submissions, applications };
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
      await this.createNotification({
        user_id: saved.assigned_to_user_id,
        from_user_id: assignedByUserId,
        resource_id: saved.id,
        resource_type: ResourceType.TASK_ASSIGNED,
        parent_id: saved.id,
        parent_type: ParentType.DESIGNER_TASK,
        type: "You have been assigned to a new designer task",
      });
    }

    return saved;
  }

  async updateTask(id: string, params: UpdateTaskParams) {
    const task = await this.taskRepo.findOneBy({ id });
    if (!task) throw new AppError(404, "Designer task not found");

    if (params.title !== undefined) task.title = params.title;
    if (params.description !== undefined) task.description = params.description;
    if (params.status !== undefined) task.status = params.status;
    if (params.stage !== undefined) task.stage = params.stage;
    if (params.is_public !== undefined) task.is_public = params.is_public;
    if (params.story_point !== undefined) task.story_point = params.story_point;
    if (params.due_date !== undefined) task.due_date = params.due_date as any;
    if (params.assigned_to_user_id !== undefined) task.assigned_to_user_id = params.assigned_to_user_id as any;

    return this.taskRepo.save(task);
  }

  async assignDesigner(taskId: string, designerUserId: string, assignedByUserId: string) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Designer task not found");

    if (task.assigned_to_user_id) {
      throw new AppError(409, "Task is already assigned to a designer");
    }

    const designer = await this.userRepo.findOne({
      where: { id: designerUserId, role: UserRole.DESIGNER, is_active: true },
    });
    if (!designer) throw new AppError(404, "Designer not found or not active");

    task.assigned_to_user_id = designerUserId as any;
    await this.taskRepo.save(task);

    const pendingApplications = await this.applicationRepo.find({
      where: { designer_task_id: taskId },
    });

    for (const app of pendingApplications) {
      if (app.applicant_user_id !== designerUserId) {
        await this.applicationRepo.delete({ id: app.id });
      }
    }

    await this.createNotification({
      user_id: designerUserId,
      from_user_id: assignedByUserId,
      resource_id: taskId,
      resource_type: ResourceType.TASK_ASSIGNED,
      parent_id: taskId,
      parent_type: ParentType.DESIGNER_TASK,
      type: "You have been assigned to a designer task",
    });

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

    return {
      success: true,
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async reviewApplication(
    applicationId: string,
    reviewOutcome: ReviewOutcome,
    reviewerUserId: string
  ) {
    const application = await this.applicationRepo.findOne({
      where: { id: applicationId },
      relations: ["designer_task"],
    });
    if (!application) throw new AppError(404, "Designer application not found");

    if (reviewOutcome === ReviewOutcome.APPROVED) {
      const task = application.designer_task;
      if (task && !task.assigned_to_user_id) {
        task.assigned_to_user_id = application.applicant_user_id as any;
        await this.taskRepo.save(task);

        const otherPending = await this.applicationRepo.find({
          where: { designer_task_id: task.id },
        });

        for (const other of otherPending) {
          if (other.id !== applicationId) {
            await this.applicationRepo.delete({ id: other.id });
          }
        }

        await this.createNotification({
          user_id: application.applicant_user_id,
          from_user_id: reviewerUserId,
          resource_id: task.id,
          resource_type: ResourceType.TASK_ASSIGNED,
          parent_id: task.id,
          parent_type: ParentType.DESIGNER_TASK,
          type: "Your application has been accepted",
        });
      }
    }

    if (reviewOutcome === ReviewOutcome.REJECTED) {
      const task = application.designer_task;
      await this.createNotification({
        user_id: application.applicant_user_id,
        from_user_id: reviewerUserId,
        resource_id: application.designer_task_id,
        resource_type: ResourceType.APPLY,
        parent_id: application.designer_task_id,
        parent_type: ParentType.DESIGNER_TASK,
        type: "Your application was not accepted",
      });
    }

    await this.applicationRepo.delete({ id: applicationId });

    return { id: applicationId, review_outcome: reviewOutcome };
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

    if (task.task_state !== TaskState.ACTIVE) {
      throw new AppError(400, "Cannot submit to a deactive task");
    }

    if (task.is_paused) {
      throw new AppError(409, "Cannot submit to a paused task");
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

    task.stage = resolvedStage;
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

  async createSubmissionReview(
    submissionId: string,
    reviewerUserId: string,
    reviewOutcome: ReviewOutcome,
    description: string
  ) {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ["designer_task"],
    });
    if (!submission) throw new AppError(404, "Designer submission not found");

    const review = new DesignerSubmissionReview();
    review.designer_submission_id = submissionId;
    review.reviewer_user_id = reviewerUserId;
    review.review_outcome = reviewOutcome;
    review.description = description;

    const saved = await this.submissionReviewRepo.save(review);

    const task = submission.designer_task;
    if (task?.assigned_to_user_id) {
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

  async getSubmissions(taskId: string) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Designer task not found");

    return this.submissionRepo.find({
      where: { designer_task_id: taskId },
      order: { created_at: "DESC" },
    });
  }

  async getSubmissionReviews(submissionId: string) {
    const submission = await this.submissionRepo.findOneBy({ id: submissionId });
    if (!submission) throw new AppError(404, "Designer submission not found");

    return this.submissionReviewRepo.find({
      where: { designer_submission_id: submissionId },
      relations: ["reviewer_user"],
      order: { created_at: "DESC" },
    });
  }

  async pauseTask(taskId: string, reason: string, userId: string) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Designer task not found");

    if (task.is_paused) {
      throw new AppError(409, "Task is already paused");
    }

    const pausedTask = new PausedTask();
    pausedTask.designer_task_id = taskId;
    pausedTask.reason = reason;
    await this.pausedTaskRepo.save(pausedTask);

    task.is_paused = true;
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

    const pausedTask = await this.pausedTaskRepo.findOne({
      where: { designer_task_id: taskId },
      order: { paused_at: "DESC" },
    });

    if (pausedTask) {
      pausedTask.resumed_at = new Date();
      await this.pausedTaskRepo.save(pausedTask);
    }

    task.is_paused = false;
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

    const removal = new DesignerTaskRemoval();
    removal.designer_task_id = taskId;
    removal.removed_by_user_id = removedByUserId;
    removal.removed_user_id = task.assigned_to_user_id ?? removedByUserId;
    removal.reason = reason;
    await this.removalRepo.save(removal);

    task.task_state = TaskState.DEACTIVE;
    await this.taskRepo.save(task);

    return task;
  }
}

export const designerService = new DesignerService();
