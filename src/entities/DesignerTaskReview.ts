import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index, Check,
} from "typeorm";
import { DesignerTask } from "./DesignerTask";
import { User } from "./User";

@Entity("designer_task_review")
@Index("idx_designer_task_review_task_id", ["designer_task_id"])
@Check("chk_creativity", "creativity >= 1 AND creativity <= 5")
@Check("chk_timeliness", "timeliness >= 1 AND timeliness <= 5")
@Check("chk_rendering_quality", "rendering_quality >= 1 AND rendering_quality <= 5")
@Check("chk_client_understanding", "client_understanding >= 1 AND client_understanding <= 5")
export class DesignerTaskReview {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  designer_task_id: string;

  @ManyToOne(() => DesignerTask)
  @JoinColumn({ name: "designer_task_id" })
  designer_task: DesignerTask;

  @Column({ type: "uuid" })
  reviewer_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "reviewer_user_id" })
  reviewer_user: User;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ type: "smallint" })
  creativity: number;

  @Column({ type: "smallint" })
  timeliness: number;

  @Column({ type: "smallint" })
  rendering_quality: number;

  @Column({ type: "smallint" })
  client_understanding: number;


  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  updated_at: Date;
}
