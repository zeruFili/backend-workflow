import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { DesignerTask } from "./DesignerTask";
import { DesignerStage } from "../enums/designer-stage.enum";

@Entity("designer_submission")
@Index("idx_designer_submission_task_id", ["designer_task_id"])
export class DesignerSubmission {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  designer_task_id: string;

  @ManyToOne(() => DesignerTask)
  @JoinColumn({ name: "designer_task_id" })
  designer_task: DesignerTask;

  @Column({ type: "enum", enum: DesignerStage, nullable: true })
  stage: DesignerStage;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "text", array: true, nullable: true })
  attachment_urls: string[];

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "NOW()", nullable: true })
  updated_at: Date;
}
