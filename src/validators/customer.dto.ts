import { IsString, IsOptional, Length, IsNumber, IsPositive } from "class-validator";

export class CreateCustomerDto {
  @IsString()
  @Length(1, 500)
  customer_name: string;

  @IsString()
  @Length(1, 20)
  customer_phone: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  customer_email?: string;

  @IsString()
  @Length(1, 2000)
  customer_address: string;

  @IsString()
  @Length(1, 255)
  category: string;

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

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  customer_name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
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
  @IsString()
  @Length(1, 255)
  category?: string;

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
