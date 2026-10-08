import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  User,
  Sparkles,
  Trash2,
  Copy,
  Check,
  Zap,
  RotateCcw,
  ExternalLink,
  BookOpen,
  Cog,
} from 'lucide-react';
import { useAgentStore } from '../../store/useAgentStore';
import { useGridStore } from '../../store/useGridStore';
import { renderSafeMarkdown } from '../../utils/markdownUtils';
import { getActiveModelLabel } from '../../services/providerConfig';
import { ThoughtAccordion } from './ThoughtAccordion';
import { AgentToolStepper } from './AgentToolStepper';
import { AgentChatInput } from './AgentChatInput';
import { DiscoveryCandidateCard } from './DiscoveryCandidateCard';
import type { DiscoveredPaperCandidate } from '../../services/academicSearchService';

interface RightAgentPanelProps {
  activePdfTitle?: string;
  onOpenSettings?: () => void;
}

export const RightAgentPanel: React.FC<RightAgentPanelProps> = ({
  activePdfTitle = 'Active Paper',
  onOpenSettings,
}) => {
  const {
    messages,
    isThinking,
    activityStatus,
    activityDetail,
    activityToolName,
    streamingThought,
    streamingText,
    sendMessage,
    cancelInteraction,
    selectOption,
    clearMessages,
    deleteMessage,
  } = useAgentStore();

  const {
    rows,
    columns,
    activeCitation,
    focusedCell,
    selectedCells,
    removeSelectedCell,
    selectedRowIds,
    selectedColumnField,
    isTableSelected,
    resetActiveSelection,
    setActiveEvidence,
  } = useGridStore();

  const [inputPrompt, setInputPrompt] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Live timer during thinking / agent execution with 100ms interval
  useEffect(() => {
    let interval: any;
    if (isThinking) {
      const start = Date.now();
      interval = setInterval(() => {
        setElapsed((Date.now() - start) / 1000);
      }, 100);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(interval);
  }, [isThinking]);

  const handleSend = () => {
    if (!inputPrompt.trim() || isThinking) return;
    const text = inputPrompt;
    setInputPrompt('');
    sendMessage(text, activePdfTitle);
  };

  const handleJumpToCitation = () => {
    if (activeCitation) {
      setActiveEvidence({
        pageNumber: activeCitation.pageNumber || 1,
        snippetText: activeCitation.snippetQuote || '',
        sectionName: activeCitation.sectionName,
        paragraphNumber: activeCitation.paragraphNumber,
      });
    }
  };

  useEffect(() => {
    if (chatBottomRef.current && typeof chatBottomRef.current.scrollIntoView === 'function') {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking, streamingThought, streamingText]);

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMsgId(id);
      setTimeout(() => setCopiedMsgId(null), 1800);
    });
  };

  // Resolve active selection metadata for Antigravity-style context inspector
  const validSelectedCells = (selectedCells || []).filter(
    (c) => c.field !== '0' && c.field !== 'rowNum' && columns.some((col) => col.field === c.field)
  );

  let selectionContextInfo: {
    type: 'cells' | 'row' | 'column' | 'table';
    summaryLabel: string;
    items: Array<{
      id: string;
      title: string;
      subtitle?: string;
      value?: string;
      quote?: string;
      onRemove?: () => void;
    }>;
  } | null = null;

  if (validSelectedCells.length > 0) {
    const firstCol = columns.find((c) => c.field === validSelectedCells[0].field);
    const summary = validSelectedCells.length === 1
      ? `Cell: ${firstCol?.headerName || validSelectedCells[0].field}`
      : `${validSelectedCells.length} Cells`;

    selectionContextInfo = {
      type: 'cells',
      summaryLabel: summary,
      items: validSelectedCells.map((c) => {
        const row = rows.find((r) => r.id === c.rowId);
        const rowIndex = rows.findIndex((r) => r.id === c.rowId);
        const col = columns.find((cl) => cl.field === c.field);
        const cit = row?.citationMap?.[c.field];
        return {
          id: `${c.rowId}-${c.field}`,
          title: `Row ${rowIndex >= 0 ? rowIndex + 1 : '?'}: ${col?.headerName || c.field}`,
          subtitle: row?.pdfTitle || 'Active Paper',
          value: row ? String(row[c.field] ?? 'Empty') : 'Unknown',
          quote: cit?.snippetQuote,
          onRemove: () => removeSelectedCell(c),
        };
      }),
    };
  } else if (selectedRowIds.length > 0) {
    const firstRowIndex = rows.findIndex((r) => r.id === selectedRowIds[0]);
    selectionContextInfo = {
      type: 'row',
      summaryLabel: selectedRowIds.length === 1
        ? `Row ${firstRowIndex >= 0 ? firstRowIndex + 1 : 1}`
        : `${selectedRowIds.length} Rows`,
      items: selectedRowIds.map((rowId) => {
        const row = rows.find((r) => r.id === rowId);
        const rowIndex = rows.findIndex((r) => r.id === rowId);
        return {
          id: rowId,
          title: `Row ${rowIndex >= 0 ? rowIndex + 1 : '?'}: ${row?.pdfTitle || 'Selected Observation'}`,
          subtitle: `${columns.length} columns`,
          onRemove: () => resetActiveSelection(),
        };
      }),
    };
  } else if (selectedColumnField) {
    const col = columns.find((c) => c.field === selectedColumnField);
    selectionContextInfo = {
      type: 'column',
      summaryLabel: `Col: ${col?.headerName || selectedColumnField}`,
      items: [
        {
          id: selectedColumnField,
          title: `Column: ${col?.headerName || selectedColumnField}`,
          subtitle: `${rows.length} rows in dataset`,
          onRemove: () => resetActiveSelection(),
        },
      ],
    };
  } else if (isTableSelected) {
    selectionContextInfo = {
      type: 'table',
      summaryLabel: `Entire Table (${rows.length} rows)`,
      items: [
        {
          id: 'table',
          title: `Full Dataset Grid`,
          subtitle: `${rows.length} rows, ${columns.length} columns`,
          onRemove: () => resetActiveSelection(),
        },
      ],
    };
  }

  return (
    <aside
      className="panel right-agent vscode-chat-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        height: '100%',
        background: 'var(--bg-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Top Header Bar */}
      <div
        className="vscode-chat-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-subtle)',
          fontSize: '11px',
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text-primary)' }}>
          <Bot size={14} color="var(--accent-primary)" />
          <span>Agent</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Start Fresh Session */}
          <button
            onClick={clearMessages}
            title="Start New Chat Session"
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '3px',
              borderRadius: '4px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* Interactive AI Cell Reasoning & Grounding Card */}
      {focusedCell && activeCitation && (
        <div
          onClick={handleJumpToCitation}
          title="Click to jump to evidence passage in document"
          style={{
            margin: '8px 10px 0 10px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '8px 10px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '4px',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--accent-primary)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Sparkles size={12} color="var(--accent-primary)" /> Cell Grounding Context
            </span>
            <span style={{ fontSize: '10px', color: 'var(--accent-success)', fontWeight: 600 }}>
              {Math.round(activeCitation.confidence * 100)}% Match
            </span>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-primary)', marginBottom: '6px', lineHeight: '1.35' }}>
            {activeCitation.reasoning}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '10px',
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
              background: 'var(--bg-tertiary)',
              padding: '4px 8px',
              borderRadius: '4px',
              gap: '8px',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              "{activeCitation.snippetQuote}"
            </span>
            <span style={{ fontSize: '9px', color: 'var(--accent-primary)', flexShrink: 0, fontStyle: 'normal', display: 'flex', alignItems: 'center', gap: '2px' }}>
              p. {activeCitation.pageNumber} <ExternalLink size={9} />
            </span>
          </div>
        </div>
      )}

      {/* Main VS Code Editorial Chat Stream */}
      <div
        className="vscode-chat-stream-container"
        style={{
          flex: 1,
          padding: '12px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {messages
          .filter((msg) => msg.text !== '⚡ LitSift Agent ready' && !msg.text.startsWith('⚡ Viewing'))
          .map((msg) => {
            const isUser = msg.sender === 'user';
            const isCopied = copiedMsgId === msg.id;

            return (
              <div
                key={msg.id}
                className={`vscode-chat-turn ${msg.sender}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  background: isUser ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
                  border: isUser ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                {/* Turn Header: Icon only & Action Buttons */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '6px',
                    fontSize: '10.5px',
                    color: 'var(--text-muted)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {isUser ? (
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <User size={11} color="var(--text-secondary)" />
                      </div>
                    ) : (
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '4px',
                          background: 'rgba(137, 180, 250, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Bot size={11} color="var(--accent-primary)" />
                      </div>
                    )}
                  </div>

                  {/* Quick Action Toolbar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      onClick={() => handleCopyText(msg.id, msg.text)}
                      title="Copy message content"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: isCopied ? 'var(--accent-success)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '2px',
                        borderRadius: '3px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = isCopied ? 'var(--accent-success)' : 'var(--text-muted)')}
                    >
                      {isCopied ? <Check size={11} /> : <Copy size={11} />}
                    </button>

                    <button
                      onClick={() => deleteMessage(msg.id)}
                      title="Delete turn"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '2px',
                        borderRadius: '3px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-danger)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                {/* Turn Body */}
                <div style={{ fontSize: '12px', lineHeight: '1.5', color: 'var(--text-primary)' }}>
                  {/* 1. Chain-of-Thought Reasoning Accordion (Formatted Markdown) */}
                  {!isUser && msg.thought && (
                    <ThoughtAccordion
                      thought={msg.thought}
                      thinkingTokens={msg.thinkingTokens}
                      elapsedSeconds={msg.executionTime}
                    />
                  )}

                  {/* 2. Stepper for Tool Actions */}
                  {!isUser && msg.toolsExecuted && msg.toolsExecuted.length > 0 && (
                    <AgentToolStepper
                      tools={msg.toolsExecuted}
                      executionTime={msg.executionTime}
                    />
                  )}

                  {/* 3. Natural Language / Markdown Response */}
                  {!isUser ? (
                    <div
                      className="chat-markdown vscode-markdown"
                      dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(msg.text) }}
                    />
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                  )}

                  {/* 3.5. Discovered Academic Papers Cards (Phase 3 HITL Discovery) */}
                  {!isUser && msg.toolsExecuted && (
                    (() => {
                      const discoveryTools = msg.toolsExecuted.filter(
                        (t) => t.name === 'searchAcademicLiterature' && t.status === 'completed' && t.result?.candidates?.length > 0
                      );
                      if (discoveryTools.length === 0) return null;

                      return (
                        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {discoveryTools.map((tool) => (
                            <div key={tool.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  fontSize: '10.5px',
                                  fontWeight: 600,
                                  color: 'var(--text-secondary)',
                                  padding: '0 2px',
                                }}
                              >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <BookOpen size={11} color="var(--accent-primary)" />
                                  Discovered Papers ({tool.result.candidates.length})
                                </span>
                                <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                                  {tool.result.searchStrategy === 'related_works' ? 'Citation Graph' : 'Registry Search'}
                                </span>
                              </div>
                              {tool.result.candidates.map((cand: DiscoveredPaperCandidate, idx: number) => (
                                <DiscoveryCandidateCard
                                  key={cand.id || cand.doi || `candidate-${idx}`}
                                  candidate={cand}
                                />
                              ))}
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  )}

                  {/* 4. Interactive Suggestion Option Chips */}
                  {msg.options && msg.options.length > 0 && (
                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {msg.options.map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => selectOption(opt)}
                          style={{
                            background: 'var(--bg-secondary)',
                            color: 'var(--accent-primary)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                            padding: '5px 8px',
                            fontSize: '11px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontWeight: 500,
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--accent-primary)';
                            e.currentTarget.style.background = 'rgba(137, 180, 250, 0.08)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-subtle)';
                            e.currentTarget.style.background = 'var(--bg-secondary)';
                          }}
                        >
                          <Sparkles size={11} color="var(--accent-primary)" />
                          <span>{opt}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 5. In-Turn Telemetry & Token Metadata Pill (VS Code Style) */}
                  {!isUser && (msg.executionTime !== undefined || msg.promptTokens !== undefined) && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '6px',
                        marginTop: '8px',
                        paddingTop: '6px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.04)',
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        userSelect: 'none',
                      }}
                      title={[
                        msg.modelUsed ? `Model: ${msg.modelUsed}` : '',
                        msg.upstreamProvider ? `Upstream Provider: ${msg.upstreamProvider}` : '',
                        msg.generationId ? `Generation ID: ${msg.generationId}` : '',
                        msg.executionTime !== undefined ? `Total Duration: ${msg.executionTime.toFixed(1)}s` : '',
                        msg.timeToFirstToken !== undefined ? `Time to First Token (TTFT): ${msg.timeToFirstToken.toFixed(1)}s` : '',
                        msg.tokensPerSecond !== undefined ? `Throughput: ${msg.tokensPerSecond} tokens/sec` : '',
                        msg.promptTokens !== undefined
                          ? `Context Window: ${msg.promptTokens.toLocaleString()} tokens${
                              msg.cachedTokens
                                ? ` (${msg.cachedTokens.toLocaleString()} cached, ${Math.max(0, msg.promptTokens - msg.cachedTokens).toLocaleString()} newly evaluated)`
                                : ''
                            }`
                          : '',
                        msg.candidateTokens !== undefined ? `Output Tokens: ${msg.candidateTokens.toLocaleString()}` : '',
                        msg.thinkingTokens ? `Reasoning Tokens: ${msg.thinkingTokens.toLocaleString()}` : '',
                        msg.cost !== undefined ? `Cost: $${msg.cost.toFixed(6)}` : '',
                      ]
                        .filter(Boolean)
                        .join('\n')}
                    >
                      {/* 1. Total Duration */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Zap size={10} color="var(--accent-primary)" />
                        <span>{msg.executionTime !== undefined ? `${msg.executionTime.toFixed(1)}s` : 'Instant'}</span>
                      </div>

                      {/* 2. TTFT */}
                      {msg.timeToFirstToken !== undefined && (
                        <>
                          <span style={{ opacity: 0.35 }}>|</span>
                          <span>TTFT {msg.timeToFirstToken.toFixed(1)}s</span>
                        </>
                      )}

                      {/* 3. Input Tokens (e.g. 23,000 + 200 in or 23,200 in) */}
                      {msg.promptTokens !== undefined && (
                        <>
                          <span style={{ opacity: 0.35 }}>|</span>
                          <span title={`Context Window: ${msg.promptTokens.toLocaleString()} tokens${msg.cachedTokens ? ` (${msg.cachedTokens.toLocaleString()} cached, ${Math.max(0, msg.promptTokens - msg.cachedTokens).toLocaleString()} newly evaluated)` : ''}`}>
                            {msg.cachedTokens !== undefined && msg.cachedTokens > 0
                              ? `${msg.cachedTokens.toLocaleString()} + ${Math.max(0, msg.promptTokens - msg.cachedTokens).toLocaleString()} in`
                              : `${msg.promptTokens.toLocaleString()} in`}
                          </span>
                        </>
                      )}

                      {/* 4. Output Tokens */}
                      {msg.candidateTokens !== undefined && (
                        <>
                          <span style={{ opacity: 0.35 }}>|</span>
                          <span title={`Output Candidate Tokens: ${msg.candidateTokens.toLocaleString()}`}>
                            {msg.candidateTokens.toLocaleString()} out
                          </span>
                        </>
                      )}

                      {/* 5. Speed (tok/s) */}
                      {msg.tokensPerSecond !== undefined && msg.tokensPerSecond > 0 && (
                        <>
                          <span style={{ opacity: 0.35 }}>|</span>
                          <span
                            style={{ color: 'var(--accent-primary)', fontWeight: 500 }}
                            title={`Generation Throughput: ${msg.tokensPerSecond} tokens per second`}
                          >
                            {msg.tokensPerSecond} tok/s
                          </span>
                        </>
                      )}

                      {/* 6. Reasoning / Thinking Tokens */}
                      {msg.thinkingTokens !== undefined && msg.thinkingTokens > 0 && (
                        <>
                          <span style={{ opacity: 0.35 }}>|</span>
                          <span title={`Reasoning / Thinking Tokens: ${msg.thinkingTokens.toLocaleString()}`}>
                            {msg.thinkingTokens.toLocaleString()} thought
                          </span>
                        </>
                      )}

                      {/* 7. Cost */}
                      {msg.cost !== undefined && (
                        <>
                          <span style={{ opacity: 0.35 }}>|</span>
                          <span
                            style={{
                              color: msg.cost === 0 ? 'var(--text-muted)' : '#a6e3a1',
                              fontWeight: 500,
                            }}
                            title={`Inference Cost: ${msg.cost === 0 ? 'Free tier ($0.00)' : `$${msg.cost.toFixed(6)}`}`}
                          >
                            {msg.cost === 0 ? '$0.00 (free)' : `$${msg.cost < 0.01 ? msg.cost.toFixed(4) : msg.cost.toFixed(3)}`}
                          </span>
                        </>
                      )}

                      {/* 8. Model & Upstream Provider */}
                      {msg.modelUsed && (() => {
                        const displayModel = msg.modelUsed.includes('/')
                          ? msg.modelUsed.split('/').slice(1).join('/')
                          : msg.modelUsed;
                        return (
                          <div
                            style={{
                              marginLeft: 'auto',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '9px',
                              fontFamily: 'var(--font-mono, monospace)',
                              color: 'var(--text-muted)',
                              opacity: 0.85,
                            }}
                            title={`Model: ${msg.modelUsed}${msg.upstreamProvider ? ` (via ${msg.upstreamProvider})` : ''}`}
                          >
                            <span style={{ opacity: 0.35 }}>|</span>
                            <span>
                              {displayModel}
                              {msg.upstreamProvider && (
                                <span style={{ opacity: 0.75, marginLeft: '4px' }}>
                                  ({msg.upstreamProvider})
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

        {/* Live Active Turn with Granular Step Feedback */}
        {isThinking && (
          <div
            className="vscode-chat-turn agent live-thinking"
            style={{
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '6px',
              padding: '6px 8px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '6px',
                fontSize: '10.5px',
                color: 'var(--text-muted)',
              }}
            >
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '4px',
                  background: 'rgba(137, 180, 250, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Bot size={11} color="var(--accent-primary)" />
              </div>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>LitSift Agent</span>
            </div>

            {/* Phase 1: Context Reading & Ingestion (Only before text or thoughts have started) */}
            {activityStatus === 'reading_context' && !streamingThought && !streamingText && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  background: 'rgba(137, 180, 250, 0.05)',
                  border: '1px solid rgba(137, 180, 250, 0.15)',
                  fontSize: '11px',
                  marginBottom: '8px',
                }}
              >
                <BookOpen size={13} color="var(--accent-primary)" style={{ animation: 'pulse-dot 1.5s ease-in-out infinite' }} />
                <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>
                  Reading context & prompt
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  ({elapsed.toFixed(1)}s)...
                </span>
                {activityDetail && (
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      marginLeft: 'auto',
                      fontStyle: 'italic',
                      maxWidth: '220px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={activityDetail}
                  >
                    {activityDetail}
                  </span>
                )}
              </div>
            )}

            {/* Phase 2: Chain-of-Thought (ONLY rendered if thought tokens actually exist) */}
            {streamingThought && (
              <ThoughtAccordion
                thought={streamingThought}
                isActive={activityStatus === 'thinking' || (!streamingText && activityStatus !== 'executing_tool' && activityStatus !== 'formulating_action')}
                elapsedSeconds={elapsed}
                defaultExpanded={true}
              />
            )}

            {/* Phase 3 (Case 1): Internal Tokens / Tool Formulation & Execution Feedback */}
            {(activityStatus === 'formulating_action' || activityStatus === 'executing_tool') && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  background: 'rgba(250, 179, 135, 0.08)',
                  border: '1px solid rgba(250, 179, 135, 0.25)',
                  fontSize: '11px',
                  marginBottom: '8px',
                }}
              >
                <Cog size={13} color="#fab387" style={{ animation: 'spin 2s linear infinite' }} />
                <span style={{ fontWeight: 600, color: '#fab387' }}>
                  {activityStatus === 'formulating_action'
                    ? `Formulating tool call: ${activityToolName || 'tool'}`
                    : `Executing: ${activityToolName || 'tool'}`}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  ({elapsed.toFixed(1)}s)...
                </span>
                {activityDetail && (
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      marginLeft: 'auto',
                      fontStyle: 'italic',
                      maxWidth: '220px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={activityDetail}
                  >
                    {activityDetail}
                  </span>
                )}
              </div>
            )}

            {/* Phase 4 (Case 2): Conversational Text Streaming (Direct Markdown, no redundant banner) */}
            {streamingText && (
              <div
                className="chat-markdown vscode-markdown"
                style={{ marginTop: '4px', padding: '0 4px' }}
                dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(streamingText) }}
              />
            )}
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Unified VS Code Copilot Chat Input */}
      <AgentChatInput
        inputPrompt={inputPrompt}
        setInputPrompt={setInputPrompt}
        onSend={handleSend}
        onCancel={cancelInteraction}
        isThinking={isThinking}
        selectionContextInfo={selectionContextInfo}
        onClearAllSelection={() => resetActiveSelection()}
        activePdfTitle={activePdfTitle}
        gridColumnCount={columns.length}
        selectedModel={getActiveModelLabel()}
        onOpenSettings={onOpenSettings}
      />
    </aside>
  );
};

export default RightAgentPanel;
