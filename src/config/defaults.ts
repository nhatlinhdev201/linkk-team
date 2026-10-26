import { OfficeConfig } from '../types/office.js';

export const DEFAULT_CONFIG: OfficeConfig = {
  proxyBaseUrl: 'http://localhost:8000/v1',
  apiKey: '',
  roleModels: {
    ARCHITECT: 'claude-3-5-sonnet',
    FRONTEND: 'claude-3-5-sonnet',
    BACKEND: 'claude-3-5-sonnet',
    QA: 'gpt-4o-mini',
    DEVOPS: 'claude-3-5-sonnet'
  },
  soundEnabled: true,
  soundVolume: 0.8,
  simulationSpeed: 1.0,
  defaultBudgetCapUsd: 5.0,
  autoPauseThreshold: 0.8,
  requirePlanApproval: true,
  requireMergeApproval: true,
  ignoredFolders: ['node_modules', 'dist', '.git', '.cache']
};
