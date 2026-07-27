const SAFE_USER_COLUMNS = [
  "id",
  "full_name",
  "email",
  "phone",
  "role",
  "is_active",
  "last_login_at",
  "created_at",
  "updated_at",
  "created_by",
] as const;

export function safeUserColumns(alias: string): string[] {
  return SAFE_USER_COLUMNS.map((col) => `${alias}.${col}`);
}
