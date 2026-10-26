export type AgentRole = 'ARCHITECT' | 'FRONTEND' | 'BACKEND' | 'QA' | 'DEVOPS';
export type AgentState = 'IDLE' | 'WALKING' | 'THINKING' | 'CODING' | 'TALKING' | 'REVIEWING' | 'CELEBRATING';
export type EpicStatus = 'DRAFT' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED';
export type TaskStatus = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';

export interface OfficeConfig {
  proxyBaseUrl: string;
  apiKey: string;
  roleModels: Record<AgentRole, string>;
  jevEndpoint?: string;
  soundEnabled: boolean;
  soundVolume: number;
  simulationSpeed: number;
  defaultBudgetCapUsd: number;
  autoPauseThreshold: number;
  requirePlanApproval: boolean;
  requireMergeApproval: boolean;
  ignoredFolders: string[];
}
