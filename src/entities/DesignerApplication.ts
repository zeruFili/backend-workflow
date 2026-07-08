import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { DesignerTask } from "./DesignerTask";
import { User } from "./User";

@Entity("designer_application")
@Index("idx_designer_application_task_applicant", ["designer_task_id", "applicant_user_id"])
export class DesignerApplication {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  designer_task_id: string;

  @ManyToOne(() => DesignerTask)
  @JoinColumn({ name: "designer_task_id" })
  designer_task: DesignerTask;

  @Column({ type: "uuid" })
  applicant_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "applicant_user_id" })
  applicant_user: User;

  @Column({ type: "text", nullable: true })
  cover_note: string;

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @Column({ type: "timestamptz", nullable: true })
  updated_at: Date;

  @Column({ type: "boolean", default: false })
  is_withdrawn: boolean;
}
