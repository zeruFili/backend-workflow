import { IsString, IsEnum, IsOptional, Length, IsArray, IsNumber, IsPositive } from "class-validator";
import { ReviewOutcome } from "../enums/review-outcome.enum";
import { TaskState } from "../enums/task-state.enum";

export class CreateMarketingTaskDto {
  @IsString()
  @Length(1, 500)
  title: string;

  @IsString()
  @Length(1, 5000)
  description: string;

  @IsOptional()
  @IsString()
  due_date?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachment_urls?: string[];

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

export class UpdateMarketingTaskDto {
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
  @IsEnum(TaskState)
  task_state?: TaskState;

  @IsOptional()
  @IsString()
  due_date?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachment_urls?: string[];

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

export class CreateMarketingSubmissionDto {
  @IsString()
  @Length(1, 5000)
  description: string;
}

export class CreateMarketingReviewDto {
  @IsEnum(ReviewOutcome)
  review_outcome: ReviewOutcome;

  @IsString()
  @Length(1, 5000)
  description: string;
}

export class UpdateMarketingReviewDto {
  @IsOptional()
  @IsEnum(ReviewOutcome)
  review_outcome?: ReviewOutcome;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  description?: string;
}
