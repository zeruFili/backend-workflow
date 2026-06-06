import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, OneToMany, Index,
} from "typeorm";
import { User } from "./User";
import { Task } from "./Task";
import { QsRecommendation } from "../enums/qs-recommendation.enum";
import { QsDecision } from "../enums/qs-decision.enum";

@Entity("quantity_surveyor_evaluations")
export class QsEvaluation {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  task_id: string;

  @ManyToOne(() => Task, { onDelete: "CASCADE" })
  @JoinColumn({ name: "task_id" })
  task: Task;

  @Index()
  @Column({ type: "uuid" })
  qs_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "qs_id" })
  surveyor: User;

  @Column({ type: "varchar", length: 255 })
  qs_name: string;

  @Column({ type: "enum", enum: QsRecommendation })
  recommendation: QsRecommendation;

  @Column({ type: "text" })
  cost_analysis: string;

  @Column({ type: "text", nullable: true })
  telegram_screenshot: string;

  @Index()
  @Column({ type: "enum", enum: QsDecision, default: QsDecision.PENDING })
  decision_status: QsDecision;

  @Column({ type: "text", nullable: true })
  decision_message: string;

  @Column({ type: "uuid", nullable: true })
  decided_by: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "decided_by" })
  decider: User;

  @Column({ type: "varchar", length: 255, nullable: true })
  decided_by_name: string;

  @Column({ type: "timestamptz", nullable: true })
  decided_at: Date;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  submitted_at: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "now()" })
  updated_at: Date;
}
