import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Terminal, FileText, Lightbulb, Trash2, X, ChevronDown, ChevronRight } from 'lucide-react';
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
  const { messages, isThinking, sendMessage, selectOption, clearMessages } = useAgentStore();
  const { activeCitation, focusedCell, addCellDiscussionMessage } = useGridStore();
  const { logs, activeStep, isOpen: isLogOpen, toggleOpen, clearLogs } = useLogStore();

  const [inputPrompt, setInputPrompt] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const logsBottomRef = useRef<HTMLDivElement>(null);

  // Live timer during thinking / tool execution
  useEffect(() => {
    let interval: any;
    if (isThinking) {
      const start = Date.now();
      interval = setInterval(() => {
        setElapsed(Number(((Date.now() - start) / 1000).toFixed(1)));
      }, 100);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(interval);
  }, [isThinking]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || isThinking) return;

    if (focusedCell) {
      addCellDiscussionMessage(focusedCell.rowId, focusedCell.field, inputPrompt.trim());
      sendMessage(`[Cell: ${focusedCell.field}] ${inputPrompt.trim()}`, activePdfTitle);
    } else {
      sendMessage(inputPrompt.trim(), activePdfTitle);
    }

    setInputPrompt('');
  };

  const handleChipClick = (promptText: string) => {
    if (!isThinking) {
      sendMessage(promptText, activePdfTitle);
    }
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
      {/* Panel Header */}
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Bot size={14} color="var(--accent-primary)" /> AGENTIC AI COMMAND CENTER
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
            <div style={{ color: '#6c7086', fontStyle: 'italic', padding: '6px 0' }}>No execution events logged yet. Trigger an extraction or query.</div>
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

      {/* Minimal Read-Only AI Cell Reasoning Card */}
      {focusedCell && activeCitation && (
        <div
          style={{
            margin: '10px 10px 0 10px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--accent-primary)',
            borderRadius: '8px',
            padding: '10px 12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
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
              }}
            >
              {Math.round(activeCitation.confidence * 100)}% Confidence
            </span>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-primary)', marginBottom: '8px', lineHeight: '1.4' }}>
            <strong>💡 Reasoning:</strong> {activeCitation.reasoning}
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
            <div style={{ fontWeight: 600, fontStyle: 'normal', color: 'var(--text-primary)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <FileText size={11} /> Source: {activeCitation.sectionName} (Page {activeCitation.pageNumber})
            </div>
            "{activeCitation.snippetQuote}"
          </div>
        </div>
      )}

      {/* Main Chat Stream */}
      <div className="agent-stream-container" style={{ flex: 1, padding: '12px', overflowY: 'auto' }}>
        {messages.map((msg) => (
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
                maxWidth: '90%',
                border: msg.sender === 'agent' ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              {msg.toolCall && (
                <div
                  style={{
                    background: 'rgba(137, 180, 250, 0.15)',
                    border: '1px solid var(--accent-primary)',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    marginBottom: '8px',
                    fontSize: '11px',
                    color: 'var(--accent-primary)',
                  }}
                >
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Terminal size={12} /> Executed Tool: <code>{msg.toolCall.name}</code>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {msg.toolCall.description}
                  </div>
                </div>
              )}

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
        ))}

        <div ref={chatBottomRef} />
      </div>

      {/* Live Execution Progress Banner with Live Timer */}
      {isThinking && (
        <div
          style={{
            margin: '0 8px 8px 8px',
            background: 'rgba(137, 180, 250, 0.12)',
            border: '1px solid var(--accent-primary)',
            borderRadius: '8px',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: 'var(--accent-primary)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
            <Sparkles size={14} className="spin-icon" />
            <span>{activeStep || 'Agent is executing & querying Gemini...'}</span>
          </div>
          <span
            style={{
              fontSize: '10px',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              padding: '2px 8px',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
              fontFamily: 'monospace',
              fontWeight: 700,
            }}
          >
            ⏱️ {elapsed}s
          </span>
        </div>
      )}

      {/* Suggested Quick Prompt Chips */}
      <div style={{ padding: '0 8px 6px 8px', display: 'flex', gap: '6px', overflowX: 'auto' }}>
        <button
          onClick={() => handleChipClick('Extract paper data')}
          disabled={isThinking}
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            borderRadius: '12px',
            padding: '2px 8px',
            fontSize: '10px',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          ⚡ Extract Data
        </button>
        <button
          onClick={() => handleChipClick('Split row 1 cell content into sub-rows')}
          disabled={isThinking}
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            borderRadius: '12px',
            padding: '2px 8px',
            fontSize: '10px',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          ✂️ Split Cell Content
        </button>
        <button
          onClick={() => handleChipClick('Generate custom schema column for Host Range')}
          disabled={isThinking}
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            borderRadius: '12px',
            padding: '2px 8px',
            fontSize: '10px',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          📋 Generate Schema
        </button>
      </div>

      {/* Single Unified Prompt Form */}
      <form className="agent-input-form" onSubmit={handleSend} style={{ padding: '8px', borderTop: '1px solid var(--border-subtle)' }}>
        <div className="input-group" style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            className="agent-prompt-input"
            placeholder={
              focusedCell
                ? `Discuss cell "${focusedCell.field}"... (e.g. 'page 2 mentions sequencing')`
                : "Type command e.g. 'split row 1' or 'extract data'..."
            }
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            disabled={isThinking}
            style={{
              flex: 1,
              background: 'var(--bg-secondary)',
              border: focusedCell ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              padding: '8px 10px',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />
          <button
            type="submit"
            className="send-btn"
            disabled={isThinking || !inputPrompt.trim()}
            style={{
              background: 'var(--accent-primary)',
              color: 'var(--bg-secondary)',
              border: 'none',
              borderRadius: '6px',
              padding: '0 14px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <Send size={14} />
          </button>
        </div>
      </form>
    </aside>
  );
};

export default RightAgentPanel;
