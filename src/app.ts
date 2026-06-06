import "reflect-metadata";
import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

import { AppDataSource } from "./config/data-source";
import { errorHandler, notFound } from "./middlewares/error.middleware";

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import projectRoutes from "./routes/project.routes";
import taskRoutes from "./routes/task.routes";
import customerRequestRoutes from "./routes/customer-request.routes";
import paidCustomerRoutes from "./routes/paid-customer.routes";
import designerTaskRoutes from "./routes/designer-task.routes";
import designerApplicationRoutes from "./routes/designer-application.routes";
import designerRatingRoutes from "./routes/designer-rating.routes";
import qsRoutes from "./routes/qs.routes";
import notificationRoutes from "./routes/notification.routes";
import dashboardRoutes from "./routes/dashboard.routes";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/projects", projectRoutes);
app.use("/api/v1/tasks", taskRoutes);
app.use("/api/v1/customer-requests", customerRequestRoutes);
app.use("/api/v1/paid-customers", paidCustomerRoutes);
app.use("/api/v1/designer-tasks", designerTaskRoutes);
app.use("/api/v1/designer-task-applications", designerApplicationRoutes);
app.use("/api/v1/designer-ratings", designerRatingRoutes);
app.use("/api/v1", qsRoutes);
app.use("/api/v1", notificationRoutes);
app.use("/api/v1", dashboardRoutes);

app.use(notFound);
app.use(errorHandler);

AppDataSource.initialize()
  .then(() => {
    console.log("Database connected successfully");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`API available at http://localhost:${PORT}/api/v1`);
    });
  })
  .catch((error) => {
    console.error("Database connection failed:", error);
    process.exit(1);
  });

export default app;
