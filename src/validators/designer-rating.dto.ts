import { IsNumber, IsString, IsOptional, IsUUID, Min, Max, Length } from "class-validator";

export class CreateDesignerRatingDto {
  @IsUUID()
  task_id: string;

  @IsNumber()
  @Min(0)
  @Max(5)
  overall_rating: number;

  @IsNumber()
  @Min(0)
  @Max(5)
  rendering_quality: number;

  @IsNumber()
  @Min(0)
  @Max(5)
  timeliness: number;

  @IsNumber()
  @Min(0)
  @Max(5)
  creativity: number;

  @IsNumber()
  @Min(0)
  @Max(5)
  client_understanding: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  revision_efficiency?: number;

  @IsString()
  @Length(10, 5000)
  feedback: string;
}

export class UpdateDesignerRatingDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  overall_rating?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  rendering_quality?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  timeliness?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  creativity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  client_understanding?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  revision_efficiency?: number;

  @IsOptional()
  @IsString()
  @Length(10, 5000)
  feedback?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
