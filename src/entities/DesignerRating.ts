import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { Task } from "./Task";

@Entity("designer_ratings")
export class DesignerRating {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  designer_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "designer_id" })
  designer: User;

  @Index()
  @Column({ type: "uuid" })
  task_id: string;

  @ManyToOne(() => Task)
  @JoinColumn({ name: "task_id" })
  task: Task;

  @Column({ type: "integer" })
  story_points: number;

  @Column({ type: "numeric", precision: 3, scale: 1 })
  overall_rating: number;

  @Column({ type: "numeric", precision: 3, scale: 1 })
  rendering_quality: number;

  @Column({ type: "numeric", precision: 3, scale: 1 })
  timeliness: number;

  @Column({ type: "numeric", precision: 3, scale: 1 })
  creativity: number;

  @Column({ type: "numeric", precision: 3, scale: 1 })
  client_understanding: number;

  @Column({ type: "numeric", precision: 3, scale: 1, nullable: true })
  revision_efficiency: number | null;

  @Column({ type: "integer", default: 0 })
  revision_count: number;

  @Column({ type: "text", nullable: true })
  feedback: string | null;

  @Column({ type: "varchar", length: 20, default: "approved" })
  status: string;

  @Index()
  @Column({ type: "uuid" })
  rated_by: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "rated_by" })
  rater: User;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  rated_at: Date;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "now()" })
  updated_at: Date;
}
