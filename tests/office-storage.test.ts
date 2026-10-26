import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OfficeStorage } from '../src/storage/office-storage.js';
import fs from 'node:fs';
import path from 'node:path';

describe('OfficeStorage', () => {
  const testDir = path.join(process.cwd(), '.test-office-storage');
  let storage: OfficeStorage;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (storage) {
      storage.close();
    }
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should initialize database in WAL mode', () => {
    storage = new OfficeStorage(testDir);
    const db = storage.getDatabase();
    const journalMode = db.pragma('journal_mode', { simple: true });
    expect(journalMode).toBe('wal');
  });

  it('should create an epic, retrieve it, and update its status', () => {
    storage = new OfficeStorage(testDir);
    const created = storage.createEpic('EPIC-001', 'Auth Feature', 'JWT implementation', 10.0);
    expect(created.id).toBe('EPIC-001');
    expect(created.title).toBe('Auth Feature');
    expect(created.description).toBe('JWT implementation');
    expect(created.status).toBe('DRAFT');
    expect(created.budget_cap_usd).toBe(10.0);

    const fetched = storage.getEpic('EPIC-001');
    expect(fetched).toBeDefined();
    expect(fetched?.title).toBe('Auth Feature');
    expect(fetched?.budget_cap_usd).toBe(10.0);

    storage.updateEpicStatus('EPIC-001', 'IN_PROGRESS');
    const updated = storage.getEpic('EPIC-001');
    expect(updated?.status).toBe('IN_PROGRESS');

    const nonExistent = storage.getEpic('EPIC-999');
    expect(nonExistent).toBeUndefined();
  });

  it('should create tasks, move statuses, and query by epic', () => {
    storage = new OfficeStorage(testDir);
    storage.createEpic('EPIC-001', 'Auth Feature', 'JWT implementation');

    const task1 = storage.createTask('TASK-1', 'EPIC-001', 'Setup JWT utils', 'BACKEND');
    expect(task1.id).toBe('TASK-1');
    expect(task1.epic_id).toBe('EPIC-001');
    expect(task1.assigned_agent_id).toBe('BACKEND');
    expect(task1.status).toBe('BACKLOG');

    const task2 = storage.createTask('TASK-2', 'EPIC-001', 'Write auth unit tests', 'QA');
    expect(task2.id).toBe('TASK-2');
    expect(task2.assigned_agent_id).toBe('QA');

    const epicTasks = storage.getTasksByEpic('EPIC-001');
    expect(epicTasks.length).toBe(2);
    expect(epicTasks.map((t) => t.id)).toEqual(['TASK-1', 'TASK-2']);

    storage.moveTask('TASK-1', 'IN_PROGRESS');
    expect(storage.getTask('TASK-1')?.status).toBe('IN_PROGRESS');

    storage.moveTask('TASK-1', 'DONE');
    expect(storage.getTask('TASK-1')?.status).toBe('DONE');
  });

  it('should automatically sync markdown checklist on task creation and status changes', () => {
    storage = new OfficeStorage(testDir);
    storage.createEpic('EPIC-001', 'Auth Feature', 'JWT implementation');

    storage.createTask('TASK-1', 'EPIC-001', 'Setup JWT token utils', 'BACKEND');
    const markdownPath = path.join(testDir, 'epics', 'EPIC-001', 'tasks.md');
    expect(fs.existsSync(markdownPath)).toBe(true);

    let mdContent = fs.readFileSync(markdownPath, 'utf-8');
    expect(mdContent).toContain('# Tasks for EPIC-001');
    expect(mdContent).toContain('- [ ] TASK-1: Setup JWT token utils (BACKLOG)');

    storage.createTask('TASK-2', 'EPIC-001', 'Login UI form', 'FRONTEND');
    storage.moveTask('TASK-1', 'DONE');

    mdContent = fs.readFileSync(markdownPath, 'utf-8');
    expect(mdContent).toContain('- [x] TASK-1: Setup JWT token utils (DONE)');
    expect(mdContent).toContain('- [ ] TASK-2: Login UI form (BACKLOG)');
  });

  it('should log activity events and retrieve them with parsed payload', () => {
    storage = new OfficeStorage(testDir);
    storage.createEpic('EPIC-001', 'Auth Feature', 'JWT implementation');

    storage.logActivity('EPIC-001', 'agent-coder-1', 'TOOL_CALL', { tool: 'readFile', file: 'auth.ts' });
    storage.logActivity('EPIC-001', 'agent-coder-1', 'FILE_EDIT', { file: 'auth.ts', linesChanged: 15 });
    storage.logActivity('EPIC-002', 'agent-architect-1', 'PLAN_CREATED', { tasksCount: 3 });

    const epic1Logs = storage.getActivityLogs('EPIC-001');
    expect(epic1Logs.length).toBe(2);
    expect(epic1Logs[0].eventType).toBe('TOOL_CALL');
    expect(epic1Logs[0].payload).toEqual({ tool: 'readFile', file: 'auth.ts' });
    expect(epic1Logs[1].eventType).toBe('FILE_EDIT');

    const allLogs = storage.getActivityLogs();
    expect(allLogs.length).toBe(3);
  });

  it('should record quota and track accumulated cost per epic', () => {
    storage = new OfficeStorage(testDir);
    storage.createEpic('EPIC-001', 'Auth Feature', 'JWT implementation');

    storage.recordQuota('EPIC-001', 0.05);
    storage.recordQuota('EPIC-001', 0.12);
    storage.recordQuota('EPIC-002', 0.20);

    expect(storage.getTotalQuota('EPIC-001')).toBeCloseTo(0.17, 5);
    expect(storage.getTotalQuota('EPIC-002')).toBeCloseTo(0.20, 5);
    expect(storage.getTotalQuota()).toBeCloseTo(0.37, 5);
  });

  it('should apply default budget cap of 5.0 when budgetCap is omitted', () => {
    storage = new OfficeStorage(testDir);
    const epic = storage.createEpic('EPIC-DEFAULT', 'Default Budget', 'Testing default budget');
    expect(epic.budget_cap_usd).toBe(5.0);

    const fetched = storage.getEpic('EPIC-DEFAULT');
    expect(fetched?.budget_cap_usd).toBe(5.0);
  });

  it('should handle string activity payload and manual syncMarkdown call', () => {
    storage = new OfficeStorage(testDir);
    storage.createEpic('EPIC-SYNC', 'Sync Epic', 'Testing manual sync');
    storage.createTask('TASK-S1', 'EPIC-SYNC', 'Manual Task', 'ARCHITECT');

    storage.logActivity('EPIC-SYNC', 'agent-architect-1', 'SPEECH', 'Planning phase completed');
    const logs = storage.getActivityLogs('EPIC-SYNC');
    expect(logs.length).toBe(1);
    expect(logs[0].payload).toBe('Planning phase completed');

    storage.syncMarkdown('EPIC-SYNC');
    const mdPath = path.join(testDir, 'epics', 'EPIC-SYNC', 'tasks.md');
    expect(fs.existsSync(mdPath)).toBe(true);
    const md = fs.readFileSync(mdPath, 'utf-8');
    expect(md).toContain('TASK-S1: Manual Task (BACKLOG)');
  });
});

