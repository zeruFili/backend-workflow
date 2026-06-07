import { IsString, IsEnum, IsOptional, Length, IsUUID } from "class-validator";
import { DataCollectorTaskStatus } from "../enums/data-collector-task-status.enum";
import { ReviewOutcome } from "../enums/review-outcome.enum";
import { TaskState } from "../enums/task-state.enum";

export class CreateDCTaskDto {
  @IsString()
  @Length(1, 500)
  title: string;

  @IsString()
  @Length(1, 5000)
  description: string;

  @IsOptional()
  @IsUUID()
  assigned_to_user_id?: string;

  @IsOptional()
  @IsString()
  due_date?: string;
}

export class UpdateDCTaskDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  description?: string;

  @IsOptional()
  @IsEnum(DataCollectorTaskStatus)
  status?: DataCollectorTaskStatus;

  @IsOptional()
  @IsEnum(TaskState)
  task_state?: TaskState;

  @IsOptional()
  @IsString()
  due_date?: string;

  @IsOptional()
  @IsUUID()
  assigned_to_user_id?: string;
}

export class CreateDCSubmissionDto {
  @IsString()
  @Length(1, 5000)
  description: string;
}

export class CreateDCReviewDto {
  @IsEnum(ReviewOutcome)
  review_outcome: ReviewOutcome;

  @IsString()
  @Length(1, 5000)
  description: string;
}
