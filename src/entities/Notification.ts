import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { NotificationType } from "../enums/notification-type.enum";

@Entity("notifications")
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  user_id: string;

  @ManyToOne(() => User, (user) => user.notifications, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Index()
  @Column({ type: "enum", enum: NotificationType })
  type: NotificationType;

  @Column({ type: "varchar", length: 500 })
  title: string;

  @Column({ type: "text", nullable: true })
  body: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  entity_type: string | null;

  @Column({ type: "uuid", nullable: true })
  entity_id: string | null;

  @Index()
  @Column({ type: "boolean", default: false })
  is_read: boolean;

  @Column({ type: "timestamptz", nullable: true })
  read_at: Date | null;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  created_at: Date;
}
