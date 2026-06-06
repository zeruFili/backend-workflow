import { AppDataSource } from "../config/data-source";
import { QsReviewTask } from "../entities/QsReviewTask";
import { QsReviewEvaluation } from "../entities/QsReviewEvaluation";
import { QsEvaluationReviewHistory } from "../entities/QsEvaluationReviewHistory";
import { QsNotification } from "../entities/QsNotification";
import { Notification } from "../entities/Notification";
import { User } from "../entities/User";
import { QsReviewStatus } from "../enums/qs-review-status.enum";
import { QsDecision } from "../enums/qs-decision.enum";
import { QsRecommendation } from "../enums/qs-recommendation.enum";
import { ReviewAction } from "../enums/review-action.enum";
import { NotificationType } from "../enums/notification-type.enum";
import { UserRole } from "../enums/user-role.enum";
import { AppError } from "../middlewares/error.middleware";

const taskRepo = () => AppDataSource.getRepository(QsReviewTask);
const evaluationRepo = () => AppDataSource.getRepository(QsReviewEvaluation);
const historyRepo = () => AppDataSource.getRepository(QsEvaluationReviewHistory);
const qsNotificationRepo = () => AppDataSource.getRepository(QsNotification);
const notificationRepo = () => AppDataSource.getRepository(Notification);
const userRepo = () => AppDataSource.getRepository(User);

