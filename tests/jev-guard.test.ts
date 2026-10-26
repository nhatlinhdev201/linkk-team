import { describe, it, expect } from 'vitest';
import {
  JevGuard,
  jevGuard,
  ToolHistoryEntry,
  LoopCheckResult,
  FastTriageResult,
} from '../src/guards/jev-guard.js';
import { AgentRole } from '../src/types/office.js';

describe('JevGuard - Loop Breaker (checkLoop)', () => {
  it('detects infinite edit loop when identical failures on same tool and target repeat 3 times', () => {
    const guard = new JevGuard();
    const history: ToolHistoryEntry[] = [
      { tool: 'edit_file', target: 'src/auth.ts', error: 'SyntaxError: unexpected token' },
      { tool: 'edit_file', target: 'src/auth.ts', error: 'SyntaxError: unexpected token' },
      { tool: 'edit_file', target: 'src/auth.ts', error: 'SyntaxError: unexpected token' },
    ];

    const result = guard.checkLoop(history);
    expect(result.isStuck).toBe(true);
    expect(result.tool).toBe('edit_file');
    expect(result.target).toBe('src/auth.ts');
    expect(result.reason).toContain('Repeated identical failure in src/auth.ts');
    expect(result.reason).toContain('3x');
  });

  it('respects custom threshold for loop detection', () => {
    const guard = new JevGuard();
    const history: ToolHistoryEntry[] = [
      { tool: 'run_command', target: 'npm test', error: 'Command failed with exit code 1' },
      { tool: 'run_command', target: 'npm test', error: 'Command failed with exit code 1' },
    ];

    // Default threshold is 3, so 2 entries should NOT trigger stuck
    expect(guard.checkLoop(history, 3).isStuck).toBe(false);

    // With threshold = 2, it should trigger stuck
    const result2 = guard.checkLoop(history, 2);
    expect(result2.isStuck).toBe(true);
    expect(result2.tool).toBe('run_command');
    expect(result2.target).toBe('npm test');

    // With threshold = 4 and 4 identical errors
    const history4: ToolHistoryEntry[] = [
      ...history,
      { tool: 'run_command', target: 'npm test', error: 'Command failed with exit code 1' },
      { tool: 'run_command', target: 'npm test', error: 'Command failed with exit code 1' },
    ];
    expect(guard.checkLoop(history4, 4).isStuck).toBe(true);
  });

  it('handles tool history entries without a target', () => {
    const guard = new JevGuard();
    const history: ToolHistoryEntry[] = [
      { tool: 'git_status', error: 'fatal: not a git repository' },
      { tool: 'git_status', error: 'fatal: not a git repository' },
      { tool: 'git_status', error: 'fatal: not a git repository' },
    ];

    const result = guard.checkLoop(history);
    expect(result.isStuck).toBe(true);
    expect(result.tool).toBe('git_status');
    expect(result.target).toBeUndefined();
    expect(result.reason).toContain('git_status');
  });

  it('does not trigger on non-identical errors', () => {
    const guard = new JevGuard();
    const history: ToolHistoryEntry[] = [
      { tool: 'edit_file', target: 'src/auth.ts', error: 'SyntaxError: unexpected token' },
      { tool: 'edit_file', target: 'src/auth.ts', error: 'TypeError: undefined is not a function' },
      { tool: 'edit_file', target: 'src/auth.ts', error: 'SyntaxError: unexpected token' },
    ];

    const result = guard.checkLoop(history);
    expect(result.isStuck).toBe(false);
  });

  it('does not trigger on identical errors on different targets', () => {
    const guard = new JevGuard();
    const history: ToolHistoryEntry[] = [
      { tool: 'edit_file', target: 'src/auth.ts', error: 'File not found' },
      { tool: 'edit_file', target: 'src/user.ts', error: 'File not found' },
      { tool: 'edit_file', target: 'src/auth.ts', error: 'File not found' },
    ];

    const result = guard.checkLoop(history);
    expect(result.isStuck).toBe(false);
  });

  it('does not trigger on successful calls (error undefined or empty)', () => {
    const guard = new JevGuard();
    const history: ToolHistoryEntry[] = [
      { tool: 'read_file', target: 'src/auth.ts' },
      { tool: 'read_file', target: 'src/auth.ts' },
      { tool: 'read_file', target: 'src/auth.ts' },
    ];

    const result = guard.checkLoop(history);
    expect(result.isStuck).toBe(false);
  });

  it('does not trigger if recent call was successful even after consecutive errors', () => {
    const guard = new JevGuard();
    const history: ToolHistoryEntry[] = [
      { tool: 'edit_file', target: 'src/auth.ts', error: 'SyntaxError' },
      { tool: 'edit_file', target: 'src/auth.ts', error: 'SyntaxError' },
      { tool: 'edit_file', target: 'src/auth.ts' }, // success!
    ];

    const result = guard.checkLoop(history);
    expect(result.isStuck).toBe(false);
  });

  it('does not trigger if history length is less than threshold', () => {
    const guard = new JevGuard();
    expect(guard.checkLoop([]).isStuck).toBe(false);
    expect(
      guard.checkLoop([
        { tool: 'edit_file', target: 'src/auth.ts', error: 'SyntaxError' },
        { tool: 'edit_file', target: 'src/auth.ts', error: 'SyntaxError' },
      ]).isStuck
    ).toBe(false);
  });

  it('only inspects the most recent consecutive entries (tail of history)', () => {
    const guard = new JevGuard();
    const history: ToolHistoryEntry[] = [
      // 3 identical errors in the past:
      { tool: 'edit_file', target: 'src/old.ts', error: 'OldError' },
      { tool: 'edit_file', target: 'src/old.ts', error: 'OldError' },
      { tool: 'edit_file', target: 'src/old.ts', error: 'OldError' },
      // But now recovered with new operations:
      { tool: 'edit_file', target: 'src/auth.ts', error: 'OtherError' },
      { tool: 'read_file', target: 'src/auth.ts' },
      { tool: 'read_file', target: 'src/user.ts' },
    ];

    const result = guard.checkLoop(history);
    expect(result.isStuck).toBe(false);
  });

  it('executes checkLoop in sub-10ms for 1000 items', () => {
    const guard = new JevGuard();
    const history: ToolHistoryEntry[] = [];
    for (let i = 0; i < 997; i++) {
      history.push({
        tool: `tool_${i % 5}`,
        target: `file_${i % 10}.ts`,
        timestamp: Date.now() - (1000 - i) * 1000,
        error: i % 2 === 0 ? `Error_${i}` : undefined,
      });
    }
    // Tail has 3 identical errors
    history.push({ tool: 'edit_file', target: 'src/loop.ts', error: 'LoopError' });
    history.push({ tool: 'edit_file', target: 'src/loop.ts', error: 'LoopError' });
    history.push({ tool: 'edit_file', target: 'src/loop.ts', error: 'LoopError' });

    expect(history.length).toBe(1000);

    const start = performance.now();
    const result = guard.checkLoop(history);
    const duration = performance.now() - start;

    expect(result.isStuck).toBe(true);
    expect(duration).toBeLessThan(10); // sub-10ms requirement

    // Benchmark 1000 calls to checkLoop to prove high throughput
    const startBatch = performance.now();
    for (let i = 0; i < 1000; i++) {
      guard.checkLoop(history);
    }
    const batchDuration = performance.now() - startBatch;
    expect(batchDuration).toBeLessThan(50); // 1000 calls in < 50ms (average < 0.05ms)
  });
});

