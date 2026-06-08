import { Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "10485760", 10);

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
]);

const ALLOWED_DOC_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "application/zip",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
]);

export const ALLOWED_MIME_TYPES = new Set([
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_DOC_TYPES,
]);

export interface UploadMiddlewareOptions {
  fieldName?: string;
  maxCount?: number;
  subfolder: string;
  allowedTypes?: Set<string>;
  fileSizeLimit?: number;
}

function ensureUploadDir(subfolder: string): string {
  const dir = path.resolve(process.cwd(), UPLOAD_DIR, subfolder);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function generateUniqueFileName(originalName: string): string {
  const ext = path.extname(originalName);
  const baseName = path
    .basename(originalName, ext)
    .replace(/[^a-zA-Z0-9_\-.]/g, "_")
    .slice(0, 100);
  const uniqueSuffix = new Date()
    .toISOString()
    .replace(/[-:.]/g, "")
    .slice(0, -5);
  return `${baseName}-${uniqueSuffix}${ext}`;
}

export function createUploadFileMiddleware(options: UploadMiddlewareOptions) {
  const {
    fieldName = "attachmentFiles",
    maxCount = 10,
    subfolder,
    allowedTypes = ALLOWED_MIME_TYPES,
    fileSizeLimit = MAX_FILE_SIZE,
  } = options;

  const uploadDir = ensureUploadDir(subfolder);

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const uniqueFileName = generateUniqueFileName(file.originalname);
      cb(null, uniqueFileName);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: fileSizeLimit },
    fileFilter: (_req, file, cb) => {
      if (allowedTypes.has(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type '${file.mimetype}' is not allowed`));
      }
    },
  }).array(fieldName, maxCount);

  return (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        let errorMessage: string;
        if (err.code === "LIMIT_FILE_SIZE") {
          errorMessage = `File size exceeds the limit of ${Math.round(fileSizeLimit / 1048576)}MB`;
        } else if (err.code === "LIMIT_FILE_COUNT") {
          errorMessage = `Too many files. Maximum is ${maxCount}`;
        } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
          errorMessage = `Unexpected file field. Use "${fieldName}"`;
        } else {
          errorMessage = err.message;
        }
        return res.status(400).json({
          success: false,
          message: errorMessage,
        });
      } else if (err) {
        return res.status(400).json({
          success: false,
          message: err.message,
        });
      }
      next();
    });
  };
}

export function getFilePathsFromRequest(
  req: Request,
  subfolder: string
): string[] {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) return [];

  return files.map(
    (file) => `/${UPLOAD_DIR}/${subfolder}/${file.filename}`
  );
}

export function getUploadsRoot(): string {
  return path.resolve(process.cwd(), UPLOAD_DIR);
}

export function deleteFile(relativePath: string): boolean {
  try {
    const cleanPath = relativePath.replace(/^\/+/, "");
    const fullPath = path.resolve(process.cwd(), cleanPath);
    const uploadsRoot = getUploadsRoot();

    if (!fullPath.startsWith(uploadsRoot)) {
      return false;
    }

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    return true;
  } catch {
    return false;
  }
}

export function deleteFiles(relativePaths: string[]): void {
  for (const p of relativePaths) {
    deleteFile(p);
  }
}

export function getFullUrl(
  filePath: string,
  req?: { protocol: string; get: (h: string) => string | undefined }
): string {
  if (!filePath.startsWith("/")) {
    filePath = "/" + filePath;
  }
  if (req) {
    const host = req.get("host") || "localhost:3001";
    return `${req.protocol}://${host}${filePath}`;
  }
  return filePath;
}
