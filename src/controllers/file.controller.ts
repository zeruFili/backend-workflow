import { Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import {
  getFilePathsFromRequest,
  getUploadsRoot,
  getFullUrl,
} from "../utils/upload.utils";

export class FileController {
  async upload(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const subfolder = (req.query.subfolder as string) || "general";
      const safeSubfolder = subfolder.replace(/[^a-zA-Z0-9_\-]/g, "_");

      const filePaths = getFilePathsFromRequest(req, safeSubfolder);

      if (filePaths.length === 0) {
        res.status(400).json({ success: false, message: "No files provided" });
        return;
      }

      const files = (req.files as Express.Multer.File[]).map((file, i) => ({
        file_name: file.originalname,
        stored_file_name: file.filename,
        file_path: filePaths[i],
        url: getFullUrl(filePaths[i], req),
        size: file.size,
        mimetype: file.mimetype,
      }));

      res.status(201).json({
        success: true,
        data: files,
        message: `${files.length} file(s) uploaded successfully`,
      });
    } catch (error) {
      next(error);
    }
  }

  async download(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const subfolder = req.params.subfolder as string;
      const filename = req.params.filename as string;

      if (!subfolder || !filename) {
        throw new AppError(400, "Subfolder and filename are required");
      }

      const safeSubfolder = subfolder.replace(/[^a-zA-Z0-9_\-]/g, "_");
      const safeFilename = path.basename(filename);
      const filePath = path.join(getUploadsRoot(), safeSubfolder, safeFilename);

      const normalizedPath = path.resolve(filePath);
      const uploadsRoot = path.resolve(getUploadsRoot());

      if (!normalizedPath.startsWith(uploadsRoot)) {
        throw new AppError(403, "Access denied");
      }

      if (!fs.existsSync(normalizedPath)) {
        throw new AppError(404, "File not found");
      }

      res.download(normalizedPath, safeFilename);
    } catch (error) {
      next(error);
    }
  }

  async getFileInfo(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const subfolder = req.params.subfolder as string;
      const filename = req.params.filename as string;

      if (!subfolder || !filename) {
        throw new AppError(400, "Subfolder and filename are required");
      }

      const safeSubfolder = subfolder.replace(/[^a-zA-Z0-9_\-]/g, "_");
      const safeFilename = path.basename(filename);
      const filePath = path.join(getUploadsRoot(), safeSubfolder, safeFilename);

      const normalizedPath = path.resolve(filePath);
      const uploadsRoot = path.resolve(getUploadsRoot());

      if (!normalizedPath.startsWith(uploadsRoot)) {
        throw new AppError(403, "Access denied");
      }

      if (!fs.existsSync(normalizedPath)) {
        throw new AppError(404, "File not found");
      }

      const stats = fs.statSync(normalizedPath);
      const ext = path.extname(safeFilename).toLowerCase();

      res.status(200).json({
        success: true,
        data: {
          file_name: filename,
          subfolder: safeSubfolder,
          size: stats.size,
          extension: ext,
          created_at: stats.birthtime,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const fileController = new FileController();
