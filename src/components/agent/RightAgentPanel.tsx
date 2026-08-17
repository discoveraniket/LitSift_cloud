import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Terminal,
  FileText,
  Lightbulb,
  Trash2,
  X,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useAgentStore } from '../../store/useAgentStore';
import { useGridStore } from '../../store/useGridStore';
import { useLogStore } from '../../store/useLogStore';
import { marked } from 'marked';

// Configure marked options
marked.setOptions({
  gfm: true,
  breaks: true,
});

interface RightAgentPanelProps {
  activePdfTitle?: string;
}

export const RightAgentPanel: React.FC<RightAgentPanelProps> = ({ activePdfTitle = 'Active Paper' }) => {
  const {
    messages,
    isThinking,
    mode,
    setExecutionMode,
    sendMessage,
    cancelInteraction,
    selectOption,
    clearMessages,
  } = useAgentStore();

  const {
    rows,
    columns,
    confirmAIEdits,
    rejectAIEdits,
    activeCitation,
    focusedCell,
    resetActiveSelection,
    setActiveEvidence,
    addCellDiscussionMessage,
  } = useGridStore();

  const { logs, activeStep, isOpen: isLogOpen, toggleOpen, clearLogs } = useLogStore();

  const [inputPrompt, setInputPrompt] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [expandedMsgTools, setExpandedMsgTools] = useState<Record<string, boolean>>({});
  const [expandedToolPayloadId, setExpandedToolPayloadId] = useState<string | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const logsBottomRef = useRef<HTMLDivElement>(null);

  const pendingRows = rows.filter((r) => r.aiStatus === 'Pending Review');
  const hasPendingEdits = pendingRows.length > 0;

  // Live timer during thinking / tool execution with steady 100ms updates
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea dynamically based on text content height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 38), 160)}px`;
    }
  }, [inputPrompt]);

  const handleSend = (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!inputPrompt.trim() || isThinking) return;

    if (focusedCell) {
      addCellDiscussionMessage(focusedCell.rowId, focusedCell.field, inputPrompt.trim());
    }

    // Send clean text without prepended tags
    sendMessage(inputPrompt.trim(), activePdfTitle);
    setInputPrompt('');

    if (textareaRef.current) {
      textareaRef.current.style.height = '38px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const handleJumpToCitation = () => {
    if (activeCitation) {
      setActiveEvidence({
        pageNumber: activeCitation.pageNumber || 1,
        snippetText: activeCitation.snippetQuote || '',
        bbox: activeCitation.bbox,
      });
    }
  };

  const toggleToolsForMessage = (msgId: string) => {
    setExpandedMsgTools((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  useEffect(() => {
    if (chatBottomRef.current && typeof chatBottomRef.current.scrollIntoView === 'function') {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking]);

  useEffect(() => {
    if (isLogOpen && logsBottomRef.current && typeof logsBottomRef.current.scrollIntoView === 'function') {
      logsBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isLogOpen]);

  return (
    <aside className="panel right-agent" style={{ display: 'flex', flexDirection: 'column', position: 'relative', height: '100%' }}>
      {/* Panel Header with Mode Switcher & Log Drawer Controls */}
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Bot size={14} color="var(--accent-primary)" />
          <span style={{ fontWeight: 700 }}>AGENTIC AI COMMAND CENTER</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Execution Mode Toggle: Human-in-the-Loop vs Autopilot */}
          <button
            onClick={() => setExecutionMode(mode === 'human_in_loop' ? 'autonomous_autopilot' : 'human_in_loop')}
            title={`Toggle mode. Currently: ${mode === 'human_in_loop' ? 'Human-in-the-Loop (Staged Review)' : 'Autonomous Autopilot (Instant Commit)'}`}
            style={{
              background: mode === 'human_in_loop' ? 'rgba(249, 226, 175, 0.15)' : 'rgba(166, 227, 161, 0.15)',
              border: `1px solid ${mode === 'human_in_loop' ? 'var(--accent-warning, #f9e2af)' : 'var(--accent-success)'}`,
              color: mode === 'human_in_loop' ? 'var(--accent-warning, #f9e2af)' : 'var(--accent-success)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10px',
              padding: '2px 7px',
              borderRadius: '4px',
              fontWeight: 600,
              transition: 'all 0.2s ease',
            }}
          >
            {mode === 'human_in_loop' ? <ShieldCheck size={11} /> : <Zap size={11} />}
            <span>{mode === 'human_in_loop' ? 'HITL Review' : 'Autopilot'}</span>
          </button>

          {/* Logs Drawer Toggle */}
          <button
            onClick={toggleOpen}
            title="Toggle Live Debug & Execution Logs"
            style={{
              background: isLogOpen ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: isLogOpen ? 'var(--bg-secondary)' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '4px',
              fontWeight: 600,
              transition: 'all 0.2s ease',
            }}
          >
            <Terminal size={11} />
            <span>Logs ({logs.length})</span>
          </button>

          <button
            onClick={() => clearMessages()}
            title="Clear Chat History & Start Fresh Session"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              padding: '2px 4px',
              borderRadius: '4px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-danger)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Embedded Live Execution Console Drawer */}
      {isLogOpen && (
        <div
          style={{
            maxHeight: '220px',
            minHeight: '140px',
            background: '#11111b',
            borderBottom: '2px solid var(--accent-primary)',
            padding: '8px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#cdd6f4',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', borderBottom: '1px solid #313244', paddingBottom: '4px' }}>
            <span style={{ color: 'var(--accent-primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Terminal size={11} /> LIVE EXECUTION LOGS
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={clearLogs}
                style={{ background: 'transparent', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: '9px' }}
                title="Clear Logs"
              >
                Clear
              </button>
              <button
                onClick={toggleOpen}
                style={{ background: 'transparent', border: 'none', color: '#a6adc8', cursor: 'pointer' }}
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {logs.length === 0 ? (
            <div style={{ color: '#6c7086', fontStyle: 'italic', padding: '6px 0' }}>No execution events logged yet. Trigger an action or query.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderLeft: `2px solid ${log.level === 'error' ? '#f38ba8' : log.level === 'success' ? '#a6e3a1' : log.level === 'warn' ? '#f9e2af' : '#89b4fa'}`, paddingLeft: '6px', margin: '2px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: log.level === 'error' ? '#f38ba8' : log.level === 'success' ? '#a6e3a1' : log.level === 'warn' ? '#f9e2af' : '#89b4fa', fontWeight: 600 }}>
                    [{log.timestamp}] {log.message}
                  </span>
                  {log.details && (
                    <button
                      onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                      style={{ background: 'transparent', border: 'none', color: '#89b4fa', cursor: 'pointer', fontSize: '9px', display: 'flex', alignItems: 'center' }}
                    >
                      {expandedLogId === log.id ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      <span>payload</span>
                    </button>
                  )}
                </div>
                {log.details && expandedLogId === log.id && (
                  <pre style={{ background: '#181825', padding: '4px', borderRadius: '4px', overflowX: 'auto', color: '#bac2de', fontSize: '9px', margin: '2px 0' }}>
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
          <div ref={logsBottomRef} />
        </div>
      )}

      {/* Human-in-the-Loop Review Banner (Staged Edits Pending Review) */}
      {hasPendingEdits && mode === 'human_in_loop' && (
        <div
          style={{
            margin: '8px 8px 0 8px',
            background: 'rgba(249, 226, 175, 0.12)',
            border: '1px solid var(--accent-warning, #f9e2af)',
            borderRadius: '6px',
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
          }}
        >
          <div style={{ color: 'var(--accent-warning, #f9e2af)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={14} />
            <span>{pendingRows.length} row(s) staged for review</span>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => confirmAIEdits()}
              style={{
                background: 'var(--accent-success)',
                color: 'var(--bg-secondary)',
                border: 'none',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <CheckCircle2 size={11} /> Confirm All
            </button>
            <button
              onClick={() => rejectAIEdits()}
              style={{
                background: 'rgba(243, 139, 168, 0.2)',
                color: 'var(--accent-danger)',
                border: '1px solid var(--accent-danger)',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <XCircle size={11} /> Reject
            </button>
          </div>
        </div>
      )}

      {/* Interactive AI Cell Reasoning & Grounding Card */}
      {focusedCell && activeCitation && (
        <div
          onClick={handleJumpToCitation}
          title="Click to jump to evidence passage in document"
          style={{
            margin: '8px 8px 0 8px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--accent-primary)',
            borderRadius: '8px',
            padding: '10px 12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            cursor: 'pointer',
            transition: 'border-color 0.2s ease',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--accent-primary)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Lightbulb size={13} color="#f9e2af" /> AI CELL REASONING
            </span>
            <span
              style={{
                fontSize: '10px',
                background: 'rgba(166, 227, 161, 0.2)',
                color: 'var(--accent-success)',
                padding: '1px 6px',
                borderRadius: '10px',
                border: '1px solid var(--accent-success)',
                fontWeight: 700,
              }}
            >
              {Math.round(activeCitation.confidence * 100)}% Grounded
            </span>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-primary)', marginBottom: '8px', lineHeight: '1.4' }}>
            <strong>💡 Rationale:</strong> {activeCitation.reasoning}
          </div>

          <div
            style={{
              background: 'var(--bg-secondary)',
              borderLeft: '3px solid var(--accent-primary)',
              padding: '6px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
            }}
          >
            <div style={{ fontWeight: 600, fontStyle: 'normal', color: 'var(--text-primary)', marginBottom: '2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <FileText size={11} /> Source: {activeCitation.sectionName} (Page {activeCitation.pageNumber})
              </span>
              <span style={{ fontSize: '9px', color: 'var(--accent-primary)', textDecoration: 'underline' }}>Jump to page ↗</span>
            </div>
            "{activeCitation.snippetQuote}"
          </div>
        </div>
      )}

      {/* Main Chat Stream */}
      <div className="agent-stream-container" style={{ flex: 1, padding: '12px', overflowY: 'auto' }}>
        {messages.map((msg) => {
          const isToolsExpanded = !!expandedMsgTools[msg.id];
          const hasTools = msg.toolsExecuted && msg.toolsExecuted.length > 0;

          return (
            <div
              key={msg.id}
              className={`agent-message-bubble ${msg.sender}`}
              style={{
                marginBottom: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '4px',
                  fontSize: '10px',
                  color: 'var(--text-secondary)',
                }}
              >
                {msg.sender === 'user' ? (
                  <>
                    <span>You</span> <User size={11} />
                  </>
                ) : (
                  <>
                    <Bot size={11} color="var(--accent-primary)" /> <span>LitSift Agent</span>
                  </>
                )}
                <span>• {msg.timestamp}</span>
              </div>

              <div
                style={{
                  background: msg.sender === 'user' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  color: msg.sender === 'user' ? 'var(--bg-secondary)' : 'var(--text-primary)',
                  padding: '8px 12px',
                  borderRadius: msg.sender === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  fontSize: '12px',
                  lineHeight: '1.4',
                  maxWidth: '92%',
                  border: msg.sender === 'agent' ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                {/* VS Code Copilot Style Collapsible Tool Execution Section */}
                {hasTools && (
                  <div style={{ marginBottom: '8px' }}>
                    <button
                      onClick={() => toggleToolsForMessage(msg.id)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        width: '100%',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                        {isToolsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <Terminal size={11} color="var(--accent-primary)" />
                        <span>Executed {msg.toolsExecuted!.length} tool action{msg.toolsExecuted!.length > 1 ? 's' : ''}</span>
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--accent-success)', fontWeight: 600 }}>✓ Complete</span>
                    </button>

                    {/* Expandable Step Details */}
                    {isToolsExpanded && (
                      <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '4px', borderLeft: '2px solid var(--border-subtle)' }}>
                        {msg.toolsExecuted!.map((t) => (
                          <div
                            key={t.id}
                            style={{
                              background: '#11111b',
                              border: `1px solid ${t.status === 'completed' ? '#313244' : 'var(--accent-danger)'}`,
                              borderRadius: '4px',
                              padding: '6px 8px',
                              fontSize: '10px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 600, color: t.status === 'completed' ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                                {t.status === 'completed' ? '✓' : '✗'} <code>{t.name}</code>
                              </span>
                              {t.args && Object.keys(t.args).length > 0 && (
                                <button
                                  onClick={() => setExpandedToolPayloadId(expandedToolPayloadId === t.id ? null : t.id)}
                                  style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '9px' }}
                                >
                                  {expandedToolPayloadId === t.id ? 'hide payload' : 'view payload'}
                                </button>
                              )}
                            </div>
                            <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {t.summary} {t.error ? `(${t.error})` : ''}
                            </div>
                            {expandedToolPayloadId === t.id && t.args && (
                              <pre style={{ background: '#181825', padding: '4px', borderRadius: '4px', overflowX: 'auto', color: '#bac2de', fontSize: '9px', marginTop: '4px' }}>
                                {JSON.stringify(t.args, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Natural Language Response Content */}
                {msg.sender === 'agent' ? (
                  <div
                    className="chat-markdown"
                    dangerouslySetInnerHTML={{ __html: marked.parse(msg.text) as string }}
                  />
                ) : (
                  <div>{msg.text}</div>
                )}

                {msg.options && (
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {msg.options.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => selectOption(opt)}
                        style={{
                          background: 'var(--bg-secondary)',
                          color: 'var(--accent-primary)',
                          border: '1px solid var(--accent-primary)',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          fontSize: '11px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontWeight: 500,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        👉 {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Live Active Thinking / Execution Bubble (VS Code Copilot Style) */}
        {isThinking && (
          <div
            className="agent-message-bubble agent"
            style={{
              marginBottom: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '4px',
                fontSize: '10px',
                color: 'var(--text-secondary)',
              }}
            >
              <Bot size={11} color="var(--accent-primary)" /> <span>LitSift Agent</span>
              <span>• Live</span>
            </div>

            <div
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--accent-primary)',
                borderRadius: '12px 12px 12px 2px',
                padding: '10px 12px',
                maxWidth: '92%',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)', fontSize: '11px', fontWeight: 600 }}>
                  <Sparkles size={14} className="spin-icon" />
                  <span>{activeStep || 'Agent is reasoning & executing tools...'}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '10px',
                      padding: '2px 6px',
                      minWidth: '54px',
                      textAlign: 'center',
                      fontVariantNumeric: 'tabular-nums',
                      display: 'inline-flex',
                      justifyContent: 'center',
                    }}
                  >
                    ⏱️ {elapsed.toFixed(1)}s
                  </span>

                  <button
                    onClick={cancelInteraction}
                    title="Stop Agent Execution"
                    style={{
                      background: 'rgba(243, 139, 168, 0.2)',
                      border: '1px solid var(--accent-danger)',
                      color: 'var(--accent-danger)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Stop
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Modern Multiline Chat Interface with Active Cell Context */}
      <form className="agent-input-form" onSubmit={(e) => handleSend(e)} style={{ padding: '10px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
        {focusedCell && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(137, 180, 250, 0.12)',
              border: '1px solid var(--accent-primary)',
              borderRadius: '8px',
              padding: '5px 10px',
              marginBottom: '8px',
              fontSize: '11px',
            }}
          >
            <span style={{ color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
              <span>🎯 Target Cell:</span>
              <span style={{ color: 'var(--text-primary)', background: 'var(--bg-tertiary)', padding: '1px 7px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                {columns.find((c) => c.field === focusedCell.field)?.headerName || focusedCell.field}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                ({rows.find((r) => r.id === focusedCell.rowId)?.pdfTitle || 'Selected Row'})
              </span>
            </span>
            <button
              type="button"
              onClick={() => resetActiveSelection()}
              title="Detach cell context (Switch to Global Mode)"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '2px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-danger)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
            >
              <X size={13} />
            </button>
          </div>
        )}

        <div
          className="chat-box-container"
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-tertiary)',
            border: focusedCell ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: '8px 10px 6px 10px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
            transition: 'all 0.2s ease',
          }}
        >
          <textarea
            ref={textareaRef}
            className="agent-prompt-textarea"
            placeholder={
              focusedCell
                ? `Discuss or update "${columns.find((c) => c.field === focusedCell.field)?.headerName || focusedCell.field}"... (or click ✕ for global)`
                : "Type command e.g. 'extract data', 'add column', 'query table'..."
            }
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isThinking}
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
              minHeight: '38px',
              maxHeight: '160px',
              lineHeight: '1.45',
              padding: '0',
              boxSizing: 'border-box',
              overflowY: 'auto',
            }}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '6px',
              paddingTop: '4px',
              borderTop: '1px solid rgba(255, 255, 255, 0.04)',
            }}
          >
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', opacity: 0.65, userSelect: 'none' }}>
              <kbd style={{ background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: '3px', border: '1px solid var(--border-subtle)', fontSize: '9px' }}>Shift</kbd> + <kbd style={{ background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: '3px', border: '1px solid var(--border-subtle)', fontSize: '9px' }}>Enter</kbd> for newline
            </span>

            <button
              type="submit"
              className="send-btn"
              disabled={isThinking || !inputPrompt.trim()}
              title="Send message (Enter)"
              style={{
                background: inputPrompt.trim() && !isThinking ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                color: inputPrompt.trim() && !isThinking ? 'var(--bg-secondary)' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '6px',
                padding: '5px 12px',
                cursor: inputPrompt.trim() && !isThinking ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                fontWeight: 600,
                fontSize: '11px',
                transition: 'all 0.15s ease',
                opacity: inputPrompt.trim() && !isThinking ? 1 : 0.5,
              }}
            >
              <span>Send</span>
              <Send size={12} />
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
};

export default RightAgentPanel;
