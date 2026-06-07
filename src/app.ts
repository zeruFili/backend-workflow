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
import paidCustomerRoutes from "./routes/paid-customer.routes";
import qsRoutes from "./routes/qs.routes";
import notificationRoutes from "./routes/notification.routes";
import dataCollectorRoutes from "./routes/data-collector.routes";
import designerRoutes from "./routes/designer.routes";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/paid-customers", paidCustomerRoutes);
app.use("/api/v1", qsRoutes);
app.use("/api/v1", notificationRoutes);
app.use("/api/v1", dataCollectorRoutes);
app.use("/api/v1", designerRoutes);

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
