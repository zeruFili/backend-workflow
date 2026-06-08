import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { createUploadFileMiddleware } from "../utils/upload.utils";
import { fileController } from "../controllers/file.controller";

const router = Router();

const uploadMiddleware = createUploadFileMiddleware({
  fieldName: "files",
  maxCount: 10,
  subfolder: "general",
});

router.post(
  "/upload",
  authenticate,
  uploadMiddleware,
  (req, res, next) => fileController.upload(req, res, next)
);

router.get(
  "/download/:subfolder/:filename",
  (req, res, next) => fileController.download(req, res, next)
);

router.get(
  "/info/:subfolder/:filename",
  authenticate,
  (req, res, next) => fileController.getFileInfo(req, res, next)
);

export default router;
