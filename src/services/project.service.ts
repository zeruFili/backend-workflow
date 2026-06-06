import { AppDataSource } from "../config/data-source";
import { Project } from "../entities/Project";
import { Task } from "../entities/Task";
import { ProjectStatus } from "../enums/project-status.enum";
import { AppError } from "../middlewares/error.middleware";

interface PaginatedParams {
  page: number;
  limit: number;
  stage?: string;
  status?: string;
  assigned_to?: string;
  search?: string;
  sort?: string;
}

interface CreateProjectParams {
  name: string;
  client_name?: string;
  description?: string;
  stage?: string;
  status?: string;
  deadline?: string;
  assigned_to?: string;
}

interface UpdateProjectParams {
  name?: string;
  client_name?: string;
  description?: string;
  stage?: string;
  status?: string;
  deadline?: string;
  assigned_to?: string;
}

export class ProjectService {
  private repo = AppDataSource.getRepository(Project);
  private taskRepo = AppDataSource.getRepository(Task);

  async findAll(params: PaginatedParams) {
    const { page, limit, stage, status, assigned_to, search, sort } = params;
    const qb = this.repo.createQueryBuilder("p")
      .leftJoinAndSelect("p.creator", "creator")
      .leftJoinAndSelect("p.assignee", "assignee")
      .loadRelationCountAndMap("p.task_count", "p.tasks");

    if (stage) qb.andWhere("p.stage = :stage", { stage });
    if (status) qb.andWhere("p.status = :status", { status });
    if (assigned_to) qb.andWhere("p.assigned_to = :assigned_to", { assigned_to });

    if (search) {
      qb.andWhere("(p.name ILIKE :search OR p.client_name ILIKE :search OR p.description ILIKE :search)", { search: `%${search}%` });
    }

    const allowedSortFields = ["name", "stage", "status", "created_at", "updated_at", "deadline"];
    if (sort && allowedSortFields.includes(sort.replace("-", ""))) {
      const direction = sort.startsWith("-") ? "DESC" : "ASC";
      const field = sort.replace("-", "");
      qb.orderBy(`p.${field}`, direction);
    } else {
      qb.orderBy("p.created_at", "DESC");
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
    const project = await this.repo.findOne({
      where: { id },
      relations: ["creator", "assignee"],
    });
    if (!project) throw new AppError(404, "Project not found");

    const statuses = await this.taskRepo
      .createQueryBuilder("t")
      .select("t.status", "status")
      .addSelect("COUNT(t.id)", "count")
      .where("t.project_id = :id", { id })
      .groupBy("t.status")
      .getRawMany<{ status: string; count: string }>();

    const taskCounts: Record<string, number> = {};
    let totalTasks = 0;
    for (const row of statuses) {
      const c = parseInt(row.count, 10);
      taskCounts[row.status] = c;
      totalTasks += c;
    }

    return { ...project, taskCounts, totalTasks };
  }

  async create(params: CreateProjectParams, createdBy: string) {
    const project = new Project();
    project.name = params.name;
    project.client_name = params.client_name ?? null;
    project.description = params.description ?? null;
    project.stage = (params.stage as any) ?? undefined;
    project.status = (params.status as any) ?? undefined;
    project.deadline = params.deadline ? new Date(params.deadline) : null;
    project.assigned_to = params.assigned_to ?? null;
    project.created_by = createdBy;

    return this.repo.save(project);
  }

  async update(id: string, params: UpdateProjectParams) {
    const project = await this.repo.findOneBy({ id });
    if (!project) throw new AppError(404, "Project not found");

    if (params.name !== undefined) project.name = params.name;
    if (params.client_name !== undefined) project.client_name = params.client_name;
    if (params.description !== undefined) project.description = params.description;
    if (params.stage !== undefined) project.stage = params.stage as any;
    if (params.status !== undefined) project.status = params.status as any;
    if (params.deadline !== undefined) {
      project.deadline = params.deadline ? new Date(params.deadline) : null;
    }
    if (params.assigned_to !== undefined) project.assigned_to = params.assigned_to;

    return this.repo.save(project);
  }

  async delete(id: string) {
    const project = await this.repo.findOneBy({ id });
    if (!project) throw new AppError(404, "Project not found");

    project.status = ProjectStatus.COMPLETED;
    return this.repo.save(project);
  }
}
