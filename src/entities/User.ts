import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  OneToMany, Index,
} from "typeorm";
import { UserRole } from "../enums/user-role.enum";

@Entity("user")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 255 })
  full_name: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255 })
  email: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone: string;

  @Index()
  @Column({ type: "enum", enum: UserRole })
  role: UserRole;

  @Column({ type: "boolean", default: true })
  is_active: boolean;

  @Column({ type: "varchar", length: 255 })
  password_hash: string;

  @Column({ type: "timestamptz", nullable: true })
  last_login_at: Date;

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @Column({ type: "timestamptz", nullable: true })
  updated_at: Date;

  @Column({ type: "uuid" })
  created_by: string;

  @OneToMany(() => require("./Notification").Notification, (n: any) => n.user)
  notifications: any[];
}
