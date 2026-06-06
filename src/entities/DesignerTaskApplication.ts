import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { Task } from "./Task";
import { DesignerTaskApplicationStatus } from "../enums/designer-task-application-status.enum";

@Entity("designer_task_applications")
export class DesignerTaskApplication {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  task_id: string;

  @ManyToOne(() => Task, { onDelete: "CASCADE" })
  @JoinColumn({ name: "task_id" })
  task: Task;

  @Index()
  @Column({ type: "uuid" })
  applicant_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "applicant_id" })
  applicant: User;

  @Column({ type: "varchar", length: 255 })
  applicant_name: string;

  @Column({ type: "text", nullable: true })
  message: string | null;

  @Index()
  @Column({ type: "enum", enum: DesignerTaskApplicationStatus, default: DesignerTaskApplicationStatus.PENDING })
  status: DesignerTaskApplicationStatus;

  @Column({ type: "uuid", nullable: true })
  reviewed_by: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "reviewed_by" })
  reviewer: User | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  reviewed_by_name: string | null;

  @Column({ type: "timestamptz", nullable: true })
  reviewed_at: Date | null;

  @Column({ type: "text", nullable: true })
  review_note: string | null;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  applied_at: Date;
}
