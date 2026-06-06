import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { Task } from "./Task";
import { Submission } from "./Submission";
import { DesignerPhase } from "../enums/designer-phase.enum";
import { ReviewAction } from "../enums/review-action.enum";

@Entity("designer_phase_history")
export class DesignerPhaseHistory {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  task_id: string;

  @ManyToOne(() => Task, { onDelete: "CASCADE" })
  @JoinColumn({ name: "task_id" })
  task: Task;

  @Column({ type: "enum", enum: DesignerPhase })
  phase: DesignerPhase;

  @Index()
  @Column({ type: "enum", enum: ReviewAction })
  action: ReviewAction;

  @Index()
  @Column({ type: "uuid" })
  reviewer_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "reviewer_id" })
  reviewer: User;

  @Column({ type: "varchar", length: 255 })
  reviewer_name: string;

  @Column({ type: "text", nullable: true })
  message: string | null;

  @Column({ type: "text", nullable: true })
  designer_note: string | null;

  @Column({ type: "text", nullable: true })
  designer_screenshot: string | null;

  @Column({ type: "uuid", nullable: true })
  designer_submission_id: string | null;

  @ManyToOne(() => Submission, { nullable: true })
  @JoinColumn({ name: "designer_submission_id" })
  designer_submission: Submission | null;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  reviewed_at: Date;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  created_at: Date;
}
