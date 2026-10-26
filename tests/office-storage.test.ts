import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OfficeStorage, toTask, toEpic } from '../src/storage/office-storage.js';
import { parseTaskListMarkdown } from '../src/storage/markdown-sync.js';
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

  it('should initialize database in WAL mode and foreign keys enabled', () => {
    storage = new OfficeStorage(testDir);
    const db = storage.getDatabase();
    const journalMode = db.pragma('journal_mode', { simple: true });
    expect(journalMode).toBe('wal');

    const foreignKeys = db.pragma('foreign_keys', { simple: true });
    expect(foreignKeys).toBe(1);
  });

  it('should enforce foreign key constraint when inserting tasks for nonexistent epics', () => {
    storage = new OfficeStorage(testDir);
    expect(() => {
      storage.createTask('TASK-ORPHAN', 'NON_EXISTENT_EPIC', 'Orphan Task');
    }).toThrow(/FOREIGN KEY constraint failed/);
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

  it('should safely log activity events including undefined payload', () => {
    storage = new OfficeStorage(testDir);
    storage.createEpic('EPIC-001', 'Auth Feature', 'JWT implementation');

    storage.logActivity('EPIC-001', 'agent-coder-1', 'TOOL_CALL', { tool: 'readFile', file: 'auth.ts' });
    storage.logActivity('EPIC-001', 'agent-coder-1', 'FILE_EDIT', { file: 'auth.ts', linesChanged: 15 });
    storage.logActivity('EPIC-001', 'agent-devops-1', 'PING', undefined);

    const epic1Logs = storage.getActivityLogs('EPIC-001');
    expect(epic1Logs.length).toBe(3);
    expect(epic1Logs[0].eventType).toBe('TOOL_CALL');
    expect(epic1Logs[0].payload).toEqual({ tool: 'readFile', file: 'auth.ts' });
    expect(epic1Logs[1].eventType).toBe('FILE_EDIT');
    expect(epic1Logs[2].eventType).toBe('PING');
    expect(epic1Logs[2].payload).toEqual({});
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

  it('should not pollute filesystem when running in in-memory mode', () => {
    const memStorage = new OfficeStorage(':memory:');
    memStorage.createEpic('EPIC-MEM', 'Memory Epic', 'No files on disk');
    memStorage.createTask('TASK-MEM', 'EPIC-MEM', 'Memory task', 'BACKEND');
    memStorage.moveTask('TASK-MEM', 'DONE');
    memStorage.syncMarkdown('EPIC-MEM');

    const unintendedDir = path.join(process.cwd(), 'epics', 'EPIC-MEM');
    expect(fs.existsSync(unintendedDir)).toBe(false);
    memStorage.close();
  });

  it('should support canonical type converters and entity getters', () => {
    storage = new OfficeStorage(testDir);
    storage.createEpic('EPIC-TYPE', 'Typing Epic', 'Testing canonical types', 15.0);
    storage.createTask('TASK-T1', 'EPIC-TYPE', 'Type Task 1', 'FRONTEND');

    const epicRecord = storage.getEpic('EPIC-TYPE')!;
    const canonicalEpic = toEpic(epicRecord);
    expect(canonicalEpic.id).toBe('EPIC-TYPE');
    expect(canonicalEpic.budgetCapUsd).toBe(15.0);

    const entityEpic = storage.getEpicEntity('EPIC-TYPE');
    expect(entityEpic?.budgetCapUsd).toBe(15.0);

    const taskRecord = storage.getTask('TASK-T1')!;
    const canonicalTask = toTask(taskRecord);
    expect(canonicalTask.epicId).toBe('EPIC-TYPE');
    expect(canonicalTask.assignedAgentId).toBe('FRONTEND');

    const entityTask = storage.getTaskEntity('TASK-T1');
    expect(entityTask?.epicId).toBe('EPIC-TYPE');

    const entityTasks = storage.getTasksEntitiesByEpic('EPIC-TYPE');
    expect(entityTasks.length).toBe(1);
    expect(entityTasks[0].assignedAgentId).toBe('FRONTEND');
  });

  it('should parse markdown task list correctly including titles with parentheses', () => {
    const md = `
# Tasks for EPIC-001

- [ ] TASK-1: Setup auth (JWT token) (IN_PROGRESS)
- [x] TASK-2: Write auth tests (DONE)
- [x] TASK-3: Documentation without explicit status
- [ ] TASK-4: Refactor handlers (Backend)
`;

    const parsed = parseTaskListMarkdown(md);
    expect(parsed.length).toBe(4);

    expect(parsed[0]).toEqual({
      id: 'TASK-1',
      title: 'Setup auth (JWT token)',
      status: 'IN_PROGRESS',
      done: false
    });

    expect(parsed[1]).toEqual({
      id: 'TASK-2',
      title: 'Write auth tests',
      status: 'DONE',
      done: true
    });

    expect(parsed[2]).toEqual({
      id: 'TASK-3',
      title: 'Documentation without explicit status',
      status: 'DONE',
      done: true
    });

    expect(parsed[3]).toEqual({
      id: 'TASK-4',
      title: 'Refactor handlers (Backend)',
      status: 'BACKLOG',
      done: false
    });
  });
});
