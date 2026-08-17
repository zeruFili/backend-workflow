import { AppDataSource } from "../config/data-source";
import { Notification } from "../entities/Notification";
import { ResourceType } from "../enums/resource-type.enum";
import { ParentType } from "../enums/parent-type.enum";
import { AppError } from "../middlewares/error.middleware";
import { pickSafeUserFields } from "../utils/response.utils";
import { safeUserColumns } from "../utils/user-columns.utils";
import { ROLE_RESOURCE_FILTERS } from "../constants/role-resource-filters";

export class NotificationService {
  private repo = AppDataSource.getRepository(Notification);

  async createNotification(params: {
    user_id: string;
    from_user_id: string;
    resource_id: string;
    resource_type: ResourceType;
    parent_id: string;
    parent_type?: ParentType;
    type: string;
  }) {
    const notification = new Notification();
    notification.user_id = params.user_id;
    notification.from_user_id = params.from_user_id;
    notification.resource_id = params.resource_id;
    notification.resource_type = params.resource_type;
    notification.parent_id = params.parent_id;
    notification.parent_type = params.parent_type ?? null as any;
    notification.type = params.type;
    notification.viewed = false;

    return this.repo.save(notification);
  }

  async getUserNotifications(userId: string, page: number, limit: number, viewed?: boolean) {
    const skip = (page - 1) * limit;

    const qb = this.repo.createQueryBuilder("n")
      .leftJoin("n.from_user", "from_user")
      .addSelect(safeUserColumns("from_user"))
      .where("n.user_id = :userId", { userId })
      .orderBy("n.created_at", "DESC")
      .skip(skip)
      .take(limit);

    if (viewed !== undefined) {
      qb.andWhere("n.viewed = :viewed", { viewed });
    }

    const [data, total] = await qb.getManyAndCount();

    const sanitized = data.map((n) => ({
      ...n,
      from_user: pickSafeUserFields(n.from_user as any),
    }));

    return {
      data: sanitized,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getUnreadCount(userId: string) {
    const count = await this.repo.count({
      where: { user_id: userId as any, viewed: false },
    });

    return { total: count };
  }

  async getUnreadCounts(userId: string, role: string, parentTypes?: string[]) {
    const domainKeys = parentTypes ?? Object.keys(ROLE_RESOURCE_FILTERS);
    const results: Record<string, number> = {};

    for (const key of domainKeys) {
      const config = ROLE_RESOURCE_FILTERS[key];
      if (!config) continue;

      const resourceTypes = config.filters[role];
      if (!resourceTypes || resourceTypes.length === 0) {
        continue;
      }

      // Fetch distinct parent_ids
      const parentIds = await this.repo
        .createQueryBuilder("n")
        .select("DISTINCT n.parent_id", "parent_id")
        .where("n.user_id = :userId", { userId })
        .andWhere("n.viewed = false")
        .andWhere("n.parent_type = :domain", { domain: config.parentType })
        .andWhere("n.resource_type IN (:...resourceTypes)", { resourceTypes })
        .getRawMany();

      const ids = parentIds.map((r: any) => r.parent_id);

      results[key] = ids.length;
    }

    return results;
  }

  async markRead(notificationId: string, userId: string) {
  const notification = await this.repo.findOne({
    where: { id: notificationId, user_id: userId } as any,
  });

  if (!notification) {
    throw new AppError(404, "Notification not found");
  }

  notification.viewed = true;
  notification.updated_at = new Date();
  
  const updatedNotification = await this.repo.save(notification);
  
  return updatedNotification;
}

  async markMultipleRead(ids: string[], userId: string) {
    const notifications = await this.repo
      .createQueryBuilder("n")
      .where("n.id IN (:...ids)", { ids })
      .andWhere("n.user_id = :userId", { userId })
      .andWhere("n.viewed = false")
      .getMany();

    for (const n of notifications) {
      n.viewed = true;
      n.updated_at = new Date();
    }

    if (notifications.length > 0) {
      await this.repo.save(notifications);
    }

    return { markedCount: notifications.length, markedIds: notifications.map((n) => n.id) };
  }

  async markAllRead(userId: string) {
    const notifications = await this.repo.find({
      where: { user_id: userId as any, viewed: false },
    });

    for (const n of notifications) {
      n.viewed = true;
      n.updated_at = new Date();
    }

    if (notifications.length > 0) {
      await this.repo.save(notifications);
    }

    return { markedCount: notifications.length };
  }
}

export const notificationService = new NotificationService();
