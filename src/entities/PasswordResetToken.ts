import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";

@Entity("password_reset_tokens")
export class PasswordResetToken {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  user_id: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255 })
  token_hash: string;

  @Column({ type: "timestamptz" })
  expires_at: Date;

  @Column({ type: "boolean", default: false })
  used: boolean;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  created_at: Date;
}
