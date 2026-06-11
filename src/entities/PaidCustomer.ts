import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { Customer } from "./Customer";
import { ReviewOutcome } from "../enums/review-outcome.enum";

@Entity("paid_customer")
@Index("idx_paid_customer_customer_status", ["customer_id", "status"])
export class PaidCustomer {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  customer_id: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: "customer_id" })
  customer: Customer;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "enum", enum: ReviewOutcome, default: ReviewOutcome.PENDING })
  status: ReviewOutcome;

  @Column({ type: "text", array: true, nullable: true })
  attachment_urls: string[];

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @Column({ type: "timestamptz", nullable: true })
  updated_at: Date;
}
