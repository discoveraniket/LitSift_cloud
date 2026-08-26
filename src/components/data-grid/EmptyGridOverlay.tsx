import React, { useState } from 'react';
import { Plus, Sparkles, Loader2, Table } from 'lucide-react';
import { useGridStore } from '../../store/useGridStore';
import { usePdfStore } from '../../store/usePdfStore';
import { useAgentStore } from '../../store/useAgentStore';
import { replayDemoExtraction } from '../../services/samplePaperService';

interface EmptyGridOverlayProps {
  filterPdfId?: string;
  activePdfTitle?: string;
  onAddRow?: () => void;
}

export const EmptyGridOverlay: React.FC<EmptyGridOverlayProps> = ({
  filterPdfId,
  activePdfTitle,
  onAddRow,
}) => {
  const { addRow } = useGridStore();
  const activePdf = usePdfStore((state) => state.getActivePdf());
  const [isExtracting, setIsExtracting] = useState(false);

  const targetPdfId = filterPdfId || activePdf?.id || '';
  const targetPdfTitle = activePdfTitle || activePdf?.name || 'Active Document';

  const handleAddRow = () => {
    if (onAddRow) {
      onAddRow();
    } else {
      addRow(targetPdfId, targetPdfTitle);
    }
  };

  const handleExtract = async () => {
    setIsExtracting(true);
    try {
      if (activePdf) {
        useAgentStore
          .getState()
          .sendMessage(
            'Extract all defined schema columns from the active paper and provide exact evidence citations.',
            targetPdfTitle
          );
      } else {
        await replayDemoExtraction();
      }
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        gap: '12px',
        color: 'var(--text-secondary, #a6adc8)',
        userSelect: 'none',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          background: 'rgba(137, 180, 250, 0.08)',
          border: '1px solid var(--border-subtle, #313244)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-primary, #89b4fa)',
        }}
      >
        <Table size={18} />
      </div>

      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary, #cdd6f4)',
            marginBottom: '4px',
          }}
        >
          No rows for this document yet
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary, #a6adc8)', maxWidth: '360px' }}>
          Add a manual row or run AI extraction to populate the table with evidence citations.
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button
          onClick={handleAddRow}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--bg-primary, #1e1e2e)',
            border: '1px solid var(--border-subtle, #313244)',
            color: 'var(--text-primary, #cdd6f4)',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '11.5px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent-primary, #89b4fa)';
            e.currentTarget.style.color = 'var(--accent-primary, #89b4fa)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-subtle, #313244)';
            e.currentTarget.style.color = 'var(--text-primary, #cdd6f4)';
          }}
        >
          <Plus size={13} />
          Add Row
        </button>

        <button
          onClick={handleExtract}
          disabled={isExtracting}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--accent-primary, #89b4fa)',
            border: 'none',
            color: '#11111b',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '11.5px',
            fontWeight: 600,
            cursor: isExtracting ? 'not-allowed' : 'pointer',
            opacity: isExtracting ? 0.7 : 1,
            transition: 'all 0.15s ease',
          }}
        >
          {isExtracting ? (
            <>
              <Loader2 size={13} className="spin-animation" />
              Extracting...
            </>
          ) : (
            <>
              <Sparkles size={13} />
              Extract Paper Data
            </>
          )}
        </button>
      </div>
    </div>
  );
};
