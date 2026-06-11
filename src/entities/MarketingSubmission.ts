import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { PaidCustomer } from "./PaidCustomer";

@Entity("marketing_submission")
@Index("idx_marketing_submission_paid_customer_created_at", ["paid_customer_id", "created_at"])
export class MarketingSubmission {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  paid_customer_id: string;

  @ManyToOne(() => PaidCustomer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "paid_customer_id" })
  paid_customer: PaidCustomer;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "text", array: true, nullable: true })
  attachment_urls: string[];

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "NOW()", nullable: true })
  updated_at: Date;
}
