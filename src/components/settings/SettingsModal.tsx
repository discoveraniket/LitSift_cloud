import React, { useState } from 'react';
import {
  Settings,
  X,
  Key,
  Cpu,
  Check,
  ShieldCheck,
  Plus,
  Zap,
  ExternalLink,
  Server,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { getGeminiApiKey, getSelectedGeminiModel, setSelectedGeminiModel } from '../../services/geminiService';
import { useAgentStore } from '../../store/useAgentStore';
import {
  getActiveProvider,
  setActiveProvider,
  getLmStudioBaseUrl,
  setLmStudioBaseUrl,
  getLmStudioModel,
  setLmStudioModel,
  getLmStudioReasoningEffort,
  setLmStudioReasoningEffort,
  getModelReasoningCapability,
  getThinkingEnabled,
  setThinkingEnabled,
  LlmProvider,
  ReasoningEffort,
} from '../../services/providerConfig';
import { checkLmStudioConnection, LmStudioModelInfo } from '../../services/lmStudioService';

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
    badge: 'Stable',
  },
  {
    id: 'gemini-3.5-flash',
    name: 'gemini 3.5 flash',
    speed: 'Ultra Fast',
    reasoning: 'High Efficacy & Tool Calling',
    badge: 'Stable',
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'gemini 3.5 flash lite',
    speed: 'Ultra Fast',
    reasoning: 'High Efficacy & Tool Calling',
    badge: 'Recommended',
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'gemini 3.1 flash lite',
    speed: 'Ultra Fast',
    reasoning: 'High Efficacy & Tool Calling',
    badge: 'Stable',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    speed: 'Fast',
    reasoning: 'Standard Extraction & Summary',
    badge: 'Stable',
  },
  {
    id: 'gemini-3.6-pro',
    name: 'Gemini 3.6 Pro',
    speed: 'Deep Reasoning',
    reasoning: 'Complex Schema Synthesis & Verification',
    badge: 'Pro Reasoning',
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

  // Provider State
  const [provider, setProvider] = useState<LlmProvider>(getActiveProvider());

  // Gemini State
  const [currentModel, setCurrentModel] = useState<string>(getSelectedGeminiModel());
  const [apiKeyInput, setApiKeyInput] = useState<string>(getGeminiApiKey());
  const [customModelInput, setCustomModelInput] = useState<string>('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // LM Studio State
  const [lmStudioUrl, setLmStudioUrlState] = useState<string>(getLmStudioBaseUrl());
  const [lmStudioModel, setLmStudioModelState] = useState<string>(getLmStudioModel());
  const [reasoningEffort, setReasoningEffortState] = useState<ReasoningEffort>(getLmStudioReasoningEffort());
  const [thinkingEnabled, setThinkingEnabledState] = useState<boolean>(getThinkingEnabled());
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    tested: boolean;
    ok: boolean;
    models: LmStudioModelInfo[];
    message: string;
  } | null>(null);

  const [savedSuccess, setSavedSuccess] = useState(false);

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

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionResult(null);
    try {
      const res = await checkLmStudioConnection(lmStudioUrl);
      if (res.ok) {
        setConnectionResult({
          tested: true,
          ok: true,
          models: res.models,
          message: `Connected successfully! Found ${res.models.length} loaded model${res.models.length === 1 ? '' : 's'}.`,
        });
        if (res.models.length > 0 && !lmStudioModel) {
          setLmStudioModelState(res.models[0].id);
        }
      } else {
        setConnectionResult({
          tested: true,
          ok: false,
          models: [],
          message: res.error || 'Could not connect to LM Studio server.',
        });
      }
    } catch (err: any) {
      setConnectionResult({
        tested: true,
        ok: false,
        models: [],
        message: err.message || 'Connection failed.',
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

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
    setActiveProvider(provider);

    if (provider === 'lmstudio') {
      setLmStudioBaseUrl(lmStudioUrl);
      setLmStudioModel(lmStudioModel);
      setLmStudioReasoningEffort(reasoningEffort);
      setThinkingEnabled(thinkingEnabled);
    } else {
      setSelectedGeminiModel(currentModel);
      if (apiKeyInput.trim()) {
        localStorage.setItem('LITSIFT_GEMINI_API_KEY', apiKeyInput.trim());
      } else {
        localStorage.removeItem('LITSIFT_GEMINI_API_KEY');
      }
    }

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 700);
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
          width: '520px',
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

        {/* Provider Switcher Tabs */}
        <div style={{ padding: '14px 20px 0 20px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
              background: 'var(--bg-tertiary)',
              padding: '4px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <button
              type="button"
              onClick={() => setProvider('gemini')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                background: provider === 'gemini' ? 'var(--bg-secondary)' : 'transparent',
                color: provider === 'gemini' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: provider === 'gemini' ? 600 : 500,
                fontSize: '12px',
                cursor: 'pointer',
                boxShadow: provider === 'gemini' ? '0 2px 6px rgba(0,0,0,0.2)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Cpu size={14} />
              <span>Google Gemini (Cloud)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setProvider('lmstudio');
                if (!connectionResult?.tested) {
                  handleTestConnection();
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                background: provider === 'lmstudio' ? 'var(--bg-secondary)' : 'transparent',
                color: provider === 'lmstudio' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: provider === 'lmstudio' ? 600 : 500,
                fontSize: '12px',
                cursor: 'pointer',
                boxShadow: provider === 'lmstudio' ? '0 2px 6px rgba(0,0,0,0.2)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Server size={14} />
              <span>LM Studio (Local)</span>
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div style={{ padding: '16px 20px 20px 20px', overflowY: 'auto', flex: 1 }}>
          {provider === 'lmstudio' ? (
            /* LM Studio Configuration Panel */
            <div>
              {/* Server Endpoint URL */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Server size={14} color="var(--accent-primary)" />
                  LM STUDIO SERVER URL
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={lmStudioUrl}
                    onChange={(e) => setLmStudioUrlState(e.target.value)}
                    placeholder="http://localhost:1234/v1"
                    style={{
                      flex: 1,
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      fontSize: '12px',
                      outline: 'none',
                      fontFamily: 'monospace',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTestingConnection}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--accent-primary)',
                      borderRadius: '6px',
                      padding: '8px 14px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <RefreshCw size={12} className={isTestingConnection ? 'spin' : ''} />
                    {isTestingConnection ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>

                {/* Connection Status Feedback Banner */}
                {connectionResult && (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: connectionResult.ok ? 'rgba(166, 227, 161, 0.12)' : 'rgba(243, 139, 168, 0.12)',
                      border: connectionResult.ok ? '1px solid var(--accent-success)' : '1px solid var(--accent-danger, #f38ba8)',
                      color: connectionResult.ok ? 'var(--accent-success)' : 'var(--accent-danger, #f38ba8)',
                    }}
                  >
                    {connectionResult.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    <span>{connectionResult.message}</span>
                  </div>
                )}
              </div>

              {/* Local Model Selection */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Cpu size={14} color="var(--accent-primary)" />
                  LOCAL MODEL IDENTIFIER
                </label>
                {connectionResult?.models && connectionResult.models.length > 0 ? (
                  <select
                    value={lmStudioModel}
                    onChange={(e) => setLmStudioModelState(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  >
                    {connectionResult.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={lmStudioModel}
                    onChange={(e) => setLmStudioModelState(e.target.value)}
                    placeholder="e.g. qwen2.5-14b-instruct, mistral-small-24b, or leave empty for auto"
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
                )}
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Select the model loaded in LM Studio. Leave empty to use whichever model is actively running.
                </div>
              </div>

              {/* Adaptive Reasoning / Thinking Mode */}
              {(() => {
                const capability = getModelReasoningCapability(lmStudioModel);
                if (capability === 'binary') {
                  return (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Zap size={14} color="var(--accent-primary)" />
                          THINKING MODE (FLEXIBLE REASONING)
                        </label>
                        <span style={{ fontSize: '10px', color: 'var(--accent-primary)', fontWeight: 600 }}>
                          On / Off
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setThinkingEnabledState(true)}
                          style={{
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: thinkingEnabled ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                            background: thinkingEnabled ? 'rgba(137, 180, 250, 0.12)' : 'var(--bg-tertiary)',
                            color: thinkingEnabled ? 'var(--accent-primary)' : 'var(--text-secondary)',
                            fontSize: '11px',
                            fontWeight: thinkingEnabled ? 600 : 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                          }}
                        >
                          <span>🧠</span> ON (&lt;think&gt;)
                        </button>
                        <button
                          type="button"
                          onClick={() => setThinkingEnabledState(false)}
                          style={{
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: !thinkingEnabled ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                            background: !thinkingEnabled ? 'rgba(137, 180, 250, 0.12)' : 'var(--bg-tertiary)',
                            color: !thinkingEnabled ? 'var(--accent-primary)' : 'var(--text-secondary)',
                            fontSize: '11px',
                            fontWeight: !thinkingEnabled ? 600 : 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                          }}
                        >
                          <span>⚡</span> OFF (Fast)
                        </button>
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {thinkingEnabled
                          ? 'Deep reasoning enabled. Model generates internal thinking traces before outputting text.'
                          : 'Thinking disabled. Lower latency and faster execution for extraction tasks.'}
                      </div>
                    </div>
                  );
                }

                if (capability === 'tiered') {
                  return (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Zap size={14} color="var(--accent-primary)" />
                          REASONING EFFORT
                        </label>
                        <span style={{ fontSize: '10px', color: 'var(--accent-primary)', fontWeight: 600 }}>
                          Graduated Effort
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                        {(['low', 'medium', 'high'] as ReasoningEffort[]).map((effort) => (
                          <button
                            key={effort}
                            type="button"
                            onClick={() => setReasoningEffortState(effort)}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '6px',
                              border: reasoningEffort === effort ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                              background: reasoningEffort === effort ? 'rgba(137, 180, 250, 0.12)' : 'var(--bg-tertiary)',
                              color: reasoningEffort === effort ? 'var(--accent-primary)' : 'var(--text-secondary)',
                              fontSize: '11px',
                              fontWeight: reasoningEffort === effort ? 600 : 500,
                              cursor: 'pointer',
                              textTransform: 'capitalize',
                            }}
                          >
                            {effort}
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Controls search budget and depth of reasoning for OpenAI o1/o3 and tiered models.
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      marginBottom: '16px',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>ℹ️</span> Standard instruction model (direct response without extended reasoning tokens).
                  </div>
                );
              })()}

              {/* Informational Card */}
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  marginBottom: '16px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.4',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  💡 Local Inference Setup:
                </div>
                1. Open LM Studio and start the local server via the <strong>Developer</strong> tab (<code style={{ color: 'var(--accent-primary)' }}>&lt;/&gt;</code>) or run <code style={{ color: 'var(--accent-primary)' }}>lms server start</code>.<br />
                2. Load a tool-compatible model (e.g. <strong>Qwen 2.5 14B</strong> or <strong>Mistral Small 24B</strong>).<br />
                3. LitSift will automatically format documents as structured text and send OpenAI tool calls directly to your GPU.
              </div>
            </div>
          ) : (
            /* Gemini Cloud Configuration Panel */
            <div>
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
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                              {model.name}
                            </span>
                            {model.badge && (
                              <span
                                style={{
                                  fontSize: '9px',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: isSelected ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.08)',
                                  color: isSelected ? 'var(--bg-secondary)' : 'var(--text-secondary)',
                                  fontWeight: 600,
                                }}
                              >
                                {model.badge}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                            {model.speed} • {model.reasoning}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {model.isCustom && (
                            <button
                              onClick={(e) => handleRemoveCustomModel(model.id, e)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'flex',
                              }}
                              title="Delete custom model"
                            >
                              <X size={12} />
                            </button>
                          )}
                          {isSelected && <Check size={14} color="var(--accent-primary)" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Gemini API Key Input */}
              <div style={{ marginBottom: '16px' }}>
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
          )}

          {/* Agent Execution Mode (HITL vs Autopilot) */}
          <div style={{ marginTop: '8px', marginBottom: '10px' }}>
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
            Active Provider:{' '}
            <strong style={{ color: 'var(--accent-primary)' }}>
              {provider === 'lmstudio' ? `LM Studio (${lmStudioModel || 'Local Model'})` : `Gemini (${currentModel})`}
            </strong>
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
