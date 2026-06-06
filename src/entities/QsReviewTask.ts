import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { QsReviewStatus } from "../enums/qs-review-status.enum";

@Entity("qs_review_tasks")
export class QsReviewTask {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 50 })
  job_id: string;

  @Column({ type: "varchar", length: 50 })
  design_work_reference: string;

  @Column({ type: "text" })
  telegram_screenshot: string;

  @Column({ type: "text", nullable: true })
  telegram_screenshot_description: string | null;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "varchar", length: 255 })
  designer_name: string;

  @Column({ type: "timestamptz" })
  submission_date: Date;

  @Column({ type: "varchar", length: 50, nullable: true })
  budget_expectation_reference: string | null;

  @Column({ type: "jsonb", default: [] })
  submission_history: string[];

  @Index()
  @Column({ type: "enum", enum: QsReviewStatus, default: QsReviewStatus.PENDING_REVIEW })
  status: QsReviewStatus;

  @Index()
  @Column({ type: "uuid" })
  created_by: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "created_by" })
  creator: User;

  @Index()
  @Column({ type: "uuid" })
  assigned_to: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "assigned_to" })
  assignee: User;

  @Column({ type: "uuid", nullable: true })
  evaluation_id: string | null;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "now()" })
  updated_at: Date;
}
