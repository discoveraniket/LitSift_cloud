import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Terminal, FileText, Lightbulb, Trash2 } from 'lucide-react';
import { useAgentStore } from '../../store/useAgentStore';
import { useGridStore } from '../../store/useGridStore';

interface RightAgentPanelProps {
  activePdfTitle?: string;
}

export const RightAgentPanel: React.FC<RightAgentPanelProps> = ({ activePdfTitle = 'Active Paper' }) => {
  const { messages, isThinking, sendMessage, selectOption, clearMessages } = useAgentStore();
  const { activeCitation, focusedCell, addCellDiscussionMessage } = useGridStore();
  const [inputPrompt, setInputPrompt] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || isThinking) return;

    if (focusedCell) {
      // If a cell is focused, dispatch the discussion to the cell's citation & grid store
      addCellDiscussionMessage(focusedCell.rowId, focusedCell.field, inputPrompt.trim());
      // Also send message to the main chat stream for a unified conversation history
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

  return (
    <aside className="panel right-agent">
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Bot size={14} color="var(--accent-primary)" /> AGENTIC AI COMMAND CENTER
        </span>
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
            padding: '2px 6px',
            borderRadius: '4px',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-danger)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
        >
          <Trash2 size={13} />
          <span>Clear Chat</span>
        </button>
      </div>

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

              {msg.text}

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

        {isThinking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--accent-primary)', fontStyle: 'italic', padding: '6px 0' }}>
            <Sparkles size={14} className="spin-icon" /> Agent is reasoning & executing tools...
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Suggested Quick Prompt Chips */}
      <div style={{ padding: '0 8px 6px 8px', display: 'flex', gap: '6px', overflowX: 'auto' }}>
        <button
          onClick={() => handleChipClick('Extract paper data into table')}
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
