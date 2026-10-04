import React, { useState, useMemo } from 'react';
import {
  Search,
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
  Globe,
  FileText,
  Shield,
  X,
  Sparkles,
} from 'lucide-react';
import {
  getGeminiApiKey,
  getSelectedGeminiModel,
  setSelectedGeminiModel,
} from '../../services/geminiService';
import { useAgentStore } from '../../store/useAgentStore';
import { useSettingsUiStore } from '../../store/useSettingsUiStore';
import {
  getActiveProvider,
  setActiveProvider,
  getLmStudioBaseUrl,
  setLmStudioBaseUrl,
  getLmStudioModel,
  setLmStudioModel,
  getLmStudioReasoningEffort,
  setLmStudioReasoningEffort,
  getOpenRouterApiKey,
  setOpenRouterApiKey,
  getOpenRouterModel,
  setOpenRouterModel,
  getOpenRouterBaseUrl,
  setOpenRouterBaseUrl,
  LlmProvider,
  ReasoningEffort,
  getModelReasoningCapability,
  getThinkingEnabled,
  setThinkingEnabled,
} from '../../services/providerConfig';
import { checkLmStudioConnection, LmStudioModelInfo } from '../../services/lmStudioService';
import {
  checkOpenRouterConnection,
  OpenRouterModelInfo,
  CURATED_OPENROUTER_PRESETS,
} from '../../services/openRouterService';

export interface ModelOption {
  id: string;
  name: string;
  speed: string;
  reasoning: string;
  badge?: string;
  isCustom?: boolean;
}

const DEFAULT_GEMINI_MODELS: ModelOption[] = [
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    speed: 'Ultra Fast',
    reasoning: 'Hybrid Thinking & Tool Calling',
    badge: 'Recommended',
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
    badge: 'Fast',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    speed: 'Fast',
    reasoning: 'Standard Extraction & Summary',
    badge: 'Stable',
  },
];

