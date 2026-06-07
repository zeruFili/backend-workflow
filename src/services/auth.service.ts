import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { AppError } from "../middlewares/error.middleware";

const userRepo = () => AppDataSource.getRepository(User);

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";
const ACCESS_TOKEN_TTL = "15m";
const RESET_TOKEN_TTL = "1h";
const BCRYPT_COST = 12;

function generateAccessToken(user: {
  id: string;
  role: string;
  email: string;
  full_name: string;
}): string {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
      full_name: user.full_name,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

function sanitizeUser(user: User) {
  const { password_hash, ...rest } = user;
  return rest;
}

export class AuthService {
  async login(email: string, password: string): Promise<{
    accessToken: string;
    user: Record<string, unknown>;
  }> {
    const user = await userRepo().findOne({ where: { email } });
    if (!user) {
      throw new AppError(401, "Invalid email or password");
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      throw new AppError(401, "Invalid email or password");
    }

    if (!user.is_active) {
      throw new AppError(403, "Account is deactivated. Contact your administrator.");
    }

    user.last_login_at = new Date();
    await userRepo().save(user);

    const accessToken = generateAccessToken({
      id: user.id,
      role: user.role,
      email: user.email,
      full_name: user.full_name,
    });

    return {
      accessToken,
      user: sanitizeUser(user),
    };
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await userRepo().findOne({ where: { email } });
    if (!user) {
      return;
    }

    const resetToken = jwt.sign(
      { sub: user.id, purpose: "password_reset" },
      JWT_SECRET,
      { expiresIn: RESET_TOKEN_TTL }
    );
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    let payload: { sub: string; purpose: string };
    try {
      payload = jwt.verify(token, JWT_SECRET) as { sub: string; purpose: string };
    } catch {
      throw new AppError(400, "Invalid or expired reset token");
    }

    if (payload.purpose !== "password_reset") {
      throw new AppError(400, "Invalid or expired reset token");
    }

    const user = await userRepo().findOne({ where: { id: payload.sub } });
    if (!user) {
      throw new AppError(404, "User not found");
    }

    user.password_hash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await userRepo().save(user);
  }

  async getMe(userId: string): Promise<Record<string, unknown>> {
    const user = await userRepo().findOne({ where: { id: userId } });
    if (!user) {
      throw new AppError(404, "User not found");
    }

    return sanitizeUser(user);
  }
}

export const authService = new AuthService();
