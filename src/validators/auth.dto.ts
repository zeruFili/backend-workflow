import { IsEmail, IsString, Length, Matches } from "class-validator";

export class LoginDto {
  @IsEmail()
  @Length(1, 255)
  email: string;

  @IsString()
  @Length(6, 128)
  password: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @Length(8, 128)
  password: string;

  @IsString()
  @Length(8, 128)
  confirmPassword: string;
}
