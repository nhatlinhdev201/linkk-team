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

export interface Epic {
  id: string;
  title: string;
  description: string;
  status: EpicStatus;
  budgetCapUsd: number;
  createdAt?: string;
}

export interface Task {
  id: string;
  epicId: string;
  title: string;
  status: TaskStatus;
  assignedAgentId?: string;
}

export interface Agent {
  id: string;
  name?: string;
  role: AgentRole;
  state: AgentState;
  currentTaskId?: string;
}

export interface ActivityEvent {
  id?: string | number;
  timestamp?: string;
  epicId: string;
  agentId: string;
  eventType: string;
  payload: any;
}
