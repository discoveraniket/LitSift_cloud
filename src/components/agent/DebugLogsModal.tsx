import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  Trash2,
  Terminal,
  Search,
  ChevronRight,
  ChevronDown,
  Download,
} from 'lucide-react';
import { useLogStore, LogEntry } from '../../store/useLogStore';

interface DebugLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DebugLogsModal: React.FC<DebugLogsModalProps> = ({ isOpen, onClose }) => {
  const { logs, clearLogs } = useLogStore();
  const [copied, setCopied] = useState(false);
  const [filterLevel, setFilterLevel] = useState<'all' | 'info' | 'warn' | 'error' | 'success'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isOpen && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  if (!isOpen) return null;

  const filteredLogs = logs.filter((log) => {
    if (filterLevel !== 'all' && log.level !== filterLevel) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchMsg = log.message.toLowerCase().includes(q);
      const matchDetails = log.details ? JSON.stringify(log.details).toLowerCase().includes(q) : false;
      return matchMsg || matchDetails;
    }
    return true;
  });

  const toggleExpand = (id: string) => {
    setExpandedLogIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyAll = () => {
    if (logs.length === 0) return;

    const formatted = logs
      .map((l) => {
        let text = `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`;
        if (l.details) {
          text += `\nDetails: ${JSON.stringify(l.details, null, 2)}`;
        }
        return text;
      })
      .join('\n\n');

    navigator.clipboard.writeText(formatted).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownloadLogs = () => {
    if (logs.length === 0) return;

    const formatted = logs
      .map((l) => {
        let text = `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`;
        if (l.details) {
          text += `\nDetails: ${JSON.stringify(l.details, null, 2)}`;
        }
        return text;
      })
      .join('\n\n');

    const blob = new Blob([formatted], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `litsift_debug_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'var(--accent-danger, #f38ba8)';
      case 'warn':
        return 'var(--accent-warning, #f9e2af)';
      case 'success':
        return 'var(--accent-success, #a6e3a1)';
      case 'info':
      default:
        return 'var(--accent-primary, #89b4fa)';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '10px',
          width: '780px',
          maxWidth: '94vw',
          height: '75vh',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
          color: 'var(--text-primary)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-tertiary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px' }}>
            <Terminal size={16} color="var(--accent-primary)" />
            <span>Agent Execution & Telemetry Debug Logs</span>
            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '8px',
                background: 'rgba(137, 180, 250, 0.15)',
                color: 'var(--accent-primary)',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 600,
              }}
            >
              {logs.length} events
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Copy Button */}
            <button
              onClick={handleCopyAll}
              disabled={logs.length === 0}
              title="Copy all logs to clipboard"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: copied ? 'rgba(166, 227, 161, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                color: copied ? 'var(--accent-success)' : 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '5px',
                padding: '4px 9px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: logs.length === 0 ? 'not-allowed' : 'pointer',
                opacity: logs.length === 0 ? 0.5 : 1,
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? 'Copied Full Log' : 'Copy All'}</span>
            </button>

            {/* Export File Button */}
            <button
              onClick={handleDownloadLogs}
              disabled={logs.length === 0}
              title="Download logs file (.log)"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '5px',
                padding: '4px 9px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: logs.length === 0 ? 'not-allowed' : 'pointer',
                opacity: logs.length === 0 ? 0.5 : 1,
              }}
            >
              <Download size={13} />
              <span>Export</span>
            </button>

            {/* Clear Button */}
            <button
              onClick={clearLogs}
              disabled={logs.length === 0}
              title="Clear all logs"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(243, 139, 168, 0.1)',
                color: 'var(--accent-danger)',
                border: '1px solid rgba(243, 139, 168, 0.3)',
                borderRadius: '5px',
                padding: '4px 9px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: logs.length === 0 ? 'not-allowed' : 'pointer',
                opacity: logs.length === 0 ? 0.5 : 1,
              }}
            >
              <Trash2 size={13} />
              <span>Clear</span>
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                borderRadius: '4px',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Toolbar: Search and Filter Tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-subtle)',
            gap: '12px',
          }}
        >
          {/* Level Filter Chips */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['all', 'info', 'success', 'warn', 'error'] as const).map((lvl) => {
              const isActive = filterLevel === lvl;
              const count = lvl === 'all' ? logs.length : logs.filter((l) => l.level === lvl).length;
              return (
                <button
                  key={lvl}
                  onClick={() => setFilterLevel(lvl)}
                  style={{
                    background: isActive ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.03)',
                    color: isActive ? 'var(--bg-secondary)' : 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '10.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {lvl} ({count})
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              padding: '3px 8px',
              flex: 1,
              maxWidth: '260px',
            }}
          >
            <Search size={12} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search logs or payloads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: '11px',
                outline: 'none',
                width: '100%',
              }}
            />
            {searchQuery && (
              <X
                size={12}
                color="var(--text-muted)"
                style={{ cursor: 'pointer' }}
                onClick={() => setSearchQuery('')}
              />
            )}
          </div>
        </div>

        {/* Logs Output Console */}
        <div
          ref={logsContainerRef}
          style={{
            flex: 1,
            padding: '12px 16px',
            background: '#090a0f',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '11px',
            lineHeight: '1.6',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          {filteredLogs.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '40px 0' }}>
              {logs.length === 0
                ? 'No debug events recorded yet. Perform actions or prompt the agent to capture live telemetry traces.'
                : 'No logs match your active filter or search query.'}
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isExpanded = !!expandedLogIds[log.id];
              const hasDetails = log.details !== undefined && log.details !== null;

              return (
                <div
                  key={log.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    background: 'rgba(255, 255, 255, 0.015)',
                    borderLeft: `2px solid ${getLevelColor(log.level)}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ color: '#6c7086', flexShrink: 0, fontSize: '10px' }}>
                      {log.timestamp}
                    </span>

                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: '10px',
                        color: getLevelColor(log.level),
                        flexShrink: 0,
                      }}
                    >
                      [{log.level.toUpperCase()}]
                    </span>

                    <span style={{ color: '#cdd6f4', flex: 1, wordBreak: 'break-word' }}>
                      {log.message}
                    </span>

                    {hasDetails && (
                      <button
                        onClick={() => toggleExpand(log.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--accent-primary)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          fontSize: '10px',
                          padding: '0 4px',
                        }}
                      >
                        {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                        <span>{isExpanded ? 'Hide Payload' : 'Inspect JSON'}</span>
                      </button>
                    )}
                  </div>

                  {/* Expanded JSON Details Viewer */}
                  {hasDetails && isExpanded && (
                    <pre
                      style={{
                        marginTop: '6px',
                        marginBottom: '2px',
                        marginLeft: '20px',
                        padding: '8px',
                        background: '#040508',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '4px',
                        color: '#fab387',
                        fontSize: '10px',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                      }}
                    >
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info bar */}
        <div
          style={{
            padding: '8px 16px',
            background: 'var(--bg-tertiary)',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '10.5px',
            color: 'var(--text-muted)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>Showing {filteredLogs.length} of {logs.length} total events</span>
          <span style={{ fontStyle: 'italic' }}>Logs update in real time as the agent processes tool calls and queries.</span>
        </div>
      </div>
    </div>
  );
};
