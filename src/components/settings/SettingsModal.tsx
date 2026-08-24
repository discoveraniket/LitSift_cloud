import React, { useState } from 'react';
import { Settings, X, Key, Cpu, Check, ShieldCheck, Plus, Zap, ExternalLink } from 'lucide-react';
import { getGeminiApiKey, getSelectedGeminiModel, setSelectedGeminiModel } from '../../services/geminiService';
import { useAgentStore } from '../../store/useAgentStore';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface ModelOption {
  id: string;
  name: string;
  speed: string;
  reasoning: string;
  badge?: string;
  isCustom?: boolean;
}

const DEFAULT_MODELS: ModelOption[] = [
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    speed: 'Hybrid Reasoning',
    reasoning: 'State-of-the-Art Speed & Reasoning',
    badge: 'Latest',
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    speed: 'Ultra Fast',
    reasoning: 'High Efficacy & Tool Calling',
    badge: 'Recommended',
  },
  {
    id: 'gemini-3.6-pro',
    name: 'Gemini 3.6 Pro',
    speed: 'Deep Reasoning',
    reasoning: 'Complex Schema Synthesis & Verification',
    badge: 'Pro Reasoning',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    speed: 'Fast',
    reasoning: 'Standard Extraction & Summary',
    badge: 'Stable',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    speed: 'High Capacity',
    reasoning: 'Large Context & Multi-turn Depth',
    badge: 'Stable Pro',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const mode = useAgentStore((state) => state.mode);
  const setExecutionMode = useAgentStore((state) => state.setExecutionMode);

  const [currentModel, setCurrentModel] = useState<string>(getSelectedGeminiModel());
  const [apiKeyInput, setApiKeyInput] = useState<string>(getGeminiApiKey());
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [customModelInput, setCustomModelInput] = useState<string>('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Load custom models from localStorage
  const [customModels, setCustomModels] = useState<ModelOption[]>(() => {
    try {
      const stored = localStorage.getItem('LITSIFT_CUSTOM_MODELS');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  if (!isOpen) return null;

  const allModels: ModelOption[] = [...DEFAULT_MODELS, ...customModels];

  const handleAddCustomModel = () => {
    const trimmed = customModelInput.trim();
    if (!trimmed) return;

    if (allModels.some((m) => m.id.toLowerCase() === trimmed.toLowerCase())) {
      setCurrentModel(trimmed);
      setCustomModelInput('');
      setShowCustomInput(false);
      return;
    }

    const newOption: ModelOption = {
      id: trimmed,
      name: trimmed,
      speed: 'Custom Model',
      reasoning: 'User Specified Endpoint',
      badge: 'Custom',
      isCustom: true,
    };

    const updated = [...customModels, newOption];
    setCustomModels(updated);
    localStorage.setItem('LITSIFT_CUSTOM_MODELS', JSON.stringify(updated));
    setCurrentModel(trimmed);
    setCustomModelInput('');
    setShowCustomInput(false);
  };

  const handleRemoveCustomModel = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customModels.filter((m) => m.id !== id);
    setCustomModels(updated);
    localStorage.setItem('LITSIFT_CUSTOM_MODELS', JSON.stringify(updated));
    if (currentModel === id) {
      setCurrentModel('gemini-3.7-flash');
    }
  };

  const handleSave = () => {
    setSelectedGeminiModel(currentModel);
    if (apiKeyInput.trim()) {
      localStorage.setItem('LITSIFT_GEMINI_API_KEY', apiKeyInput.trim());
    } else {
      localStorage.removeItem('LITSIFT_GEMINI_API_KEY');
    }
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          width: '500px',
          maxWidth: '92vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          color: 'var(--text-primary)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '14px' }}>
            <Settings size={17} color="var(--accent-primary)" />
            <span>Workspace Settings & AI Model Configuration</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {/* Model Selection */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Cpu size={14} color="var(--accent-primary)" />
                SELECT OR ENTER GEMINI MODEL
              </label>
              <button
                onClick={() => setShowCustomInput(!showCustomInput)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-primary)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Plus size={12} /> {showCustomInput ? 'Hide Input' : 'Enter Custom Model'}
              </button>
            </div>

            {/* Custom Model Input Row */}
            {showCustomInput && (
              <div
                style={{
                  display: 'flex',
                  gap: '6px',
                  marginBottom: '10px',
                  padding: '8px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <input
                  type="text"
                  placeholder="e.g. gemini-2.5-flash-lite, gemini-experimental..."
                  value={customModelInput}
                  onChange={(e) => setCustomModelInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCustomModel()}
                  style={{
                    flex: 1,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    borderRadius: '4px',
                    padding: '5px 8px',
                    fontSize: '11px',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleAddCustomModel}
                  style={{
                    background: 'var(--accent-primary)',
                    color: 'var(--bg-secondary)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '5px 12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Add Model
                </button>
              </div>
            )}

            {/* Model Card Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {allModels.map((model) => {
                const isSelected = currentModel === model.id;
                return (
                  <div
                    key={model.id}
                    onClick={() => setCurrentModel(model.id)}
                    style={{
                      border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      background: isSelected ? 'rgba(137, 180, 250, 0.12)' : 'var(--bg-tertiary)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {model.name}
                        {model.badge && (
                          <span
                            style={{
                              fontSize: '9px',
                              padding: '1px 6px',
                              borderRadius: '10px',
                              background: isSelected ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                              color: isSelected ? 'var(--bg-secondary)' : 'var(--text-secondary)',
                              fontWeight: 700,
                            }}
                          >
                            {model.badge}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        ⚡ {model.speed} • {model.reasoning}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {model.isCustom && (
                        <button
                          onClick={(e) => handleRemoveCustomModel(model.id, e)}
                          title="Remove custom model"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: '11px',
                          }}
                        >
                          ✕
                        </button>
                      )}
                      {isSelected && <Check size={16} color="var(--accent-primary)" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agent Execution Mode (HITL vs Autopilot) */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <ShieldCheck size={14} color="var(--accent-primary)" />
              AGENT EXECUTION MODE
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div
                onClick={() => setExecutionMode('human_in_loop')}
                style={{
                  border: mode === 'human_in_loop' ? '1px solid var(--accent-warning, #f9e2af)' : '1px solid var(--border-subtle)',
                  background: mode === 'human_in_loop' ? 'rgba(249, 226, 175, 0.12)' : 'var(--bg-tertiary)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-warning, #f9e2af)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={14} /> HITL Staged Review
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.3' }}>
                  AI extractions require human confirmation before committing.
                </div>
              </div>

              <div
                onClick={() => setExecutionMode('autonomous_autopilot')}
                style={{
                  border: mode === 'autonomous_autopilot' ? '1px solid var(--accent-success)' : '1px solid var(--border-subtle)',
                  background: mode === 'autonomous_autopilot' ? 'rgba(166, 227, 161, 0.12)' : 'var(--bg-tertiary)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={14} /> Autopilot Mode
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.3' }}>
                  Extracted data is instantly committed into grid tables.
                </div>
              </div>
            </div>
          </div>

          {/* API Key Input */}
          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Key size={14} color="var(--accent-primary)" />
              GEMINI API KEY (ENV / LOCAL)
            </label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Paste your GEMINI_API_KEY here..."
              style={{
                width: '100%',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                borderRadius: '6px',
                padding: '8px 10px',
                fontSize: '12px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ShieldCheck size={12} color="var(--accent-success)" />
                <span>Stored securely in local browser storage (BYOK).</span>
              </div>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--accent-primary, #89b4fa)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  textDecoration: 'none',
                  fontSize: '10px',
                  fontWeight: 600,
                }}
              >
                Get a free key <ExternalLink size={10} />
              </a>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-secondary)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Active: <strong style={{ color: 'var(--accent-primary)' }}>{currentModel}</strong>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                background: savedSuccess ? 'var(--accent-success)' : 'var(--accent-primary)',
                color: 'var(--bg-secondary)',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 16px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {savedSuccess ? 'Saved ✓' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
