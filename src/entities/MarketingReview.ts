import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { MarketingSubmission } from "./MarketingSubmission";
import { User } from "./User";
import { ReviewOutcome } from "../enums/review-outcome.enum";

@Entity("marketing_review")
@Index("idx_marketing_review_submission_id", ["marketing_submission_id"])
@Index("idx_marketing_review_reviewer_user_id", ["reviewer_user_id"])
export class MarketingReview {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  marketing_submission_id: string;

  @ManyToOne(() => MarketingSubmission)
  @JoinColumn({ name: "marketing_submission_id" })
  marketing_submission: MarketingSubmission;

  @Column({ type: "uuid" })
  reviewer_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "reviewer_user_id" })
  reviewer_user: User;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "enum", enum: ReviewOutcome })
  review_outcome: ReviewOutcome;

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @Column({ type: "timestamptz", nullable: true })
  updated_at: Date;
}
