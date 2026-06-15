import { IsArray, IsUUID, ArrayNotEmpty } from "class-validator";

export class BulkMarkReadDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  ids: string[];
}
