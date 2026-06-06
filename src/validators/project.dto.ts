import { IsString, IsEnum, IsOptional, Length, IsUUID } from "class-validator";
import { ProjectStage } from "../enums/project-stage.enum";
import { ProjectStatus } from "../enums/project-status.enum";

export class CreateProjectDto {
  @IsString()
  @Length(1, 500)
  name: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  client_name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ProjectStage)
  stage?: ProjectStage;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsString()
  deadline?: string;

  @IsOptional()
  @IsUUID()
  assigned_to?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  client_name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ProjectStage)
  stage?: ProjectStage;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsString()
  deadline?: string;

  @IsOptional()
  @IsUUID()
  assigned_to?: string;
}
