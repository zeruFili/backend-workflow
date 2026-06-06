import { IsString, IsEnum, IsOptional, Length, IsUUID, IsInt, Min, Max } from "class-validator";
import { DesignerPhase } from "../enums/designer-phase.enum";

export class CreateDesignerTaskDto {
  @IsString()
  @Length(1, 500)
  title: string;

  @IsString()
  @Length(1, 5000)
  description: string;

  @IsString()
  @Length(1, 5000)
  instruction: string;

  @IsOptional()
  @IsUUID()
  project_id?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  story_points: number;

  @IsOptional()
  @IsUUID()
  assigned_to?: string;

  @IsOptional()
  @IsString()
  telegram_screenshot?: string;

  @IsOptional()
  @IsString()
  deadline?: string;

  @IsOptional()
  is_public?: boolean;
}

export class AssignDesignerDto {
  @IsUUID()
  designer_id: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  review_note?: string;
}

export class SubmitPhaseDto {
  @IsString()
  @Length(5, 5000)
  note: string;
}

export class ReviewPhaseDto {
  @IsEnum(["approved", "feedback", "rejected"])
  action: string;

  @IsString()
  @Length(5, 5000)
  message: string;
}

export class ApplyForTaskDto {
  @IsUUID()
  task_id: string;

  @IsString()
  @Length(10, 2000)
  message: string;
}

export class ReviewApplicationDto {
  @IsEnum(["assigned", "rejected"])
  status: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  review_note?: string;
}
