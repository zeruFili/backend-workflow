import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { Project } from "./Project";
import { Task } from "./Task";

@Entity("documents")
export class DocumentEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid", nullable: true })
  project_id: string;

  @ManyToOne(() => Project, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "project_id" })
  project: Project;

  @Index()
  @Column({ type: "uuid", nullable: true })
  task_id: string;

  @ManyToOne(() => Task, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "task_id" })
  task: Task;

  @Column({ type: "varchar", length: 500 })
  name: string;

  @Column({ type: "varchar", length: 100 })
  type: string;

  @Column({ type: "text" })
  file_url: string;

  @Column({ type: "bigint" })
  file_size: number;

  @Index()
  @Column({ type: "uuid" })
  uploaded_by: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "uploaded_by" })
  uploader: User;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  uploaded_at: Date;
}
