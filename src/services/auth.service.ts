import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { MoreThan } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { RefreshToken } from "../entities/RefreshToken";
import { PasswordResetToken } from "../entities/PasswordResetToken";
import { AppError } from "../middlewares/error.middleware";

const userRepo = () => AppDataSource.getRepository(User);
const refreshTokenRepo = () => AppDataSource.getRepository(RefreshToken);
const passwordResetTokenRepo = () => AppDataSource.getRepository(PasswordResetToken);

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "default_refresh_secret";
const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

interface TokenUser {
  id: string;
  role: string;
  username: string;
  name: string;
}

function generateAccessToken(user: TokenUser): string {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      username: user.username,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

function generateRefreshTokenString(): string {
  return crypto.randomBytes(48).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export class AuthService {
  async login(username: string, password: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; username: string; name: string; email: string; role: string; avatar_url: string | null; phone: string | null };
  }> {
    const user = await userRepo().findOne({ where: { username } });
    if (!user) {
      throw new AppError(401, "Invalid username or password");
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      throw new AppError(401, "Invalid username or password");
    }

    if (!user.is_active) {
      throw new AppError(403, "Account is deactivated. Contact your administrator.");
    }

    user.last_login_at = new Date();
    await userRepo().save(user);

    const tokenUser: TokenUser = {
      id: user.id,
      role: user.role,
      username: user.username,
      name: user.name,
    };

    const accessToken = generateAccessToken(tokenUser);

    const refreshTokenString = generateRefreshTokenString();
    const refreshTokenHash = hashToken(refreshTokenString);

    const refreshTokenEntity = refreshTokenRepo().create({
      user_id: user.id,
      token_hash: refreshTokenHash,
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revoked: false,
    });
    await refreshTokenRepo().save(refreshTokenEntity);

    return {
      accessToken,
      refreshToken: refreshTokenString,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
        phone: user.phone,
      },
    };
  }

  async refresh(refreshTokenString: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const refreshTokenHash = hashToken(refreshTokenString);

    const storedToken = await refreshTokenRepo().findOne({
      where: { token_hash: refreshTokenHash },
      relations: ["user"],
    });

    if (!storedToken) {
      throw new AppError(401, "Invalid refresh token");
    }

    if (storedToken.expires_at < new Date()) {
      throw new AppError(401, "Refresh token expired");
    }

    if (storedToken.revoked) {
      // Security: if a revoked token is being used, revoke all tokens for this user
      await refreshTokenRepo().update(
        { user_id: storedToken.user_id },
        { revoked: true }
      );
      throw new AppError(401, "Refresh token has been revoked. All sessions invalidated for security.");
    }

    // Revoke the old token
    storedToken.revoked = true;
    await refreshTokenRepo().save(storedToken);

    const user = storedToken.user;
    if (!user.is_active) {
      throw new AppError(403, "Account is deactivated");
    }

    const tokenUser: TokenUser = {
      id: user.id,
      role: user.role,
      username: user.username,
      name: user.name,
    };

    const accessToken = generateAccessToken(tokenUser);

    const newRefreshTokenString = generateRefreshTokenString();
    const newRefreshTokenHash = hashToken(newRefreshTokenString);

    const newRefreshTokenEntity = refreshTokenRepo().create({
      user_id: user.id,
      token_hash: newRefreshTokenHash,
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revoked: false,
    });
    await refreshTokenRepo().save(newRefreshTokenEntity);

    return {
      accessToken,
      refreshToken: newRefreshTokenString,
    };
  }

  async logout(refreshTokenString: string): Promise<void> {
    const refreshTokenHash = hashToken(refreshTokenString);

    const storedToken = await refreshTokenRepo().findOne({
      where: { token_hash: refreshTokenHash },
    });

    if (!storedToken) {
      return; // Token not found — already logged out or invalid, no error
    }

    storedToken.revoked = true;
    await refreshTokenRepo().save(storedToken);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await userRepo().findOne({ where: { email } });
    if (!user) {
      return; // Don't reveal whether email exists
    }

    // Invalidate all previous reset tokens for this user
    await passwordResetTokenRepo().update(
      { user_id: user.id, used: false },
      { used: true }
    );

    const resetTokenString = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = hashToken(resetTokenString);

    const resetTokenEntity = passwordResetTokenRepo().create({
      user_id: user.id,
      token_hash: resetTokenHash,
      expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      used: false,
    });
    await passwordResetTokenRepo().save(resetTokenEntity);

    // In a production system, send the resetTokenString via email.
    // For now, it is returned from the controller for integration testing.
    (resetTokenEntity as any)._plainToken = resetTokenString;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);

    const resetToken = await passwordResetTokenRepo().findOne({
      where: {
        token_hash: tokenHash,
        used: false,
        expires_at: MoreThan(new Date()),
      },
      relations: ["user"],
    });

    if (!resetToken) {
      throw new AppError(400, "Invalid or expired reset token");
    }

    const user = resetToken.user;

    const password_hash = await bcrypt.hash(newPassword, 10);
    user.password_hash = password_hash;
    user.force_password_change = false;
    await userRepo().save(user);

    resetToken.used = true;
    await passwordResetTokenRepo().save(resetToken);

    // Revoke all refresh tokens for this user to force re-login
    await refreshTokenRepo().update(
      { user_id: user.id },
      { revoked: true }
    );
  }

  async getMe(userId: string): Promise<{
    id: string;
    username: string;
    name: string;
    email: string;
    role: string;
    avatar_url: string | null;
    phone: string | null;
    created_at: Date;
    updated_at: Date;
    last_login_at: Date | null;
    force_password_change: boolean;
  }> {
    const user = await userRepo().findOne({ where: { id: userId } });
    if (!user) {
      throw new AppError(404, "User not found");
    }

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url,
      phone: user.phone,
      created_at: user.created_at,
      updated_at: user.updated_at,
      last_login_at: user.last_login_at,
      force_password_change: user.force_password_change,
    };
  }
}

export const authService = new AuthService();
