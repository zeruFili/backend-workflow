import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { PaidCustomer } from "./PaidCustomer";

@Entity("payment_proofs")
export class PaymentProof {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  paid_customer_id: string;

  @ManyToOne(() => PaidCustomer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "paid_customer_id" })
  paid_customer: PaidCustomer;

  @Column({ type: "text" })
  file_url: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  file_name: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  file_type: string;

  @Column({ type: "bigint", nullable: true })
  file_size: number;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()" })
  uploaded_at: Date;
}
