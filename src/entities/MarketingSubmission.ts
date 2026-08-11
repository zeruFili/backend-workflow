import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { MarketingTask } from "./MarketingTask";

@Entity("marketing_submission")
@Index("idx_marketing_submission_task_id", ["marketing_task_id"])
export class MarketingSubmission {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  @Column({ type: "uuid" })
  marketing_task_id: string;

  @ManyToOne(() => MarketingTask)
  @JoinColumn({ name: "marketing_task_id" })
  marketing_task: MarketingTask;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "text", array: true, nullable: true })
  attachment_urls: string[];

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @Column({ type: "timestamptz", nullable: true })
  updated_at: Date;
}
