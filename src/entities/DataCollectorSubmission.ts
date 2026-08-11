import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { DataCollectorTask } from "./DataCollectorTask";

@Entity("data_collector_submission")
@Index("idx_data_collector_submission_task_id", ["data_collector_task_id"])
export class DataCollectorSubmission {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  @Column({ type: "uuid" })
  data_collector_task_id: string;

  @ManyToOne(() => DataCollectorTask)
  @JoinColumn({ name: "data_collector_task_id" })
  data_collector_task: DataCollectorTask;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "text", array: true, nullable: true })
  attachment_urls: string[];

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @Column({ type: "timestamptz", nullable: true })
  updated_at: Date;
}
