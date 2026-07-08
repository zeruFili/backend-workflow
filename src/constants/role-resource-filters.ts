import { UserRole } from "../enums/user-role.enum";
import { ResourceType } from "../enums/resource-type.enum";
import { ParentType } from "../enums/parent-type.enum";

export interface DomainFilterConfig {
  parentType: string;
  filters: Record<string, ResourceType[]>;
}

export const ROLE_RESOURCE_FILTERS: Record<string, DomainFilterConfig> = {
  marketingTasks: {
    parentType: ParentType.MARKETING_TASK,
    filters: {
      [UserRole.MARKETING]: [ResourceType.REVIEW],
      [UserRole.FINANCE]: [ResourceType.SUBMISSION, ResourceType.REVIEW],
      [UserRole.CEO]: [ResourceType.SUBMISSION, ResourceType.REVIEW],
    },
  },
  dataCollectorTasks: {
    parentType: ParentType.DATA_COLLECTOR_TASK,
    filters: {
      [UserRole.DATA_COLLECTOR]: [ResourceType.TASK_ASSIGNED, ResourceType.REVIEW],
      [UserRole.GENERAL_MANAGER]: [ResourceType.SUBMISSION, ResourceType.REVIEW],
      [UserRole.CEO]: [ResourceType.SUBMISSION, ResourceType.REVIEW],
    },
  },
  quantitySurveyorTasks: {
    parentType: ParentType.QUANTITY_SURVEYOR_TASK,
    filters: {
      [UserRole.QUANTITY_SURVEYOR]: [ResourceType.REVIEW],
      [UserRole.GENERAL_MANAGER]: [ResourceType.SUBMISSION, ResourceType.REVIEW],
      [UserRole.CEO]: [ResourceType.SUBMISSION, ResourceType.REVIEW],
    },
  },
  designerTasks: {
    parentType: ParentType.DESIGNER_TASK,
    filters: {
      [UserRole.DESIGNER]: [ResourceType.TASK_ASSIGNED, ResourceType.REVIEW],
      [UserRole.GENERAL_MANAGER]: [ResourceType.SUBMISSION, ResourceType.REVIEW],
      [UserRole.CEO]: [ResourceType.SUBMISSION, ResourceType.REVIEW],
    },
  },
  designerJobPostings: {
    parentType: ParentType.DESIGNER_TASK,
    filters: {
      [UserRole.DESIGNER]: [ResourceType.POSTED_JOB],
      [UserRole.GENERAL_MANAGER]: [ResourceType.POSTED_JOB],
      [UserRole.CEO]: [ResourceType.POSTED_JOB],
    },
  },
};
