import { IsString, IsEnum, IsOptional, Length, IsUUID, IsInt, Min, Max, IsBoolean, IsArray } from "class-validator";
import { DesignerStage } from "../enums/designer-stage.enum";
import { ReviewOutcome } from "../enums/review-outcome.enum";

export class CreateDesignerTaskDto {
  @IsString()
  @Length(1, 500)
  title: string;

  @IsString()
  @Length(1, 5000)
  description: string;

  @IsInt()
  @Min(1)
  @Max(100)
  story_point: number;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @IsOptional()
  @IsString()
  due_date?: string;

  @IsOptional()
  @IsUUID()
  assigned_to_user_id?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachment_urls?: string[];
}

export class UpdateDesignerTaskDto {
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
  @IsEnum(DesignerStage)
  stage?: DesignerStage;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  story_point?: number;

  @IsOptional()
  @IsString()
  due_date?: string;

  @IsOptional()
  @IsUUID()
  assigned_to_user_id?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachment_urls?: string[];
}

export class AssignDesignerDto {
  @IsUUID()
  designer_id: string;
}

export class CreateDesignerSubmissionDto {
  @IsOptional()
  @IsEnum(DesignerStage)
  stage?: DesignerStage;

  @IsString()
  @Length(1, 5000)
  description: string;
}

export class CreateSubmissionReviewDto {
  @IsEnum(ReviewOutcome)
  review_outcome: ReviewOutcome;

  @IsString()
  @Length(1, 5000)
  description: string;

  @IsString()
  @IsOptional()
  task_state?: string;
}

export class CreateTaskReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  Creativity: number;

  @IsInt()
  @Min(1)
  @Max(5)
  Timeliness: number;

  @IsInt()
  @Min(1)
  @Max(5)
  Rendering_quality: number;

  @IsInt()
  @Min(1)
  @Max(5)
  Client_understanding: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class DesignApplicationDto {
  @IsUUID()
  designer_task_id: string;

  @IsOptional()
  @IsString()
  @Length(10, 2000)
  cover_note?: string;
}

export class UpdateSubmissionReviewDto {
  @IsString()
  @IsUUID()
  submission_id: string;

  @IsString()
  @IsUUID()
  task_id: string;

  @IsOptional()
  @IsEnum(ReviewOutcome)
  review_outcome?: ReviewOutcome;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  description?: string;

  @IsOptional()
  @IsString()
  task_state?: string;
}

export class PauseTaskDto {
  @IsString()
  @Length(1, 5000)
  reason: string;
}

export class UpdateTaskReviewDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  Creativity?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  Timeliness?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  Rendering_quality?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  Client_understanding?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
