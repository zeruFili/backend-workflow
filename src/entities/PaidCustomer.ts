import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, OneToMany, Index,
} from "typeorm";
import { User } from "./User";
import { CustomerRequest } from "./CustomerRequest";
import { CustomerRequestCategory } from "../enums/customer-request-category.enum";
import { PaymentVerificationStatus } from "../enums/payment-verification-status.enum";

@Entity("paid_customers")
export class PaidCustomer {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column({ type: "uuid" })
  source_request_id: string;

  @ManyToOne(() => CustomerRequest)
  @JoinColumn({ name: "source_request_id" })
  source_request: CustomerRequest;

  @Column({ type: "varchar", length: 500 })
  customer_name: string;

  @Column({ type: "varchar", length: 50 })
  customer_phone: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  customer_email: string;

  @Column({ type: "text", nullable: true })
  customer_address: string;

  @Column({ type: "enum", enum: CustomerRequestCategory, nullable: true })
  category: CustomerRequestCategory;

  @Column({ type: "text", nullable: true })
  service_description: string;

  @Column({ type: "date", nullable: true })
  preferred_start_date: string;

  @Column({ type: "numeric", precision: 15, scale: 2, nullable: true })
  budget: number;

  @Column({ type: "text", nullable: true })
  notes: string;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  transferred_at: Date;

  @Index()
  @Column({ type: "uuid" })
  transferred_by: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "transferred_by" })
  transferrer: User;

  @Column({ type: "varchar", length: 255 })
  transferred_by_name: string;

  @Column({ type: "text", nullable: true })
  payment_note: string;

  @Index()
  @Column({ type: "enum", enum: PaymentVerificationStatus, default: PaymentVerificationStatus.PENDING })
  payment_verification_status: PaymentVerificationStatus;

  @Column({ type: "text", nullable: true })
  payment_verification_message: string;

  @Column({ type: "timestamptz", nullable: true })
  payment_verified_at: Date;

  @Column({ type: "uuid", nullable: true })
  payment_verified_by: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "payment_verified_by" })
  verifier: User;

  @Column({ type: "varchar", length: 255, nullable: true })
  payment_verified_by_name: string;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "now()" })
  updated_at: Date;
}
