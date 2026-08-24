import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { renderSafeMarkdown } from '../../utils/markdownUtils';

interface ThoughtAccordionProps {
  thought?: string;
  thinkingTokens?: number;
  isActive?: boolean;
  elapsedSeconds?: number;
  defaultExpanded?: boolean;
}

export const ThoughtAccordion: React.FC<ThoughtAccordionProps> = ({
  thought,
  thinkingTokens,
  isActive = false,
  elapsedSeconds,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded || isActive);
  const [copied, setCopied] = useState<boolean>(false);
  const thoughtBodyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll thought body as new reasoning tokens stream in
  useEffect(() => {
    if (isActive && isExpanded && thoughtBodyRef.current) {
      thoughtBodyRef.current.scrollTop = thoughtBodyRef.current.scrollHeight;
    }
  }, [thought, isActive, isExpanded]);

  // If there's no thought text and it's not currently active, nothing to render
  if (!thought && !isActive) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!thought) return;
    navigator.clipboard.writeText(thought).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const formattedTokens = thinkingTokens ? `${thinkingTokens.toLocaleString()} tokens` : undefined;

  return (
    <div
      className={`vscode-thought-container ${isActive ? 'active-thinking' : ''}`}
      style={{
        marginBottom: '8px',
        borderRadius: '6px',
        border: '1px solid var(--border-subtle)',
        background: 'rgba(255, 255, 255, 0.02)',
        overflow: 'hidden',
        fontSize: '11px',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Header / Summary Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          cursor: 'pointer',
          userSelect: 'none',
          background: isActive ? 'rgba(137, 180, 250, 0.08)' : 'rgba(255, 255, 255, 0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>

          <span style={{ fontWeight: 600, color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
            {isActive
              ? `Thinking${elapsedSeconds !== undefined ? ` (${elapsedSeconds.toFixed(1)}s)...` : '...'}`
              : 'Thought Process'}
          </span>

          {!isActive && (
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {formattedTokens ? `• ${formattedTokens}` : ''}
              {elapsedSeconds !== undefined && elapsedSeconds > 0 ? ` • ${elapsedSeconds.toFixed(1)}s` : ''}
            </span>
          )}
        </div>

        {!isActive && thought && isExpanded && (
          <button
            onClick={handleCopy}
            title="Copy thought trace"
            style={{
              background: 'transparent',
              border: 'none',
              color: copied ? 'var(--accent-success)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              fontSize: '10px',
              padding: '1px 4px',
            }}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        )}
      </div>

      {/* Expandable Reasoning Body (Formatted Markdown Prose) */}
      {isExpanded && (
        <div
          ref={thoughtBodyRef}
          style={{
            padding: '8px 12px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'rgba(0, 0, 0, 0.18)',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-sans, inherit)',
            fontSize: '11px',
            lineHeight: '1.55',
            maxHeight: '280px',
            overflowY: 'auto',
          }}
        >
          {thought ? (
            <div className="vscode-thought-markdown">
              <div dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(thought) }} />
              {isActive && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                  <span className="pulsing-dot" />
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              <span className="pulsing-dot" />
              Deliberating research context and planning agent actions...
            </div>
          )}
        </div>
      )}
    </div>
  );
};
