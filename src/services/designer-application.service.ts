import { AppDataSource } from "../config/data-source";
import { DesignerTaskApplication } from "../entities/DesignerTaskApplication";
import { Task } from "../entities/Task";
import { User } from "../entities/User";
import { Notification } from "../entities/Notification";
import { DesignerTaskApplicationStatus } from "../enums/designer-task-application-status.enum";
import { TaskStatus } from "../enums/task-status.enum";
import { TaskType } from "../enums/task-type.enum";
import { NotificationType } from "../enums/notification-type.enum";
import { UserRole } from "../enums/user-role.enum";
import { AppError } from "../middlewares/error.middleware";

interface PaginatedParams {
  page: number;
  limit: number;
  taskId?: string;
  applicantId?: string;
  status?: string;
  currentUser: { id: string; role: UserRole };
}

interface ApplyParams {
  task_id: string;
  message: string;
}

interface ReviewParams {
  status: string;
  review_note?: string;
}

export class DesignerApplicationService {
  private applicationRepo = AppDataSource.getRepository(DesignerTaskApplication);
  private taskRepo = AppDataSource.getRepository(Task);
  private userRepo = AppDataSource.getRepository(User);
  private notificationRepo = AppDataSource.getRepository(Notification);

  async findAll(params: PaginatedParams) {
    const { page, limit, taskId, applicantId, status, currentUser } = params;

    const qb = this.applicationRepo.createQueryBuilder("a")
      .leftJoinAndSelect("a.applicant", "applicant")
      .leftJoinAndSelect("a.task", "task")
      .leftJoinAndSelect("a.reviewer", "reviewer");

    const isDesigner = currentUser.role === UserRole.DESIGNER;
    if (isDesigner) {
      qb.andWhere("a.applicant_id = :userId", { userId: currentUser.id });
    }

    if (taskId) qb.andWhere("a.task_id = :taskId", { taskId });
    if (applicantId) qb.andWhere("a.applicant_id = :applicantId", { applicantId });
    if (status) qb.andWhere("a.status = :status", { status });

    qb.orderBy("a.applied_at", "DESC");

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

  async apply(params: ApplyParams, applicant: { id: string; name: string }) {
    const task = await this.taskRepo.findOne({
      where: { id: params.task_id, task_type: TaskType.DESIGNER },
    });
    if (!task) throw new AppError(404, "Designer task not found");

    if (!task.is_public) {
      throw new AppError(400, "This task is not open for applications");
    }

    if (task.assigned_to) {
      throw new AppError(400, "This task is already assigned");
    }

    const existing = await this.applicationRepo.findOne({
      where: { task_id: params.task_id, applicant_id: applicant.id },
    });
    if (existing) {
      throw new AppError(409, "You have already applied for this task");
    }

    const application = this.applicationRepo.create({
      task_id: params.task_id,
      applicant_id: applicant.id,
      applicant_name: applicant.name,
      message: params.message,
      status: DesignerTaskApplicationStatus.PENDING,
    });
    const saved = await this.applicationRepo.save(application);

    const ceoGm = await this.userRepo.find({
      where: [
        { role: UserRole.CEO, is_active: true },
        { role: UserRole.GENERAL_MANAGER, is_active: true },
      ],
    });

    for (const reviewer of ceoGm) {
      const notification = this.notificationRepo.create({
        user_id: reviewer.id,
        type: NotificationType.DESIGNER_APPLICATION,
        title: "New designer application",
        body: `${applicant.name} applied for task "${task.title}".`,
        entity_type: "task",
        entity_id: params.task_id,
      });
      await this.notificationRepo.save(notification);
    }

    return saved;
  }

  async review(
    applicationId: string,
    params: ReviewParams,
    reviewer: { id: string; name: string }
  ) {
    const application = await this.applicationRepo.findOne({
      where: { id: applicationId },
      relations: ["task"],
    });
    if (!application) throw new AppError(404, "Application not found");

    if (application.status !== DesignerTaskApplicationStatus.PENDING) {
      throw new AppError(409, "Application has already been reviewed");
    }

    if (params.status === DesignerTaskApplicationStatus.ASSIGNED) {
      const task = application.task;
      if (!task) throw new AppError(404, "Associated task not found");

      if (task.assigned_to) {
        throw new AppError(409, "Task is already assigned to a designer");
      }

      task.assigned_to = application.applicant_id;
      task.status = TaskStatus.IN_PROGRESS;
      task.assigned_at = new Date();
      await this.taskRepo.save(task);

      const notification = this.notificationRepo.create({
        user_id: application.applicant_id,
        type: NotificationType.DESIGNER_ASSIGNED,
        title: "Application accepted",
        body: `Your application for "${task.title}" has been accepted.`,
        entity_type: "task",
        entity_id: task.id,
      });
      await this.notificationRepo.save(notification);

      const otherPending = await this.applicationRepo.find({
        where: { task_id: task.id, status: DesignerTaskApplicationStatus.PENDING },
      });

      for (const other of otherPending) {
        if (other.id !== applicationId) {
          other.status = DesignerTaskApplicationStatus.REJECTED;
          other.reviewed_by = reviewer.id;
          other.reviewed_by_name = reviewer.name;
          other.reviewed_at = new Date();
          other.review_note = "Another applicant was assigned to this task";
        }
      }
      await this.applicationRepo.save(otherPending);
    }

    application.status = params.status as DesignerTaskApplicationStatus;
    application.reviewed_by = reviewer.id;
    application.reviewed_by_name = reviewer.name;
    application.reviewed_at = new Date();
    application.review_note = params.review_note ?? null;

    const saved = await this.applicationRepo.save(application);

    if (params.status === DesignerTaskApplicationStatus.REJECTED) {
      const notification = this.notificationRepo.create({
        user_id: application.applicant_id,
        type: NotificationType.DESIGNER_ASSIGNED,
        title: "Application not accepted",
        body: `Your application for "${application.task?.title || "a task"}" was not accepted.`,
        entity_type: "task",
        entity_id: application.task_id,
      });
      await this.notificationRepo.save(notification);
    }

    return saved;
  }
}

export const designerApplicationService = new DesignerApplicationService();