describe('JevGuard - Thought Summarizer (summarizeThought)', () => {
  it('handles empty or whitespace thoughts gracefully with a default placeholder', () => {
    const guard = new JevGuard();
    expect(guard.summarizeThought('')).toBe('Đang suy nghĩ...');
    expect(guard.summarizeThought('   \n\t  ')).toBe('Đang suy nghĩ...');
  });

  it('summarizes test execution thoughts concisely in Vietnamese or 5-8 words', () => {
    const guard = new JevGuard();
    const thought = 'I am now running vitest across all test suites to verify that the bug is resolved.';
    const summary = guard.summarizeThought(thought);
    expect(summary).toBe('Đang chạy kiểm thử...');
  });

  it('summarizes coding and editing thoughts concisely in Vietnamese', () => {
    const guard = new JevGuard();
    const thought1 = 'I will edit src/guards/jev-guard.ts to implement the checkLoop algorithm.';
    expect(guard.summarizeThought(thought1)).toBe('Đang viết mã nguồn...');

    const thought2 = 'Writing the new component implementation for the user card.';
    expect(guard.summarizeThought(thought2)).toBe('Đang viết mã nguồn...');
  });

  it('summarizes AST analysis and review thoughts concisely in Vietnamese', () => {
    const guard = new JevGuard();
    const thought =
      'I am currently analyzing the AST of src/auth.ts to identify why the bcrypt hash function is throwing an invalid salt error during the integration test execution.';
    const summary = guard.summarizeThought(thought);
    expect(summary).toBe('Đang phân tích cấu trúc...');
  });

  it('summarizes planning and architecture thoughts concisely in Vietnamese', () => {
    const guard = new JevGuard();
    const thought = 'Let us plan the architecture of the new persistence storage layer and database tables.';
    expect(guard.summarizeThought(thought)).toBe('Đang lập kế hoạch...');
  });

  it('summarizes deployment and docker thoughts concisely in Vietnamese', () => {
    const guard = new JevGuard();
    const thought = 'Setting up the docker container and deploying the pipeline configuration.';
    expect(guard.summarizeThought(thought)).toBe('Đang triển khai môi trường...');
  });

  it('summarizes debugging thoughts concisely in Vietnamese', () => {
    const guard = new JevGuard();
    const thought = 'Debugging the race condition and fixing the unexpected token error.';
    expect(guard.summarizeThought(thought)).toBe('Đang gỡ lỗi sự cố...');
  });

  it('compresses generic thoughts into short, punchy text of 5 to 8 words', () => {
    const guard = new JevGuard();
    const generic =
      'Checking all existing configuration variables in settings file to ensure valid environment values.';
    const summary = guard.summarizeThought(generic);
    const words = summary.split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThanOrEqual(1);
    expect(words.length).toBeLessThanOrEqual(8);
  });

  it('strips thought XML tags and markdown before summarizing', () => {
    const guard = new JevGuard();
    const thoughtWithTags = '<thought>\n**Analyzing** the system logs to identify memory usage.\n</thought>';
    const summary = guard.summarizeThought(thoughtWithTags);
    expect(summary).toBe('Đang phân tích cấu trúc...');
  });
});

