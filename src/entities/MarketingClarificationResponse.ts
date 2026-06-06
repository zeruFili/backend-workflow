import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { PaidCustomer } from "./PaidCustomer";

@Entity("marketing_clarification_responses")
export class MarketingClarificationResponse {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  paid_customer_id: string;

  @ManyToOne(() => PaidCustomer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "paid_customer_id" })
  paid_customer: PaidCustomer;

  @Column({ type: "text" })
  description: string;

  @Index()
  @Column({ type: "uuid" })
  responded_by: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "responded_by" })
  responder: User;

  @Column({ type: "varchar", length: 255 })
  responded_by_name: string;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  responded_at: Date;
}
