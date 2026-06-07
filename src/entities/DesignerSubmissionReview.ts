import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { DesignerSubmission } from "./DesignerSubmission";
import { User } from "./User";
import { ReviewOutcome } from "../enums/review-outcome.enum";

@Entity("designer_submission_review")
@Index("idx_designer_submission_review_submission_id", ["designer_submission_id"])
export class DesignerSubmissionReview {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  designer_submission_id: string;

  @ManyToOne(() => DesignerSubmission)
  @JoinColumn({ name: "designer_submission_id" })
  designer_submission: DesignerSubmission;

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

  @UpdateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  updated_at: Date;
}
