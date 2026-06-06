import { AppDataSource } from "../config/data-source";
import { Task } from "../entities/Task";
import { Submission } from "../entities/Submission";
import { Feedback } from "../entities/Feedback";
import { SubmissionAttachment } from "../entities/SubmissionAttachment";
import { TaskStatus } from "../enums/task-status.enum";
import { ApprovalStatus } from "../enums/approval-status.enum";
import { UserRole } from "../enums/user-role.enum";
import { AppError } from "../middlewares/error.middleware";

const LEADERSHIP_ROLES: UserRole[] = [UserRole.CEO, UserRole.GENERAL_MANAGER];

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.PENDING]: [TaskStatus.IN_PROGRESS],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.COMPLETED, TaskStatus.INCOMPLETE],
  [TaskStatus.COMPLETED]: [],
  [TaskStatus.INCOMPLETE]: [TaskStatus.IN_PROGRESS],
  [TaskStatus.REJECTED]: [],
};

interface PaginatedParams {
  page: number;
  limit: number;
  status?: string;
  assignedTo?: string;
  assignedBy?: string;
  projectId?: string;
  taskType?: string;
  search?: string;
  sort?: string;
}

interface CreateTaskParams {
  title: string;
  description?: string;
  instruction?: string;
  project_id?: string;
  assigned_to?: string;
  deadline?: string;
  status?: string;
  task_type?: string;
  story_points?: number;
  is_public?: boolean;
}

interface UpdateTaskParams {
  title?: string;
  description?: string;
  instruction?: string;
  project_id?: string;
  assigned_to?: string;
  deadline?: string;
  status?: string;
  story_points?: number;
  is_public?: boolean;
  telegram_screenshot?: string;
}

export class TaskService {
  private repo = AppDataSource.getRepository(Task);
  private submissionRepo = AppDataSource.getRepository(Submission);
  private feedbackRepo = AppDataSource.getRepository(Feedback);
  private attachmentRepo = AppDataSource.getRepository(SubmissionAttachment);

