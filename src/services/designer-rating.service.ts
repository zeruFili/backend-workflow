import { AppDataSource } from "../config/data-source";
import { DesignerRating } from "../entities/DesignerRating";
import { Task } from "../entities/Task";
import { DesignerPhaseHistory } from "../entities/DesignerPhaseHistory";
import { User } from "../entities/User";
import { DesignerPhase } from "../enums/designer-phase.enum";
import { ReviewAction } from "../enums/review-action.enum";
import { UserRole } from "../enums/user-role.enum";
import { AppError } from "../middlewares/error.middleware";

const ratingRepo = () => AppDataSource.getRepository(DesignerRating);
const taskRepo = () => AppDataSource.getRepository(Task);
const phaseHistoryRepo = () => AppDataSource.getRepository(DesignerPhaseHistory);
const userRepo = () => AppDataSource.getRepository(User);

export class DesignerRatingService {
  async findAll(params: {
    page: number;
    limit: number;
    designerId?: string;
    status?: string;
    year?: number;
    quarter?: number;
    month?: number;
    week?: number;
    sort?: string;
    currentUser: { id: string; role: UserRole };
  }) {
    const { page, limit, designerId, status, year, quarter, month, week, sort, currentUser } = params;
    const qb = ratingRepo().createQueryBuilder("r")
      .leftJoinAndSelect("r.designer", "designer")
      .leftJoinAndSelect("r.task", "task")
      .leftJoinAndSelect("r.rater", "rater");

    if (currentUser.role === UserRole.DESIGNER) {
      qb.andWhere("r.designer_id = :designer_id", { designer_id: currentUser.id });
    }

    if (designerId) {
      const canSeeAll = currentUser.role === UserRole.CEO || currentUser.role === UserRole.GENERAL_MANAGER;
      if (canSeeAll) {
        qb.andWhere("r.designer_id = :designerId", { designerId });
      }
    }

    if (status) {
      qb.andWhere("r.status = :status", { status });
    }

    if (year) {
      qb.andWhere("EXTRACT(YEAR FROM r.rated_at) = :year", { year });
    }

    if (quarter) {
      qb.andWhere("EXTRACT(QUARTER FROM r.rated_at) = :quarter", { quarter });
    }

    if (month) {
      qb.andWhere("EXTRACT(MONTH FROM r.rated_at) = :month", { month });
    }

    if (week) {
      qb.andWhere("EXTRACT(WEEK FROM r.rated_at) = :week", { week });
    }

    const allowedSortFields = ["overall_rating", "rated_at", "created_at", "story_points"];
    if (sort && allowedSortFields.includes(sort.replace("-", ""))) {
      const direction = sort.startsWith("-") ? "DESC" : "ASC";
      const field = sort.replace("-", "");
      qb.orderBy(`r.${field}`, direction);
    } else {
      qb.orderBy("r.created_at", "DESC");
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

  async getSummary(params: {
    designerId?: string;
    year?: number;
    quarter?: number;
    month?: number;
    week?: number;
    currentUser: { id: string; role: UserRole };
  }) {
    const { designerId, year, quarter, month, week, currentUser } = params;

    const qb = ratingRepo().createQueryBuilder("r")
      .leftJoin("r.designer", "designer")
      .select("r.designer_id", "designerId")
      .addSelect("designer.name", "designerName")
      .addSelect("AVG(r.overall_rating)", "avgOverallRating")
      .addSelect("AVG(r.rendering_quality)", "avgRenderingQuality")
      .addSelect("AVG(r.timeliness)", "avgTimeliness")
      .addSelect("AVG(r.creativity)", "avgCreativity")
      .addSelect("AVG(r.client_understanding)", "avgClientUnderstanding")
      .addSelect("AVG(r.revision_efficiency)", "avgRevisionEfficiency")
      .addSelect("SUM(r.story_points)", "totalStoryPoints")
      .addSelect("COUNT(r.id)", "tasksCompleted")
      .where("r.status = :status", { status: "approved" });

    if (currentUser.role === UserRole.DESIGNER) {
      qb.andWhere("r.designer_id = :designer_id", { designer_id: currentUser.id });
    }

    if (designerId) {
      const canSeeAll = currentUser.role === UserRole.CEO || currentUser.role === UserRole.GENERAL_MANAGER;
      if (canSeeAll) {
        qb.andWhere("r.designer_id = :designerId", { designerId });
      }
    }

    if (year) {
      qb.andWhere("EXTRACT(YEAR FROM r.rated_at) = :year", { year });
    }
    if (quarter) {
      qb.andWhere("EXTRACT(QUARTER FROM r.rated_at) = :quarter", { quarter });
    }
    if (month) {
      qb.andWhere("EXTRACT(MONTH FROM r.rated_at) = :month", { month });
    }
    if (week) {
      qb.andWhere("EXTRACT(WEEK FROM r.rated_at) = :week", { week });
    }

    qb.groupBy("r.designer_id")
      .addGroupBy("designer.name");

    const results = await qb.getRawMany();

    return {
      data: results.map((r: any) => ({
        designerId: r.designerId,
        designerName: r.designerName,
        avgOverallRating: parseFloat(r.avgOverallRating) || 0,
        avgRenderingQuality: parseFloat(r.avgRenderingQuality) || 0,
        avgTimeliness: parseFloat(r.avgTimeliness) || 0,
        avgCreativity: parseFloat(r.avgCreativity) || 0,
        avgClientUnderstanding: parseFloat(r.avgClientUnderstanding) || 0,
        avgRevisionEfficiency: parseFloat(r.avgRevisionEfficiency) || 0,
        totalStoryPoints: parseInt(r.totalStoryPoints, 10) || 0,
        tasksCompleted: parseInt(r.tasksCompleted, 10) || 0,
      })),
    };
  }

  async getLeaderboard(params: {
    year?: number;
    quarter?: number;
    month?: number;
    week?: number;
    limit?: number;
  }) {
    const { year, quarter, month, week, limit } = params;
    const take = Math.min(50, Math.max(1, limit || 10));

    const qb = ratingRepo().createQueryBuilder("r")
      .leftJoin("r.designer", "designer")
      .select("r.designer_id", "designerId")
      .addSelect("designer.name", "designerName")
      .addSelect("AVG(r.overall_rating)", "avgOverallRating")
      .addSelect("SUM(r.story_points)", "totalStoryPoints")
      .addSelect("COUNT(r.id)", "tasksCompleted")
      .where("r.status = :status", { status: "approved" });

    if (year) {
      qb.andWhere("EXTRACT(YEAR FROM r.rated_at) = :year", { year });
    }
    if (quarter) {
      qb.andWhere("EXTRACT(QUARTER FROM r.rated_at) = :quarter", { quarter });
    }
    if (month) {
      qb.andWhere("EXTRACT(MONTH FROM r.rated_at) = :month", { month });
    }
    if (week) {
      qb.andWhere("EXTRACT(WEEK FROM r.rated_at) = :week", { week });
    }

    qb.groupBy("r.designer_id")
      .addGroupBy("designer.name")
      .orderBy("AVG(r.overall_rating)", "DESC")
      .take(take);

    const results = await qb.getRawMany();

    return {
      data: results.map((r: any, index: number) => ({
        rank: index + 1,
        designerId: r.designerId,
        designerName: r.designerName,
        avgOverallRating: parseFloat(r.avgOverallRating) || 0,
        totalStoryPoints: parseInt(r.totalStoryPoints, 10) || 0,
        tasksCompleted: parseInt(r.tasksCompleted, 10) || 0,
      })),
    };
  }

  async create(dto: {
    task_id: string;
    overall_rating: number;
    rendering_quality: number;
    timeliness: number;
    creativity: number;
    client_understanding: number;
    revision_efficiency?: number;
    feedback: string;
  }, currentUser: { id: string; role: UserRole }) {
    const task = await taskRepo().findOne({
      where: { id: dto.task_id },
      relations: ["assignee"],
    });
    if (!task) {
      throw new AppError(404, "Task not found");
    }

    if (!task.assigned_to) {
      throw new AppError(400, "Task has no designer assigned");
    }

    const existingRating = await ratingRepo().findOne({ where: { task_id: dto.task_id } });
    if (existingRating) {
      throw new AppError(409, "Rating already exists for this task");
    }

    const phases = [DesignerPhase.CASE_STUDY, DesignerPhase.DESIGN_STAGE, DesignerPhase.RENDERING, DesignerPhase.FINAL_STAGE];
    const phaseHistories = await phaseHistoryRepo().find({ where: { task_id: dto.task_id } });

    const approvedPhases = new Set<string>();
    for (const ph of phaseHistories) {
      if (ph.action === ReviewAction.APPROVED) {
        approvedPhases.add(ph.phase);
      }
    }

    for (const phase of phases) {
      if (!approvedPhases.has(phase)) {
        throw new AppError(400, `Phase ${phase} has not been approved for this task`);
      }
    }

    const revisionCount = phaseHistories.filter(
      (ph) => ph.action === ReviewAction.REJECTED || ph.action === ReviewAction.FEEDBACK
    ).length;

    const rating = new DesignerRating();
    rating.designer_id = task.assigned_to;
    rating.task_id = dto.task_id;
    rating.story_points = task.story_points;
    rating.overall_rating = dto.overall_rating;
    rating.rendering_quality = dto.rendering_quality;
    rating.timeliness = dto.timeliness;
    rating.creativity = dto.creativity;
    rating.client_understanding = dto.client_understanding;
    rating.revision_efficiency = dto.revision_efficiency ?? null;
    rating.revision_count = revisionCount;
    rating.feedback = dto.feedback;
    rating.status = "approved";
    rating.rated_by = currentUser.id;

    return ratingRepo().save(rating);
  }

  async update(ratingId: string, dto: {
    overall_rating?: number;
    rendering_quality?: number;
    timeliness?: number;
    creativity?: number;
    client_understanding?: number;
    revision_efficiency?: number;
    feedback?: string;
    status?: string;
  }) {
    const rating = await ratingRepo().findOne({ where: { id: ratingId } });
    if (!rating) {
      throw new AppError(404, "Designer rating not found");
    }

    if (dto.status !== undefined) {
      const validStatuses = ["approved", "in_review", "rejected"];
      if (!validStatuses.includes(dto.status)) {
        throw new AppError(400, `Invalid status. Must be one of: ${validStatuses.join(", ")}`);
      }
      rating.status = dto.status;
    }

    if (dto.overall_rating !== undefined) rating.overall_rating = dto.overall_rating;
    if (dto.rendering_quality !== undefined) rating.rendering_quality = dto.rendering_quality;
    if (dto.timeliness !== undefined) rating.timeliness = dto.timeliness;
    if (dto.creativity !== undefined) rating.creativity = dto.creativity;
    if (dto.client_understanding !== undefined) rating.client_understanding = dto.client_understanding;
    if (dto.revision_efficiency !== undefined) rating.revision_efficiency = dto.revision_efficiency;
    if (dto.feedback !== undefined) rating.feedback = dto.feedback;

    return ratingRepo().save(rating);
  }
}

export const designerRatingService = new DesignerRatingService();
