import { IsString, Length } from "class-validator";

export class LoginDto {
  @IsString()
  @Length(1, 255)
  email: string;

  @IsString()
  @Length(6, 128)
  password: string;
}

export class ForgotPasswordDto {
  @IsString()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @Length(8, 128)
  newPassword: string;
}
