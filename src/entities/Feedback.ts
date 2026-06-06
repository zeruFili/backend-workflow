import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { Task } from "./Task";

@Entity("feedbacks")
export class Feedback {
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
  sender_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "sender_id" })
  sender: User;

  @Column({ type: "varchar", length: 255, nullable: true })
  sender_name: string;

  @Column({ type: "text" })
  body: string;

  @Column({ type: "integer", default: 1 })
  version: number;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  sent_at: Date;
}
