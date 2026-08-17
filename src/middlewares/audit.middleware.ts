import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";

export function auditLog(action: string, entityType: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const originalJson = res.json.bind(res);

    res.json = function (body: any) {
      return originalJson(body);
    };

    next();
  };
}
