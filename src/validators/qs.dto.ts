import { IsString, IsEnum, IsOptional, Length, IsUUID, IsArray } from "class-validator";
import { ReviewOutcome } from "../enums/review-outcome.enum";

export class CreateQSTaskDto {
  @IsString()
  @Length(1, 500)
  title: string;

  @IsString()
  @Length(1, 5000)
  description: string;

  @IsOptional()
  @IsUUID()
  assigned_to_user_id?: string;

  @IsString()
  due_date: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachment_urls?: string[];
}

export class UpdateQSTaskDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  description?: string;

  @IsOptional()
  @IsEnum(ReviewOutcome)
  status?: ReviewOutcome;

  @IsOptional()
  @IsString()
  due_date?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachment_urls?: string[];

  @IsOptional()
  @IsUUID()
  assigned_to_user_id?: string;
}

export class CreateQSSubmissionDto {
  @IsString()
  @Length(1, 5000)
  description: string;
}

export class CreateQSReviewDto {
  @IsEnum(ReviewOutcome)
  review_outcome: ReviewOutcome;

  @IsString()
  @Length(1, 5000)
  description: string;
}

export class UpdateQSReviewDto {
  @IsOptional()
  @IsEnum(ReviewOutcome)
  review_outcome?: ReviewOutcome;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  description?: string;
}
