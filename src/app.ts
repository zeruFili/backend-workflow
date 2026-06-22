import "reflect-metadata";
import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

import { DataSource } from "typeorm";
import { AppDataSource } from "./config/data-source";
import { errorHandler, notFound } from "./middlewares/error.middleware";

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import marketingRoutes from "./routes/marketing.routes";
import qsRoutes from "./routes/qs.routes";
import notificationRoutes from "./routes/notification.routes";
import dataCollectorRoutes from "./routes/data-collector.routes";
import designerRoutes from "./routes/designer.routes";
import ceoTransferRoutes from "./routes/ceo-transfer.routes";
import fileRoutes from "./routes/file.routes";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1", marketingRoutes);
app.use("/api/v1", ceoTransferRoutes);
app.use("/api/v1", qsRoutes);
app.use("/api/v1", notificationRoutes);
app.use("/api/v1", dataCollectorRoutes);
app.use("/api/v1", designerRoutes);
app.use("/api/v1/files", fileRoutes);

app.use(notFound);
app.use(errorHandler);

async function cleanupOldMarketingTables() {
  const cleanupDs = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_NAME || "wase_workflow",
    synchronize: false,
    logging: false,
  });

  try {
    await cleanupDs.initialize();
    await cleanupDs.query(`
      DELETE FROM notification
      WHERE parent_type IN ('paid_customer_submission', 'customer')
         OR resource_type IN ('payment_submitted', 'clarification_requested', 'clarification_response')
    `);
    await cleanupDs.query(`DROP TABLE IF EXISTS paid_customer_review CASCADE`);
    await cleanupDs.query(`DROP TABLE IF EXISTS paid_customer CASCADE`);
    await cleanupDs.query(`DROP TABLE IF EXISTS customer CASCADE`);
    console.log("Old marketing tables cleaned up");
  } catch (e: any) {
    console.log("Marketing cleanup (non-fatal):", e.message);
  } finally {
    await cleanupDs.destroy();
  }
}

cleanupOldMarketingTables()
  .then(() => AppDataSource.initialize())
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
