import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { QsEvaluation } from "./QsEvaluation";
import { ReviewAction } from "../enums/review-action.enum";

@Entity("qs_evaluation_review_history")
export class QsEvaluationReviewHistory {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  evaluation_id: string;

  @ManyToOne(() => QsEvaluation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "evaluation_id" })
  evaluation: QsEvaluation;

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
  message: string | null;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  reviewed_at: Date;
}
