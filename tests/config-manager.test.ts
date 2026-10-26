import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '../src/config/config-manager.js';
import fs from 'node:fs';
import path from 'node:path';

describe('ConfigManager', () => {
  const testDir = path.join(process.cwd(), '.test-office');
  const configPath = path.join(testDir, 'config.json');

  beforeEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should initialize default config when file does not exist', () => {
    const manager = new ConfigManager(configPath);
    const config = manager.getConfig();
    expect(config.proxyBaseUrl).toBe('http://localhost:8000/v1');
    expect(config.defaultBudgetCapUsd).toBe(5.0);
    expect(config.simulationSpeed).toBe(1.0);
  });

  it('should update and persist configuration changes', () => {
    const manager = new ConfigManager(configPath);
    manager.updateConfig({ proxyBaseUrl: 'https://api.openai.com/v1', defaultBudgetCapUsd: 10.0 });
    
    const reloaded = new ConfigManager(configPath);
    expect(reloaded.getConfig().proxyBaseUrl).toBe('https://api.openai.com/v1');
    expect(reloaded.getConfig().defaultBudgetCapUsd).toBe(10.0);
    expect(reloaded.getConfig().simulationSpeed).toBe(1.0);
  });

  it('should fallback to default config when file contains invalid JSON', () => {
    fs.writeFileSync(configPath, 'invalid json content', 'utf-8');
    const manager = new ConfigManager(configPath);
    const config = manager.getConfig();
    expect(config.proxyBaseUrl).toBe('http://localhost:8000/v1');
    expect(config.defaultBudgetCapUsd).toBe(5.0);
  });
});
