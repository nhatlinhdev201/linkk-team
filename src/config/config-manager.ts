import fs from 'node:fs';
import path from 'node:path';
import { OfficeConfig, AgentRole } from '../types/office.js';

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

export type UpdateOfficeConfig = Partial<Omit<OfficeConfig, 'roleModels'>> & {
  roleModels?: Partial<Record<AgentRole, string>>;
};

export class ConfigManager {
  private config: OfficeConfig;
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.config = this.load();
  }

  private load(): OfficeConfig {
    if (!fs.existsSync(this.filePath)) {
      this.save(DEFAULT_CONFIG);
      return structuredClone(DEFAULT_CONFIG);
    }
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(data);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        roleModels: {
          ...DEFAULT_CONFIG.roleModels,
          ...(parsed.roleModels || {})
        }
      };
    } catch {
      return structuredClone(DEFAULT_CONFIG);
    }
  }

  public getConfig(): OfficeConfig {
    return structuredClone(this.config);
  }

  public updateConfig(partial: UpdateOfficeConfig): void {
    this.config = {
      ...this.config,
      ...partial,
      roleModels: {
        ...this.config.roleModels,
        ...(partial.roleModels || {})
      }
    };
    this.save(this.config);
  }

  public getProxyUrl(): string {
    return this.config.proxyBaseUrl;
  }

  public getModelForRole(role: AgentRole): string {
    return this.config.roleModels[role];
  }

  private save(config: OfficeConfig): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(config, null, 2), 'utf-8');
  }
}
