import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";
import { CustomerRequestCategory } from "../enums/customer-request-category.enum";
import { CustomerRequestStatus } from "../enums/customer-request-status.enum";

@Entity("customer_requests")
export class CustomerRequest {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 500 })
  customer_name: string;

  @Column({ type: "varchar", length: 50 })
  customer_phone: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  customer_email: string;

  @Column({ type: "text", nullable: true })
  customer_address: string;

  @Index()
  @Column({ type: "enum", enum: CustomerRequestCategory, default: CustomerRequestCategory.OTHER })
  category: CustomerRequestCategory;

  @Column({ type: "text", nullable: true })
  service_description: string;

  @Column({ type: "date", nullable: true })
  preferred_start_date: string;

  @Column({ type: "numeric", precision: 15, scale: 2, nullable: true })
  budget: number;

  @Column({ type: "text", nullable: true })
  notes: string;

  @Index()
  @Column({ type: "enum", enum: CustomerRequestStatus, default: CustomerRequestStatus.NEW })
  status: CustomerRequestStatus;

  @Index()
  @Column({ type: "uuid" })
  created_by: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "created_by" })
  creator: User;

  @Column({ type: "varchar", length: 255 })
  created_by_name: string;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "now()" })
  updated_at: Date;
}
