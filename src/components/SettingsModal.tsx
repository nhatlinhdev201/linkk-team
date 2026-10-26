import React, { useState, useEffect } from 'react';
import { OfficeConfig, AgentRole } from '../types/office.js';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: OfficeConfig;
  onSaveConfig: (cfg: Partial<OfficeConfig>) => void;
}

const ROLES: AgentRole[] = ['ARCHITECT', 'FRONTEND', 'BACKEND', 'QA', 'DEVOPS'];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) => {
  const [proxyBaseUrl, setProxyBaseUrl] = useState(config.proxyBaseUrl || '');
  const [apiKey, setApiKey] = useState(config.apiKey || '');
  const [roleModels, setRoleModels] = useState<Record<AgentRole, string>>({
    ARCHITECT: config.roleModels?.ARCHITECT || 'claude-3-5-sonnet',
    FRONTEND: config.roleModels?.FRONTEND || 'claude-3-5-sonnet',
    BACKEND: config.roleModels?.BACKEND || 'claude-3-5-sonnet',
    QA: config.roleModels?.QA || 'gpt-4o-mini',
    DEVOPS: config.roleModels?.DEVOPS || 'claude-3-5-sonnet',
  });
  const [soundEnabled, setSoundEnabled] = useState(config.soundEnabled ?? true);
  const [soundVolume, setSoundVolume] = useState(config.soundVolume ?? 0.8);
  const [defaultBudgetCapUsd, setDefaultBudgetCapUsd] = useState(
    config.defaultBudgetCapUsd ?? 5.0
  );

  useEffect(() => {
    if (isOpen) {
      setProxyBaseUrl(config.proxyBaseUrl || '');
      setApiKey(config.apiKey || '');
      setRoleModels({
        ARCHITECT: config.roleModels?.ARCHITECT || 'claude-3-5-sonnet',
        FRONTEND: config.roleModels?.FRONTEND || 'claude-3-5-sonnet',
        BACKEND: config.roleModels?.BACKEND || 'claude-3-5-sonnet',
        QA: config.roleModels?.QA || 'gpt-4o-mini',
        DEVOPS: config.roleModels?.DEVOPS || 'claude-3-5-sonnet',
      });
      setSoundEnabled(config.soundEnabled ?? true);
      setSoundVolume(config.soundVolume ?? 0.8);
      setDefaultBudgetCapUsd(config.defaultBudgetCapUsd ?? 5.0);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const handleRoleModelChange = (role: AgentRole, model: string) => {
    setRoleModels((prev) => ({
      ...prev,
      [role]: model,
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      proxyBaseUrl,
      apiKey,
      roleModels,
      soundEnabled,
      soundVolume,
      defaultBudgetCapUsd: Number(defaultBudgetCapUsd),
    });
    onClose();
  };

  return (
    <div
      data-testid="settings-modal"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
    >
      <div
        style={{
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          borderRadius: '10px',
          border: '1px solid #334155',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#e2e8f0' }}>
            ⚙️ Office Settings Center
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.5rem',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Modal Body Form */}
        <form
          onSubmit={handleSave}
          style={{
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Proxy URL */}
          <div>
            <label
              htmlFor="input-proxy-url"
              style={{ display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500 }}
            >
              Proxy Base URL
            </label>
            <input
              id="input-proxy-url"
              data-testid="input-proxy-url"
              type="text"
              value={proxyBaseUrl}
              onChange={(e) => setProxyBaseUrl(e.target.value)}
              placeholder="http://localhost:8000/v1"
              style={{
                width: '100%',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '8px 12px',
                color: '#f8fafc',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* API Key */}
          <div>
            <label
              htmlFor="input-api-key"
              style={{ display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500 }}
            >
              API Key
            </label>
            <input
              id="input-api-key"
              data-testid="input-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              style={{
                width: '100%',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '8px 12px',
                color: '#f8fafc',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Role Models */}
          <fieldset
            style={{
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '12px 14px',
              margin: 0,
            }}
          >
            <legend style={{ fontSize: '0.875rem', fontWeight: 600, color: '#38bdf8', padding: '0 6px' }}>
              🤖 Agent Role Models
            </legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px' }}>
              {ROLES.map((role) => (
                <div key={role}>
                  <label
                    htmlFor={`input-model-${role}`}
                    style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: '#94a3b8' }}
                  >
                    {role}
                  </label>
                  <input
                    id={`input-model-${role}`}
                    data-testid={`input-model-${role}`}
                    type="text"
                    value={roleModels[role] || ''}
                    onChange={(e) => handleRoleModelChange(role, e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      color: '#f8fafc',
                      fontSize: '0.75rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              ))}
            </div>
          </fieldset>

          {/* Budget Cap */}
          <div>
            <label
              htmlFor="input-budget-cap"
              style={{ display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500 }}
            >
              Default Budget Cap (USD)
            </label>
            <input
              id="input-budget-cap"
              data-testid="input-budget-cap"
              type="number"
              step="0.5"
              min="0.5"
              value={defaultBudgetCapUsd}
              onChange={(e) => setDefaultBudgetCapUsd(Number(e.target.value))}
              style={{
                width: '100%',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '8px 12px',
                color: '#f8fafc',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Sound Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              <input
                id="input-sound-enabled"
                data-testid="input-sound-enabled"
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              Sound FX Enabled
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Volume:</span>
              <input
                id="input-sound-volume"
                data-testid="input-sound-volume"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={soundVolume}
                onChange={(e) => setSoundVolume(Number(e.target.value))}
                style={{ width: '100px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.75rem', color: '#cbd5e1', minWidth: '32px' }}>
                {Math.round(soundVolume * 100)}%
              </span>
            </div>
          </div>

          {/* Footer Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '12px',
              paddingTop: '16px',
              borderTop: '1px solid #1e293b',
            }}
          >
            <button
              type="button"
              data-testid="btn-cancel-settings"
              onClick={onClose}
              style={{
                backgroundColor: '#334155',
                color: '#cbd5e1',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="btn-save-settings"
              style={{
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 18px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
