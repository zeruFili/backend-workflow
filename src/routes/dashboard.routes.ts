import { Router } from "express";
import { dashboardController } from "../controllers/dashboard.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/dashboard", (req, res) => dashboardController.getOverview(req, res));
router.get("/dashboard/designer-performance", (req, res) => dashboardController.getDesignerPerformance(req, res));
router.get("/dashboard/site-engineer", (req, res) => dashboardController.getSiteEngineerDashboard(req, res));

export default router;
