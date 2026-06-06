import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { PaidCustomer } from "./PaidCustomer";
import { ReviewAction } from "../enums/review-action.enum";

@Entity("payment_verification_history")
export class PaymentVerificationHistory {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  paid_customer_id: string;

  @ManyToOne(() => PaidCustomer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "paid_customer_id" })
  paid_customer: PaidCustomer;

  @Column({ type: "enum", enum: ReviewAction })
  action: ReviewAction;

  @Index()
  @Column({ type: "uuid" })
  reviewer_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "reviewer_id" })
  reviewer: User;

  @Column({ type: "varchar", length: 255 })
  reviewer_name: string;

  @Column({ type: "text", nullable: true })
  message: string;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  reviewed_at: Date;
}
