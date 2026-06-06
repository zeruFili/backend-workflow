import { IsString, IsEnum, IsOptional, IsEmail, Length, IsBoolean, MinLength, Matches } from "class-validator";
import { UserRole } from "../enums/user-role.enum";

export class CreateUserDto {
  @IsString()
  @Length(3, 100)
  username: string;

  @IsString()
  @Length(1, 255)
  name: string;

  @IsEmail()
  @Length(1, 255)
  email: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,128}$/, {
    message: "Password must include uppercase, lowercase, digit, and special character",
  })
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: "Invalid E.164 phone format" })
  phone?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @IsOptional()
  @IsEmail()
  @Length(1, 255)
  email?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: "Invalid E.164 phone format" })
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,128}$/, {
    message: "Password must include uppercase, lowercase, digit, and special character",
  })
  password?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
