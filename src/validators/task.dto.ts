import { IsString, IsEnum, IsOptional, Length, IsUUID, IsBoolean, IsInt, Min, Max } from "class-validator";
import { TaskStatus } from "../enums/task-status.enum";

export class CreateTaskDto {
  @IsString()
  @Length(1, 500)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  instruction?: string;

  @IsOptional()
  @IsUUID()
  project_id?: string;

  @IsOptional()
  @IsUUID()
  assigned_to?: string;

  @IsOptional()
  @IsString()
  deadline?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  task_type?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  story_points?: number;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  instruction?: string;

  @IsOptional()
  @IsUUID()
  project_id?: string;

  @IsOptional()
  @IsUUID()
  assigned_to?: string;

  @IsOptional()
  @IsString()
  deadline?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  story_points?: number;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @IsOptional()
  @IsString()
  telegram_screenshot?: string;
}

export class ChangeTaskStatusDto {
  @IsEnum(TaskStatus)
  status: TaskStatus;
}

export class ChangeTaskDescriptionDto {
  @IsString()
  @Length(1, 5000)
  description: string;
}

export class ReviewTaskDto {
  @IsEnum(["approve", "feedback", "reject"])
  action: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  message?: string;
}

export class AddFeedbackDto {
  @IsString()
  @Length(1, 5000)
  body: string;
}
