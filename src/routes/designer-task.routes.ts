import { Router } from "express";
import multer from "multer";
import path from "path";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { designerTaskController } from "../controllers/designer-task.controller";

const router = Router();

const uploadDir = path.resolve(process.cwd(), "uploads");

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadDir);
  },
  filename(_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `screenshot-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (jpeg, jpg, png, gif, webp) are allowed"));
    }
  },
});

const uploadSingle = upload.single("screenshot");

function wrapUpload(req: any, res: any, next: any): void {
  uploadSingle(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      res.status(400).json({ success: false, message: err.message || "File upload error" });
      return;
    }
    next();
  });
}

router.get("/", authenticate, (req, res, next) => designerTaskController.findAll(req, res, next));
router.post("/", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerTaskController.create(req, res, next));
router.get("/:id", authenticate, (req, res, next) => designerTaskController.findById(req, res, next));
router.patch("/:id", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerTaskController.update(req, res, next));
router.delete("/:id", authenticate, authorize(UserRole.CEO), (req, res, next) => designerTaskController.delete(req, res, next));
router.post("/:id/assign", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerTaskController.assignDesigner(req, res, next));
router.get("/:id/phases", authenticate, (req, res, next) => designerTaskController.getPhases(req, res, next));
router.post("/:id/phases/:phase/submit", authenticate, authorize(UserRole.DESIGNER), wrapUpload, (req, res, next) => designerTaskController.submitPhase(req, res, next));
router.post("/:id/phases/:phase/review", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerTaskController.reviewPhase(req, res, next));
router.patch("/:id/phases/:phase/notes", authenticate, authorize(UserRole.DESIGNER), (req, res, next) => designerTaskController.updatePhaseNotes(req, res, next));
router.patch("/:id/pause", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerTaskController.pauseTask(req, res, next));
router.patch("/:id/resume", authenticate, authorize(UserRole.CEO, UserRole.GENERAL_MANAGER), (req, res, next) => designerTaskController.resumeTask(req, res, next));

export default router;
