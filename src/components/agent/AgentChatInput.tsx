import React, { useRef, useEffect } from 'react';
import {
  Send,
  Square,
  X,
  FileText,
  Table,
  Target,
  Cpu,
  ChevronDown,
} from 'lucide-react';

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
  onClearCellFocus?: () => void;
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
  focusedCellInfo,
  onClearCellFocus,
  activePdfTitle,
  gridColumnCount = 0,
  selectedModel,
  onOpenSettings,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Dynamic textarea height adjustment
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [inputPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isThinking && inputPrompt.trim()) {
        onSend();
      }
    }
  };

  const placeholderText = focusedCellInfo
    ? `Ask about or update "${focusedCellInfo.headerName}"...`
    : activePdfTitle
    ? `Ask LitSift Agent or extract data from "${activePdfTitle}"...`
    : "Type instructions e.g. 'extract table data', 'add column'...";

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
          border: focusedCellInfo
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
        {/* Context Capsule Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
            marginBottom: '6px',
          }}
        >
          {focusedCellInfo ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: 'rgba(137, 180, 250, 0.15)',
                border: '1px solid var(--accent-primary)',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '10px',
                color: 'var(--accent-primary)',
                fontWeight: 600,
              }}
            >
              <Target size={11} />
              <span>Cell: {focusedCellInfo.headerName}</span>
              {focusedCellInfo.pdfTitle && (
                <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
                  ({focusedCellInfo.pdfTitle})
                </span>
              )}
              {onClearCellFocus && (
                <button
                  type="button"
                  onClick={onClearCellFocus}
                  title="Remove cell target focus"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '1px',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-danger)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ) : (
            <>
              {activePdfTitle && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '10px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <FileText size={10} color="var(--accent-primary)" />
                  <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activePdfTitle}
                  </span>
                </div>
              )}

              {gridColumnCount > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '10px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <Table size={10} color="var(--accent-secondary, #cba6f7)" />
                  <span>{gridColumnCount} column{gridColumnCount > 1 ? 's' : ''}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Prompt Input Textarea */}
        <textarea
          ref={textareaRef}
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isThinking}
          placeholder={placeholderText}
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
