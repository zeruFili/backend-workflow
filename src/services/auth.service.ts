import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { PasswordResetToken } from "../entities/PasswordResetToken";
import { AppError } from "../middlewares/error.middleware";
import { pickSafeUserFields, SafeUserOutput } from "../utils/response.utils";
import { getUserDetails, UserDetails } from "../utils/user-details.util";
import { validatePasswordStrength } from "../utils/password.utils";
import { emailService } from "./email.service";

const userRepo = () => AppDataSource.getRepository(User);
const resetTokenRepo = () => AppDataSource.getRepository(PasswordResetToken);

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";
const ACCESS_TOKEN_TTL = (process.env.ACCESS_TOKEN_TTL || "15m") as jwt.SignOptions["expiresIn"];
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

function hashToken(rawToken: string): string {
  return bcrypt.hashSync(rawToken, 10);
}

export class AuthService {
  async login(email: string, password: string): Promise<{
    accessToken: string;
    user: SafeUserOutput;
  }> {
    const user = await userRepo()
      .createQueryBuilder("user")
      .addSelect("user.password_hash")
      .where("user.email = :email", { email })
      .getOne();
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
    user.updated_at = new Date();
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

    await resetTokenRepo().delete({ userId: user.id, used: false });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);

    const resetToken = resetTokenRepo().create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      used: false,
    });
    await resetTokenRepo().save(resetToken);

    await emailService.sendPasswordResetEmail(user.email, user.full_name, rawToken);
  }

  async resetPassword(rawToken: string, password: string, confirmPassword: string): Promise<void> {
    if (password !== confirmPassword) {
      throw new AppError(400, "Passwords do not match");
    }

    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      throw new AppError(400, passwordValidation.errors.join("; "));
    }

    const tokens = await resetTokenRepo().find({
      where: { used: false },
      order: { createdAt: "DESC" },
    });

    let matchedToken: PasswordResetToken | null = null;
    for (const t of tokens) {
      const isMatch = await bcrypt.compare(rawToken, t.tokenHash);
      if (isMatch) {
        matchedToken = t;
        break;
      }
    }

    if (!matchedToken) {
      throw new AppError(400, "Password reset link is invalid or has already been used.");
    }

    if (new Date() > new Date(matchedToken.expiresAt)) {
      matchedToken.used = true;
      await resetTokenRepo().save(matchedToken);
      throw new AppError(400, "Password reset link has expired. Please request a new one.");
    }

    const user = await userRepo().findOne({ where: { id: matchedToken.userId } });
    if (!user) {
      throw new AppError(400, "Password reset link is invalid.");
    }

    user.password_hash = await bcrypt.hash(password, BCRYPT_COST);
    user.updated_at = new Date();
    await userRepo().save(user);

    matchedToken.used = true;
    await resetTokenRepo().save(matchedToken);
  }

  async getMe(userId: string): Promise<UserDetails> {
    const user = await getUserDetails(userId);
    if (!user) {
      throw new AppError(404, "User not found");
    }

    return user;
  }
}

export const authService = new AuthService();
