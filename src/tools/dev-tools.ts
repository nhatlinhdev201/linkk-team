import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';

export class DevTools {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

  private resolvePath(relPath: string): string {
    const target = path.resolve(this.rootDir, relPath);
    if (target !== this.rootDir && !target.startsWith(this.rootDir + path.sep)) {
      throw new Error(`Access denied: Target path ${relPath} outside workspace root`);
    }
    return target;
  }

  public readFile(relPath: string): string {
    const target = this.resolvePath(relPath);
    if (!fs.existsSync(target)) {
      throw new Error(`File not found: ${relPath}`);
    }
    return fs.readFileSync(target, 'utf-8');
  }

  public writeFile(relPath: string, content: string): void {
    const target = this.resolvePath(relPath);
    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(target, content, 'utf-8');
  }

  public listFiles(relDir: string = ''): string[] {
    const target = this.resolvePath(relDir);
    if (!fs.existsSync(target)) {
      return [];
    }
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) {
      return [path.relative(this.rootDir, target).split(path.sep).join('/')];
    }
    const entries = fs.readdirSync(target, { recursive: true });
    return entries
      .map((entry) => entry.toString())
      .filter((entryPath) => {
        try {
          return fs.statSync(path.join(target, entryPath)).isFile();
        } catch {
          return false;
        }
      })
      .map((entryPath) => entryPath.split(path.sep).join('/'));
  }

  public runCommand(cmd: string): { stdout: string; error?: string } {
    try {
      const output = execSync(cmd, {
        cwd: this.rootDir,
        timeout: 30000,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      return { stdout: output };
    } catch (err: any) {
      const stdout = err.stdout ? (typeof err.stdout === 'string' ? err.stdout : err.stdout.toString('utf-8')) : '';
      const stderr = err.stderr ? (typeof err.stderr === 'string' ? err.stderr : err.stderr.toString('utf-8')) : '';
      const errorMsg = err.message || stderr || 'Command failed';
      return {
        stdout,
        error: errorMsg
      };
    }
  }

  public getGitDiff(target?: string): string {
    try {
      const args = target ? ['diff', target] : ['diff'];
      const output = execFileSync('git', args, {
        cwd: this.rootDir,
        timeout: 15000,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      return output;
    } catch (err: any) {
      if (err && err.stdout) {
        return typeof err.stdout === 'string' ? err.stdout : err.stdout.toString('utf-8');
      }
      return '';
    }
  }
}
