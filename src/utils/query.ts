import { Request } from "express";

export function getQueryParam(req: Request, key: string, defaultValue?: string): string | undefined {
  const val = req.query[key] as string | string[] | undefined;
  if (Array.isArray(val)) return val[0];
  if (typeof val === "string") return val;
  return defaultValue;
}

export function getQueryParamAsNumber(req: Request, key: string, defaultValue?: number): number | undefined {
  const val = getQueryParam(req, key);
  if (val === undefined) return defaultValue;
  const num = Number(val);
  return isNaN(num) ? defaultValue : num;
}
