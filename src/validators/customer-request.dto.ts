import { IsString, IsEnum, IsOptional, Length, IsUUID, IsNumber, Min, IsPositive } from "class-validator";
import { CustomerRequestCategory } from "../enums/customer-request-category.enum";

export class CreateCustomerRequestDto {
  @IsString()
  @Length(1, 500)
  customer_name: string;

  @IsString()
  @Length(1, 50)
  customer_phone: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  customer_email?: string;

  @IsString()
  @Length(1, 2000)
  customer_address: string;

  @IsEnum(CustomerRequestCategory)
  category: CustomerRequestCategory;

  @IsString()
  @Length(1, 5000)
  service_description: string;

  @IsOptional()
  @IsString()
  preferred_start_date?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  budget?: number;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  notes?: string;
}

export class UpdateCustomerRequestDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  customer_name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  customer_phone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  customer_email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  customer_address?: string;

  @IsOptional()
  @IsEnum(CustomerRequestCategory)
  category?: CustomerRequestCategory;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  service_description?: string;

  @IsOptional()
  @IsString()
  preferred_start_date?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  budget?: number;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  notes?: string;
}
