import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, OneToMany, Index,
} from "typeorm";
import { User } from "./User";
import { Project } from "./Project";
import { TaskStatus } from "../enums/task-status.enum";
import { ApprovalStatus } from "../enums/approval-status.enum";

@Entity("tasks")
export class Task {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid", nullable: true })
  project_id: string | null;

  @ManyToOne(() => Project, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "project_id" })
  project: Project | null;

  @Column({ type: "varchar", length: 500 })
  title: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "text", nullable: true })
  instruction: string | null;

  @Column({ type: "varchar", length: 50, default: "generic" })
  task_type: string;

  @Index()
  @Column({ type: "uuid", nullable: true })
  assigned_to: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "assigned_to" })
  assignee: User | null;

  @Index()
  @Column({ type: "uuid" })
  assigned_by: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "assigned_by" })
  assigner: User;

  @Column({ type: "timestamptz", nullable: true })
  assigned_at: Date | null;

  @Index()
  @Column({ type: "enum", enum: TaskStatus, default: TaskStatus.PENDING })
  status: TaskStatus;

  @Column({ type: "timestamptz", nullable: true })
  deadline: Date | null;

  @Index()
  @Column({ type: "enum", enum: ApprovalStatus, default: ApprovalStatus.PENDING })
  approval_status: ApprovalStatus;

  @Column({ type: "text", nullable: true })
  approval_feedback: string | null;

  @Column({ type: "uuid", nullable: true })
  approved_by: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "approved_by" })
  approver: User | null;

  @Column({ type: "timestamptz", nullable: true })
  approved_at: Date | null;

  @Column({ type: "text", nullable: true })
  telegram_screenshot: string | null;

  @Column({ type: "boolean", default: false })
  is_public: boolean;

  @Column({ type: "integer", default: 0 })
  story_points: number;

  @Column({ type: "boolean", default: false })
  is_paused: boolean;

  @Column({ type: "text", nullable: true })
  pause_reason: string | null;

  @Column({ type: "timestamptz", nullable: true })
  pause_resume_date: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  paused_at: Date | null;

  @Column({ type: "uuid", nullable: true })
  paused_by: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "paused_by" })
  pauser: User | null;

  @Column({ type: "timestamptz", nullable: true })
  resumed_at: Date | null;

  @Column({ type: "uuid", nullable: true })
  resumed_by: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "resumed_by" })
  resumer: User | null;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "now()" })
  updated_at: Date;
}
