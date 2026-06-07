import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from "typeorm";
import { User } from "./User";

@Entity("customer")
export class Customer {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  marketing_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "marketing_user_id" })
  marketing_user: User;

  @Column({ type: "varchar", length: 500 })
  customer_name: string;

  @Column({ type: "varchar", length: 20 })
  customer_phone: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  customer_email: string;

  @Column({ type: "varchar", length: 2000 })
  customer_address: string;

  @Column({ type: "varchar", length: 255 })
  category: string;

  @Column({ type: "text" })
  service_description: string;

  @Column({ type: "date", nullable: true })
  preferred_start_date: string;

  @Column({ type: "numeric", precision: 15, scale: 2, nullable: true })
  budget: number;

  @Column({ type: "text", nullable: true })
  notes: string;

  @Column({ type: "boolean", default: false })
  paid: boolean;

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  updated_at: Date;
}