export class QsService {
  async findAllReviewTasks(params: {
    page: number;
    limit: number;
    status?: string;
    assignedTo?: string;
    search?: string;
    sort?: string;
    currentUser: { id: string; role: UserRole };
  }) {
    const { page, limit, status, assignedTo, search, sort, currentUser } = params;
    const qb = taskRepo().createQueryBuilder("t")
      .leftJoinAndSelect("t.creator", "creator")
      .leftJoinAndSelect("t.assignee", "assignee");

    if (currentUser.role === UserRole.QUANTITY_SURVEYOR) {
      qb.andWhere("t.assigned_to = :assigned_to", { assigned_to: currentUser.id });
    }

    if (status) {
      qb.andWhere("t.status = :status", { status });
    }

    if (assignedTo) {
      const canSeeAll = currentUser.role === UserRole.CEO || currentUser.role === UserRole.GENERAL_MANAGER;
      if (canSeeAll) {
        qb.andWhere("t.assigned_to = :assignedTo", { assignedTo });
      }
    }

    if (search) {
      qb.andWhere(
        "(t.job_id ILIKE :search OR t.design_work_reference ILIKE :search OR t.description ILIKE :search OR t.designer_name ILIKE :search)",
        { search: `%${search}%` }
      );
    }

    const allowedSortFields = ["created_at", "updated_at", "submission_date", "status", "job_id"];
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

  async createReviewTask(dto: {
    description: string;
    assigned_to: string;
    telegram_screenshot: string;
    telegram_screenshot_description?: string;
    budget_expectation_reference?: string;
  }, createdBy: string) {
    const assignee = await userRepo().findOne({ where: { id: dto.assigned_to } });
    if (!assignee) {
      throw new AppError(404, "Assigned QS user not found");
    }

    const timestamp = Date.now();
    const jobId = `JOB-${timestamp}`;
    const designWorkRef = `DW-${timestamp}`;

    const task = new QsReviewTask();
    task.job_id = jobId;
    task.design_work_reference = designWorkRef;
    task.description = dto.description;
    task.telegram_screenshot = dto.telegram_screenshot;
    task.telegram_screenshot_description = dto.telegram_screenshot_description ?? null;
    task.designer_name = "";
    task.submission_date = new Date();
    task.budget_expectation_reference = dto.budget_expectation_reference ?? null;
    task.submission_history = [];
    task.status = QsReviewStatus.PENDING_REVIEW;
    task.created_by = createdBy;
    task.assigned_to = dto.assigned_to;

    const saved = await taskRepo().save(task);

    const qsNotif = new QsNotification();
    qsNotif.type = "qs_task_assigned";
    qsNotif.task_id = saved.id;
    qsNotif.job_id = jobId;
    qsNotif.message = `New review task assigned: ${jobId}`;
    qsNotif.description = dto.description;
    qsNotif.telegram_screenshot = dto.telegram_screenshot;
    qsNotif.target_roles = [UserRole.QUANTITY_SURVEYOR, UserRole.CEO, UserRole.GENERAL_MANAGER];
    qsNotif.read_by_roles = [];
    await qsNotificationRepo().save(qsNotif);

    return saved;
  }

  async updateTaskStatus(taskId: string, status: QsReviewStatus, currentUser: { id: string; role: UserRole }) {
    const task = await taskRepo().findOne({ where: { id: taskId } });
    if (!task) {
      throw new AppError(404, "QS review task not found");
    }

    if (task.assigned_to !== currentUser.id) {
      throw new AppError(403, "You are not assigned to this task");
    }

    if (task.status !== QsReviewStatus.PENDING_REVIEW || status !== QsReviewStatus.IN_REVIEW) {
      throw new AppError(400, "Status can only transition from pending_review to in_review");
    }

    task.status = status;
    const saved = await taskRepo().save(task);

    const qsNotif = new QsNotification();
    qsNotif.type = "qs_task_in_review";
    qsNotif.task_id = saved.id;
    qsNotif.job_id = saved.job_id;
    qsNotif.message = `QS review task ${saved.job_id} is now in review`;
    qsNotif.description = `Task status updated to ${status} by ${currentUser.id}`;
    qsNotif.target_roles = [UserRole.CEO, UserRole.GENERAL_MANAGER];
    qsNotif.read_by_roles = [];
    await qsNotificationRepo().save(qsNotif);

    return saved;
  }

  async assignTask(taskId: string, assignedTo: string) {
    const task = await taskRepo().findOne({ where: { id: taskId } });
    if (!task) {
      throw new AppError(404, "QS review task not found");
    }

    if (task.status !== QsReviewStatus.PENDING_REVIEW && task.status !== QsReviewStatus.IN_REVIEW) {
      throw new AppError(400, "Can only reassign tasks in pending_review or in_review status");
    }

    const newAssignee = await userRepo().findOne({ where: { id: assignedTo } });
    if (!newAssignee) {
      throw new AppError(404, "Assignee user not found");
    }

    const previousAssignee = task.assigned_to;
    task.assigned_to = assignedTo;
    const saved = await taskRepo().save(task);

    const qsNotif = new QsNotification();
    qsNotif.type = "qs_task_assigned";
    qsNotif.task_id = saved.id;
    qsNotif.job_id = saved.job_id;
    qsNotif.message = `QS review task ${saved.job_id} reassigned`;
    qsNotif.description = `Task reassigned from ${previousAssignee} to ${assignedTo}`;
    qsNotif.target_roles = [UserRole.QUANTITY_SURVEYOR, UserRole.CEO, UserRole.GENERAL_MANAGER];
    qsNotif.read_by_roles = [];
    await qsNotificationRepo().save(qsNotif);

    return saved;
  }

  async findEvaluations(params: {
    page: number;
    limit: number;
    surveyorId?: string;
    decisionStatus?: string;
    recommendation?: string;
    sort?: string;
    currentUser: { id: string; role: UserRole };
  }) {
    const { page, limit, surveyorId, decisionStatus, recommendation, sort, currentUser } = params;
    const qb = evaluationRepo().createQueryBuilder("e")
      .leftJoinAndSelect("e.task", "task")
      .leftJoinAndSelect("e.surveyor", "surveyor")
      .leftJoinAndSelect("e.decider", "decider");

    if (currentUser.role === UserRole.QUANTITY_SURVEYOR) {
      qb.andWhere("e.surveyor_id = :surveyor_id", { surveyor_id: currentUser.id });
    }

    if (surveyorId) {
      const canSeeAll = currentUser.role === UserRole.CEO || currentUser.role === UserRole.GENERAL_MANAGER;
      if (canSeeAll) {
        qb.andWhere("e.surveyor_id = :surveyorId", { surveyorId });
      }
    }

    if (decisionStatus) {
      qb.andWhere("e.decision_status = :decisionStatus", { decisionStatus });
    }

    if (recommendation) {
      qb.andWhere("e.recommendation = :recommendation", { recommendation });
    }

    const allowedSortFields = ["submitted_at", "cost_value"];
    if (sort && allowedSortFields.includes(sort.replace("-", ""))) {
      const direction = sort.startsWith("-") ? "DESC" : "ASC";
      const field = sort.replace("-", "");
      qb.orderBy(`e.${field}`, direction);
    } else {
      qb.orderBy("e.submitted_at", "DESC");
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

  async createEvaluation(dto: {
    task_id: string;
    cost_value: number;
    evaluation_notes: string;
    recommendation: QsRecommendation;
  }, currentUser: { id: string; role: UserRole }) {
    const task = await taskRepo().findOne({ where: { id: dto.task_id } });
    if (!task) {
      throw new AppError(404, "QS review task not found");
    }

    if (task.assigned_to !== currentUser.id) {
      throw new AppError(403, "You are not assigned to this task");
    }

    const existing = await evaluationRepo().findOne({ where: { task_id: dto.task_id } });
    if (existing) {
      throw new AppError(409, "Evaluation already exists for this task");
    }

    const evaluation = new QsReviewEvaluation();
    evaluation.task_id = dto.task_id;
    evaluation.job_id = task.job_id;
    evaluation.surveyor_id = currentUser.id;
    evaluation.surveyor_name = currentUser.id;
    evaluation.cost_value = dto.cost_value;
    evaluation.budget_expectation_reference = task.budget_expectation_reference;
    evaluation.evaluation_notes = dto.evaluation_notes;
    evaluation.recommendation = dto.recommendation;
    evaluation.decision_status = QsDecision.PENDING;

    const saved = await evaluationRepo().save(evaluation);

    task.status = QsReviewStatus.RECORD_SUBMITTED;
    task.evaluation_id = saved.id;
    await taskRepo().save(task);

    const qsNotif = new QsNotification();
    qsNotif.type = "qs_evaluation_submitted";
    qsNotif.task_id = task.id;
    qsNotif.evaluation_id = saved.id;
    qsNotif.job_id = task.job_id;
    qsNotif.message = `QS evaluation submitted for ${task.job_id}`;
    qsNotif.description = `Evaluation submitted with recommendation: ${dto.recommendation}. Cost: ${dto.cost_value}`;
    qsNotif.target_roles = [UserRole.CEO, UserRole.GENERAL_MANAGER];
    qsNotif.read_by_roles = [];
    await qsNotificationRepo().save(qsNotif);

    const ceoAndGmUsers = await userRepo().find({
      where: [
        { role: UserRole.CEO, is_active: true },
        { role: UserRole.GENERAL_MANAGER, is_active: true },
      ],
    });

    for (const u of ceoAndGmUsers) {
      const notif = new Notification();
      notif.user_id = u.id;
      notif.type = NotificationType.QS_EVALUATION_SUBMITTED;
      notif.title = `QS Evaluation Submitted - ${task.job_id}`;
      notif.body = `A new quantity surveyor evaluation has been submitted by ${currentUser.id} with recommendation: ${dto.recommendation}. Cost: ${dto.cost_value}`;
      notif.entity_type = "qs_evaluation";
      notif.entity_id = saved.id;
      await notificationRepo().save(notif);
    }

    return saved;
  }

  async updateEvaluation(evaluationId: string, dto: {
    cost_value?: number;
    evaluation_notes?: string;
    recommendation?: QsRecommendation;
  }, currentUser: { id: string; role: UserRole }) {
    const evaluation = await evaluationRepo().findOne({ where: { id: evaluationId } });
    if (!evaluation) {
      throw new AppError(404, "Evaluation not found");
    }

    if (evaluation.surveyor_id !== currentUser.id) {
      throw new AppError(403, "You are not the author of this evaluation");
    }

    if (evaluation.decision_status !== QsDecision.PENDING) {
      throw new AppError(400, "Cannot update evaluation after a decision has been made");
    }

    if (dto.cost_value !== undefined) {
      evaluation.cost_value = dto.cost_value;
    }
    if (dto.evaluation_notes !== undefined) {
      evaluation.evaluation_notes = dto.evaluation_notes;
    }
    if (dto.recommendation !== undefined) {
      evaluation.recommendation = dto.recommendation;
    }

    return evaluationRepo().save(evaluation);
  }

  async decide(evaluationId: string, dto: {
    decision: string;
    notes?: string;
  }, currentUser: { id: string; role: UserRole; name: string }) {
    const evaluation = await evaluationRepo().findOne({ where: { id: evaluationId } });
    if (!evaluation) {
      throw new AppError(404, "Evaluation not found");
    }

    if (evaluation.decision_status !== QsDecision.PENDING) {
      throw new AppError(400, "Decision has already been made for this evaluation");
    }

    const decisionStatus = dto.decision === "approved" ? QsDecision.APPROVED : QsDecision.FEEDBACK;

    evaluation.decision_status = decisionStatus;
    evaluation.decision_notes = dto.notes ?? null;
    evaluation.decided_by = currentUser.id;
    evaluation.decided_by_name = currentUser.name;
    evaluation.decided_at = new Date();

    const saved = await evaluationRepo().save(evaluation);

    const reviewAction = decisionStatus === QsDecision.APPROVED ? ReviewAction.APPROVED : ReviewAction.FEEDBACK;
    const history = new QsEvaluationReviewHistory();
    history.evaluation_id = saved.id;
    history.action = reviewAction;
    history.reviewer_id = currentUser.id;
    history.reviewer_name = currentUser.name;
    history.message = dto.notes ?? null;
    await historyRepo().save(history);

    const qsNotif = new QsNotification();
    qsNotif.type = "qs_evaluation_reviewed";
    qsNotif.task_id = evaluation.task_id;
    qsNotif.evaluation_id = saved.id;
    qsNotif.job_id = evaluation.job_id;
    qsNotif.message = `QS evaluation ${evaluation.job_id} ${dto.decision}`;
    qsNotif.description = `Evaluation was ${dto.decision} by ${currentUser.name}. ${dto.notes ?? ""}`;
    qsNotif.target_roles = [UserRole.QUANTITY_SURVEYOR, UserRole.CEO, UserRole.GENERAL_MANAGER];
    qsNotif.read_by_roles = [];
    await qsNotificationRepo().save(qsNotif);

    const surveyorUser = await userRepo().findOne({ where: { id: evaluation.surveyor_id } });
    if (surveyorUser) {
      const notif = new Notification();
      notif.user_id = surveyorUser.id;
      notif.type = NotificationType.QS_EVALUATION_REVIEWED;
      notif.title = `QS Evaluation ${dto.decision} - ${evaluation.job_id}`;
      notif.body = `Your evaluation for ${evaluation.job_id} has been ${dto.decision} by ${currentUser.name}. ${dto.notes ?? ""}`;
      notif.entity_type = "qs_evaluation";
      notif.entity_id = saved.id;
      await notificationRepo().save(notif);
    }

    return saved;
  }

  async getQsNotifications(params: {
    page: number;
    limit: number;
    type?: string;
    currentUser: { role: UserRole };
  }) {
    const { page, limit, type, currentUser } = params;
    const qb = qsNotificationRepo().createQueryBuilder("n")
      .leftJoinAndSelect("n.task", "task");

    qb.andWhere(":role = ANY(n.target_roles)", { role: currentUser.role });

    if (type) {
      qb.andWhere("n.type = :type", { type });
    }

    qb.orderBy("n.created_at", "DESC");

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

  async markQsNotificationsRead(type: string, currentUser: { role: UserRole }) {
    const notifications = await qsNotificationRepo()
      .createQueryBuilder("n")
      .where("n.type = :type", { type })
      .andWhere(":role = ANY(n.target_roles)", { role: currentUser.role })
      .getMany();

    for (const notif of notifications) {
      const readByRoles: string[] = notif.read_by_roles ?? [];
      if (!readByRoles.includes(currentUser.role)) {
        readByRoles.push(currentUser.role);
        notif.read_by_roles = readByRoles;
      }
    }

    if (notifications.length > 0) {
      await qsNotificationRepo().save(notifications);
    }

    return { markedCount: notifications.length };
  }
}

export const qsService = new QsService();
