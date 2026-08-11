import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from "typeorm";
import { DesignerTask } from "./DesignerTask";
import { User } from "./User";

@Entity("designer_task_removal")
export class DesignerTaskRemoval {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  @Column({ type: "uuid" })
  designer_task_id: string;

  @ManyToOne(() => DesignerTask)
  @JoinColumn({ name: "designer_task_id" })
  designer_task: DesignerTask;

  @Column({ type: "uuid" })
  removed_by_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "removed_by_user_id" })
  removed_by_user: User;

  @Column({ type: "uuid" })
  removed_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "removed_user_id" })
  removed_user: User;

  @Column({ type: "text" })
  reason: string;

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @Column({ type: "timestamptz", nullable: true })
  updated_at: Date;
}
