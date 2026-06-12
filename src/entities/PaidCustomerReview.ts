import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { PaidCustomer } from "./PaidCustomer";
import { MarketingSubmission } from "./MarketingSubmission";
import { ReviewOutcome } from "../enums/review-outcome.enum";

@Entity("paid_customer_review")
@Index("idx_pcr_paid_customer", ["paid_customer_id"])
@Index("idx_pcr_submission", ["marketing_submission_id"])
export class PaidCustomerReview {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid", nullable: true })
  paid_customer_id: string;

  @ManyToOne(() => PaidCustomer)
  @JoinColumn({ name: "paid_customer_id" })
  paid_customer: PaidCustomer;

  @Column({ type: "uuid", nullable: true })
  marketing_submission_id: string;

  @ManyToOne(() => MarketingSubmission)
  @JoinColumn({ name: "marketing_submission_id" })
  marketing_submission: MarketingSubmission;

  @Column({ type: "uuid" })
  reviewer_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "reviewer_user_id" })
  reviewer: User;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "enum", enum: ReviewOutcome })
  review_outcome: ReviewOutcome;

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @Column({ type: "timestamptz", nullable: true })
  updated_at: Date;
}
