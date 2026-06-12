import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { ReviewOutcome } from "../enums/review-outcome.enum";
import { TaskState } from "../enums/task-state.enum";

@Entity("marketing_task")
@Index("idx_marketing_task_user_status", ["marketing_user_id", "status"])
export class MarketingTask {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  marketing_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "marketing_user_id" })
  marketing_user: User;

  @Column({ type: "varchar", length: 500 })
  title: string;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "enum", enum: ReviewOutcome, nullable: true, default: ReviewOutcome.PENDING })
  status: ReviewOutcome;

  @Column({ type: "enum", enum: TaskState, default: TaskState.ACTIVE })
  task_state: TaskState;

  @Column({ type: "date", nullable: true })
  due_date: string;

  @Column({ type: "text", array: true, nullable: true })
  attachment_urls: string[];

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  updated_at: Date;

  @Column({ type: "uuid", nullable: true })
  updated_by: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "updated_by" })
  updated_by_user: User;

  @Column({ type: "varchar", length: 500 })
  customer_name: string;

  @Column({ type: "varchar", length: 20 })
  customer_phone: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  customer_email: string;

  @Column({ type: "varchar", length: 2000 })
  customer_address: string;

  @Column({ type: "varchar", length: 255 })
  category: string;

  @Column({ type: "text" })
  service_description: string;

  @Column({ type: "date", nullable: true })
  preferred_start_date: string;

  @Column({ type: "numeric", precision: 15, scale: 2, nullable: true })
  budget: number;

  @Column({ type: "text", nullable: true })
  notes: string;
}
