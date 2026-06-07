import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from "typeorm";
import { DesignerTask } from "./DesignerTask";

@Entity("paused_task")
export class PausedTask {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  designer_task_id: string;

  @ManyToOne(() => DesignerTask)
  @JoinColumn({ name: "designer_task_id" })
  designer_task: DesignerTask;

  @Column({ type: "text" })
  reason: string;

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  paused_at: Date;

  @Column({ type: "timestamptz", nullable: true })
  resumed_at: Date;

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  updated_at: Date;
}
