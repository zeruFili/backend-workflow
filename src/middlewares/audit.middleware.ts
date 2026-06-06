import { Request, Response, NextFunction } from "express";
import { AppDataSource } from "../config/data-source";
import { AuditLog } from "../entities/AuditLog";
import { UserRole } from "../enums/user-role.enum";
import { AuthRequest } from "./auth.middleware";

export function auditLog(action: string, entityType: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const originalJson = res.json.bind(res);

    res.json = function (body: any) {
      if (res.statusCode >= 200 && res.statusCode < 400 && req.user) {
        const auditRepo = AppDataSource.getRepository(AuditLog);

        let entityId: string | undefined;
        if (body?.data?.id) entityId = body.data.id;
        else if (req.params.id) entityId = req.params.id as string;

        let changes: Record<string, any> | undefined;
        if (req.method !== "GET" && req.method !== "DELETE") {
          changes = { body: req.body };
        }

        auditRepo
          .save({
            user_id: req.user.id,
            user_name: req.user.name,
            user_role: req.user.role,
            action,
            entity_type: entityType,
            entity_id: entityId || undefined,
            changes,
            ip_address: req.ip || req.socket.remoteAddress,
            user_agent: req.headers["user-agent"] || "",
          })
          .catch((err) => console.error("Audit log error:", err));
      }
      return originalJson(body);
    };

    next();
  };
}
