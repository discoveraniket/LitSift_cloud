import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Trash2,
  X,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Copy,
  Check,
  Zap,
} from 'lucide-react';
import { useAgentStore } from '../../store/useAgentStore';
import { useGridStore } from '../../store/useGridStore';
import { useLogStore } from '../../store/useLogStore';
import { marked } from 'marked';
import { getSelectedGeminiModel } from '../../services/geminiService';

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
    sendMessage,
    cancelInteraction,
    selectOption,
    clearMessages,
    deleteMessage,
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
  } = useGridStore();

  const { logs, isOpen: isLogOpen, toggleOpen: toggleLogOpen, setOpen: setLogOpen, clearLogs } = useLogStore();

  const [inputPrompt, setInputPrompt] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [expandedMsgTools, setExpandedMsgTools] = useState<Record<string, boolean>>({});
  const [expandedToolPayloadId, setExpandedToolPayloadId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

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
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [inputPrompt]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputPrompt.trim() || isThinking) return;

    const text = inputPrompt;
    setInputPrompt('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    sendMessage(text, activePdfTitle);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMsgId(id);
      setTimeout(() => setCopiedMsgId(null), 2000);
    });
  };

  return (
    <aside className="panel right-agent" style={{ display: 'flex', flexDirection: 'column', position: 'relative', height: '100%' }}>
      {/* Top Header Bar with Model Badge, Live Telemetry Toggle, and Clear Chat */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-subtle)',
          fontSize: '11px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text-primary)' }}>
          <Bot size={14} color="var(--accent-primary)" />
          <span>LitSift Agent</span>
          <span
            style={{
              fontSize: '9px',
              padding: '1px 5px',
              borderRadius: '10px',
              background: 'rgba(137, 180, 250, 0.15)',
              color: 'var(--accent-primary)',
              fontFamily: 'monospace',
            }}
          >
            {getSelectedGeminiModel()}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Toggle Live Console / Telemetry Drawer */}
          <button
            onClick={toggleLogOpen}
            title={isLogOpen ? 'Hide Live Execution Console' : 'Open Live Execution Console & Telemetry Profiler'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: isLogOpen ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: isLogOpen ? 'var(--bg-secondary)' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              padding: '2px 7px',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Zap size={11} />
            <span>Telemetry {logs.length > 0 ? `(${logs.length})` : ''}</span>
          </button>

          {/* Clear Chat History */}
          <button
            onClick={clearMessages}
            title="Clear Chat History"
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px 4px',
            }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Embedded Live Execution Console Drawer */}
      {isLogOpen && (
        <div
          style={{
            maxHeight: '260px',
            minHeight: '140px',
            background: '#11111b',
            borderBottom: '2px solid var(--accent-primary)',
            padding: '8px 10px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '10.5px',
            color: '#cdd6f4',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6)',
            flexShrink: 0,
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--accent-primary)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Zap size={12} /> REALTIME AGENT REASONING & TELEMETRY
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>{logs.length} events logged</span>
              <button
                onClick={clearLogs}
                title="Clear Logs"
                style={{ background: 'transparent', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: '9px' }}
              >
                Clear
              </button>
              <button
                onClick={() => setLogOpen(false)}
                title="Close Drawer"
                style={{ background: 'transparent', border: 'none', color: '#6c7086', cursor: 'pointer' }}
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {logs.length === 0 ? (
            <div style={{ color: '#6c7086', fontStyle: 'italic' }}>No execution trace logged yet. Send a prompt to view live agent reasoning and latency telemetry.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                <span style={{ color: '#6c7086', minWidth: '55px' }}>{log.timestamp}</span>
                <span
                  style={{
                    fontWeight: 700,
                    minWidth: '55px',
                    color: log.level === 'error' ? 'var(--accent-danger)' : log.level === 'warn' ? '#f9e2af' : 'var(--accent-success)',
                  }}
                >
                  [{log.level.toUpperCase()}]
                </span>
                <span style={{ flex: 1, wordBreak: 'break-word' }}>{log.message}</span>
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
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '8px 10px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
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
              <Sparkles size={12} color="var(--accent-primary)" /> Cell Grounding
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
              background: 'var(--bg-secondary)',
              padding: '4px 8px',
              borderRadius: '4px',
              gap: '8px',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              "{activeCitation.snippetQuote}"
            </span>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', flexShrink: 0, fontStyle: 'normal' }}>
              p. {activeCitation.pageNumber} ↗
            </span>
          </div>
        </div>
      )}

      {/* Main Chat Stream */}
      <div className="agent-stream-container" style={{ flex: 1, padding: '12px', overflowY: 'auto' }}>
        {messages.map((msg) => {
          const isToolsExpanded = !!expandedMsgTools[msg.id];
          const hasTools = msg.toolsExecuted && msg.toolsExecuted.length > 0;
          const isCopied = copiedMsgId === msg.id;

          return (
            <div
              key={msg.id}
              className={`agent-message-bubble ${msg.sender}`}
              style={{
                marginBottom: '14px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                position: 'relative',
              }}
            >
              {/* Header: Sender & Timestamp */}
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

              {/* Message Content Container */}
              <div
                className="message-content-wrapper"
                style={{
                  position: 'relative',
                  maxWidth: '92%',
                  background: msg.sender === 'user' ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                  color: 'var(--text-primary)',
                  padding: msg.sender === 'user' ? '8px 12px' : '4px 8px 6px 12px',
                  borderRadius: msg.sender === 'user' ? '10px' : '6px',
                  border: msg.sender === 'user' ? '1px solid var(--border-subtle)' : 'none',
                  borderLeft: msg.sender === 'agent' ? '2px solid var(--accent-primary)' : undefined,
                  fontSize: '12px',
                  lineHeight: '1.45',
                }}
              >
                {/* Minimal Collapsible Tool Executions Drawer */}
                {hasTools && (
                  <div style={{ marginBottom: '8px' }}>
                    <button
                      onClick={() => toggleToolsForMessage(msg.id)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        padding: '2px 7px',
                        fontSize: '10px',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontWeight: 600,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isToolsExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      <span>{msg.toolsExecuted!.length} tool action{msg.toolsExecuted!.length > 1 ? 's' : ''}</span>
                    </button>

                    {/* Expandable Technical Step Details */}
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

                {/* Natural Language Response / Query Content */}
                {msg.sender === 'agent' ? (
                  <div
                    className="chat-markdown"
                    dangerouslySetInnerHTML={{ __html: marked.parse(msg.text) as string }}
                  />
                ) : (
                  <div>{msg.text}</div>
                )}

                {/* Interactive Suggestion Chips */}
                {msg.options && (
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {msg.options.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => selectOption(opt)}
                        style={{
                          background: 'var(--bg-secondary)',
                          color: 'var(--accent-primary)',
                          border: '1px solid var(--accent-primary)',
                          borderRadius: '6px',
                          padding: '4px 8px',
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

                {/* Persistent Execution Time Note (Bottom Muted Badge) */}
                {msg.sender === 'agent' && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginTop: '6px',
                      fontSize: '10px',
                      color: 'var(--text-secondary)',
                      opacity: 0.75,
                    }}
                  >
                    <Zap size={10} color="var(--accent-primary)" />
                    <span>{msg.executionTime !== undefined ? `⚡ ${msg.executionTime}s` : '⚡ Instant'}</span>
                  </div>
                )}

                {/* Hover Quick-Actions (Copy & Delete Buttons) */}
                <div
                  className="msg-hover-toolbar"
                  style={{
                    position: 'absolute',
                    bottom: '-10px',
                    right: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '2px 4px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                    zIndex: 10,
                  }}
                >
                  <button
                    onClick={() => handleCopyText(msg.id, msg.text)}
                    title="Copy message to clipboard"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: isCopied ? 'var(--accent-success)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {isCopied ? <Check size={11} /> : <Copy size={11} />}
                  </button>

                  <button
                    onClick={() => deleteMessage(msg.id)}
                    title="Delete message from chat history"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-danger)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Live Active Thinking / Execution Bubble */}
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
                background: 'rgba(137, 180, 250, 0.08)',
                border: '1px solid var(--accent-primary)',
                borderRadius: '8px',
                padding: '6px 10px',
                maxWidth: '92%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)', fontSize: '11px', fontWeight: 600 }}>
                <Sparkles size={13} className="spin-icon" />
                <span>Executing...</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  ⚡ {elapsed.toFixed(1)}s
                </span>

                <button
                  onClick={cancelInteraction}
                  title="Stop Agent Execution"
                  style={{
                    background: 'rgba(243, 139, 168, 0.2)',
                    border: '1px solid var(--accent-danger)',
                    color: 'var(--accent-danger)',
                    padding: '1px 6px',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', opacity: 0.65, userSelect: 'none' }}>
                <kbd style={{ background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: '3px', border: '1px solid var(--border-subtle)', fontSize: '9px' }}>Shift</kbd> + <kbd style={{ background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: '3px', border: '1px solid var(--border-subtle)', fontSize: '9px' }}>Enter</kbd> for newline
              </span>
              <button
                type="button"
                onClick={() => clearMessages()}
                title="Clear Chat History & Start Fresh Session"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  opacity: 0.7,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-danger)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                <Trash2 size={11} /> Clear
              </button>
            </div>

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
