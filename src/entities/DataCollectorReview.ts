import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { DataCollectorSubmission } from "./DataCollectorSubmission";
import { User } from "./User";
import { ReviewOutcome } from "../enums/review-outcome.enum";

@Entity("data_collector_review")
@Index("idx_data_collector_review_submission_id", ["data_collector_submission_id"])
@Index("idx_data_collector_review_reviewer_user_id", ["reviewer_user_id"])
export class DataCollectorReview {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  data_collector_submission_id: string;

  @ManyToOne(() => DataCollectorSubmission)
  @JoinColumn({ name: "data_collector_submission_id" })
  data_collector_submission: DataCollectorSubmission;

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
