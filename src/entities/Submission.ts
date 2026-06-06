import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { Task } from "./Task";

@Entity("submissions")
export class Submission {
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
  submitted_by: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "submitted_by" })
  submitter: User;

  @Column({ type: "varchar", length: 255, nullable: true })
  submitted_by_name: string | null;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column({ type: "jsonb", default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  submitted_at: Date;
}
