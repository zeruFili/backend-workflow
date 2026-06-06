import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { UserRole } from "../enums/user-role.enum";

@Entity("audit_logs")
export class AuditLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid", nullable: true })
  user_id: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ type: "varchar", length: 255 })
  user_name: string;

  @Column({ type: "enum", enum: UserRole })
  user_role: UserRole;

  @Index()
  @Column({ type: "varchar", length: 100 })
  action: string;

  @Index()
  @Column({ type: "varchar", length: 50 })
  entity_type: string;

  @Column({ type: "uuid", nullable: true })
  entity_id: string;

  @Column({ type: "jsonb", nullable: true })
  changes: Record<string, any>;

  @Column({ type: "varchar", length: 45, nullable: true })
  ip_address: string;

  @Column({ type: "text", nullable: true })
  user_agent: string;

  @Index()
  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  created_at: Date;
}
