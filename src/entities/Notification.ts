import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { ResourceType } from "../enums/resource-type.enum";
import { ParentType } from "../enums/parent-type.enum";

@Entity("notification")
@Index("idx_notif_user_parent", ["user_id", "parent_id", "viewed"])
@Index("idx_notif_user_resource", ["user_id", "resource_id", "viewed"]) // i can use this when i try to update as viewed

// it am thinking to remove this indexes because they are not that much useful

@Index("idx_notif_user_resource_type", ["user_id", "resource_type", "viewed"])
@Index("idx_notif_user_parent_type", ["user_id", "parent_type", "viewed"])
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ type: "uuid" })
  from_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "from_user_id" })
  from_user: User;

  @Column({ type: "uuid" })
  resource_id: string;

  @Column({ type: "varchar", length: 50 })
  resource_type: ResourceType;

  @Column({ type: "uuid" })
  parent_id: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  parent_type: ParentType;

  @Column({ type: "varchar", length: 255 })
  type: string;

  @Column({ type: "boolean", default: false })
  viewed: boolean;

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "NOW()", nullable: true })
  updated_at: Date;
}
