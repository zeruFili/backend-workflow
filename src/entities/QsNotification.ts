import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { QsReviewTask } from "./QsReviewTask";

@Entity("qs_notifications")
export class QsNotification {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 30 })
  type: string;

  @Index()
  @Column({ type: "uuid" })
  task_id: string;

  @ManyToOne(() => QsReviewTask)
  @JoinColumn({ name: "task_id" })
  task: QsReviewTask;

  @Column({ type: "uuid", nullable: true })
  evaluation_id: string;

  @Column({ type: "varchar", length: 50 })
  job_id: string;

  @Column({ type: "varchar", length: 500 })
  message: string;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "text", nullable: true })
  telegram_screenshot: string;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  created_at: Date;

  @Column({ type: "jsonb", default: [] })
  target_roles: string[];

  @Column({ type: "jsonb", default: [] })
  read_by_roles: string[];
}
