import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { Submission } from "./Submission";

@Entity("submission_attachments")
export class SubmissionAttachment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  submission_id: string;

  @ManyToOne(() => Submission, { onDelete: "CASCADE" })
  @JoinColumn({ name: "submission_id" })
  submission: Submission;

  @Column({ type: "text" })
  file_url: string;

  @Column({ type: "varchar", length: 500 })
  file_name: string;

  @Column({ type: "varchar", length: 100 })
  file_type: string;

  @Column({ type: "bigint" })
  file_size: number;

  @Column({ type: "boolean", default: false })
  is_screenshot: boolean;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  uploaded_at: Date;
}
