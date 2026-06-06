import { AppDataSource } from "../config/data-source";
import { DeepPartial } from "typeorm";
import { Task } from "../entities/Task";
import { DesignerPhaseHistory } from "../entities/DesignerPhaseHistory";
import { DesignerTaskApplication } from "../entities/DesignerTaskApplication";
import { Submission } from "../entities/Submission";
import { SubmissionAttachment } from "../entities/SubmissionAttachment";
import { User } from "../entities/User";
import { Notification } from "../entities/Notification";
import { DesignerPhase } from "../enums/designer-phase.enum";
import { DesignerTaskApplicationStatus } from "../enums/designer-task-application-status.enum";
import { ReviewAction } from "../enums/review-action.enum";
import { TaskStatus } from "../enums/task-status.enum";
import { NotificationType } from "../enums/notification-type.enum";
import { UserRole } from "../enums/user-role.enum";
import { TaskType } from "../enums/task-type.enum";
import { AppError } from "../middlewares/error.middleware";

interface PaginatedParams {
  page: number;
  limit: number;
  status?: string;
  assignedTo?: string;
  assignedBy?: string;
  isPublic?: boolean;
  isPaused?: boolean;
  search?: string;
  sort?: string;
  currentUser: { id: string; role: UserRole };
}

interface CreateDesignerTaskParams {
  title: string;
  description: string;
  instruction: string;
  project_id?: string;
  story_points: number;
  assigned_to?: string;
  telegram_screenshot?: string;
  deadline?: string;
  is_public?: boolean;
}

interface UpdateDesignerTaskParams {
  title?: string;
  description?: string;
  instruction?: string;
  project_id?: string;
  story_points?: number;
  assigned_to?: string;
  telegram_screenshot?: string;
  deadline?: string;
  is_public?: boolean;
  status?: TaskStatus;
}

const ALLOWED_FIBONACCI = [1, 2, 3, 5, 8, 13, 21];

export class DesignerTaskService {
  private taskRepo = AppDataSource.getRepository(Task);
  private phaseHistoryRepo = AppDataSource.getRepository(DesignerPhaseHistory);
  private applicationRepo = AppDataSource.getRepository(DesignerTaskApplication);
  private submissionRepo = AppDataSource.getRepository(Submission);
  private attachmentRepo = AppDataSource.getRepository(SubmissionAttachment);
  private userRepo = AppDataSource.getRepository(User);
  private notificationRepo = AppDataSource.getRepository(Notification);

