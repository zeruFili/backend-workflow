import { AppDataSource } from "../config/data-source";
import { Notification } from "../entities/Notification";
import { AppError } from "../middlewares/error.middleware";

export class NotificationService {
  private repo = AppDataSource.getRepository(Notification);

  async createNotification(params: {
    user_id: string;
    from_user_id: string;
    resource_id: string;
    resource_type: string;
    parent_id: string;
    parent_type?: string;
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

    return {
      data,
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
    return this.repo.save(notification);
  }

  async markAllRead(userId: string) {
    const result = await this.repo.update(
      { user_id: userId as any, viewed: false },
      { viewed: true }
    );

    return { markedCount: result.affected ?? 0 };
  }
}

export const notificationService = new NotificationService();