interface SettingsViewProps {
  onClose?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onClose }) => {
  const { activeSection, setActiveSection } = useSettingsUiStore();
  const [searchQuery, setSearchQuery] = useState('');

  // Active Provider
  const [provider, setProviderState] = useState<LlmProvider>(getActiveProvider());

  // Gemini State
  const [currentGeminiModel, setCurrentGeminiModel] = useState<string>(getSelectedGeminiModel());
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState<string>(getGeminiApiKey());
  const [customModelInput, setCustomModelInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // LM Studio State
  const [lmStudioUrl, setLmStudioUrlState] = useState<string>(getLmStudioBaseUrl());
  const [lmStudioModel, setLmStudioModelState] = useState<string>(getLmStudioModel());
  const [reasoningEffort, setReasoningEffortState] = useState<ReasoningEffort>(getLmStudioReasoningEffort());
  const [thinkingEnabled, setThinkingEnabledState] = useState<boolean>(getThinkingEnabled());
  const [isTestingLmStudio, setIsTestingLmStudio] = useState(false);
  const [lmStudioResult, setLmStudioResult] = useState<{
    tested: boolean;
    ok: boolean;
    models: LmStudioModelInfo[];
    message: string;
  } | null>(null);

  // OpenRouter State
  const [openRouterKeyInput, setOpenRouterKeyInput] = useState<string>(getOpenRouterApiKey());
  const [openRouterModel, setOpenRouterModelState] = useState<string>(getOpenRouterModel());
  const [openRouterUrl, setOpenRouterUrlState] = useState<string>(getOpenRouterBaseUrl());
  const [isTestingOpenRouter, setIsTestingOpenRouter] = useState(false);
  const [openRouterResult, setOpenRouterResult] = useState<{
    tested: boolean;
    ok: boolean;
    models: OpenRouterModelInfo[];
    message: string;
  } | null>(null);

  // Agent Execution Mode
  const { mode: agentMode, setExecutionMode } = useAgentStore();
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Custom Gemini Models from localStorage
  const [customModels, setCustomModels] = useState<ModelOption[]>(() => {
    try {
      const stored = localStorage.getItem('LITSIFT_CUSTOM_MODELS');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const allGeminiModels = useMemo(
    () => [...DEFAULT_GEMINI_MODELS, ...customModels],
    [customModels]
  );

  const handleTestLmStudio = async () => {
    setIsTestingLmStudio(true);
    setLmStudioResult(null);
    try {
      const res = await checkLmStudioConnection(lmStudioUrl);
      if (res.ok) {
        setLmStudioResult({
          tested: true,
          ok: true,
          models: res.models,
          message: `Connected successfully! Found ${res.models.length} loaded model${res.models.length === 1 ? '' : 's'}.`,
        });
        if (res.models.length > 0 && !lmStudioModel) {
          setLmStudioModelState(res.models[0].id);
        }
      } else {
        setLmStudioResult({
          tested: true,
          ok: false,
          models: [],
          message: res.error || 'Could not connect to LM Studio server.',
        });
      }
    } catch (err: any) {
      setLmStudioResult({
        tested: true,
        ok: false,
        models: [],
        message: err.message || 'Connection failed.',
      });
    } finally {
      setIsTestingLmStudio(false);
    }
  };

  const handleTestOpenRouter = async () => {
    setIsTestingOpenRouter(true);
    setOpenRouterResult(null);
    try {
      const res = await checkOpenRouterConnection(openRouterKeyInput, openRouterUrl);
      if (res.ok) {
        setOpenRouterResult({
          tested: true,
          ok: true,
          models: res.models,
          message: `Authentication succeeded! Verified access to ${res.models.length} OpenRouter models.`,
        });
      } else {
        setOpenRouterResult({
          tested: true,
          ok: false,
          models: [],
          message: res.error || 'Authentication with OpenRouter failed.',
        });
      }
    } catch (err: any) {
      setOpenRouterResult({
        tested: true,
        ok: false,
        models: [],
        message: err.message || 'Failed to connect to OpenRouter.',
      });
    } finally {
      setIsTestingOpenRouter(false);
    }
  };

  const handleAddCustomGeminiModel = () => {
    const trimmed = customModelInput.trim();
    if (!trimmed) return;

    if (allGeminiModels.some((m) => m.id.toLowerCase() === trimmed.toLowerCase())) {
      setCurrentGeminiModel(trimmed);
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
    setCurrentGeminiModel(trimmed);
    setCustomModelInput('');
    setShowCustomInput(false);
  };

  const handleRemoveCustomGeminiModel = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customModels.filter((m) => m.id !== id);
    setCustomModels(updated);
    localStorage.setItem('LITSIFT_CUSTOM_MODELS', JSON.stringify(updated));
    if (currentGeminiModel === id) {
      setCurrentGeminiModel('gemini-3.7-flash');
    }
  };

  const handleSaveAll = () => {
    setActiveProvider(provider);

    // Save Gemini
    setSelectedGeminiModel(currentGeminiModel);
    if (geminiApiKeyInput.trim()) {
      localStorage.setItem('GEMINI_API_KEY', geminiApiKeyInput.trim());
    } else {
      localStorage.removeItem('GEMINI_API_KEY');
    }

    // Save LM Studio
    setLmStudioBaseUrl(lmStudioUrl);
    setLmStudioModel(lmStudioModel);
    setLmStudioReasoningEffort(reasoningEffort);

    // Save OpenRouter
    setOpenRouterApiKey(openRouterKeyInput);
    setOpenRouterModel(openRouterModel);
    setOpenRouterBaseUrl(openRouterUrl);

    // Save Thinking Mode
    setThinkingEnabled(thinkingEnabled);

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const renderReasoningControls = (targetModelId: string) => {
    const capability = getModelReasoningCapability(targetModelId);

    if (capability === 'binary') {
      return (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
              THINKING MODE (FLEXIBLE REASONING)
            </label>
            <span style={{ fontSize: '10px', color: 'var(--accent-primary)', fontWeight: 600 }}>
              Flexible Thinking (On / Off)
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setThinkingEnabledState(true)}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: '6px',
                background: thinkingEnabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: thinkingEnabled ? 'var(--bg-primary)' : 'var(--text-secondary)',
                fontWeight: thinkingEnabled ? 700 : 500,
                fontSize: '11px',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <span>🧠</span> ON (Step-by-step &lt;think&gt;)
            </button>
            <button
              type="button"
              onClick={() => setThinkingEnabledState(false)}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: '6px',
                background: !thinkingEnabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: !thinkingEnabled ? 'var(--bg-primary)' : 'var(--text-secondary)',
                fontWeight: !thinkingEnabled ? 700 : 500,
                fontSize: '11px',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <span>⚡</span> OFF (Direct response, faster)
            </button>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.4' }}>
            {thinkingEnabled
              ? 'Deep reasoning enabled. Model produces internal step-by-step thinking traces before executing actions.'
              : 'Thinking disabled. Model provides immediate outputs with lower latency and reduced token usage.'}
          </div>
        </div>
      );
    }

    if (capability === 'tiered') {
      return (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
              REASONING EFFORT
            </label>
            <span style={{ fontSize: '10px', color: 'var(--accent-primary)', fontWeight: 600 }}>
              Graduated Search Budget
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['low', 'medium', 'high'] as ReasoningEffort[]).map((effort) => (
              <button
                key={effort}
                type="button"
                onClick={() => setReasoningEffortState(effort)}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: '6px',
                  background: reasoningEffort === effort ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  color: reasoningEffort === effort ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  fontWeight: reasoningEffort === effort ? 700 : 500,
                  fontSize: '11px',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 0.15s ease',
                }}
              >
                {effort}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.4' }}>
            Controls the search budget and depth of reasoning for OpenAI o1/o3 and tiered models.
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          padding: '10px 14px',
          borderRadius: '6px',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-subtle)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span>ℹ️</span> Standard instruction model (responds directly without extended reasoning tokens).
      </div>
    );
  };

  return (
    <div
      className="settings-view-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--bg-primary, #1e1e2e)',
        color: 'var(--text-primary, #cdd6f4)',
        fontFamily: 'Inter, system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* 1. VS Code Style Header & Search Bar */}
      <header
        style={{
          padding: '16px 24px 12px 24px',
          borderBottom: '1px solid var(--border-subtle, #313244)',
          background: 'var(--bg-secondary, #181825)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary, #a6adc8)', fontWeight: 600 }}>
              LitSift
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted, #6c7086)' }}>/</span>
            <h1 style={{ fontSize: '16px', fontWeight: 700, margin: 0, letterSpacing: '0.3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Settings
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {savedSuccess && (
              <span style={{ fontSize: '12px', color: 'var(--accent-success, #a6e3a1)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                <CheckCircle2 size={14} /> Saved & Applied!
              </span>
            )}
            <button
              onClick={handleSaveAll}
              style={{
                background: 'var(--accent-primary, #89b4fa)',
                color: 'var(--bg-primary, #1e1e2e)',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'opacity 0.15s ease',
              }}
            >
              <Check size={14} /> Save Changes
            </button>
            {onClose && (
              <button
                onClick={onClose}
                title="Close Settings (or close tab above)"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                }}
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Search Bar & Category Navigation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div
            style={{
              position: 'relative',
              maxWidth: '680px',
              width: '100%',
            }}
          >
            <Search
              size={14}
              color="var(--text-muted, #6c7086)"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Search settings (e.g. model, openrouter, reasoning, api key, hitl)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-tertiary, #11111b)',
                border: '1px solid var(--border-subtle, #313244)',
                color: 'var(--text-primary, #cdd6f4)',
                borderRadius: '6px',
                padding: '8px 12px 8px 34px',
                fontSize: '12px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Quick Category Navigation Pills */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              overflowX: 'auto',
              paddingBottom: '2px',
            }}
          >
            <button
              onClick={() => setActiveSection('providers')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '6px',
                background: activeSection === 'providers' ? 'rgba(137, 180, 250, 0.15)' : 'var(--bg-tertiary, #11111b)',
                border: activeSection === 'providers' ? '1px solid var(--accent-primary, #89b4fa)' : '1px solid var(--border-subtle, #313244)',
                color: activeSection === 'providers' ? 'var(--accent-primary, #89b4fa)' : 'var(--text-secondary, #a6adc8)',
                fontWeight: activeSection === 'providers' ? 600 : 500,
                fontSize: '11px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.12s ease',
              }}
            >
              <Cpu size={13} />
              <span>AI Providers & Models</span>
            </button>

            <button
              onClick={() => setActiveSection('execution')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '6px',
                background: activeSection === 'execution' ? 'rgba(137, 180, 250, 0.15)' : 'var(--bg-tertiary, #11111b)',
                border: activeSection === 'execution' ? '1px solid var(--accent-primary, #89b4fa)' : '1px solid var(--border-subtle, #313244)',
                color: activeSection === 'execution' ? 'var(--accent-primary, #89b4fa)' : 'var(--text-secondary, #a6adc8)',
                fontWeight: activeSection === 'execution' ? 600 : 500,
                fontSize: '11px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.12s ease',
              }}
            >
              <ShieldCheck size={13} />
              <span>Agent Execution Mode</span>
            </button>

            <button
              onClick={() => setActiveSection('grounding')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '6px',
                background: activeSection === 'grounding' ? 'rgba(137, 180, 250, 0.15)' : 'var(--bg-tertiary, #11111b)',
                border: activeSection === 'grounding' ? '1px solid var(--accent-primary, #89b4fa)' : '1px solid var(--border-subtle, #313244)',
                color: activeSection === 'grounding' ? 'var(--accent-primary, #89b4fa)' : 'var(--text-secondary, #a6adc8)',
                fontWeight: activeSection === 'grounding' ? 600 : 500,
                fontSize: '11px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.12s ease',
              }}
            >
              <FileText size={13} />
              <span>Grounding & Documents</span>
            </button>

            <button
              onClick={() => setActiveSection('privacy')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '6px',
                background: activeSection === 'privacy' ? 'rgba(137, 180, 250, 0.15)' : 'var(--bg-tertiary, #11111b)',
                border: activeSection === 'privacy' ? '1px solid var(--accent-primary, #89b4fa)' : '1px solid var(--border-subtle, #313244)',
                color: activeSection === 'privacy' ? 'var(--accent-primary, #89b4fa)' : 'var(--text-secondary, #a6adc8)',
                fontWeight: activeSection === 'privacy' ? 600 : 500,
                fontSize: '11px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.12s ease',
              }}
            >
              <Shield size={13} />
              <span>Telemetry & BYOK</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area (Spacious Single Column) */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 32px 48px 32px',
          minHeight: 0,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ maxWidth: '920px', margin: '0 auto', width: '100%' }}>
          {/* SECTION 1: AI PROVIDERS */}
          {activeSection === 'providers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Cpu size={16} color="var(--accent-primary)" />
                  AI Models & Providers
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Choose your synthesis intelligence backend. You can toggle freely between Google Gemini Cloud, local models via LM Studio, or OpenRouter gateway models.
                </p>
              </div>

              {/* Segmented Provider Switcher */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px',
                  background: 'var(--bg-secondary)',
                  padding: '6px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {/* 1. Google Gemini */}
                <button
                  type="button"
                  onClick={() => setProviderState('gemini')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: provider === 'gemini' ? 'var(--accent-primary)' : 'transparent',
                    color: provider === 'gemini' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                    fontWeight: provider === 'gemini' ? 700 : 500,
                    fontSize: '12px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Sparkles size={14} />
                  <span>Google Gemini (Cloud)</span>
                </button>

                {/* 2. LM Studio (Local) */}
                <button
                  type="button"
                  onClick={() => setProviderState('lmstudio')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: provider === 'lmstudio' ? 'var(--accent-primary)' : 'transparent',
                    color: provider === 'lmstudio' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                    fontWeight: provider === 'lmstudio' ? 700 : 500,
                    fontSize: '12px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Server size={14} />
                  <span>LM Studio (Local)</span>
                </button>

                {/* 3. OpenRouter */}
                <button
                  type="button"
                  onClick={() => setProviderState('openrouter')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: provider === 'openrouter' ? 'var(--accent-primary)' : 'transparent',
                    color: provider === 'openrouter' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                    fontWeight: provider === 'openrouter' ? 700 : 500,
                    fontSize: '12px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Globe size={14} />
                  <span>OpenRouter (Gateway)</span>
                </button>
              </div>

              {/* TAB 1: GOOGLE GEMINI SETTINGS */}
              {provider === 'gemini' && (
                <div
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        GEMINI API KEY (BYOK)
                      </label>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: 'var(--accent-primary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          textDecoration: 'none',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        Get free Google AI Studio key <ExternalLink size={11} />
                      </a>
                    </div>
                    <input
                      type="password"
                      value={geminiApiKeyInput}
                      onChange={(e) => setGeminiApiKeyInput(e.target.value)}
                      placeholder="Paste your Google Gemini API key here..."
                      style={{
                        width: '100%',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        borderRadius: '6px',
                        padding: '9px 12px',
                        fontSize: '12px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      🔒 Stored locally in your browser storage. Never transmitted to LitSift servers.
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        SELECT GEMINI MODEL
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
                        <Plus size={12} /> {showCustomInput ? 'Cancel' : 'Add Custom Model'}
                      </button>
                    </div>

                    {showCustomInput && (
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        <input
                          type="text"
                          value={customModelInput}
                          onChange={(e) => setCustomModelInput(e.target.value)}
                          placeholder="e.g. gemini-2.0-flash-thinking-exp-01-21"
                          style={{
                            flex: 1,
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            fontSize: '12px',
                          }}
                        />
                        <button
                          onClick={handleAddCustomGeminiModel}
                          style={{
                            background: 'var(--accent-primary)',
                            color: 'var(--bg-primary)',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 14px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Add
                        </button>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '8px' }}>
                      {allGeminiModels.map((model) => {
                        const isSelected = currentGeminiModel === model.id;
                        return (
                          <div
                            key={model.id}
                            onClick={() => setCurrentGeminiModel(model.id)}
                            style={{
                              border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                              background: isSelected ? 'rgba(137, 180, 250, 0.12)' : 'var(--bg-tertiary)',
                              borderRadius: '8px',
                              padding: '10px 14px',
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
                                      color: isSelected ? 'var(--bg-primary)' : 'var(--text-secondary)',
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {model.isCustom && (
                                <button
                                  onClick={(e) => handleRemoveCustomGeminiModel(model.id, e)}
                                  title="Remove custom model"
                                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}
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
                </div>
              )}

              {/* TAB 2: LM STUDIO (LOCAL) SETTINGS */}
              {provider === 'lmstudio' && (
                <div
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                  }}
                >
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                      LM STUDIO LOCAL ENDPOINT URL
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
                          padding: '9px 12px',
                          fontSize: '12px',
                        }}
                      />
                      <button
                        onClick={handleTestLmStudio}
                        disabled={isTestingLmStudio}
                        style={{
                          background: 'var(--accent-primary)',
                          color: 'var(--bg-primary)',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0 16px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: isTestingLmStudio ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <RefreshCw size={13} className={isTestingLmStudio ? 'spin' : ''} />
                        {isTestingLmStudio ? 'Connecting...' : 'Test Connection'}
                      </button>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Tip: Ensure LM Studio server is started on port 1234. Browser requests are routed through Vite proxy automatically.
                    </div>
                  </div>

                  {lmStudioResult && (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: lmStudioResult.ok ? 'rgba(166, 227, 161, 0.12)' : 'rgba(243, 139, 168, 0.12)',
                        border: lmStudioResult.ok ? '1px solid rgba(166, 227, 161, 0.3)' : '1px solid rgba(243, 139, 168, 0.3)',
                        color: lmStudioResult.ok ? 'var(--accent-success)' : 'var(--accent-danger)',
                      }}
                    >
                      {lmStudioResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                      <span>{lmStudioResult.message}</span>
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                      ACTIVE LOADED MODEL
                    </label>
                    {lmStudioResult?.ok && lmStudioResult.models.length > 0 ? (
                      <select
                        value={lmStudioModel}
                        onChange={(e) => setLmStudioModelState(e.target.value)}
                        style={{
                          width: '100%',
                          background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                          borderRadius: '6px',
                          padding: '9px 12px',
                          fontSize: '12px',
                        }}
                      >
                        {lmStudioResult.models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name || m.id}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={lmStudioModel}
                        onChange={(e) => setLmStudioModelState(e.target.value)}
                        placeholder="e.g. qwen2.5-14b-instruct (or click Test Connection above)"
                        style={{
                          width: '100%',
                          background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                          borderRadius: '6px',
                          padding: '9px 12px',
                          fontSize: '12px',
                        }}
                      />
                    )}
                  </div>

                  {renderReasoningControls(lmStudioModel)}
                </div>
              )}

              {/* TAB 3: OPENROUTER (GATEWAY) SETTINGS */}
              {provider === 'openrouter' && (
                <div
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        OPENROUTER API KEY (BYOK)
                      </label>
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: 'var(--accent-primary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          textDecoration: 'none',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        Get OpenRouter API Key <ExternalLink size={11} />
                      </a>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="password"
                        value={openRouterKeyInput}
                        onChange={(e) => setOpenRouterKeyInput(e.target.value)}
                        placeholder="sk-or-v1-..."
                        style={{
                          flex: 1,
                          background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                          borderRadius: '6px',
                          padding: '9px 12px',
                          fontSize: '12px',
                        }}
                      />
                      <button
                        onClick={handleTestOpenRouter}
                        disabled={isTestingOpenRouter}
                        style={{
                          background: 'var(--accent-primary)',
                          color: 'var(--bg-primary)',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0 16px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: isTestingOpenRouter ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <RefreshCw size={13} className={isTestingOpenRouter ? 'spin' : ''} />
                        {isTestingOpenRouter ? 'Verifying...' : 'Test Key'}
                      </button>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      🔒 Stored locally in your browser. OpenRouter routes requests securely using direct browser CORS.
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                      OPENROUTER BASE URL (API ENDPOINT)
                    </label>
                    <input
                      type="text"
                      value={openRouterUrl}
                      onChange={(e) => setOpenRouterUrlState(e.target.value)}
                      placeholder="https://openrouter.ai/api/v1"
                      style={{
                        width: '100%',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        borderRadius: '6px',
                        padding: '9px 12px',
                        fontSize: '12px',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Default is <code>https://openrouter.ai/api/v1</code>. Can be customized for enterprise relays or regional proxies.
                    </div>
                  </div>

                  {openRouterResult && (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: openRouterResult.ok ? 'rgba(166, 227, 161, 0.12)' : 'rgba(243, 139, 168, 0.12)',
                        border: openRouterResult.ok ? '1px solid rgba(166, 227, 161, 0.3)' : '1px solid rgba(243, 139, 168, 0.3)',
                        color: openRouterResult.ok ? 'var(--accent-success)' : 'var(--accent-danger)',
                      }}
                    >
                      {openRouterResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                      <span>{openRouterResult.message}</span>
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                      CURATED OPENROUTER PRESETS
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
                      {CURATED_OPENROUTER_PRESETS.map((preset) => {
                        const isSelected = openRouterModel === preset.id;
                        return (
                          <div
                            key={preset.id}
                            onClick={() => setOpenRouterModelState(preset.id)}
                            style={{
                              border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                              background: isSelected ? 'rgba(137, 180, 250, 0.12)' : 'var(--bg-tertiary)',
                              borderRadius: '8px',
                              padding: '10px 12px',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                                {preset.name}
                              </span>
                              <span
                                style={{
                                  fontSize: '9px',
                                  padding: '1px 6px',
                                  borderRadius: '10px',
                                  background: isSelected ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                                  color: isSelected ? 'var(--bg-primary)' : 'var(--text-secondary)',
                                  fontWeight: 700,
                                }}
                              >
                                {preset.badge}
                              </span>
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                              Context: <strong>{preset.context}</strong> • {preset.pricing}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                              {preset.description}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                      OPENROUTER MODEL IDENTIFIER
                    </label>
                    <input
                      type="text"
                      value={openRouterModel}
                      onChange={(e) => setOpenRouterModelState(e.target.value)}
                      placeholder="e.g. qwen/qwen3.8-27b:free or any OpenRouter model ID"
                      style={{
                        width: '100%',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        borderRadius: '6px',
                        padding: '9px 12px',
                        fontSize: '12px',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      You can type any active model ID from OpenRouter's catalog.
                    </div>
                  </div>

                  {renderReasoningControls(openRouterModel)}
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: AGENT EXECUTION MODE */}
          {activeSection === 'execution' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={16} color="var(--accent-primary)" />
                  Agent Execution Mode
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Configure whether scientific findings require researcher confirmation before being finalized in your master table.
                </p>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '12px',
                }}
              >
                {/* Human in the Loop */}
                <div
                  onClick={() => setExecutionMode('human_in_loop')}
                  style={{
                    border: agentMode === 'human_in_loop' ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                    background: agentMode === 'human_in_loop' ? 'rgba(137, 180, 250, 0.12)' : 'var(--bg-secondary)',
                    borderRadius: '10px',
                    padding: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldCheck size={16} color="var(--accent-primary)" />
                      Human-in-the-Loop (HITL)
                    </div>
                    {agentMode === 'human_in_loop' && <Check size={16} color="var(--accent-primary)" />}
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    Extractions and modifications are staged in the table as <strong>"Pending Review"</strong> with yellow highlights. Cells require researcher confirmation.
                  </p>
                </div>

                {/* Autopilot */}
                <div
                  onClick={() => setExecutionMode('autonomous_autopilot')}
                  style={{
                    border: agentMode === 'autonomous_autopilot' ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                    background: agentMode === 'autonomous_autopilot' ? 'rgba(137, 180, 250, 0.12)' : 'var(--bg-secondary)',
                    borderRadius: '10px',
                    padding: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Zap size={16} color="var(--accent-warning, #f9e2af)" />
                      Autopilot Mode
                    </div>
                    {agentMode === 'autonomous_autopilot' && <Check size={16} color="var(--accent-primary)" />}
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    The agent commits extracted rows directly to <strong>"Confirmed"</strong> status without requiring manual approval clicks. Ideal for batch processing.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: GROUNDING & DOCUMENTS */}
          {activeSection === 'grounding' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={16} color="var(--accent-primary)" />
                  Grounding & Citation Policies
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  LitSift ensures all extracted data is strictly grounded in evidence passages from research documents.
                </p>
              </div>

              <div
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div>
                  <h3 style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 4px 0' }}>
                    Administrative Boilerplate Stripping
                  </h3>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    Sections such as References, Acknowledgments, and Conflict of Interest statements are automatically stripped prior to LLM transmission to maximize prompt token efficiency and stay well within context windows.
                  </p>
                </div>

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                  <h3 style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 4px 0' }}>
                    Verbatim Evidence Citations
                  </h3>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    For every extracted cell value, the agent captures the exact unaltered sentence in <code>snippetQuote</code>, section title, and page number to power instant click-to-highlight PDF verification.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 4: TELEMETRY & PRIVACY */}
          {activeSection === 'privacy' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Shield size={16} color="var(--accent-primary)" />
                  Telemetry & Security
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  LitSift is built on a client-first, Bring-Your-Own-Key (BYOK) privacy model.
                </p>
              </div>

              <div
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--accent-success)' }}>
                    <ShieldCheck size={16} /> Zero Cloud Storage of API Keys
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                    All credentials (Gemini API keys, OpenRouter keys, LM Studio endpoints) reside solely in your browser's local storage and are never uploaded to any intermediary servers.
                  </p>
                </div>

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700 }}>
                    Local Offline Mode Available
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                    When using <strong>LM Studio (Local)</strong>, research papers and extracted data never leave your local hardware.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
