import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { DataCollectorTaskStatus } from "../enums/data-collector-task-status.enum";
import { TaskState } from "../enums/task-state.enum";

@Entity("data_collector_task")
@Index("idx_data_collector_task_assigned_status", ["assigned_to_user_id", "status"])
export class DataCollectorTask {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid", nullable: true })
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

  @Column({ type: "enum", enum: DataCollectorTaskStatus, nullable: true, default: DataCollectorTaskStatus.PENDING })
  status: DataCollectorTaskStatus;

  @Column({ type: "enum", enum: TaskState, default: TaskState.ACTIVE })
  task_state: TaskState;

  @Column({ type: "date", nullable: true })
  due_date: string;

  @Column({ type: "text", array: true, nullable: true })
  attachment_urls: string[];

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @Column({ type: "timestamptz", nullable: true })
  updated_at: Date;

  @Column({ type: "uuid", nullable: true })
  updated_by: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "updated_by" })
  updated_by_user: User;
}
