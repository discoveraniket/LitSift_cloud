import React, { useState } from 'react';
import { Settings, X, Key, Cpu, Check, ShieldCheck } from 'lucide-react';
import { getGeminiApiKey, getSelectedGeminiModel, setSelectedGeminiModel } from '../../services/geminiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AVAILABLE_MODELS = [
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash (Recommended)',
    speed: 'Ultra Fast',
    reasoning: 'High Efficacy & Tool Calling',
    badge: 'Default',
  },
  {
    id: 'gemini-3.6-pro',
    name: 'Gemini 3.6 Pro',
    speed: 'Deep Reasoning',
    reasoning: 'Complex Schema Synthesis',
    badge: 'Pro Reasoning',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    speed: 'Fast',
    reasoning: 'Standard Extraction',
    badge: 'Legacy',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [currentModel, setCurrentModel] = useState<string>(getSelectedGeminiModel());
  const [apiKeyInput, setApiKeyInput] = useState<string>(getGeminiApiKey());
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    setSelectedGeminiModel(currentModel);
    if (apiKeyInput.trim()) {
      localStorage.setItem('LITSIFT_GEMINI_API_KEY', apiKeyInput.trim());
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
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
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
          width: '460px',
          maxWidth: '90vw',
          padding: '20px 24px',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5)',
          color: 'var(--text-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '15px' }}>
            <Settings size={18} color="var(--accent-primary)" />
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
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Model Selection */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <Cpu size={14} color="var(--accent-primary)" />
            SELECT GEMINI AI MODEL
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {AVAILABLE_MODELS.map((model) => {
              const isSelected = currentModel === model.id;
              return (
                <div
                  key={model.id}
                  onClick={() => setCurrentModel(model.id)}
                  style={{
                    border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                    background: isSelected ? 'rgba(137, 180, 250, 0.1)' : 'var(--bg-tertiary)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {model.name}
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
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      ⚡ {model.speed} • {model.reasoning}
                    </div>
                  </div>

                  {isSelected && <Check size={16} color="var(--accent-primary)" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* API Key Input */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
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
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ShieldCheck size={12} color="var(--accent-success)" />
            Key detected from environment variable `GEMINI_API_KEY` or local storage.
          </div>
        </div>

        {/* Footer Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
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
  );
};
