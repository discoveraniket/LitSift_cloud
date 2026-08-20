import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Sparkles,
  Code2,
} from 'lucide-react';
import { AgentToolExecution } from '../../types/agent';

interface AgentToolStepperProps {
  tools: AgentToolExecution[];
  executionTime?: number;
  defaultExpanded?: boolean;
}

export const AgentToolStepper: React.FC<AgentToolStepperProps> = ({
  tools,
  executionTime,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [expandedPayloads, setExpandedPayloads] = useState<Record<string, boolean>>({});

  if (!tools || tools.length === 0) return null;

  const togglePayload = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedPayloads((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const allCompleted = tools.every((t) => t.status === 'completed');

  return (
    <div
      className="vscode-tool-stepper"
      style={{
        marginBottom: '8px',
        borderRadius: '6px',
        border: '1px solid var(--border-subtle)',
        background: 'rgba(17, 17, 27, 0.5)',
        overflow: 'hidden',
        fontSize: '11px',
      }}
    >
      {/* Header Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 10px',
          cursor: 'pointer',
          userSelect: 'none',
          background: 'rgba(255, 255, 255, 0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>

          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            Executed {tools.length} tool action{tools.length > 1 ? 's' : ''}
          </span>

          {executionTime !== undefined && executionTime > 0 ? (
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              • {executionTime.toFixed(1)}s
            </span>
          ) : !allCompleted ? (
            <span
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                borderRadius: '6px',
                background: 'rgba(243, 139, 168, 0.15)',
                color: 'var(--accent-danger)',
                fontWeight: 600,
              }}
            >
              Partial Error
            </span>
          ) : null}
        </div>
      </div>

      {/* Stepper Content */}
      {isExpanded && (
        <div
          style={{
            padding: '6px 10px 8px 10px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            background: '#0d0e15',
          }}
        >
          {tools.map((tool, idx) => {
            const isPayloadOpen = !!expandedPayloads[tool.id];
            const hasPayload = (tool.args && Object.keys(tool.args).length > 0) || tool.result || tool.error;

            return (
              <div
                key={tool.id || idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  padding: '6px 8px',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                    {tool.status === 'completed' ? (
                      <CheckCircle2 size={13} color="var(--accent-success)" style={{ flexShrink: 0 }} />
                    ) : tool.status === 'running' ? (
                      <Sparkles size={13} className="spin-icon" color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                    ) : (
                      <XCircle size={13} color="var(--accent-danger)" style={{ flexShrink: 0 }} />
                    )}

                    <code
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontWeight: 600,
                        color: 'var(--accent-primary)',
                        fontSize: '10.5px',
                      }}
                    >
                      {tool.name}
                    </code>

                    <span
                      style={{
                        color: 'var(--text-secondary)',
                        fontSize: '10px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      — {tool.summary || 'Executing action...'}
                    </span>
                  </div>

                  {hasPayload && (
                    <button
                      onClick={(e) => togglePayload(tool.id, e)}
                      style={{
                        background: isPayloadOpen ? 'rgba(137, 180, 250, 0.15)' : 'transparent',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '3px',
                        color: isPayloadOpen ? 'var(--accent-primary)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        fontSize: '9px',
                        padding: '1px 5px',
                        flexShrink: 0,
                      }}
                    >
                      <Code2 size={10} />
                      <span>{isPayloadOpen ? 'Hide Data' : 'Inspect'}</span>
                    </button>
                  )}
                </div>

                {tool.error && (
                  <div style={{ color: 'var(--accent-danger)', fontSize: '10px', marginTop: '4px' }}>
                    Error: {tool.error}
                  </div>
                )}

                {/* Inspectable Parameters & Results */}
                {isPayloadOpen && (
                  <div
                    style={{
                      marginTop: '6px',
                      padding: '6px',
                      background: '#11111b',
                      borderRadius: '4px',
                      border: '1px solid #2a2a3c',
                      fontSize: '9.5px',
                      fontFamily: 'var(--font-mono, monospace)',
                      color: '#cdd6f4',
                      overflowX: 'auto',
                    }}
                  >
                    {tool.args && Object.keys(tool.args).length > 0 && (
                      <div>
                        <div style={{ color: 'var(--accent-secondary, #cba6f7)', fontWeight: 600, marginBottom: '2px' }}>
                          Arguments:
                        </div>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                          {JSON.stringify(tool.args, null, 2)}
                        </pre>
                      </div>
                    )}

                    {tool.result && (
                      <div style={{ marginTop: tool.args ? '6px' : '0' }}>
                        <div style={{ color: 'var(--accent-success)', fontWeight: 600, marginBottom: '2px' }}>
                          Result Output:
                        </div>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                          {typeof tool.result === 'object' ? JSON.stringify(tool.result, null, 2) : String(tool.result)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
