import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, OneToMany, Index,
} from "typeorm";
import { User } from "./User";
import { ProjectStage } from "../enums/project-stage.enum";
import { ProjectStatus } from "../enums/project-status.enum";

@Entity("projects")
export class Project {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 500 })
  name: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  client_name: string | null;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Index()
  @Column({ type: "enum", enum: ProjectStage, default: ProjectStage.LEAD })
  stage: ProjectStage;

  @Index()
  @Column({ type: "enum", enum: ProjectStatus, default: ProjectStatus.ACTIVE })
  status: ProjectStatus;

  @Column({ type: "timestamptz", nullable: true })
  deadline: Date | null;

  @Index()
  @Column({ type: "uuid" })
  created_by: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "created_by" })
  creator: User;

  @Index()
  @Column({ type: "uuid", nullable: true })
  assigned_to: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "assigned_to" })
  assignee: User | null;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "now()" })
  updated_at: Date;
}