  async findAll(params: PaginatedParams, userId: string, userRole: UserRole) {
    const { page, limit, status, assignedTo, assignedBy, projectId, taskType, search, sort } = params;

    const qb = this.repo.createQueryBuilder("t")
      .leftJoinAndSelect("t.assignee", "assignee")
      .leftJoinAndSelect("t.assigner", "assigner")
      .leftJoinAndSelect("t.project", "project")
      .leftJoinAndSelect("t.approver", "approver");

    if (userRole === UserRole.SITE_ENGINEER) {
      qb.andWhere("t.assigned_to = :userId", { userId });
    }

    if (status) qb.andWhere("t.status = :status", { status });
    if (assignedTo) qb.andWhere("t.assigned_to = :assignedTo", { assignedTo });
    if (assignedBy) qb.andWhere("t.assigned_by = :assignedBy", { assignedBy });
    if (projectId) qb.andWhere("t.project_id = :projectId", { projectId });
    if (taskType) qb.andWhere("t.task_type = :taskType", { taskType });

    if (search) {
      qb.andWhere("(t.title ILIKE :search OR t.description ILIKE :search OR t.instruction ILIKE :search)", { search: `%${search}%` });
    }

    const allowedSortFields = ["title", "status", "approval_status", "created_at", "updated_at", "deadline", "story_points"];
    if (sort && allowedSortFields.includes(sort.replace("-", ""))) {
      const direction = sort.startsWith("-") ? "DESC" : "ASC";
      const field = sort.replace("-", "");
      qb.orderBy(`t.${field}`, direction);
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
    const task = await this.repo.findOne({
      where: { id },
      relations: ["assignee", "assigner", "project", "approver"],
    });
    if (!task) throw new AppError(404, "Task not found");

    const submissions = await this.submissionRepo.find({
      where: { task_id: id },
      relations: ["submitter"],
      order: { submitted_at: "ASC" },
    });

    const feedbacks = await this.feedbackRepo.find({
      where: { task_id: id },
      relations: ["sender"],
      order: { sent_at: "ASC" },
    });

    return { ...task, submissions, feedbacks };
  }

  async create(params: CreateTaskParams, assignedBy: string, assignedByName: string) {
    const task = new Task();
    task.title = params.title;
    task.description = params.description ?? null;
    task.instruction = params.instruction ?? null;
    task.project_id = params.project_id ?? null;
    task.assigned_to = params.assigned_to ?? null;
    task.deadline = params.deadline ? new Date(params.deadline) : null;
    task.status = (params.status as TaskStatus) ?? TaskStatus.PENDING;
    task.task_type = params.task_type ?? "generic";
    task.story_points = params.story_points ?? 0;
    task.is_public = params.is_public ?? false;
    task.assigned_by = assignedBy;
    task.assigned_at = new Date();

    return this.repo.save(task);
  }

  async update(id: string, params: UpdateTaskParams) {
    const task = await this.repo.findOneBy({ id });
    if (!task) throw new AppError(404, "Task not found");

    if (params.title !== undefined) task.title = params.title;
    if (params.description !== undefined) task.description = params.description;
    if (params.instruction !== undefined) task.instruction = params.instruction;
    if (params.project_id !== undefined) task.project_id = params.project_id;
    if (params.assigned_to !== undefined) task.assigned_to = params.assigned_to;
    if (params.deadline !== undefined) {
      task.deadline = params.deadline ? new Date(params.deadline) : null;
    }
    if (params.status !== undefined) task.status = params.status as TaskStatus;
    if (params.story_points !== undefined) task.story_points = params.story_points;
    if (params.is_public !== undefined) task.is_public = params.is_public;
    if (params.telegram_screenshot !== undefined) task.telegram_screenshot = params.telegram_screenshot;

    return this.repo.save(task);
  }

  async delete(id: string) {
    const task = await this.repo.findOneBy({ id });
    if (!task) throw new AppError(404, "Task not found");

    const submissionCount = await this.submissionRepo.count({ where: { task_id: id } });
    if (submissionCount > 0) {
      throw new AppError(400, "Cannot delete task with existing submissions");
    }

    await this.repo.remove(task);
    return { id };
  }

  async changeStatus(id: string, newStatus: TaskStatus, userId: string, userRole: UserRole) {
    const task = await this.repo.findOneBy({ id });
    if (!task) throw new AppError(404, "Task not found");

    if (newStatus === TaskStatus.REJECTED && !LEADERSHIP_ROLES.includes(userRole)) {
      throw new AppError(403, "Only leadership can reject tasks");
    }

    if (task.assigned_to !== userId && !LEADERSHIP_ROLES.includes(userRole)) {
      throw new AppError(403, "Only the assigned user or leadership can change task status");
    }

    const allowedNextStatuses = VALID_TRANSITIONS[task.status] || [];
    if (newStatus === task.status) {
      return task;
    }
    if (!allowedNextStatuses.includes(newStatus)) {
      throw new AppError(
        400,
        `Cannot transition from ${task.status} to ${newStatus}. Allowed transitions: ${allowedNextStatuses.join(", ") || "none"}`
      );
    }

    if (newStatus === TaskStatus.REJECTED) {
      task.approval_status = ApprovalStatus.REJECTED;
      task.status = newStatus;
    } else {
      task.status = newStatus;
    }

    return this.repo.save(task);
  }

  async approve(id: string, userId: string, feedback?: string) {
    const task = await this.repo.findOneBy({ id });
    if (!task) throw new AppError(404, "Task not found");

    task.approval_status = ApprovalStatus.APPROVED;
    task.approved_by = userId;
    task.approved_at = new Date();
    if (feedback) {
      task.approval_feedback = feedback;
    }

    return this.repo.save(task);
  }

  async reject(id: string, userId: string, feedback: string) {
    if (!feedback || feedback.trim().length === 0) {
      throw new AppError(400, "Feedback is required when rejecting a task");
    }

    const task = await this.repo.findOneBy({ id });
    if (!task) throw new AppError(404, "Task not found");

    task.approval_status = ApprovalStatus.REJECTED;
    task.approved_by = userId;
    task.approved_at = new Date();
    task.approval_feedback = feedback;

    return this.repo.save(task);
  }

  async addFeedback(taskId: string, body: string, senderId: string, senderName: string) {
    const task = await this.repo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Task not found");

    const lastFeedback = await this.feedbackRepo.findOne({
      where: { task_id: taskId },
      order: { version: "DESC" },
    });

    const nextVersion = lastFeedback ? lastFeedback.version + 1 : 1;

    const fb = new Feedback();
    fb.task_id = taskId;
    fb.body = body;
    fb.sender_id = senderId;
    fb.sender_name = senderName;
    fb.version = nextVersion;

    return this.feedbackRepo.save(fb);
  }

  async uploadAttachment(submissionId: string, file: { file_url: string; file_name: string; file_type: string; file_size: number; is_screenshot?: boolean }) {
    const submission = await this.submissionRepo.findOneBy({ id: submissionId });
    if (!submission) throw new AppError(404, "Submission not found");

    const attachment = new SubmissionAttachment();
    attachment.submission_id = submissionId;
    attachment.file_url = file.file_url;
    attachment.file_name = file.file_name;
    attachment.file_type = file.file_type;
    attachment.file_size = file.file_size;
    attachment.is_screenshot = file.is_screenshot ?? false;

    return this.attachmentRepo.save(attachment);
  }

  async createSubmission(taskId: string, userId: string, userName: string, notes?: string, metadata?: Record<string, any>) {
    const task = await this.repo.findOneBy({ id: taskId });
    if (!task) throw new AppError(404, "Task not found");

    const submission = new Submission();
    submission.task_id = taskId;
    submission.submitted_by = userId;
    submission.submitted_by_name = userName;
    submission.notes = notes ?? null;
    submission.metadata = metadata ?? {};

    return this.submissionRepo.save(submission);
  }

  async getSubmissions(taskId: string) {
    return this.submissionRepo.find({
      where: { task_id: taskId },
      relations: ["submitter"],
      order: { submitted_at: "DESC" },
    });
  }

  async approveSubmission(submissionId: string, userId: string) {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ["task"],
    });
    if (!submission) throw new AppError(404, "Submission not found");

    const task = await this.repo.findOneBy({ id: submission.task_id });
    if (task) {
      task.approval_status = ApprovalStatus.APPROVED;
      task.approved_by = userId;
      task.approved_at = new Date();
      await this.repo.save(task);
    }

    return submission;
  }

  async updateFeedback(feedbackId: string, body: string, userId: string) {
    const fb = await this.feedbackRepo.findOneBy({ id: feedbackId });
    if (!fb) throw new AppError(404, "Feedback not found");
    if (fb.sender_id !== userId) throw new AppError(403, "Only the author can edit this feedback");

    fb.body = body;
    return this.feedbackRepo.save(fb);
  }

  async deleteFeedback(feedbackId: string, userId: string) {
    const fb = await this.feedbackRepo.findOneBy({ id: feedbackId });
    if (!fb) throw new AppError(404, "Feedback not found");
    if (fb.sender_id !== userId) throw new AppError(403, "Only the author can delete this feedback");

    await this.feedbackRepo.remove(fb);
    return { id: feedbackId };
  }
}
