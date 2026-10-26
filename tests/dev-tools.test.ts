import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DevTools } from '../src/tools/dev-tools.js';
import { ModelProviderHub, ChatMessage } from '../src/providers/provider-hub.js';
import { OfficeConfig } from '../src/types/office.js';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

describe('DevTools Engine', () => {
  const testRoot = path.join(process.cwd(), '.test-workspace-dev-tools');

  beforeEach(() => {
    if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true, force: true });
    fs.mkdirSync(testRoot, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true, force: true });
  });

  describe('Directory Traversal Protection & Security', () => {
    it('should throw Access denied when relative path traverses outside root (../)', () => {
      const tools = new DevTools(testRoot);
      expect(() => tools.readFile('../outside.txt')).toThrowError(
        /Access denied: Target path \.\.\/outside\.txt outside workspace root/
      );
    });

    it('should throw Access denied when write path traverses outside root (../../)', () => {
      const tools = new DevTools(testRoot);
      expect(() => tools.writeFile('../../outside.txt', 'evil content')).toThrowError(
        /Access denied: Target path \.\.\/\.\.\/outside\.txt outside workspace root/
      );
    });

    it('should throw Access denied on absolute path outside root', () => {
      const tools = new DevTools(testRoot);
      const absPath = path.resolve('/tmp/arbitrary-outside-file.txt');
      expect(() => tools.readFile(absPath)).toThrowError(
        new RegExp(`Access denied: Target path .* outside workspace root`)
      );
    });

    it('should throw Access denied on nested traversal attempt', () => {
      const tools = new DevTools(testRoot);
      expect(() => tools.readFile('nested/deep/../../../outside.txt')).toThrowError(/Access denied/);
    });

    it('should throw Access denied when listFiles targets path outside root', () => {
      const tools = new DevTools(testRoot);
      expect(() => tools.listFiles('../')).toThrowError(/Access denied/);
    });
  });

  describe('File Read & Write Operations', () => {
    it('should write and read files within root workspace, creating nested directories as needed', () => {
      const tools = new DevTools(testRoot);
      tools.writeFile('src/modules/auth.ts', 'export const token = "abc";');
      const content = tools.readFile('src/modules/auth.ts');
      expect(content).toBe('export const token = "abc";');
    });

    it('should overwrite existing file content', () => {
      const tools = new DevTools(testRoot);
      tools.writeFile('notes.txt', 'initial');
      expect(tools.readFile('notes.txt')).toBe('initial');
      tools.writeFile('notes.txt', 'updated');
      expect(tools.readFile('notes.txt')).toBe('updated');
    });

    it('should throw an error when reading non-existent file', () => {
      const tools = new DevTools(testRoot);
      expect(() => tools.readFile('missing.txt')).toThrowError(/File not found: missing\.txt/);
    });
  });

  describe('listFiles', () => {
    it('should list all files recursively relative to root and allow direct readFile', () => {
      const tools = new DevTools(testRoot);
      tools.writeFile('index.ts', 'console.log("root");');
      tools.writeFile('src/app.ts', 'export default {};');
      tools.writeFile('src/utils/helpers.ts', 'export const add = () => {};');

      const files = tools.listFiles();
      expect(files.sort()).toEqual([
        'index.ts',
        'src/app.ts',
        'src/utils/helpers.ts'
      ].sort());

      // Each returned path is relative to rootDir and can be read directly
      for (const f of files) {
        expect(tools.readFile(f)).toBeDefined();
      }
    });

    it('should list files within a specific subfolder returning paths relative to rootDir', () => {
      const tools = new DevTools(testRoot);
      tools.writeFile('root.txt', 'root');
      tools.writeFile('nested/a.txt', 'a content');
      tools.writeFile('nested/sub/b.txt', 'b content');

      const files = tools.listFiles('nested');
      expect(files.sort()).toEqual([
        'nested/a.txt',
        'nested/sub/b.txt'
      ].sort());

      // Directly readable
      expect(tools.readFile(files[0])).toBe('a content');
    });

    it('should skip default ignored folders like node_modules, .git, dist, and .cache', () => {
      const tools = new DevTools(testRoot);
      tools.writeFile('src/index.ts', 'export const ok = 1;');
      tools.writeFile('node_modules/pkg/index.js', 'module.exports = {};');
      tools.writeFile('.git/objects/abc', 'fake-git-object');
      tools.writeFile('dist/bundle.js', 'console.log("bundle");');
      tools.writeFile('.cache/temp.data', 'cached');

      const files = tools.listFiles();
      expect(files).toEqual(['src/index.ts']);
    });

    it('should allow custom ignoredFolders to be provided', () => {
      const tools = new DevTools(testRoot);
      tools.writeFile('src/index.ts', 'export const ok = 1;');
      tools.writeFile('build/output.js', 'output');
      tools.writeFile('temp/temp.txt', 'temp');

      const files = tools.listFiles('', ['build', 'temp']);
      expect(files).toEqual(['src/index.ts']);
    });

    it('should return empty array if directory does not exist', () => {
      const tools = new DevTools(testRoot);
      expect(tools.listFiles('nonexistent')).toEqual([]);
    });
  });

  describe('runCommand', () => {
    it('should execute command in the workspace root cwd and capture stdout', () => {
      const tools = new DevTools(testRoot);
      const res = tools.runCommand('node -e "console.log(process.cwd())"');
      expect(res.error).toBeUndefined();
      // On macOS /var vs /private/var can be symlinked, so resolve both
      expect(fs.realpathSync(res.stdout.trim())).toBe(fs.realpathSync(testRoot));
    });

    it('should capture error when command fails without crashing', () => {
      const tools = new DevTools(testRoot);
      const res = tools.runCommand('node -e "console.error(\'failed!\'); process.exit(1);"');
      expect(res.error).toBeDefined();
    });
  });

  describe('getGitDiff', () => {
    it('should return empty string when workspace is not a git repo or has no diff', () => {
      const tools = new DevTools(testRoot);
      expect(tools.getGitDiff()).toBe('');
    });

    it('should return diff of uncommitted changes in a git repo', () => {
      // Initialize a temporary git repo inside testRoot
      execSync('git init -b main', { cwd: testRoot });
      execSync('git config user.email "test@example.com"', { cwd: testRoot });
      execSync('git config user.name "Test User"', { cwd: testRoot });

      const tools = new DevTools(testRoot);
      tools.writeFile('hello.txt', 'line 1\n');
      execSync('git add hello.txt', { cwd: testRoot });
      execSync('git commit -m "initial commit"', { cwd: testRoot });

      // Modify the file
      tools.writeFile('hello.txt', 'line 1\nline 2\n');

      const diff = tools.getGitDiff();
      expect(diff).toContain('+line 2');

      const headDiff = tools.getGitDiff('HEAD');
      expect(headDiff).toContain('+line 2');
    });
  });
});

