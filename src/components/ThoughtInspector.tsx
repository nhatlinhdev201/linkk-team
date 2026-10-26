import React, { useState, useEffect } from 'react';
import { OfficeEventBus } from '../events/event-bus.js';

export interface ThoughtItem {
  id: string;
  agentId: string;
  text: string;
  type: 'speech' | 'state';
  timestamp: string;
  details?: string;
}

export interface ThoughtInspectorProps {
  bus: OfficeEventBus;
  initialThoughts?: ThoughtItem[];
  maxThoughts?: number;
  className?: string;
}

export const ThoughtInspector: React.FC<ThoughtInspectorProps> = ({
  bus,
  initialThoughts = [],
  maxThoughts = 100,
  className = '',
}) => {
  const [thoughts, setThoughts] = useState<ThoughtItem[]>(initialThoughts);
  const [selectedAgent, setSelectedAgent] = useState<string>('ALL');

  useEffect(() => {
    const unsubSpeech = bus.subscribe('BUBBLE_SPEECH', (payload) => {
      const newItem: ThoughtItem = {
        id: `speech-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        agentId: payload.agentId,
        text: payload.text,
        type: 'speech',
        timestamp: new Date().toLocaleTimeString(),
      };

      setThoughts((prev) => [newItem, ...prev].slice(0, maxThoughts));
    });

    const unsubState = bus.subscribe('AGENT_STATE_CHANGED', (payload) => {
      let text = '';
      if (payload.action === 'HIRED') {
        text = `Hired as ${payload.role}`;
      } else if (payload.action === 'RELEASED') {
        text = `Released from squad`;
      } else {
        const fromStr = payload.from ? `${payload.from} ➔ ` : '';
        const toStr = payload.to || 'UNKNOWN';
        const reasonStr = payload.reason ? ` (${payload.reason})` : '';
        text = `State: ${fromStr}${toStr}${reasonStr}`;
      }

      const newItem: ThoughtItem = {
        id: `state-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        agentId: payload.agentId,
        text,
        type: 'state',
        timestamp: new Date().toLocaleTimeString(),
        details: payload.reason,
      };

      setThoughts((prev) => [newItem, ...prev].slice(0, maxThoughts));
    });

    return () => {
      unsubSpeech();
      unsubState();
    };
  }, [bus, maxThoughts]);

  // Extract unique agents for filtering
  const agentOptions = Array.from(new Set(thoughts.map((t) => t.agentId))).sort();

  const filteredThoughts =
    selectedAgent === 'ALL'
      ? thoughts
      : thoughts.filter((t) => t.agentId === selectedAgent);

  return (
    <div
      data-testid="thought-inspector"
      className={`thought-inspector-container ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
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
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#e2e8f0' }}>
            🧠 Thought Inspector
          </h3>
          <span
            style={{
              backgroundColor: '#1e293b',
              color: '#38bdf8',
              fontSize: '0.75rem',
              padding: '2px 8px',
              borderRadius: '12px',
              fontWeight: 600,
            }}
          >
            {filteredThoughts.length}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            data-testid="select-agent-filter"
            aria-label="Filter by agent"
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            style={{
              backgroundColor: '#1e293b',
              color: '#f1f5f9',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">All Agents</option>
            {agentOptions.map((agentId) => (
              <option key={agentId} value={agentId}>
                {agentId}
              </option>
            ))}
          </select>

          <button
            data-testid="btn-clear-thoughts"
            onClick={() => {
              setThoughts([]);
              setSelectedAgent('ALL');
            }}
            style={{
              backgroundColor: '#334155',
              color: '#cbd5e1',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
            title="Clear history"
          >
            Clear
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          flexGrow: 1,
          overflowY: 'auto',
          maxHeight: '400px',
          paddingRight: '4px',
        }}
      >
        {filteredThoughts.map((item) => (
          <div
            key={item.id}
            data-testid="thought-item"
            style={{
              backgroundColor: item.type === 'speech' ? '#172554' : '#1e293b',
              borderLeft: item.type === 'speech' ? '4px solid #3b82f6' : '4px solid #10b981',
              borderRadius: '4px',
              padding: '8px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    backgroundColor: '#0f172a',
                    color: '#93c5fd',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                  }}
                >
                  {item.agentId}
                </span>
                <span
                  style={{
                    color: item.type === 'speech' ? '#60a5fa' : '#34d399',
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  {item.type === 'speech' ? '💬 Speech' : '⚙️ Activity'}
                </span>
              </div>
              <span style={{ color: '#64748b', fontSize: '0.7rem' }}>{item.timestamp}</span>
            </div>

            <div
              style={{
                fontSize: '0.85rem',
                color: '#e2e8f0',
                lineHeight: 1.35,
                wordBreak: 'break-word',
              }}
            >
              {item.text}
            </div>
          </div>
        ))}

        {filteredThoughts.length === 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexGrow: 1,
              color: '#64748b',
              fontSize: '0.85rem',
              fontStyle: 'italic',
              padding: '32px 0',
            }}
          >
            No thoughts or events logged yet
          </div>
        )}
      </div>
    </div>
  );
};
