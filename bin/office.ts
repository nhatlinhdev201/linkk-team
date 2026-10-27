#!/usr/bin/env -S npx tsx

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigManager } from '../src/config/config-manager.js';
import { OfficeStorage } from '../src/storage/office-storage.js';

export const CLI_VERSION = '0.1.0';

export interface InitResult {
  officeDir: string;
  detectedStack: string[];
  baselineCreated: boolean;
}

export interface StartOptions {
  port?: number;
  openBrowser?: boolean;
}

export interface StartResult {
  port: number;
  url: string;
}

/**
 * Initializes .office directory, configuration, storage, and codebase onboarding baseline snapshot.
 */
export function runInit(targetDir: string): InitResult {
  const resolvedTarget = path.resolve(targetDir);
  const officeDir = path.join(resolvedTarget, '.office');

  if (!fs.existsSync(officeDir)) {
    fs.mkdirSync(officeDir, { recursive: true });
  }

  // 1. Initialize config.json
  const configPath = path.join(officeDir, 'config.json');
  new ConfigManager(configPath);

  // 2. Initialize office.db
  const storage = new OfficeStorage(officeDir);
  storage.close();

  // 3. Codebase Onboarding Scanner
  const detectedStack: string[] = [];
  if (fs.existsSync(path.join(resolvedTarget, 'package.json'))) {
    detectedStack.push('Node.js / TypeScript / JavaScript');
  }
  if (fs.existsSync(path.join(resolvedTarget, 'Cargo.toml'))) {
    detectedStack.push('Rust');
  }
  if (
    fs.existsSync(path.join(resolvedTarget, 'requirements.txt')) ||
    fs.existsSync(path.join(resolvedTarget, 'pyproject.toml'))
  ) {
    detectedStack.push('Python');
  }
  if (fs.existsSync(path.join(resolvedTarget, 'go.mod'))) {
    detectedStack.push('Go');
  }

  // 4. Genesis Snapshot in baseline.json (machine-independent relative path)
  const baselinePath = path.join(officeDir, 'baseline.json');
  let baselineCreated = false;
  if (!fs.existsSync(baselinePath)) {
    const projectName = path.basename(resolvedTarget);
    const baselineData = {
      projectName,
      targetDir: '.',
      detectedStack,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(baselinePath, JSON.stringify(baselineData, null, 2), 'utf-8');
    baselineCreated = true;
  }

  // 5. Gitignore management (handles DB, SQLite WAL auxiliary files, and config.json)
  const gitignorePath = path.join(resolvedTarget, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, '.office/office.db*\n.office/config.json\n', 'utf-8');
  } else {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    const lines = content.split(/\r?\n/).map((l) => l.trim());
    const hasEntireOfficeDir =
      lines.includes('.office') ||
      lines.includes('.office/') ||
      lines.includes('.office/*') ||
      lines.includes('.office/**');

    if (!hasEntireOfficeDir) {
      const toAdd: string[] = [];
      const hasDbWildcard = lines.includes('.office/office.db*');
      const hasDb = lines.includes('.office/office.db');

      if (!hasDbWildcard) {
        if (!hasDb) {
          toAdd.push('.office/office.db*');
        } else {
          // If .office/office.db is already listed, ensure SQLite WAL and SHM files are also ignored
          if (!lines.includes('.office/office.db-wal')) {
            toAdd.push('.office/office.db-wal');
          }
          if (!lines.includes('.office/office.db-shm')) {
            toAdd.push('.office/office.db-shm');
          }
        }
      }

      if (!lines.includes('.office/config.json')) {
        toAdd.push('.office/config.json');
      }

      if (toAdd.length > 0) {
        const needsLeadingNewline = content.length > 0 && !content.endsWith('\n');
        const appendContent = (needsLeadingNewline ? '\n' : '') + toAdd.join('\n') + '\n';
        fs.appendFileSync(gitignorePath, appendContent, 'utf-8');
      }
    }
  }

  return {
    officeDir,
    detectedStack,
    baselineCreated
  };
}

/**
 * Validates office initialization and starts the dashboard.
 */