  async findAll(params: PaginatedParams) {
    const { page, limit, status, assignedTo, assignedBy, isPublic, isPaused, search, sort, currentUser } = params;

    const qb = this.taskRepo.createQueryBuilder("t")
      .leftJoinAndSelect("t.assignee", "assignee")
      .leftJoinAndSelect("t.assigner", "assigner")
      .where("t.task_type = :taskType", { taskType: TaskType.DESIGNER });

    const isDesigner = currentUser.role === UserRole.DESIGNER;
    if (isDesigner) {
      qb.andWhere("t.assigned_to = :userId", { userId: currentUser.id });
    }

    if (status) qb.andWhere("t.status = :status", { status });
    if (assignedTo) qb.andWhere("t.assigned_to = :assignedTo", { assignedTo });
    if (assignedBy) qb.andWhere("t.assigned_by = :assignedBy", { assignedBy });
    if (isPublic !== undefined) qb.andWhere("t.is_public = :isPublic", { isPublic });
    if (isPaused !== undefined) qb.andWhere("t.is_paused = :isPaused", { isPaused });

    if (search) {
      qb.andWhere("(t.title ILIKE :search OR t.description ILIKE :search OR t.instruction ILIKE :search)", {
        search: `%${search}%`,
      });
    }

    const allowedSort = ["title", "status", "story_points", "created_at", "updated_at", "deadline"];
    if (sort && allowedSort.includes(sort.replace("-", ""))) {
      const dir = sort.startsWith("-") ? "DESC" : "ASC";
      const field = sort.replace("-", "");
      qb.orderBy(`t.${field}`, dir);
    } else {
      qb.orderBy("t.created_at", "DESC");
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
    const task = await this.taskRepo.findOne({
      where: { id, task_type: TaskType.DESIGNER },
      relations: ["assignee", "assigner", "pauser", "resumer"],
    });
    if (!task) throw new AppError(404, "Designer task not found");

    const phaseHistory = await this.phaseHistoryRepo.find({
      where: { task_id: id },
      relations: ["reviewer"],
      order: { created_at: "ASC" },
    });

    return { ...task, phaseHistory };
  }

  async create(params: CreateDesignerTaskParams, createdBy: string) {
    if (!ALLOWED_FIBONACCI.includes(params.story_points)) {
      throw new AppError(400, `Story points must be one of: ${ALLOWED_FIBONACCI.join(", ")}`);
    }

    const taskData: DeepPartial<Task> = {
      title: params.title,
      description: params.description,
      instruction: params.instruction,
      task_type: TaskType.DESIGNER,
      project_id: params.project_id ?? null,
      story_points: params.story_points,
      assigned_to: params.assigned_to ?? null,
      assigned_by: createdBy,
      telegram_screenshot: params.telegram_screenshot ?? null,
      deadline: params.deadline ? new Date(params.deadline) : null,
      is_public: params.is_public ?? false,
      status: params.assigned_to ? TaskStatus.IN_PROGRESS : TaskStatus.PENDING,
      assigned_at: params.assigned_to ? new Date() : null,
    };

    const task = this.taskRepo.create(taskData);

    const saved = await this.taskRepo.save(task);

    if (saved.is_public && !saved.assigned_to) {
      const designers = await this.userRepo.find({
        where: { role: UserRole.DESIGNER, is_active: true },
      });

      for (const designer of designers) {
        const notification = this.notificationRepo.create({
          user_id: designer.id,
          type: NotificationType.DESIGNER_APPLICATION,
          title: "New Open Designer Task",
          body: `"${saved.title}" is open for application.`,
          entity_type: "task",
          entity_id: saved.id,
        });
        await this.notificationRepo.save(notification);
      }
    }

    return saved;
  }

  async update(id: string, params: UpdateDesignerTaskParams) {
    const task = await this.taskRepo.findOne({
      where: { id, task_type: TaskType.DESIGNER },
    });
    if (!task) throw new AppError(404, "Designer task not found");

    if (params.story_points !== undefined && !ALLOWED_FIBONACCI.includes(params.story_points)) {
      throw new AppError(400, `Story points must be one of: ${ALLOWED_FIBONACCI.join(", ")}`);
    }

    if (params.title !== undefined) task.title = params.title;
    if (params.description !== undefined) task.description = params.description;
    if (params.instruction !== undefined) task.instruction = params.instruction;
    if (params.project_id !== undefined) task.project_id = params.project_id;
    if (params.story_points !== undefined) task.story_points = params.story_points;
    if (params.assigned_to !== undefined) task.assigned_to = params.assigned_to;
    if (params.telegram_screenshot !== undefined) task.telegram_screenshot = params.telegram_screenshot;
    if (params.deadline !== undefined) {
      task.deadline = params.deadline ? new Date(params.deadline) : null;
    }
    if (params.is_public !== undefined) task.is_public = params.is_public;
    if (params.status !== undefined) task.status = params.status;

    return this.taskRepo.save(task);
  }

  async delete(id: string) {
    const task = await this.taskRepo.findOne({
      where: { id, task_type: TaskType.DESIGNER },
    });
    if (!task) throw new AppError(404, "Designer task not found");

    const submissionCount = await this.submissionRepo.count({ where: { task_id: id } });
    if (submissionCount > 0) {
      throw new AppError(409, "Cannot delete task with existing submissions");
    }

    const reviewCount = await this.phaseHistoryRepo.count({ where: { task_id: id } });
    if (reviewCount > 0) {
      throw new AppError(409, "Cannot delete task with existing reviews");
    }

    await this.applicationRepo.delete({ task_id: id });
    await this.taskRepo.remove(task);
  }

  async assignDesigner(taskId: string, designerId: string, reviewNote: string | undefined, reviewer: { id: string; name: string }) {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, task_type: TaskType.DESIGNER },
    });
    if (!task) throw new AppError(404, "Designer task not found");

    if (task.assigned_to) {
      throw new AppError(409, "Task is already assigned to a designer");
    }

    const designer = await this.userRepo.findOne({
      where: { id: designerId, role: UserRole.DESIGNER, is_active: true },
    });
    if (!designer) throw new AppError(404, "Designer not found or not active");

    task.assigned_to = designerId;
    task.status = TaskStatus.IN_PROGRESS;
    task.assigned_at = new Date();
    await this.taskRepo.save(task);

    const pendingApplications = await this.applicationRepo.find({
      where: { task_id: taskId, status: DesignerTaskApplicationStatus.PENDING },
    });

    for (const app of pendingApplications) {
      if (app.applicant_id === designerId) {
        app.status = DesignerTaskApplicationStatus.ASSIGNED;
      } else {
        app.status = DesignerTaskApplicationStatus.REJECTED;
      }
      app.reviewed_by = reviewer.id;
      app.reviewed_by_name = reviewer.name;
      app.reviewed_at = new Date();
      app.review_note = reviewNote ?? null;
    }
    await this.applicationRepo.save(pendingApplications);

    const notification = this.notificationRepo.create({
      user_id: designerId,
      type: NotificationType.DESIGNER_ASSIGNED,
      title: "You have been assigned to a task",
      body: `You have been assigned to "${task.title}".`,
      entity_type: "task",
      entity_id: taskId,
    });
    await this.notificationRepo.save(notification);

    return task;
  }

  async pauseTask(taskId: string, reason: string | undefined, pausedBy: { id: string; name: string }) {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, task_type: TaskType.DESIGNER },
    });
    if (!task) throw new AppError(404, "Designer task not found");

    if (task.is_paused) {
      throw new AppError(409, "Task is already paused");
    }

    task.is_paused = true;
    task.pause_reason = reason ?? null;
    task.paused_at = new Date();
    task.paused_by = pausedBy.id;
    await this.taskRepo.save(task);

    if (task.assigned_to) {
      const notification = this.notificationRepo.create({
        user_id: task.assigned_to,
        type: NotificationType.DESIGNER_PAUSED,
        title: "Task paused",
        body: `Task "${task.title}" has been paused.`,
        entity_type: "task",
        entity_id: taskId,
      });
      await this.notificationRepo.save(notification);
    }

    return task;
  }

  async resumeTask(taskId: string, resumedBy: { id: string; name: string }) {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, task_type: TaskType.DESIGNER },
    });
    if (!task) throw new AppError(404, "Designer task not found");

    if (!task.is_paused) {
      throw new AppError(409, "Task is not paused");
    }

    task.is_paused = false;
    task.pause_resume_date = new Date();
    task.resumed_at = new Date();
    task.resumed_by = resumedBy.id;
    await this.taskRepo.save(task);

    if (task.assigned_to) {
      const notification = this.notificationRepo.create({
        user_id: task.assigned_to,
        type: NotificationType.DESIGNER_RESUMED,
        title: "Task resumed",
        body: `Task "${task.title}" has been resumed.`,
        entity_type: "task",
        entity_id: taskId,
      });
      await this.notificationRepo.save(notification);
    }

    return task;
  }

  async getPhases(taskId: string) {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, task_type: TaskType.DESIGNER },
    });
    if (!task) throw new AppError(404, "Designer task not found");

    const phaseHistory = await this.phaseHistoryRepo.find({
      where: { task_id: taskId },
      relations: ["reviewer"],
      order: { created_at: "ASC" },
    });

    const submissions = await this.submissionRepo.find({
      where: { task_id: taskId },
      relations: ["submitter"],
      order: { submitted_at: "ASC" },
    });

    const phases = Object.values(DesignerPhase).map((phase) => {
      const phaseSubmissions = submissions.filter((s) => s.metadata?.phase === phase);
      const phaseReviews = phaseHistory.filter((h) => h.phase === phase);
      return {
        phase,
        submissions: phaseSubmissions,
        reviews: phaseReviews,
      };
    });

    return phases;
  }

  async submitPhase(
    taskId: string,
    phase: DesignerPhase,
    note: string,
    screenshotPath: string | null,
    submitter: { id: string; name: string }
  ) {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, task_type: TaskType.DESIGNER },
    });
    if (!task) throw new AppError(404, "Designer task not found");

    if (task.assigned_to !== submitter.id) {
      throw new AppError(403, "You are not assigned to this task");
    }

    if (task.is_paused) {
      throw new AppError(409, "Cannot submit to a paused task");
    }

    const submission = this.submissionRepo.create({
      task_id: taskId,
      submitted_by: submitter.id,
      submitted_by_name: submitter.name,
      notes: note,
      metadata: { phase },
    });
    const savedSubmission = await this.submissionRepo.save(submission);

    if (screenshotPath) {
      const attachment = this.attachmentRepo.create({
        submission_id: savedSubmission.id,
        file_url: screenshotPath,
        file_name: screenshotPath.split("/").pop() || "screenshot",
        file_type: "image/png",
        file_size: 0,
        is_screenshot: true,
      });
      await this.attachmentRepo.save(attachment);
    }

    const ceoGm = await this.userRepo.find({
      where: [
        { role: UserRole.CEO, is_active: true },
        { role: UserRole.GENERAL_MANAGER, is_active: true },
      ],
    });

    for (const reviewer of ceoGm) {
      const notification = this.notificationRepo.create({
        user_id: reviewer.id,
        type: NotificationType.DESIGNER_PHASE_SUBMITTED,
        title: "Phase submitted",
        body: `${submitter.name} submitted phase "${phase}" for task "${task.title}".`,
        entity_type: "task",
        entity_id: taskId,
      });
      await this.notificationRepo.save(notification);
    }

    return savedSubmission;
  }

  async reviewPhase(
    taskId: string,
    phase: DesignerPhase,
    action: ReviewAction,
    message: string,
    reviewer: { id: string; name: string }
  ) {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, task_type: TaskType.DESIGNER },
    });
    if (!task) throw new AppError(404, "Designer task not found");

    const latestSubmission = await this.submissionRepo.findOne({
      where: { task_id: taskId },
      order: { submitted_at: "DESC" },
    });

    const screenshotAttachment = latestSubmission
      ? await this.attachmentRepo.findOne({
          where: { submission_id: latestSubmission.id, is_screenshot: true },
        })
      : null;

    const phaseEntryData: DeepPartial<DesignerPhaseHistory> = {
      task_id: taskId,
      phase,
      action,
      reviewer_id: reviewer.id,
      reviewer_name: reviewer.name,
      message,
      designer_note: latestSubmission?.notes ?? null,
      designer_screenshot: screenshotAttachment?.file_url ?? null,
      designer_submission_id: latestSubmission?.id ?? null,
    };
    const phaseEntry = this.phaseHistoryRepo.create(phaseEntryData);
    const savedEntry = await this.phaseHistoryRepo.save(phaseEntry);

    if (task.assigned_to) {
      const notification = this.notificationRepo.create({
        user_id: task.assigned_to,
        type: NotificationType.DESIGNER_PHASE_REVIEWED,
        title: "Phase reviewed",
        body: `Phase "${phase}" for task "${task.title}" was ${action}.`,
        entity_type: "task",
        entity_id: taskId,
      });
      await this.notificationRepo.save(notification);
    }

    return savedEntry;
  }

  async updatePhaseNotes(taskId: string, phase: DesignerPhase, note: string, designerId: string) {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, task_type: TaskType.DESIGNER },
    });
    if (!task) throw new AppError(404, "Designer task not found");

    if (task.assigned_to !== designerId) {
      throw new AppError(403, "You are not assigned to this task");
    }

    const entry = await this.phaseHistoryRepo.findOne({
      where: { task_id: taskId, phase },
      order: { created_at: "DESC" },
    });

    if (!entry) {
      throw new AppError(404, "No phase history entry found for this phase");
    }

    entry.designer_note = note;
    return this.phaseHistoryRepo.save(entry);
  }
}

export const designerTaskService = new DesignerTaskService();
