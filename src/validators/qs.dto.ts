import { IsString, IsEnum, IsOptional, Length, IsUUID, IsNumber, Min } from "class-validator";
import { QsRecommendation } from "../enums/qs-recommendation.enum";
import { QsDecision } from "../enums/qs-decision.enum";
import { QsReviewStatus } from "../enums/qs-review-status.enum";

export class CreateQsReviewTaskDto {
  @IsString()
  @Length(1, 5000)
  description: string;

  @IsUUID()
  assigned_to: string;

  @IsString()
  telegram_screenshot: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  telegram_screenshot_description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  budget_expectation_reference?: string;
}

export class UpdateQsReviewTaskStatusDto {
  @IsEnum(QsReviewStatus)
  status: QsReviewStatus;
}

export class AssignQsTaskDto {
  @IsUUID()
  assigned_to: string;
}

export class CreateQsEvaluationDto {
  @IsUUID()
  task_id: string;

  @IsNumber()
  @Min(0)
  cost_value: number;

  @IsString()
  @Length(10, 5000)
  evaluation_notes: string;

  @IsEnum(QsRecommendation)
  recommendation: QsRecommendation;
}

export class UpdateQsEvaluationDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost_value?: number;

  @IsOptional()
  @IsString()
  @Length(10, 5000)
  evaluation_notes?: string;

  @IsOptional()
  @IsEnum(QsRecommendation)
  recommendation?: QsRecommendation;
}

export class DecideQsEvaluationDto {
  @IsEnum(["approved", "feedback"])
  decision: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  notes?: string;
}
