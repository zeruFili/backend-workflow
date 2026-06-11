import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { UserRole } from "../enums/user-role.enum";

export interface UserDetails {
  id: string;
  fullName: string;
  role: UserRole;
}

const userRepo = () => AppDataSource.getRepository(User);

export async function getUserDetails(userId: string): Promise<UserDetails | null> {
  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.full_name,
    role: user.role,
  };
}
