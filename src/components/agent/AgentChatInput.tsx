import React, { useRef, useEffect, useState } from 'react';
import {
  Send,
  Square,
  X,
  FileText,
  Table,
  Cpu,
  ChevronDown,
  Layers,
  Eye,
  EyeOff,
  Copy,
  Check,
} from 'lucide-react';
import { usePdfStore, GroundingMode } from '../../store/usePdfStore';
import { getGroundingPayloadDetails } from '../../services/pdfUtils';

export interface ContextItemDetail {
  id: string;
  title: string;
  subtitle?: string;
  value?: string;
  quote?: string;
  onRemove?: () => void;
}

export interface SelectionContextInfo {
  type: 'cells' | 'row' | 'column' | 'table';
  summaryLabel: string;
  items: ContextItemDetail[];
}

interface AgentChatInputProps {
  inputPrompt: string;
  setInputPrompt: (val: string) => void;
  onSend: () => void;
  onCancel: () => void;
  isThinking: boolean;
  focusedCellInfo?: {
    headerName: string;
    pdfTitle?: string;
    field: string;
  } | null;
  selectionContextInfo?: SelectionContextInfo | null;
  onClearAllSelection?: () => void;
  activePdfTitle?: string;
  gridColumnCount?: number;
  selectedModel?: string;
  onOpenSettings?: () => void;
}

