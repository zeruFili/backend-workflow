import { IsString, IsOptional, Length, IsUUID, IsNumber, IsPositive, IsArray } from "class-validator";

export class CreateCeoTransferDto {
  @IsUUID()
  finance_user_id: string;

  @IsUUID()
  ceo_user_id: string;

  @IsString()
  @Length(1, 5000)
  description: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachment_urls?: string[];
}

export class UpdateCeoTransferDto {
  @IsOptional()
  @IsUUID()
  finance_user_id?: string;

  @IsOptional()
  @IsUUID()
  ceo_user_id?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  description?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachment_urls?: string[];
}
