import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { AppError } from "../middlewares/error.middleware";
import { pickSafeUserFields, SafeUserOutput } from "../utils/response.utils";

const userRepo = () => AppDataSource.getRepository(User);

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";
const ACCESS_TOKEN_TTL = (process.env.ACCESS_TOKEN_TTL || "15m") as jwt.SignOptions["expiresIn"];
const RESET_TOKEN_TTL = (process.env.RESET_TOKEN_TTL || "1h") as jwt.SignOptions["expiresIn"];
const parsedBcryptCost = Number(process.env.BCRYPT_COST);
const BCRYPT_COST = Number.isFinite(parsedBcryptCost) && parsedBcryptCost > 0 ? parsedBcryptCost : 12;

function generateAccessToken(user: {
  id: string;
  role: string;
}): string {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

function sanitizeUser(user: User): SafeUserOutput {
  return pickSafeUserFields(user)!;
}

export class AuthService {
  async login(email: string, password: string): Promise<{
    accessToken: string;
    user: SafeUserOutput;
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

  async resetPassword(userId: string, newPassword: string): Promise<void> {
    const user = await userRepo().findOne({ where: { id: userId } });
    if (!user) {
      throw new AppError(404, "User not found");
    }

    user.password_hash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await userRepo().save(user);
  }

  async getMe(userId: string): Promise<SafeUserOutput> {
    const user = await userRepo().findOne({ where: { id: userId } });
    if (!user) {
      throw new AppError(404, "User not found");
    }

    return sanitizeUser(user);
  }
}

export const authService = new AuthService();
