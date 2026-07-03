import { AppDataSource } from "../config/data-source";
import { Notification } from "../entities/Notification";
import { ResourceType } from "../enums/resource-type.enum";
import { ParentType } from "../enums/parent-type.enum";
import { AppError } from "../middlewares/error.middleware";
import { pickSafeUserFields } from "../utils/response.utils";
import { ROLE_RESOURCE_FILTERS, toCamelKey } from "../constants/role-resource-filters";

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

    const [data, total] = await this.repo.findAndCount({
      where: { user_id: userId, ...(viewed !== undefined ? { viewed } : {}) } as any,
      relations: ["from_user"],
      order: { created_at: "DESC" },
      skip,
      take: limit,
    });

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
    const domains = parentTypes ?? Object.keys(ROLE_RESOURCE_FILTERS);
    const results: Record<string, number> = {};

    for (const domain of domains) {
      const resourceTypes = ROLE_RESOURCE_FILTERS[domain]?.[role];
      if (!resourceTypes || resourceTypes.length === 0) {
        console.log(`  [getUnreadCounts] Skipping domain=${domain} — no resource_types for role=${role}`);
        continue;
      }

      console.log(`  [getUnreadCounts] Querying domain=${domain} resourceTypes=[${resourceTypes.join(",")}]`);

      const result = await this.repo
        .createQueryBuilder("n")
        .select("COUNT(DISTINCT n.parent_id)", "count")
        .where("n.user_id = :userId", { userId })
        .andWhere("n.viewed = false")
        .andWhere("n.parent_type = :domain", { domain })
        .andWhere("n.resource_type IN (:...resourceTypes)", { resourceTypes })
        .getRawOne();

      results[toCamelKey(domain)] = Number(result?.count ?? 0);
      console.log(`  [getUnreadCounts] domain=${domain} → ${toCamelKey(domain)}=${results[toCamelKey(domain)]}`);
    }

    console.log(`[getUnreadCounts] Final result:`, JSON.stringify(results));
    return results;
  }

  async markRead(notificationId: string, userId: string) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [markRead] RECEIVED - notificationId: ${notificationId}, userId: ${userId}`);
  
  const notification = await this.repo.findOne({
    where: { id: notificationId, user_id: userId } as any,
  });

  if (!notification) {
    console.log(`[${timestamp}] [markRead] NOT FOUND - notificationId: ${notificationId}, userId: ${userId}`);
    throw new AppError(404, "Notification not found");
  }

  console.log(`[${timestamp}] [markRead] FOUND - Notification details:`, JSON.stringify({
    id: notification.id,
    viewed_before: notification.viewed,
    user_id: notification.user_id,
    created_at: notification.created_at
  }));

  notification.viewed = true;
  notification.updated_at = new Date();
  
  const updatedNotification = await this.repo.save(notification);
  
  console.log(`[${timestamp}] [markRead] SUCCESS - Updated notification ID: ${notificationId}`, JSON.stringify({
    id: updatedNotification.id,
    viewed: updatedNotification.viewed,
    updated_at: updatedNotification.updated_at
  }));
  
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
