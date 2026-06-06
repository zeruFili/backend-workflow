import { IsString, IsEnum, IsOptional, Length, IsUUID } from "class-validator";

export class VerifyPaymentDto {
  @IsEnum(["approve", "reject", "request_clarification"])
  action: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  message?: string;
}

export class ClarifyPaymentDto {
  @IsString()
  @Length(10, 5000)
  description: string;
}
