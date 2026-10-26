import React from 'react';
import { Task, TaskStatus } from '../types/office.js';

export interface KanbanBoardProps {
  tasks?: Task[];
  onMoveTask?: (taskId: string, newStatus: TaskStatus) => void;
  className?: string;
}

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'BACKLOG', label: 'Backlog', color: '#64748b' },
  { id: 'TODO', label: 'To Do', color: '#3b82f6' },
  { id: 'IN_PROGRESS', label: 'In Progress', color: '#f59e0b' },
  { id: 'IN_REVIEW', label: 'In Review', color: '#8b5cf6' },
  { id: 'DONE', label: 'Done', color: '#10b981' },
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  tasks = [],
  onMoveTask,
  className = '',
}) => {
  const getTasksByStatus = (status: TaskStatus) => {
    return tasks.filter((t) => t.status === status);
  };

  return (
    <div
      data-testid="kanban-board"
      className={`kanban-board-container ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        borderRadius: '8px',
        border: '1px solid #1e293b',
        padding: '16px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          paddingBottom: '8px',
          borderBottom: '1px solid #1e293b',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#e2e8f0' }}>
          📋 Kanban Task Board
        </h3>
        <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
          Total Tasks: {tasks.length}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(180px, 1fr))',
          gap: '12px',
          overflowX: 'auto',
          minHeight: '260px',
        }}
      >
        {COLUMNS.map((column) => {
          const columnTasks = getTasksByStatus(column.id);

          return (
            <div
              key={column.id}
              data-testid={`kanban-column-${column.id}`}
              style={{
                backgroundColor: '#1e293b',
                borderRadius: '6px',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                borderTop: `3px solid ${column.color}`,
                minHeight: '220px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px',
                }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    color: '#f1f5f9',
                    letterSpacing: '0.025em',
                  }}
                >
                  {column.label}
                </span>
                <span
                  style={{
                    backgroundColor: '#334155',
                    color: '#cbd5e1',
                    fontSize: '0.75rem',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontWeight: 600,
                  }}
                >
                  {columnTasks.length}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  flexGrow: 1,
                  overflowY: 'auto',
                }}
              >
                {columnTasks.map((task) => (
                  <div
                    key={task.id}
                    data-testid={`task-card-${task.id}`}
                    style={{
                      backgroundColor: '#0f172a',
                      borderRadius: '4px',
                      padding: '10px',
                      border: '1px solid #334155',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontFamily: 'monospace',
                          color: '#38bdf8',
                          fontWeight: 600,
                        }}
                      >
                        {task.id}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        color: '#f8fafc',
                        lineHeight: 1.3,
                      }}
                    >
                      {task.title}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '4px',
                        fontSize: '0.75rem',
                        color: '#94a3b8',
                      }}
                    >
                      <span
                        style={{
                          backgroundColor: task.assignedAgentId ? '#1e3a8a' : '#334155',
                          color: task.assignedAgentId ? '#93c5fd' : '#94a3b8',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                        }}
                      >
                        {task.assignedAgentId || 'Unassigned'}
                      </span>

                      {onMoveTask && (
                        <select
                          data-testid={`task-move-select-${task.id}`}
                          aria-label={`Move task ${task.id}`}
                          value={task.status}
                          onChange={(e) => onMoveTask(task.id, e.target.value as TaskStatus)}
                          style={{
                            backgroundColor: '#1e293b',
                            color: '#e2e8f0',
                            border: '1px solid #475569',
                            borderRadius: '4px',
                            padding: '2px 4px',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                          }}
                        >
                          {COLUMNS.map((col) => (
                            <option key={col.id} value={col.id}>
                              ➔ {col.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}

                {columnTasks.length === 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexGrow: 1,
                      color: '#475569',
                      fontSize: '0.75rem',
                      fontStyle: 'italic',
                      padding: '16px 0',
                    }}
                  >
                    No tasks
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
