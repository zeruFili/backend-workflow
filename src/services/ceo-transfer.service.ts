import { AppDataSource } from "../config/data-source";
import { CeoTransfer } from "../entities/CeoTransfer";
import { Notification } from "../entities/Notification";
import { AppError } from "../middlewares/error.middleware";
import { pickSafeUserFields } from "../utils/response.utils";
import { safeUserColumns } from "../utils/user-columns.utils";
import { syncAttachments } from "../utils/upload.utils";
import { getUserDetails } from "../utils/user-details.util";

interface CreateTransferParams {
  finance_user_id: string;
  ceo_user_id: string;
  description: string;
  amount: number;
  attachment_urls?: string[];
}

interface UpdateTransferParams {
  finance_user_id?: string;
  ceo_user_id?: string;
  description?: string;
  amount?: number;
  attachment_urls?: string[];
}

export class CeoTransferService {
  private repo = AppDataSource.getRepository(CeoTransfer);
  private notificationRepo = AppDataSource.getRepository(Notification);

  async findAll(page: number = 1, limit: number = 20, user?: { id: string; role: string }) {
    const p = Math.max(1, page);
    const l = Math.min(100, Math.max(1, limit));

    const qb = this.repo.createQueryBuilder("ct")
      .leftJoin("ct.finance_user", "finance_user")
      .leftJoin("ct.ceo_user", "ceo_user")
      .addSelect(safeUserColumns("finance_user"))
      .addSelect(safeUserColumns("ceo_user"))
      .orderBy("ct.created_at", "DESC")
      .skip((p - 1) * l)
      .take(l);

    if (user) {
      if (user.role === 'finance_officer') {
        qb.andWhere("ct.finance_user_id = :userId", { userId: user.id });
      }
      // CEO sees all — no filter
    }

    const [data, total] = await qb.getManyAndCount();

    const sanitized = data.map((t) => ({
      ...t,
      finance_user: pickSafeUserFields(t.finance_user),
      ceo_user: pickSafeUserFields(t.ceo_user),
    }));

    return {
      data: sanitized,
      meta: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
      },
    };
  }

  async findById(id: string) {
    const transfer = await this.repo
      .createQueryBuilder("ct")
      .leftJoin("ct.finance_user", "finance_user")
      .leftJoin("ct.ceo_user", "ceo_user")
      .addSelect(safeUserColumns("finance_user"))
      .addSelect(safeUserColumns("ceo_user"))
      .where("ct.id = :id", { id })
      .getOne();
    if (!transfer) throw new AppError(404, "CEO transfer not found");
    return {
      ...transfer,
      finance_user: pickSafeUserFields(transfer.finance_user),
      ceo_user: pickSafeUserFields(transfer.ceo_user),
    };
  }

  async create(params: CreateTransferParams, userId: string) {
    const financeUser = await getUserDetails(params.finance_user_id);
    if (!financeUser) throw new AppError(404, "Finance user not found");

    const ceoUser = await getUserDetails(params.ceo_user_id);
    if (!ceoUser) throw new AppError(404, "CEO user not found");

    const transfer = new CeoTransfer();
    transfer.finance_user_id = params.finance_user_id;
    transfer.ceo_user_id = params.ceo_user_id;
    transfer.description = params.description;
    transfer.amount = params.amount;
    transfer.attachment_urls = (params.attachment_urls ?? null) as any;

    const saved = await this.repo.save(transfer);
    return saved;
  }

  async update(id: string, params: UpdateTransferParams, userId: string) {
    const transfer = await this.repo.findOneBy({ id });
    if (!transfer) throw new AppError(404, "CEO transfer not found");

    if (transfer.finance_user_id !== userId) {
      throw new AppError(403, "You can only edit transfers that you created.");
    }

    if (params.finance_user_id !== undefined) transfer.finance_user_id = params.finance_user_id;
    if (params.ceo_user_id !== undefined) transfer.ceo_user_id = params.ceo_user_id;
    if (params.description !== undefined) transfer.description = params.description;
    if (params.amount !== undefined) transfer.amount = params.amount;
    if (params.attachment_urls !== undefined) {
      transfer.attachment_urls = syncAttachments(transfer.attachment_urls, params.attachment_urls) as any;
    }

    transfer.updated_at = new Date();

    return this.repo.save(transfer);
  }

  async delete(id: string, userId: string) {
    const transfer = await this.repo.findOneBy({ id });
    if (!transfer) throw new AppError(404, "CEO transfer not found");

    if (transfer.finance_user_id !== userId) {
      throw new AppError(403, "You can only delete transfers that you created.");
    }

    await this.notificationRepo.delete({ parent_id: id });
    await this.repo.remove(transfer);
    return { id };
  }
}

export const ceoTransferService = new CeoTransferService();
