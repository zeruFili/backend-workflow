import { IsString, IsEnum, IsOptional, IsEmail, Length, IsBoolean, MinLength, Matches, IsNotEmpty } from "class-validator";
import { UserRole } from "../enums/user-role.enum";

export class CreateUserDto {
  @IsString()
  @Length(1, 255)
  full_name: string;

  @IsEmail()
  @Length(1, 255)
  email: string;

  @IsString()
  @MinLength(8)
  @Length(8, 128)
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
  full_name?: string;

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
  @Length(8, 128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,128}$/, {
    message: "Password must include uppercase, lowercase, digit, and special character",
  })
  password?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateUserStatusDto {
  @IsNotEmpty()
  @IsBoolean()
  is_active: boolean;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
