import { Request, Response } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { authService } from "../services/auth.service";
import { LoginDto, RefreshTokenDto, ForgotPasswordDto, ResetPasswordDto } from "../validators/auth.dto";

export class AuthController {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(LoginDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat();
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      const result = await authService.login(dto.username, dto.password);
      res.status(200).json({ success: true, message: "Login successful", data: result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("Login error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async refresh(req: Request, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(RefreshTokenDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat();
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      const result = await authService.refresh(dto.refreshToken);
      res.status(200).json({ success: true, message: "Token refreshed", data: result });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("Refresh error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async logout(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken || typeof refreshToken !== "string") {
        res.status(400).json({ success: false, message: "refreshToken is required" });
        return;
      }

      await authService.logout(refreshToken);
      res.status(200).json({ success: true, message: "Logged out successfully" });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("Logout error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(ForgotPasswordDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat();
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      await authService.forgotPassword(dto.email);
      res.status(200).json({
        success: true,
        message: "If an account with that email exists, a password reset link has been sent.",
      });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("Forgot password error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(ResetPasswordDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat();
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      await authService.resetPassword(dto.token, dto.newPassword);
      res.status(200).json({ success: true, message: "Password has been reset successfully. Please log in." });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("Reset password error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async getMe(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const user = await authService.getMe(req.user.id);
      res.status(200).json({ success: true, message: "User profile", data: user });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("GetMe error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
}

export const authController = new AuthController();
