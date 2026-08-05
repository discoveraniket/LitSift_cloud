import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Terminal } from 'lucide-react';
import { useAgentStore } from '../../store/useAgentStore';

export const RightAgentPanel: React.FC = () => {
  const { messages, isThinking, sendMessage, selectOption } = useAgentStore();
  const [inputPrompt, setInputPrompt] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPrompt.trim() && !isThinking) {
      sendMessage(inputPrompt.trim());
      setInputPrompt('');
    }
  };

  const handleChipClick = (promptText: string) => {
    if (!isThinking) {
      sendMessage(promptText);
    }
  };

  useEffect(() => {
    if (chatBottomRef.current && typeof chatBottomRef.current.scrollIntoView === 'function') {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking]);

  return (
    <aside className="panel right-agent">
      <div className="panel-header">
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Bot size={14} color="var(--accent-primary)" /> AGENTIC AI COMMAND CENTER
        </span>
      </div>

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
                        border: '1px solid var(--accent-primary)',
                        color: 'var(--accent-primary)',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '11px',
                        fontWeight: 600,
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-primary)', fontSize: '11px', fontStyle: 'italic' }}>
            <Sparkles size={13} className="spin-icon" /> Agent is processing document and tool calls...
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Preset Quick Prompt Chips */}
      <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)', display: 'flex', gap: '6px', overflowX: 'auto' }}>
        <button
          onClick={() => handleChipClick('Extract methodology and key findings')}
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            borderRadius: '12px',
            padding: '2px 8px',
            fontSize: '10px',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          ⚡ Extract Methodology
        </button>
        <button
          onClick={() => handleChipClick('Split row 1 cell findings')}
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            borderRadius: '12px',
            padding: '2px 8px',
            fontSize: '10px',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          ✂️ Split Row Cell
        </button>
        <button
          onClick={() => handleChipClick('Generate schema for clinical implications')}
          style={{
            background: 'var(--bg-secondary)',
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

      <form className="agent-input-form" onSubmit={handleSend} style={{ padding: '8px', borderTop: '1px solid var(--border-subtle)' }}>
        <div className="input-group" style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            className="agent-prompt-input"
            placeholder="Type command e.g. 'split row 1' or 'extract data'..."
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            disabled={isThinking}
            style={{
              flex: 1,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
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