export async function runStart(
  targetDir: string,
  options?: StartOptions
): Promise<StartResult> {
  const resolvedTarget = path.resolve(targetDir);
  const officeDir = path.join(resolvedTarget, '.office');
  const configPath = path.join(officeDir, 'config.json');
  const dbPath = path.join(officeDir, 'office.db');

  if (!fs.existsSync(officeDir) || !fs.existsSync(configPath) || !fs.existsSync(dbPath)) {
    throw new Error(
      `Office is not initialized in "${resolvedTarget}". Please run "office init" first.`
    );
  }

  let port = 3000;
  if (options?.port !== undefined) {
    if (
      typeof options.port !== 'number' ||
      isNaN(options.port) ||
      !Number.isInteger(options.port) ||
      options.port < 1 ||
      options.port > 65535
    ) {
      throw new Error(`Invalid port: ${options.port}. Port must be an integer between 1 and 65535.`);
    }
    port = options.port;
  }

  const url = `http://localhost:${port}`;

  console.log(`Starting 2D Agent Office dashboard at ${url}`);

  if (options?.openBrowser) {
    console.log(`Opening browser at ${url}...`);
  }

  return { port, url };
}

/**
 * CLI Entrypoint argument parser and executor.
 */
export async function runCli(
  argv: string[] = process.argv.slice(2)
): Promise<InitResult | StartResult | void> {
  const command = argv[0];

  // If help flag is provided anywhere in argv or no command given, show help early
  if (
    !command ||
    argv.includes('--help') ||
    argv.includes('-h') ||
    command === 'help'
  ) {
    console.log(`
Usage: office <command> [options]

Commands:
  init [dir]           Initialize 2D Agent Office in target directory (default: current dir)
  start [dir]          Start the 2D Agent Office dashboard

Options:
  -p, --port <number>  Port for dashboard server (default: 3000)
  --open               Open dashboard in browser
  -v, --version        Show version number
  -h, --help           Show help
`);
    return;
  }

  if (command === '--version' || command === '-v' || command === 'version') {
    console.log(`office v${CLI_VERSION}`);
    return;
  }

  if (command === 'init') {
    let targetDir = process.cwd();
    if (argv[1] && !argv[1].startsWith('-')) {
      targetDir = argv[1];
    }
    const result = runInit(targetDir);
    console.log(`Initialized 2D Agent Office at ${result.officeDir}`);
    if (result.detectedStack.length > 0) {
      console.log(`Detected tech stack: ${result.detectedStack.join(', ')}`);
    }
    if (result.baselineCreated) {
      console.log('Created genesis baseline snapshot (.office/baseline.json)');
    }
    return result;
  }

  if (command === 'start') {
    let targetDir = process.cwd();
    let port: number | undefined;
    let openBrowser = false;

    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === '--port' || arg === '-p') {
        const next = argv[i + 1];
        if (next && /^\d+$/.test(next)) {
          const parsedPort = parseInt(next, 10);
          if (parsedPort >= 1 && parsedPort <= 65535) {
            port = parsedPort;
            i++; // Safely consume next numeric argument
          } else {
            throw new Error(`Invalid port "${next}". Port must be between 1 and 65535.`);
          }
        } else if (next && !next.startsWith('-')) {
          throw new Error(`Invalid port "${next}". Port must be an integer between 1 and 65535.`);
        } else {
          throw new Error(`Missing port value after "${arg}". Port must be an integer between 1 and 65535.`);
        }
      } else if (arg.startsWith('--port=')) {
        const val = arg.split('=')[1];
        if (/^\d+$/.test(val)) {
          const parsedPort = parseInt(val, 10);
          if (parsedPort >= 1 && parsedPort <= 65535) {
            port = parsedPort;
          } else {
            throw new Error(`Invalid port "${val}". Port must be between 1 and 65535.`);
          }
        } else {
          throw new Error(`Invalid port "${val}". Port must be an integer between 1 and 65535.`);
        }
      } else if (arg === '--open' || arg === '--open-browser') {
        openBrowser = true;
      } else if (!arg.startsWith('-')) {
        targetDir = arg;
      }
    }

    const result = await runStart(targetDir, { port, openBrowser });
    return result;
  }

  console.error(`Unknown command: ${command}`);
  console.log('Run "office --help" to see available commands.');
  throw new Error(`Unknown command "${command}"`);
}

function isDirectExecution(): boolean {
  if (typeof process === 'undefined' || !process.argv || !process.argv[1]) {
    return false;
  }
  try {
    const fileUrl = fileURLToPath(import.meta.url);
    const invoked = path.resolve(process.argv[1]);
    if (invoked === fileUrl) return true;
    if (fs.existsSync(invoked) && fs.existsSync(fileUrl)) {
      return fs.realpathSync(invoked) === fs.realpathSync(fileUrl);
    }
    return false;
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  runCli().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
