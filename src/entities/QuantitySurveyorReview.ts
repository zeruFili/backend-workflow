import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { QuantitySurveyorSubmission } from "./QuantitySurveyorSubmission";
import { User } from "./User";
import { ReviewOutcome } from "../enums/review-outcome.enum";

@Entity("quantity_surveyor_review")
@Index("idx_quantity_surveyor_review_submission_id", ["quantity_surveyor_submission_id"])
export class QuantitySurveyorReview {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  @Column({ type: "uuid" })
  quantity_surveyor_submission_id: string;

  @ManyToOne(() => QuantitySurveyorSubmission)
  @JoinColumn({ name: "quantity_surveyor_submission_id" })
  quantity_surveyor_submission: QuantitySurveyorSubmission;

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
