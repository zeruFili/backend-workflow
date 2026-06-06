import { AppDataSource } from "../config/data-source";
import { Notification } from "../entities/Notification";
import { User } from "../entities/User";
import { NotificationType } from "../enums/notification-type.enum";
import { UserRole } from "../enums/user-role.enum";
import { AppError } from "../middlewares/error.middleware";
import { In } from "typeorm";

const notificationRepo = () => AppDataSource.getRepository(Notification);
const userRepo = () => AppDataSource.getRepository(User);

export class NotificationService {
  async getUserNotifications(params: {
    page: number;
    limit: number;
    isRead?: boolean;
    type?: string;
    entityType?: string;
    sort?: string;
    currentUser: { id: string };
  }) {
    const { page, limit, isRead, type, entityType, sort, currentUser } = params;

    const qb = notificationRepo().createQueryBuilder("n")
      .where("n.user_id = :userId", { userId: currentUser.id });

    if (isRead !== undefined) {
      qb.andWhere("n.is_read = :isRead", { isRead });
    }

    if (type) {
      qb.andWhere("n.type = :type", { type });
    }

    if (entityType) {
      qb.andWhere("n.entity_type = :entityType", { entityType });
    }

    const allowedSortFields = ["created_at", "type", "is_read"];
    if (sort && allowedSortFields.includes(sort.replace("-", ""))) {
      const direction = sort.startsWith("-") ? "DESC" : "ASC";
      const field = sort.replace("-", "");
      qb.orderBy(`n.${field}`, direction);
    } else {
      qb.orderBy("n.created_at", "DESC");
    }

    const skip = (page - 1) * limit;
    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    const unreadCount = await notificationRepo().count({
      where: { user_id: currentUser.id, is_read: false },
    });

    return {
      data,
      unreadCount,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async markRead(notificationId: string, currentUser: { id: string }) {
    const notification = await notificationRepo().findOne({
      where: { id: notificationId, user_id: currentUser.id },
    });

    if (!notification) {
      throw new AppError(404, "Notification not found");
    }

    notification.is_read = true;
    notification.read_at = new Date();

    return notificationRepo().save(notification);
  }

  async markAllRead(params: {
    types?: string[];
    currentUser: { id: string };
  }) {
    const { types, currentUser } = params;

    const where: any = { user_id: currentUser.id, is_read: false };

    if (types && types.length > 0) {
      where.type = In(types);
    }

    const unreadNotifications = await notificationRepo().find({ where });
    const count = unreadNotifications.length;

    if (count > 0) {
      const now = new Date();
      for (const n of unreadNotifications) {
        n.is_read = true;
        n.read_at = now;
      }
      await notificationRepo().save(unreadNotifications);
    }

    return { markedCount: count };
  }

  async getUnreadCount(params: {
    currentUser: { id: string };
  }) {
    const { currentUser } = params;

    const total = await notificationRepo().count({
      where: { user_id: currentUser.id, is_read: false },
    });

    const rawByType = await notificationRepo()
      .createQueryBuilder("n")
      .select("n.type", "type")
      .addSelect("COUNT(n.id)", "count")
      .where("n.user_id = :userId", { userId: currentUser.id })
      .andWhere("n.is_read = false")
      .groupBy("n.type")
      .getRawMany<{ type: string; count: string }>();

    const byType: Record<string, number> = {};
    for (const row of rawByType) {
      byType[row.type] = parseInt(row.count, 10);
    }

    return { total, byType };
  }

  async createNotification(params: {
    userIds?: string[];
    role?: UserRole;
    type: NotificationType;
    title: string;
    body?: string;
    entityType?: string;
    entityId?: string;
  }) {
    let userIds: string[] = params.userIds ?? [];

    if (!userIds.length && params.role) {
      const users = await userRepo().find({
        where: { role: params.role, is_active: true },
        select: ["id"],
      });
      userIds = users.map((u) => u.id);
    }

    const notifications: Notification[] = [];
    for (const userId of userIds) {
      const notif = new Notification();
      notif.user_id = userId;
      notif.type = params.type;
      notif.title = params.title;
      notif.body = params.body ?? null;
      notif.entity_type = params.entityType ?? null;
      notif.entity_id = params.entityId ?? null;
      notif.is_read = false;
      notifications.push(notif);
    }

    if (notifications.length > 0) {
      return notificationRepo().save(notifications);
    }

    return [];
  }
}

export const notificationService = new NotificationService();
