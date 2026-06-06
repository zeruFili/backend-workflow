import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { QsReviewTask } from "./QsReviewTask";
import { QsRecommendation } from "../enums/qs-recommendation.enum";
import { QsDecision } from "../enums/qs-decision.enum";

@Entity("qs_evaluations")
export class QsReviewEvaluation {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  task_id: string;

  @ManyToOne(() => QsReviewTask, { onDelete: "CASCADE" })
  @JoinColumn({ name: "task_id" })
  task: QsReviewTask;

  @Column({ type: "varchar", length: 50 })
  job_id: string;

  @Index()
  @Column({ type: "uuid" })
  surveyor_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "surveyor_id" })
  surveyor: User;

  @Column({ type: "varchar", length: 255 })
  surveyor_name: string;

  @Column({ type: "numeric", precision: 15, scale: 2 })
  cost_value: number;

  @Column({ type: "varchar", length: 50, nullable: true })
  budget_expectation_reference: string | null;

  @Column({ type: "text" })
  evaluation_notes: string;

  @Column({ type: "enum", enum: QsRecommendation })
  recommendation: QsRecommendation;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  submitted_at: Date;

  @Index()
  @Column({ type: "enum", enum: QsDecision, default: QsDecision.PENDING })
  decision_status: QsDecision;

  @Column({ type: "text", nullable: true })
  decision_notes: string | null;

  @Column({ type: "uuid", nullable: true })
  decided_by: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "decided_by" })
  decider: User | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  decided_by_name: string | null;

  @Column({ type: "timestamptz", nullable: true })
  decided_at: Date | null;
}