describe('JevGuard - Squad Recommender (recommendSquad)', () => {
  it('always includes ARCHITECT and QA by default for minimal epic', () => {
    const guard = new JevGuard();
    const squad = guard.recommendSquad('General project coordination and quality audit');
    expect(squad).toContain('ARCHITECT');
    expect(squad).toContain('QA');
    expect(squad.length).toBe(2);
  });

  it('recommends FRONTEND when UI/CSS/frontend/button/client is mentioned', () => {
    const guard = new JevGuard();
    const epics = [
      'Build user dashboard UI with custom button styles',
      'Update the CSS styles for responsive layout',
      'Refactor frontend client bundle size',
      'Create interactive client-side widgets',
    ];

    for (const epic of epics) {
      const squad = guard.recommendSquad(epic);
      expect(squad).toContain('ARCHITECT');
      expect(squad).toContain('FRONTEND');
      expect(squad).toContain('QA');
      expect(squad).not.toContain('BACKEND');
      expect(squad).not.toContain('DEVOPS');
    }
  });

  it('recommends BACKEND when API/DB/backend/auth/database/server is mentioned', () => {
    const guard = new JevGuard();
    const epics = [
      'Create GraphQL API endpoints for user profiles',
      'Optimize SQL database queries and indexes',
      'Implement JWT auth and authentication middleware',
      'Setup Node.js backend server services',
      'Configure DB connection pool',
    ];

    for (const epic of epics) {
      const squad = guard.recommendSquad(epic);
      expect(squad).toContain('ARCHITECT');
      expect(squad).toContain('BACKEND');
      expect(squad).toContain('QA');
      expect(squad).not.toContain('FRONTEND');
      expect(squad).not.toContain('DEVOPS');
    }
  });

  it('recommends DEVOPS when docker/ci/cd/deploy/kubernetes/pipeline is mentioned', () => {
    const guard = new JevGuard();
    const epics = [
      'Build docker container images for production release',
      'Setup CI/CD deployment pipeline on GitHub Actions',
      'Deploy service onto Kubernetes cluster',
      'Configure continuous integration and deployment pipeline',
    ];

    for (const epic of epics) {
      const squad = guard.recommendSquad(epic);
      expect(squad).toContain('ARCHITECT');
      expect(squad).toContain('DEVOPS');
      expect(squad).toContain('QA');
      expect(squad).not.toContain('FRONTEND');
      expect(squad).not.toContain('BACKEND');
    }
  });

  it('recommends full squad for fullstack applications with devops pipeline', () => {
    const guard = new JevGuard();
    const epic =
      'Build a fullstack platform with React frontend UI, Node.js backend API and auth database, deployed via docker kubernetes pipeline';
    const squad = guard.recommendSquad(epic);

    expect(squad).toEqual(['ARCHITECT', 'FRONTEND', 'BACKEND', 'DEVOPS', 'QA']);
  });

  it('does not falsely trigger keywords on substring matches like build (ui) or decide (ci/cd)', () => {
    const guard = new JevGuard();
    // 'build' contains 'ui', 'decide' contains 'ci' and 'cd'
    const epic = 'Please build a quick guide and decide on product requirements';
    const squad = guard.recommendSquad(epic);

    // Should only contain ARCHITECT and QA, not FRONTEND or DEVOPS
    expect(squad).toEqual(['ARCHITECT', 'QA']);
  });

  it('returns unique roles with no duplicates', () => {
    const guard = new JevGuard();
    const squad = guard.recommendSquad('UI frontend button client with UI and CSS');
    const unique = Array.from(new Set(squad));
    expect(squad.length).toBe(unique.length);
  });
});

