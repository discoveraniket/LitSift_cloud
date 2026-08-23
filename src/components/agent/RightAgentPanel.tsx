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
} from 'lucide-react';
import { useAgentStore } from '../../store/useAgentStore';
import { useGridStore } from '../../store/useGridStore';
import { marked } from 'marked';
import { getSelectedGeminiModel } from '../../services/geminiService';
import { ThoughtAccordion } from './ThoughtAccordion';
import { AgentToolStepper } from './AgentToolStepper';
import { AgentChatInput } from './AgentChatInput';

// Configure marked options for clean GitHub-style Markdown rendering
marked.setOptions({
  gfm: true,
  breaks: true,
});

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

  // Resolve focused cell metadata for context capsule
  const focusedCellInfo = focusedCell
    ? {
        headerName: columns.find((c) => c.field === focusedCell.field)?.headerName || focusedCell.field,
        pdfTitle: rows.find((r) => r.id === focusedCell.rowId)?.pdfTitle,
        field: focusedCell.field,
      }
    : null;

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
      {/* Top VS Code Copilot Header Bar */}
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
          <span>LitSift Copilot</span>
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
        {messages.map((msg) => {
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
              {/* Turn Header: Avatar, Name, Timestamp */}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {isUser ? (
                    <>
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
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>You</span>
                    </>
                  ) : (
                    <>
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
                      <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>LitSift Agent</span>
                    </>
                  )}
                  <span>• {msg.timestamp}</span>
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
                    dangerouslySetInnerHTML={{ __html: marked.parse(msg.text) as string }}
                  />
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
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
                      gap: '8px',
                      marginTop: '8px',
                      paddingTop: '6px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.04)',
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Zap size={10} color="var(--accent-primary)" />
                      <span>{msg.executionTime !== undefined ? `${msg.executionTime.toFixed(1)}s` : 'Instant'}</span>
                    </div>

                    {(msg.promptTokens !== undefined || msg.candidateTokens !== undefined) && (
                      <span>•</span>
                    )}

                    {msg.promptTokens !== undefined && (
                      <span title={`Input Prompt Tokens: ${msg.promptTokens.toLocaleString()} (Cached: ${(msg.cachedTokens || 0).toLocaleString()})`}>
                        {Math.max(0, msg.promptTokens - (msg.cachedTokens || 0)).toLocaleString()} in
                      </span>
                    )}

                    {msg.candidateTokens !== undefined && (
                      <span title={`Output Candidate Tokens: ${msg.candidateTokens.toLocaleString()}`}>
                        / {msg.candidateTokens.toLocaleString()} out
                      </span>
                    )}

                    {msg.thinkingTokens !== undefined && msg.thinkingTokens > 0 && (
                      <span title={`Reasoning / Thinking Tokens: ${msg.thinkingTokens.toLocaleString()}`}>
                        • {msg.thinkingTokens.toLocaleString()} thought
                      </span>
                    )}

                    {msg.modelUsed && (
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: '9px',
                          fontFamily: 'var(--font-mono, monospace)',
                          color: 'var(--text-muted)',
                          opacity: 0.8,
                        }}
                      >
                        {msg.modelUsed}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Live Active Thinking Turn */}
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
              <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>LitSift Agent</span>
              <span>• Live Generating</span>
            </div>

            <ThoughtAccordion
              thought={streamingThought}
              isActive={true}
              elapsedSeconds={elapsed}
              defaultExpanded={true}
            />

            {streamingText && (
              <div
                className="chat-markdown vscode-markdown"
                style={{ marginTop: '8px', padding: '0 4px' }}
                dangerouslySetInnerHTML={{ __html: marked.parse(streamingText) as string }}
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
        focusedCellInfo={focusedCellInfo}
        onClearCellFocus={() => resetActiveSelection()}
        activePdfTitle={activePdfTitle}
        gridColumnCount={columns.length}
        selectedModel={getSelectedGeminiModel()}
        onOpenSettings={onOpenSettings}
      />
    </aside>
  );
};

export default RightAgentPanel;