describe('ModelProviderHub', () => {
  const dummyConfig: OfficeConfig = {
    proxyBaseUrl: 'http://localhost:8000/v1',
    apiKey: 'sk-test-proxy-key',
    roleModels: {
      ARCHITECT: 'claude-3-5-sonnet',
      FRONTEND: 'claude-3-5-sonnet',
      BACKEND: 'claude-3-5-sonnet',
      QA: 'gpt-4o-mini',
      DEVOPS: 'claude-3-5-sonnet'
    },
    soundEnabled: false,
    soundVolume: 0.5,
    simulationSpeed: 1.0,
    defaultBudgetCapUsd: 5.0,
    autoPauseThreshold: 0.8,
    requirePlanApproval: true,
    requireMergeApproval: true,
    ignoredFolders: ['node_modules']
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call chat completions endpoint with AbortSignal timeout and return CompletionResult', async () => {
    const hub = new ModelProviderHub(dummyConfig);
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are an architect.' },
      { role: 'user', content: 'Create plan' }
    ];

    const mockResponseData = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Architecture plan finalized.'
          }
        }
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150
      },
      model: 'claude-3-5-sonnet'
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponseData), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const result = await hub.callChatCompletion(messages, 'ARCHITECT');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOptions] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe('http://localhost:8000/v1/chat/completions');
    expect(calledOptions?.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test-proxy-key'
    });
    expect(calledOptions?.signal).toBeInstanceOf(AbortSignal);

    const parsedBody = JSON.parse(calledOptions?.body as string);
    expect(parsedBody.model).toBe('claude-3-5-sonnet');
    expect(parsedBody.messages).toEqual(messages);

    expect(result.content).toBe('Architecture plan finalized.');
    expect(result.promptTokens).toBe(100);
    expect(result.completionTokens).toBe(50);
    expect(result.totalTokens).toBe(150);
    expect(result.model).toBe('claude-3-5-sonnet');
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it('should route model based on agent role (e.g. QA -> gpt-4o-mini)', async () => {
    const hub = new ModelProviderHub(dummyConfig);
    const messages: ChatMessage[] = [{ role: 'user', content: 'Run test suite' }];

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'Tests passed.' } }],
          usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
        }),
        { status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await hub.callChatCompletion(messages, 'QA');
    const calledOptions = fetchSpy.mock.calls[0][1];
    const parsedBody = JSON.parse(calledOptions?.body as string);

    expect(parsedBody.model).toBe('gpt-4o-mini');
    expect(result.content).toBe('Tests passed.');
  });

  it('should respect customModel override over role model', async () => {
    const hub = new ModelProviderHub(dummyConfig);
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'Custom response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        }),
        { status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json' } }
      )
    );

    await hub.callChatCompletion(messages, 'QA', 'deepseek-coder');
    const calledOptions = fetchSpy.mock.calls[0][1];
    const parsedBody = JSON.parse(calledOptions?.body as string);

    expect(parsedBody.model).toBe('deepseek-coder');
  });

  it('should throw descriptive error when proxy returns HTTP 500 with JSON body', async () => {
    const hub = new ModelProviderHub(dummyConfig);
    const messages: ChatMessage[] = [{ role: 'user', content: 'Trigger error' }];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { message: 'Provider rate limit exceeded' } }),
        { status: 500, statusText: 'Internal Server Error', headers: { 'Content-Type': 'application/json' } }
      )
    );

    await expect(hub.callChatCompletion(messages)).rejects.toThrowError(
      /Proxy error.*500.*Provider rate limit exceeded/
    );
  });

  it('should throw descriptive error when proxy returns HTTP error with plain text without stream errors', async () => {
    const hub = new ModelProviderHub(dummyConfig);
    const messages: ChatMessage[] = [{ role: 'user', content: 'Trigger 401' }];

    // Real Response instance with text/plain body
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Invalid API key provided', {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'Content-Type': 'text/plain' }
      })
    );

    await expect(hub.callChatCompletion(messages)).rejects.toThrowError(
      /Proxy error.*401.*Invalid API key provided/
    );
  });

  describe('calculateCost', () => {
    it('should correctly calculate USD cost for claude-3-5-sonnet', () => {
      const hub = new ModelProviderHub(dummyConfig);
      // 1000 prompt @ 0.003/1k = 0.003, 1000 completion @ 0.015/1k = 0.015 -> 0.018
      const cost = hub.calculateCost(1000, 1000, 'claude-3-5-sonnet');
      expect(cost).toBeCloseTo(0.018, 5);
    });

    it('should correctly calculate USD cost for gpt-4o-mini', () => {
      const hub = new ModelProviderHub(dummyConfig);
      // 1000 prompt @ 0.00015/1k = 0.00015, 1000 completion @ 0.0006/1k = 0.0006 -> 0.00075
      const cost = hub.calculateCost(1000, 1000, 'gpt-4o-mini');
      expect(cost).toBeCloseTo(0.00075, 5);
    });

    it('should prioritize longer model prefix match (gpt-4o-mini over gpt-4o)', () => {
      const hub = new ModelProviderHub(dummyConfig);
      // gpt-4o-mini-2024-07-18 contains both "gpt-4o" and "gpt-4o-mini".
      // It must match "gpt-4o-mini" (0.00075) rather than "gpt-4o" (0.0125).
      const cost = hub.calculateCost(1000, 1000, 'gpt-4o-mini-2024-07-18');
      expect(cost).toBeCloseTo(0.00075, 5);
    });

    it('should return 0 when tokens are 0', () => {
      const hub = new ModelProviderHub(dummyConfig);
      expect(hub.calculateCost(0, 0, 'claude-3-5-sonnet')).toBe(0);
    });
  });
});