describe('JevGuard - Fast Triage (fastTriage)', () => {
  it('executes in sub-millisecond time', () => {
    const guard = new JevGuard();
    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      guard.fastTriage('Implement user authentication service');
    }
    const elapsed = performance.now() - start;
    // 200 triage runs should take < 10ms (sub-0.05ms per call)
    expect(elapsed).toBeLessThan(10);
  });

  it('triages LOW complexity tasks to QA', () => {
    const guard = new JevGuard();
    const lowTasks = [
      'Fix typo in README documentation',
      'Update comments in config file',
      'Format code with linter and style check',
      'Minor rename of variable',
      'Trivial documentation typo fix',
    ];

    for (const task of lowTasks) {
      const result = guard.fastTriage(task);
      expect(result.complexity).toBe('LOW');
      expect(result.suggestedModelRole).toBe('QA');
    }
  });

  it('triages MEDIUM complexity tasks to BACKEND', () => {
    const guard = new JevGuard();
    const medTasks = [
      'Implement user authentication API endpoint',
      'Create CRUD handlers for office epics',
      'Add unit tests for markdown sync module',
      'Fix bug in token refresh handler',
      'Update storage schema query',
    ];

    for (const task of medTasks) {
      const result = guard.fastTriage(task);
      expect(result.complexity).toBe('MEDIUM');
      expect(result.suggestedModelRole).toBe('BACKEND');
    }
  });

  it('triages HIGH complexity tasks to ARCHITECT', () => {
    const guard = new JevGuard();
    const highTasks = [
      'Architect distributed microservices event bus with consensus',
      'Complete system redesign and database migration with security overhaul',
      'Core architecture refactor for multi-tenant scalability',
      'Design distributed concurrency lock for cluster synchronization',
    ];

    for (const task of highTasks) {
      const result = guard.fastTriage(task);
      expect(result.complexity).toBe('HIGH');
      expect(result.suggestedModelRole).toBe('ARCHITECT');
    }
  });
});

describe('JevGuard - Static and Instance Invocation', () => {
  it('supports static calls directly on JevGuard class and exported jevGuard singleton', () => {
    const history: ToolHistoryEntry[] = [
      { tool: 'edit_file', target: 'a.ts', error: 'err' },
      { tool: 'edit_file', target: 'a.ts', error: 'err' },
      { tool: 'edit_file', target: 'a.ts', error: 'err' },
    ];

    // Static call
    expect(JevGuard.checkLoop(history).isStuck).toBe(true);
    expect(JevGuard.summarizeThought('')).toBe('Đang suy nghĩ...');
    expect(JevGuard.recommendSquad('UI and API')).toContain('FRONTEND');
    expect(JevGuard.fastTriage('Fix typo').complexity).toBe('LOW');

    // Exported singleton
    expect(jevGuard.checkLoop(history).isStuck).toBe(true);
    expect(jevGuard.summarizeThought('')).toBe('Đang suy nghĩ...');
    expect(jevGuard.recommendSquad('UI and API')).toContain('BACKEND');
    expect(jevGuard.fastTriage('Fix typo').complexity).toBe('LOW');
  });
});
