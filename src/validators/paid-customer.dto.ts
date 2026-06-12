import { IsString, IsEnum, IsOptional, Length, IsUUID, IsArray } from "class-validator";
import { ReviewOutcome } from "../enums/review-outcome.enum";

export class CreatePaidCustomerDto {
  @IsUUID()
  customer_id: string;

  @IsString()
  @Length(1, 5000)
  description: string;
}

export class UpdatePaidCustomerDto {
  @IsOptional()
  @IsString()
  @Length(1, 5000)
  description?: string;

  @IsOptional()
  @IsEnum(ReviewOutcome)
  status?: ReviewOutcome;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachment_urls?: string[];
}

export class CreatePaidCustomerReviewDto {
  @IsEnum([ReviewOutcome.APPROVED, ReviewOutcome.REJECTED, ReviewOutcome.FEEDBACK])
  review_outcome: ReviewOutcome;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  description?: string;
}