export const AgentChatInput: React.FC<AgentChatInputProps> = ({
  inputPrompt,
  setInputPrompt,
  onSend,
  onCancel,
  isThinking,
  selectionContextInfo,
  onClearAllSelection,
  activePdfTitle,
  gridColumnCount = 0,
  selectedModel,
  onOpenSettings,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showContextPopover, setShowContextPopover] = useState(false);
  const [showPayloadPreview, setShowPayloadPreview] = useState(false);
  const [hasCopiedPayload, setHasCopiedPayload] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const activePdf = usePdfStore((state) => state.getActivePdf());
  const setPaperGroundingMode = usePdfStore((state) => state.setPaperGroundingMode);
  const payloadDetails = getGroundingPayloadDetails(activePdf);

  const handleCopyPayload = () => {
    if (!payloadDetails.previewContent) return;
    navigator.clipboard.writeText(payloadDetails.previewContent);
    setHasCopiedPayload(true);
    setTimeout(() => setHasCopiedPayload(false), 2000);
  };

  // Dynamic textarea height adjustment
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [inputPrompt]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowContextPopover(false);
      }
    };
    if (showContextPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showContextPopover]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isThinking && inputPrompt.trim()) {
        onSend();
      }
    }
  };

  const hasDynamicSelection = Boolean(selectionContextInfo && selectionContextInfo.items.length > 0);
  const dynamicCount = selectionContextInfo?.items.length || 0;

  return (
    <div
      className="vscode-chat-input-wrapper"
      style={{
        padding: '8px 12px 10px 12px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-secondary)',
        flexShrink: 0,
      }}
    >
      <div
        className="vscode-chat-input-box"
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-tertiary)',
          border: hasDynamicSelection
            ? '1px solid var(--accent-primary)'
            : isThinking
            ? '1px solid rgba(137, 180, 250, 0.4)'
            : '1px solid var(--border-subtle)',
          borderRadius: '8px',
          padding: '8px 10px 6px 10px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
          transition: 'all 0.15s ease',
        }}
      >
        {/* Top Floating Action Pill: Context Inspector */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '6px',
          }}
        >
          <div style={{ position: 'relative' }} ref={popoverRef}>
            <button
              type="button"
              onClick={() => setShowContextPopover(!showContextPopover)}
              title={
                hasDynamicSelection
                  ? `Active Selection (${dynamicCount} items) + Document Grounding Context`
                  : 'View Attached Prompt Contexts (PDF, Dataset Schema)'
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '2.5px 7px',
                fontSize: '10.5px',
                fontWeight: 500,
                borderRadius: '4px',
                background: hasDynamicSelection
                  ? 'rgba(137, 180, 250, 0.15)'
                  : showContextPopover
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(255, 255, 255, 0.04)',
                border: hasDynamicSelection
                  ? '1px solid rgba(137, 180, 250, 0.4)'
                  : '1px solid var(--border-subtle)',
                color: hasDynamicSelection
                  ? 'var(--accent-primary)'
                  : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Layers size={11} color={hasDynamicSelection ? 'var(--accent-primary)' : 'var(--text-muted)'} />
              <span>Context</span>
              {hasDynamicSelection && (
                <span
                  style={{
                    background: 'var(--accent-primary)',
                    color: '#11111b',
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '0 4px',
                    borderRadius: '10px',
                    marginLeft: '2px',
                  }}
                >
                  {dynamicCount}
                </span>
              )}
            </button>

            {/* Context Details Inspector Popover */}
            {showContextPopover && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  marginBottom: '8px',
                  width: '360px',
                  maxHeight: '430px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.55)',
                  zIndex: 1000,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                {/* Popover Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: 'var(--bg-tertiary)',
                    borderBottom: '1px solid var(--border-subtle)',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Layers size={12} color="var(--accent-primary)" />
                    <span>Attached Prompt Contexts</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowContextPopover(false)}
                    title="Close popover"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>

                {/* Popover Body */}
                <div
                  style={{
                    overflowY: 'auto',
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  {/* Dynamic Selection Section (Dismissible) */}
                  {hasDynamicSelection && (
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '9.5px',
                          fontWeight: 700,
                          color: 'var(--accent-primary)',
                          marginBottom: '4px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        <span>Active Grid Selection ({dynamicCount})</span>
                        {onClearAllSelection && (
                          <button
                            type="button"
                            onClick={() => {
                              onClearAllSelection();
                              setShowContextPopover(false);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--accent-danger)',
                              cursor: 'pointer',
                              fontSize: '9.5px',
                              fontWeight: 600,
                              padding: 0,
                            }}
                          >
                            Clear Selection
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {selectionContextInfo?.items.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              padding: '5px 7px',
                              background: 'rgba(137, 180, 250, 0.08)',
                              border: '1px solid rgba(137, 180, 250, 0.25)',
                              borderRadius: '5px',
                              fontSize: '10.5px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '4px' }}>
                              <div style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{item.title}</div>
                              {item.onRemove && (
                                <button
                                  type="button"
                                  onClick={item.onRemove}
                                  title="Remove item from selection"
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    padding: 0,
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-danger)')}
                                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                                >
                                  <X size={11} />
                                </button>
                              )}
                            </div>
                            {item.value && (
                              <div style={{ color: 'var(--text-secondary)', marginTop: '2px', fontFamily: 'var(--font-mono, monospace)', fontSize: '10px' }}>
                                Value: <span style={{ color: 'var(--text-primary)' }}>{item.value}</span>
                              </div>
                            )}
                            {item.quote && item.quote !== 'N/A' && item.quote !== 'Not reported in document' && (
                              <div style={{ color: 'var(--text-muted)', fontSize: '9.5px', fontStyle: 'italic', marginTop: '2px' }}>
                                "{item.quote.slice(0, 90)}{item.quote.length > 90 ? '...' : ''}"
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Permanent Workspace Context (Grounding Controls & Inspection) */}
                  <div>
                    <div
                      style={{
                        fontSize: '9.5px',
                        fontWeight: 700,
                        color: 'var(--text-secondary)',
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      Permanent Grounding Context
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {/* Active Research Document Grounding Card */}
                      <div
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          padding: '7px 8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        {/* Title & Format Badge Row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                            <FileText size={12} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                            <div
                              style={{
                                fontSize: '10.5px',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '200px',
                              }}
                              title={activePdf?.title || activePdfTitle || 'Root Document'}
                            >
                              {activePdf?.title || activePdfTitle || 'Root Research Document'}
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: '8.5px',
                              background: payloadDetails.badgeBg,
                              color: payloadDetails.badgeColor,
                              padding: '1.5px 5px',
                              borderRadius: '3px',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}
                          >
                            {payloadDetails.modeLabel}
                          </span>
                        </div>

                        {/* Grounding Mode Selector & Payload Size Row */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'rgba(0, 0, 0, 0.2)',
                            borderRadius: '4px',
                            padding: '4px 6px',
                            gap: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 500 }}>
                              Mode:
                            </span>
                            <select
                              value={activePdf?.groundingMode || 'auto'}
                              onChange={(e) => {
                                if (activePdf) {
                                  setPaperGroundingMode(activePdf.id, e.target.value as GroundingMode);
                                }
                              }}
                              disabled={!activePdf}
                              style={{
                                background: 'var(--bg-tertiary)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '3px',
                                fontSize: '9.5px',
                                padding: '1.5px 4px',
                                cursor: 'pointer',
                                outline: 'none',
                              }}
                            >
                              <option value="auto">Auto (Optimal)</option>
                              {payloadDetails.hasPdf && (
                                <option value="pdf">Full PDF (Multimodal Vision)</option>
                              )}
                              <option value="structured_text">Full Structured Text</option>
                              <option value="abstract_only">Abstract-Only (Fast)</option>
                              <option value="none">Exclude Document</option>
                            </select>
                          </div>

                          <div
                            style={{
                              fontSize: '8.5px',
                              color: 'var(--text-muted)',
                              textAlign: 'right',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={payloadDetails.sizeEstimate}
                          >
                            {payloadDetails.sizeEstimate}
                          </div>
                        </div>

                        {/* Action Bar & Expandable Preview Toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '2px' }}>
                          <button
                            type="button"
                            onClick={() => setShowPayloadPreview(!showPayloadPreview)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--accent-primary)',
                              fontSize: '9.5px',
                              fontWeight: 500,
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            {showPayloadPreview ? <EyeOff size={11} /> : <Eye size={11} />}
                            <span>{showPayloadPreview ? 'Hide Payload Preview' : 'Inspect Prompt Payload'}</span>
                          </button>
                        </div>

                        {/* In-Place Expandable Raw Payload Preview Card */}
                        {showPayloadPreview && (
                          <div
                            style={{
                              marginTop: '4px',
                              background: 'rgba(0, 0, 0, 0.4)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '5px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '4px 6px',
                                background: 'rgba(255, 255, 255, 0.03)',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                              }}
                            >
                              <span style={{ fontSize: '8.5px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.4px' }}>
                                RAW PAYLOAD PREVIEW
                              </span>
                              <button
                                type="button"
                                onClick={handleCopyPayload}
                                title="Copy raw payload text to clipboard"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: hasCopiedPayload ? '#a6e3a1' : 'var(--text-muted)',
                                  fontSize: '8.5px',
                                  cursor: 'pointer',
                                  padding: 0,
                                }}
                              >
                                {hasCopiedPayload ? <Check size={10} /> : <Copy size={10} />}
                                <span>{hasCopiedPayload ? 'Copied' : 'Copy'}</span>
                              </button>
                            </div>
                            <pre
                              style={{
                                margin: 0,
                                padding: '6px 8px',
                                maxHeight: '140px',
                                overflowY: 'auto',
                                fontSize: '9px',
                                lineHeight: '1.4',
                                fontFamily: 'var(--font-mono, monospace)',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {payloadDetails.previewContent}
                            </pre>
                          </div>
                        )}
                      </div>

                      {/* Master Data Grid Schema Card */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '5px',
                          padding: '5px 7px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Table size={11} color="var(--accent-secondary, #cba6f7)" style={{ flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--text-primary)' }}>
                              Master Data Grid
                            </div>
                            <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                              {gridColumnCount} columns defined
                            </div>
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: '9px',
                            background: 'rgba(166, 227, 161, 0.15)',
                            color: '#a6e3a1',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            fontWeight: 600,
                          }}
                        >
                          Static
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Clean Prompt Input Textarea */}
        <textarea
          ref={textareaRef}
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isThinking}
          placeholder="Ask anything about this paper or dataset..."
          rows={1}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: '12px',
            fontFamily: 'inherit',
            resize: 'none',
            minHeight: '34px',
            maxHeight: '140px',
            lineHeight: '1.45',
            padding: '2px 0',
            boxSizing: 'border-box',
          }}
        />

        {/* Bottom Toolbar & Action Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '4px',
            paddingTop: '4px',
            borderTop: '1px solid rgba(255, 255, 255, 0.04)',
          }}
        >
          {/* Model Selector Pill (Bottom-Left) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={onOpenSettings}
              title="Click to select or change Gemini Model in Settings"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(137, 180, 250, 0.1)',
                border: '1px solid rgba(137, 180, 250, 0.25)',
                borderRadius: '4px',
                padding: '2px 7px',
                fontSize: '10px',
                fontWeight: 500,
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--accent-primary)',
                cursor: onOpenSettings ? 'pointer' : 'default',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(137, 180, 250, 0.18)';
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(137, 180, 250, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(137, 180, 250, 0.25)';
              }}
            >
              <Cpu size={11} color="var(--accent-primary)" />
              <span>{selectedModel || 'gemini-3.1-flash-lite'}</span>
              <ChevronDown size={10} style={{ opacity: 0.7 }} />
            </button>
          </div>

          {/* Action Button: Send vs Stop */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isThinking ? (
              <button
                type="button"
                onClick={onCancel}
                title="Stop Agent Execution"
                style={{
                  background: 'rgba(243, 139, 168, 0.18)',
                  border: '1px solid var(--accent-danger)',
                  color: 'var(--accent-danger)',
                  borderRadius: '5px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                }}
              >
                <Square size={10} fill="var(--accent-danger)" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={!inputPrompt.trim()}
                title="Send message (Enter)"
                style={{
                  background: inputPrompt.trim() ? 'var(--accent-primary)' : 'var(--bg-surface)',
                  color: inputPrompt.trim() ? 'var(--bg-secondary)' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: inputPrompt.trim() ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                  opacity: inputPrompt.trim() ? 1 : 0.5,
                }}
              >
                <span>Send</span>
                <Send size={11} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
