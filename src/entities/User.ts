import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToMany, Index,
} from "typeorm";
import { UserRole } from "../enums/user-role.enum";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 100 })
  username: string;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  email: string;

  @Column({ type: "varchar", length: 255 })
  password_hash: string;

  @Index()
  @Column({ type: "enum", enum: UserRole })
  role: UserRole;

  @Column({ type: "boolean", default: true })
  is_active: boolean;

  @Column({ type: "text", nullable: true })
  avatar_url: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  telegram_id: string;

  @Column({ type: "boolean", default: false })
  force_password_change: boolean;

  @Column({ type: "varchar", length: 50, nullable: true })
  phone: string;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "now()" })
  updated_at: Date;

  @Column({ type: "timestamptz", nullable: true })
  last_login_at: Date;

  @OneToMany(() => require("./RefreshToken").RefreshToken, (t: any) => t.user)
  refresh_tokens: any[];

  @OneToMany(() => require("./Notification").Notification, (n: any) => n.user)
  notifications: any[];
}
