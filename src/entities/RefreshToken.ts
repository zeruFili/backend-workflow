import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";

@Entity("refresh_tokens")
export class RefreshToken {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  user_id: string;

  @ManyToOne(() => User, (user) => user.refresh_tokens, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255 })
  token_hash: string;

  @Column({ type: "timestamptz" })
  expires_at: Date;

  @Column({ type: "boolean", default: false })
  revoked: boolean;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  created_at: Date;
}
