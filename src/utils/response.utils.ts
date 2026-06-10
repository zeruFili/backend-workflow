import { User } from "../entities/User";

export interface SafeUserOutput {
  id: string;
  full_name: string;
  role: string;
}

export function pickSafeUserFields(user: User | null | undefined): SafeUserOutput | null {
  if (!user) return null;
  return {
    id: user.id,
    full_name: user.full_name,
    role: user.role,
  };
}
