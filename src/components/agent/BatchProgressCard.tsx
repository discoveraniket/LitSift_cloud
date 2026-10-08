import React from 'react';
import { Layers, X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAgentStore } from '../../store/useAgentStore';
import type { BatchExtractionProgress } from '../../types/extraction';

interface BatchProgressCardProps {
  progress: BatchExtractionProgress;
}

export const BatchProgressCard: React.FC<BatchProgressCardProps> = ({ progress }) => {
  const cancelInteraction = useAgentStore((state) => state.cancelInteraction);

  const getStatusIcon = () => {
    switch (progress.status) {
      case 'completed':
        return <CheckCircle2 size={13} color="#a6e3a1" />;
      case 'error':
        return <AlertTriangle size={13} color="#f38ba8" />;
      default:
        return <Loader2 size={13} color="var(--accent-primary)" className="animate-spin" />;
    }
  };

  return (
    <div
      className="batch-progress-card"
      style={{
        margin: '8px 10px',
        padding: '10px 12px',
        background: 'rgba(30, 30, 46, 0.95)',
        border: '1px solid var(--accent-primary)',
        borderRadius: '8px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
        flexShrink: 0,
        transition: 'all 0.2s ease',
      }}
    >
      {/* Top Header Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={13} color="var(--accent-primary)" />
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.3px' }}>
            BATCH EXTRACTION IN PROGRESS
          </span>
        </div>
        <button
          type="button"
          onClick={cancelInteraction}
          title="Cancel Batch Extraction"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            background: 'rgba(243, 139, 168, 0.12)',
            border: '1px solid rgba(243, 139, 168, 0.35)',
            color: '#f38ba8',
            fontSize: '9.5px',
            fontWeight: 600,
            borderRadius: '4px',
            padding: '2px 6px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(243, 139, 168, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(243, 139, 168, 0.12)';
          }}
        >
          <X size={10} />
          <span>Cancel</span>
        </button>
      </div>

      {/* Progress Bar & Paper Count */}
      <div style={{ marginBottom: '8px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '10.5px',
            color: 'var(--text-secondary)',
            marginBottom: '4px',
          }}
        >
          <span style={{ fontWeight: 600 }}>
            Paper {progress.currentPaperIndex} of {progress.totalPapers}
          </span>
          <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>
            {progress.percent}%
          </span>
        </div>

        {/* Outer Bar */}
        <div
          style={{
            width: '100%',
            height: '6px',
            background: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '3px',
            overflow: 'hidden',
          }}
        >
          {/* Fill Bar */}
          <div
            style={{
              width: `${Math.max(2, Math.min(100, progress.percent))}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary, #cba6f7))',
              borderRadius: '3px',
              transition: 'width 0.3s ease-out',
            }}
          />
        </div>
      </div>

      {/* Current Paper & Status Details */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '10px',
          padding: '6px 8px',
          background: 'rgba(0, 0, 0, 0.25)',
          borderRadius: '5px',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
          {getStatusIcon()}
          <span
            style={{
              color: 'var(--text-primary)',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '210px',
            }}
            title={progress.currentPaperTitle}
          >
            {progress.currentPaperTitle}
          </span>
        </div>

        <span
          style={{
            color: '#a6e3a1',
            fontWeight: 600,
            fontSize: '9.5px',
            flexShrink: 0,
            marginLeft: '8px',
          }}
        >
          {progress.extractedRowCount} row{progress.extractedRowCount !== 1 ? 's' : ''} staged
        </span>
      </div>

      {/* Sub-step Message */}
      {progress.message && (
        <div
          style={{
            marginTop: '5px',
            fontSize: '9.5px',
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={progress.message}
        >
          {progress.message}
        </div>
      )}
    </div>
  );
};
