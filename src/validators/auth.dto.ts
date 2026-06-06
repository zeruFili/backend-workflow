import { IsString, Length } from "class-validator";

export class LoginDto {
  @IsString()
  @Length(3, 100)
  username: string;

  @IsString()
  @Length(6, 128)
  password: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
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
