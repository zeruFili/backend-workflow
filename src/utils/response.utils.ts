import { User } from "../entities/User";

export interface SafeUserOutput {
  id: string;
  full_name: string;
  role: string;
}

export interface CeoUserOutput {
  id: string;
  full_name: string;
  email: string;
  role: string;
  phone: string | null;
  last_login_at: Date | null;
  is_active: boolean;
}

export function pickSafeUserFields(user: User | null | undefined): SafeUserOutput | null {
  if (!user) return null;
  return {
    id: user.id,
    full_name: user.full_name,
    role: user.role,
  };
}

export function pickCeoUserFields(user: User | null | undefined): CeoUserOutput | null {
  if (!user) return null;
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    phone: user.phone ?? null,
    last_login_at: user.last_login_at ?? null,
    is_active: user.is_active,
  };
}
