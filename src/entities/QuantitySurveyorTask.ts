import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { ReviewOutcome } from "../enums/review-outcome.enum";
import { TaskState } from "../enums/task-state.enum";

@Entity("quantity_surveyor_task")
@Index("idx_quantity_surveyor_task_assigned_to", ["assigned_to_user_id"])
export class QuantitySurveyorTask {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  assigned_to_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "assigned_to_user_id" })
  assigned_to_user: User;

  @Column({ type: "uuid" })
  assigned_by_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "assigned_by_user_id" })
  assigned_by_user: User;

  @Column({ type: "varchar", length: 500 })
  title: string;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "enum", enum: ReviewOutcome, nullable: true, default: ReviewOutcome.PENDING })
  status: ReviewOutcome;

  @Column({ type: "enum", enum: TaskState })
  task_state: TaskState;

  @Column({ type: "date" })
  due_date: string;

  @Column({ type: "text", array: true })
  attachment_urls: string[];

  @Column({ type: "uuid", nullable: true })
  updated_by: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "updated_by" })
  updated_by_user: User;

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "NOW()", nullable: true })
  updated_at: Date;
}
