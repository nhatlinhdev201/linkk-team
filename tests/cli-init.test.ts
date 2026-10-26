import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runInit, runStart, runCli } from '../bin/office.js';

describe('CLI Interface & Auto-Onboarding', () => {
  const testRoot = path.join(process.cwd(), '.test-cli-playground');

  beforeEach(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(testRoot, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('runInit', () => {
    it('should initialize .office directory, config.json, and office.db', () => {
      const projectDir = path.join(testRoot, 'my-app');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ name: 'my-app', version: '1.0.0' }, null, 2)
      );

      const result = runInit(projectDir);

      const expectedOfficeDir = path.join(projectDir, '.office');
      expect(result.officeDir).toBe(expectedOfficeDir);
      expect(result.baselineCreated).toBe(true);
      expect(result.detectedStack).toContain('Node.js / TypeScript / JavaScript');

      // Verify files created
      expect(fs.existsSync(expectedOfficeDir)).toBe(true);
      const configPath = path.join(expectedOfficeDir, 'config.json');
      const dbPath = path.join(expectedOfficeDir, 'office.db');
      const baselinePath = path.join(expectedOfficeDir, 'baseline.json');

      expect(fs.existsSync(configPath)).toBe(true);
      expect(fs.existsSync(dbPath)).toBe(true);
      expect(fs.existsSync(baselinePath)).toBe(true);

      // Verify config.json content
      const configContent = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(configContent).toHaveProperty('proxyBaseUrl');
      expect(configContent).toHaveProperty('roleModels');
      expect(configContent.roleModels).toHaveProperty('ARCHITECT');

      // Verify office.db SQLite validity
      const db = new Database(dbPath);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('epics');
      expect(tableNames).toContain('tasks');
      expect(tableNames).toContain('activity_logs');
      expect(tableNames).toContain('quota_tracking');
      db.close();
    });

    describe('Codebase Onboarding Scanner (tech stack detection)', () => {
      it('should detect Node.js / TypeScript / JavaScript from package.json', () => {
        const projectDir = path.join(testRoot, 'node-proj');
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'package.json'), '{}');

        const result = runInit(projectDir);
        expect(result.detectedStack).toEqual(['Node.js / TypeScript / JavaScript']);
      });

      it('should detect Rust from Cargo.toml', () => {
        const projectDir = path.join(testRoot, 'rust-proj');
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'Cargo.toml'), '[package]\nname = "rust-proj"');

        const result = runInit(projectDir);
        expect(result.detectedStack).toEqual(['Rust']);
      });

      it('should detect Python from requirements.txt', () => {
        const projectDir = path.join(testRoot, 'python-req-proj');
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'requirements.txt'), 'fastapi>=0.100.0');

        const result = runInit(projectDir);
        expect(result.detectedStack).toEqual(['Python']);
      });

      it('should detect Python from pyproject.toml', () => {
        const projectDir = path.join(testRoot, 'python-pyproject-proj');
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'pyproject.toml'), '[tool.poetry]\nname = "py-proj"');

        const result = runInit(projectDir);
        expect(result.detectedStack).toEqual(['Python']);
      });

      it('should detect Python only once if both requirements.txt and pyproject.toml exist', () => {
        const projectDir = path.join(testRoot, 'python-both-proj');
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'requirements.txt'), 'requests');
        fs.writeFileSync(path.join(projectDir, 'pyproject.toml'), '[tool.poetry]');

        const result = runInit(projectDir);
        expect(result.detectedStack).toEqual(['Python']);
      });

      it('should detect Go from go.mod', () => {
        const projectDir = path.join(testRoot, 'go-proj');
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'go.mod'), 'module example.com/go-proj\ngo 1.22');

        const result = runInit(projectDir);
        expect(result.detectedStack).toEqual(['Go']);
      });

      it('should detect multiple stacks in a polyglot project', () => {
        const projectDir = path.join(testRoot, 'polyglot-proj');
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'package.json'), '{}');
        fs.writeFileSync(path.join(projectDir, 'Cargo.toml'), '');
        fs.writeFileSync(path.join(projectDir, 'go.mod'), '');

        const result = runInit(projectDir);
        expect(result.detectedStack).toContain('Node.js / TypeScript / JavaScript');
        expect(result.detectedStack).toContain('Rust');
        expect(result.detectedStack).toContain('Go');
        expect(result.detectedStack.length).toBe(3);
      });

      it('should return empty array if no known manifest files exist', () => {
        const projectDir = path.join(testRoot, 'empty-proj');
        fs.mkdirSync(projectDir, { recursive: true });

        const result = runInit(projectDir);
        expect(result.detectedStack).toEqual([]);
      });
    });

    describe('Genesis Snapshot (baseline.json)', () => {
      it('should record targetDir name, detectedStack, and timestamp in baseline.json', () => {
        const projectDir = path.join(testRoot, 'awesome-app');
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'package.json'), '{}');

        const result = runInit(projectDir);
        expect(result.baselineCreated).toBe(true);

        const baselinePath = path.join(projectDir, '.office', 'baseline.json');
        expect(fs.existsSync(baselinePath)).toBe(true);

        const snapshot = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
        expect(snapshot.projectName).toBe('awesome-app');
        expect(snapshot.detectedStack).toEqual(['Node.js / TypeScript / JavaScript']);
        expect(snapshot.timestamp).toBeDefined();
        expect(new Date(snapshot.timestamp).getTime()).not.toBeNaN();
      });
    });

    describe('Gitignore management', () => {
      it('should create .gitignore if it does not exist with office entries', () => {
        const projectDir = path.join(testRoot, 'no-gitignore-proj');
        fs.mkdirSync(projectDir, { recursive: true });

        runInit(projectDir);

        const gitignorePath = path.join(projectDir, '.gitignore');
        expect(fs.existsSync(gitignorePath)).toBe(true);
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        expect(content).toContain('.office/office.db');
        expect(content).toContain('.office/config.json');
      });

      it('should append to existing .gitignore preserving original content', () => {
        const projectDir = path.join(testRoot, 'existing-gitignore-proj');
        fs.mkdirSync(projectDir, { recursive: true });
        const gitignorePath = path.join(projectDir, '.gitignore');
        fs.writeFileSync(gitignorePath, 'node_modules\n.DS_Store\n');

        runInit(projectDir);

        const content = fs.readFileSync(gitignorePath, 'utf-8');
        expect(content).toContain('node_modules');
        expect(content).toContain('.DS_Store');
        expect(content).toContain('.office/office.db');
        expect(content).toContain('.office/config.json');
      });

      it('should not add duplicate entries if .office entries already exist', () => {
        const projectDir = path.join(testRoot, 'duplicate-check-proj');
        fs.mkdirSync(projectDir, { recursive: true });
        const gitignorePath = path.join(projectDir, '.gitignore');
        const initialContent = 'node_modules\n.office/office.db\n.office/config.json\n';
        fs.writeFileSync(gitignorePath, initialContent);

        runInit(projectDir);

        const content = fs.readFileSync(gitignorePath, 'utf-8');
        expect(content).toBe(initialContent);
      });

      it('should not append entries if .office/ directory is already ignored', () => {
        const projectDir = path.join(testRoot, 'dir-ignored-proj');
        fs.mkdirSync(projectDir, { recursive: true });
        const gitignorePath = path.join(projectDir, '.gitignore');
        const initialContent = 'node_modules\n.office/\n';
        fs.writeFileSync(gitignorePath, initialContent);

        runInit(projectDir);

        const content = fs.readFileSync(gitignorePath, 'utf-8');
        expect(content).toBe(initialContent);
      });
    });

    describe('Idempotency', () => {
      it('should be safe to re-run on already initialized project without overwriting data', () => {
        const projectDir = path.join(testRoot, 'idempotent-proj');
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'package.json'), '{}');

        // First run
        const first = runInit(projectDir);
        expect(first.baselineCreated).toBe(true);

        // Customize config
        const configPath = path.join(projectDir, '.office', 'config.json');
        const customConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        customConfig.soundVolume = 0.42;
        fs.writeFileSync(configPath, JSON.stringify(customConfig, null, 2));

        // Insert data into DB
        const dbPath = path.join(projectDir, '.office', 'office.db');
        const db = new Database(dbPath);
        db.prepare("INSERT INTO epics (id, title, description, status) VALUES ('E-1', 'Epic 1', 'Desc', 'DRAFT')").run();
        db.close();

        // Second run
        const second = runInit(projectDir);
        expect(second.baselineCreated).toBe(false);

        // Config should still have custom setting
        const reloadedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        expect(reloadedConfig.soundVolume).toBe(0.42);

        // DB should still retain previous epic
        const recheckDb = new Database(dbPath);
        const epic = recheckDb.prepare("SELECT * FROM epics WHERE id = 'E-1'").get() as any;
        expect(epic).toBeDefined();
        expect(epic.title).toBe('Epic 1');
        recheckDb.close();

        // .gitignore should not duplicate lines
        const gitignoreContent = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8');
        const matchesDb = gitignoreContent.match(/\.office\/office\.db/g);
        expect(matchesDb?.length).toBe(1);
      });
    });
  });

  describe('runStart', () => {
    it('should throw helpful error if .office directory is not initialized', async () => {
      const projectDir = path.join(testRoot, 'uninitialized-proj');
      fs.mkdirSync(projectDir, { recursive: true });

      await expect(runStart(projectDir)).rejects.toThrowError(/office init/i);
    });

    it('should throw helpful error if .office exists but config.json is missing', async () => {
      const projectDir = path.join(testRoot, 'broken-office-proj');
      fs.mkdirSync(path.join(projectDir, '.office'), { recursive: true });

      await expect(runStart(projectDir)).rejects.toThrowError(/office init/i);
    });

    it('should return valid port and URL when office is initialized', async () => {
      const projectDir = path.join(testRoot, 'valid-proj');
      fs.mkdirSync(projectDir, { recursive: true });
      runInit(projectDir);

      const serverInfo = await runStart(projectDir);
      expect(serverInfo.port).toBe(3000);
      expect(serverInfo.url).toBe('http://localhost:3000');
    });

    it('should respect custom port option', async () => {
      const projectDir = path.join(testRoot, 'custom-port-proj');
      fs.mkdirSync(projectDir, { recursive: true });
      runInit(projectDir);

      const serverInfo = await runStart(projectDir, { port: 8080 });
      expect(serverInfo.port).toBe(8080);
      expect(serverInfo.url).toBe('http://localhost:8080');
    });

    it('should accept openBrowser option without throwing', async () => {
      const projectDir = path.join(testRoot, 'browser-proj');
      fs.mkdirSync(projectDir, { recursive: true });
      runInit(projectDir);

      const serverInfo = await runStart(projectDir, { port: 3000, openBrowser: true });
      expect(serverInfo.port).toBe(3000);
      expect(serverInfo.url).toBe('http://localhost:3000');
    });
  });

  describe('CLI Entrypoint (runCli)', () => {
    it('should handle "init" command via args', async () => {
      const projectDir = path.join(testRoot, 'cli-init-proj');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'package.json'), '{}');

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCli(['init', projectDir]);

      expect(fs.existsSync(path.join(projectDir, '.office', 'config.json'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.office', 'office.db'))).toBe(true);
      expect(logSpy).toHaveBeenCalled();
    });

    it('should handle "start" command via args with port', async () => {
      const projectDir = path.join(testRoot, 'cli-start-proj');
      fs.mkdirSync(projectDir, { recursive: true });
      runInit(projectDir);

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await runCli(['start', projectDir, '--port', '4567']);
      expect(result).toBeDefined();
      expect(result.port).toBe(4567);
      expect(result.url).toBe('http://localhost:4567');
    });

    it('should show help when requested with --help or -h', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCli(['--help']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: office'));

      logSpy.mockClear();
      await runCli(['-h']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: office'));
    });

    it('should show version when requested with --version or -v', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runCli(['--version']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/0\.1\.0/));

      logSpy.mockClear();
      await runCli(['-v']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/0\.1\.0/));
    });

    it('should display help and error on unknown command', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(runCli(['unknown-cmd'])).rejects.toThrowError(/Unknown command/i);
    });
  });
});
