import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { QuantitySurveyorTask } from "./QuantitySurveyorTask";

@Entity("quantity_surveyor_submission")
@Index("idx_qs_submission_task_id", ["quantity_surveyor_task_id"])
export class QuantitySurveyorSubmission {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  quantity_surveyor_task_id: string;

  @ManyToOne(() => QuantitySurveyorTask)
  @JoinColumn({ name: "quantity_surveyor_task_id" })
  quantity_surveyor_task: QuantitySurveyorTask;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "text", array: true, nullable: true })
  attachment_urls: string[];

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  updated_at: Date;
}
