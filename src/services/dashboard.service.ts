import { AppDataSource } from "../config/data-source";
import { In } from "typeorm";
import { Project } from "../entities/Project";
import { Task } from "../entities/Task";
import { Notification } from "../entities/Notification";
import { DesignerRating } from "../entities/DesignerRating";
import { UserRole } from "../enums/user-role.enum";
import { TaskStatus } from "../enums/task-status.enum";
import { ApprovalStatus } from "../enums/approval-status.enum";
import { ProjectStatus } from "../enums/project-status.enum";
import { AppError } from "../middlewares/error.middleware";

const projectRepo = () => AppDataSource.getRepository(Project);
const taskRepo = () => AppDataSource.getRepository(Task);
const notificationRepo = () => AppDataSource.getRepository(Notification);
const ratingRepo = () => AppDataSource.getRepository(DesignerRating);

export class DashboardService {
  async getOverview(currentUser: { id: string; role: UserRole }) {
    const activeStatuses = [ProjectStatus.ACTIVE, ProjectStatus.ON_HOLD];
    const projectsCount = await projectRepo().count({
      where: { status: In(activeStatuses) },
    });

    const tasksRaw = await taskRepo()
      .createQueryBuilder("t")
      .select("t.status", "status")
      .addSelect("COUNT(t.id)", "count")
      .groupBy("t.status")
      .getRawMany<{ status: string; count: string }>();

    const tasksByStatus: Record<string, number> = {};
    let totalTasks = 0;
    for (const row of tasksRaw) {
      const c = parseInt(row.count, 10);
      tasksByStatus[row.status] = c;
      totalTasks += c;
    }

    const pendingApprovals = await taskRepo().count({
      where: { approval_status: ApprovalStatus.PENDING, status: TaskStatus.COMPLETED },
    });

    const openJobPostings = await taskRepo().count({
      where: { is_public: true, assigned_to: undefined as any, status: TaskStatus.PENDING },
    });

    const unreadNotifications = await notificationRepo().count({
      where: { user_id: currentUser.id, is_read: false },
    });

    return {
      projectsCount,
      totalTasks,
      tasksByStatus,
      pendingApprovals,
      openJobPostings,
      unreadNotifications,
    };
  }

  async getDesignerPerformance() {
    const raw = await ratingRepo()
      .createQueryBuilder("r")
      .leftJoin("r.designer", "designer")
      .select("r.designer_id", "designerId")
      .addSelect("designer.name", "designerName")
      .addSelect("AVG(r.overall_rating)", "avgOverallRating")
      .addSelect("SUM(r.story_points)", "totalStoryPoints")
      .addSelect("COUNT(r.id)", "tasksCompleted")
      .addSelect("SUM(CASE WHEN r.status = 'approved' THEN 1 ELSE 0 END)", "approvedCount")
      .addSelect("SUM(CASE WHEN r.status = 'in_review' THEN 1 ELSE 0 END)", "inReviewCount")
      .where("r.status != 'rejected'")
      .groupBy("r.designer_id")
      .addGroupBy("designer.name")
      .orderBy("AVG(r.overall_rating)", "DESC")
      .getRawMany();

    return {
      data: raw.map((r: any) => ({
        designerId: r.designerId,
        designerName: r.designerName,
        avgOverallRating: parseFloat(r.avgOverallRating) || 0,
        totalStoryPoints: parseInt(r.totalStoryPoints, 10) || 0,
        tasksCompleted: parseInt(r.tasksCompleted, 10) || 0,
        approvedCount: parseInt(r.approvedCount, 10) || 0,
        inReviewCount: parseInt(r.inReviewCount, 10) || 0,
      })),
    };
  }

  async getSiteEngineerDashboard(currentUser: { id: string; role: UserRole }) {
    const userId = currentUser.id;

    const taskCountsRaw = await taskRepo()
      .createQueryBuilder("t")
      .select("t.status", "status")
      .addSelect("COUNT(t.id)", "count")
      .where("t.assigned_to = :userId", { userId })
      .groupBy("t.status")
      .getRawMany<{ status: string; count: string }>();

    const taskCounts: Record<string, number> = {};
    let totalTasks = 0;
    for (const row of taskCountsRaw) {
      const c = parseInt(row.count, 10);
      taskCounts[row.status] = c;
      totalTasks += c;
    }

    const pendingTasks = await taskRepo().count({
      where: { assigned_to: userId, status: TaskStatus.PENDING },
    });

    const inProgressTasks = await taskRepo().count({
      where: { assigned_to: userId, status: TaskStatus.IN_PROGRESS },
    });

    const completedTasks = await taskRepo().count({
      where: { assigned_to: userId, status: TaskStatus.COMPLETED },
    });

    return {
      totalTasks,
      pendingTasks,
      inProgressTasks,
      completedTasks,
      taskCounts,
    };
  }
}

export const dashboardService = new DashboardService();
