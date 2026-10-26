import fs from 'node:fs';
import path from 'node:path';
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
      return { ...DEFAULT_CONFIG };
    }
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  public getConfig(): OfficeConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<OfficeConfig>): void {
    this.config = { ...this.config, ...partial };
    this.save(this.config);
  }

  private save(config: OfficeConfig): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(config, null, 2), 'utf-8');
  }
}
