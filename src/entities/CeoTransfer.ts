import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from "typeorm";
import { User } from "./User";

@Entity("ceo_transfer")
export class CeoTransfer {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  @Column({ type: "uuid" })
  finance_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "finance_user_id" })
  finance_user: User;

  @Column({ type: "uuid" })
  ceo_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "ceo_user_id" })
  ceo_user: User;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "numeric", precision: 15, scale: 2 })
  amount: number;

  @Column({ type: "text", array: true, nullable: true })
  attachment_urls: string[];

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @Column({ type: "timestamptz", nullable: true })
  updated_at: Date;
}
