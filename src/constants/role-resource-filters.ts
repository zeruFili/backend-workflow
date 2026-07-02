import { UserRole } from "../enums/user-role.enum";
import { ResourceType } from "../enums/resource-type.enum";
import { ParentType } from "../enums/parent-type.enum";

export const ROLE_RESOURCE_FILTERS: Record<string, Record<string, ResourceType[]>> = {
  [ParentType.MARKETING_TASK]: {
    [UserRole.MARKETING]: [ResourceType.REVIEW],
    [UserRole.FINANCE]: [ResourceType.SUBMISSION, ResourceType.REVIEW],
    [UserRole.CEO]: [ResourceType.SUBMISSION, ResourceType.REVIEW],
  },
  [ParentType.DATA_COLLECTOR_TASK]: {
    [UserRole.DATA_COLLECTOR]: [ResourceType.REVIEW],
    [UserRole.GENERAL_MANAGER]: [ResourceType.SUBMISSION, ResourceType.REVIEW],
    [UserRole.CEO]: [ResourceType.SUBMISSION, ResourceType.REVIEW],
  },
  [ParentType.QUANTITY_SURVEYOR_TASK]: {
    [UserRole.QUANTITY_SURVEYOR]: [ResourceType.REVIEW],
    [UserRole.GENERAL_MANAGER]: [ResourceType.SUBMISSION, ResourceType.REVIEW],
    [UserRole.CEO]: [ResourceType.SUBMISSION, ResourceType.REVIEW],
  },
  [ParentType.DESIGNER_TASK]: {
    [UserRole.DESIGNER]: [ResourceType.POSTED_JOB],
    [UserRole.GENERAL_MANAGER]: [ResourceType.POSTED_JOB],
    [UserRole.CEO]: [ResourceType.POSTED_JOB],
  },
};

export function toCamelKey(snakeKey: string): string {
  return snakeKey.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase()) + "s";
}
