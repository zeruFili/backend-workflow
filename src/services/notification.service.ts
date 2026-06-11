import { AppDataSource } from "../config/data-source";
import { Notification } from "../entities/Notification";
import { ResourceType } from "../enums/resource-type.enum";
import { ParentType } from "../enums/parent-type.enum";
import { AppError } from "../middlewares/error.middleware";
import { pickSafeUserFields } from "../utils/response.utils";

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

  async getUserNotifications(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [data, total] = await this.repo.findAndCount({
      where: { user_id: userId } as any,
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

  async markRead(notificationId: string, userId: string) {
    const notification = await this.repo.findOne({
      where: { id: notificationId, user_id: userId } as any,
    });

    if (!notification) {
      throw new AppError(404, "Notification not found");
    }

    notification.viewed = true;
    notification.updated_at = new Date();
    return this.repo.save(notification);
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
