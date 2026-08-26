import React, { useState } from 'react';
import {
  Sparkles,
  Plus,
  Key,
  Table,
  Zap,
  Loader2,
} from 'lucide-react';
import { useGridStore } from '../../store/useGridStore';
import { usePdfStore } from '../../store/usePdfStore';
import { useAgentStore } from '../../store/useAgentStore';
import { getGeminiApiKey } from '../../services/geminiService';
import {
  DEFAULT_REVIEW_SCHEMA,
  applySampleSchemaToGrid,
  replayDemoExtraction,
} from '../../services/samplePaperService';

interface SchemaStarterCardProps {
  onOpenSettings?: () => void;
}

export const SchemaStarterCard: React.FC<SchemaStarterCardProps> = ({ onOpenSettings }) => {
  const { columns, rows, addColumn } = useGridStore();
  const activePdf = usePdfStore((state) => state.getActivePdf());
  const [customColInput, setCustomColInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  const hasColumns = columns.length > 0;
  const hasRows = rows.length > 0;
  const apiKey = getGeminiApiKey();

  const handleApplyPresetSchema = () => {
    applySampleSchemaToGrid();
  };

  const handleAddCustomColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customColInput.trim()) return;
    addColumn(customColInput.trim());
    setCustomColInput('');
  };

  const handleRunDemoExtraction = async () => {
    setIsExtracting(true);
    try {
      await replayDemoExtraction();
    } finally {
      setIsExtracting(false);
    }
  };

  const handleRunLiveExtraction = () => {
    if (!apiKey) {
      onOpenSettings?.();
      return;
    }
    useAgentStore.getState().sendMessage('Extract all defined schema columns from the active paper and provide exact evidence citations.', activePdf?.name || 'Active Document');
  };

  if (hasRows) {
    return null;
  }

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-secondary, #181825)',
        padding: '16px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          maxWidth: '720px',
          width: '100%',
          background: 'var(--bg-primary, #1e1e2e)',
          border: '1px solid var(--border-subtle, #313244)',
          borderRadius: '10px',
          padding: '20px 24px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {!hasColumns ? (
          /* STEP 2: Schema Builder */
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, rgba(137, 180, 250, 0.2), rgba(203, 166, 247, 0.2))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-primary, #89b4fa)',
                    fontWeight: 700,
                    fontSize: '12px',
                  }}
                >
                  2
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary, #cdd6f4)' }}>
                    Step 2: Choose Synthesis Questions (Schema)
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary, #a6adc8)' }}>
                    What specific columns do you want to extract and compare across papers?
                  </div>
                </div>
              </div>

              <button
                onClick={handleApplyPresetSchema}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--accent-primary, #89b4fa)',
                  color: '#11111b',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Zap size={13} />
                Apply Standard Schema
              </button>
            </div>

            {/* Column Preview Pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {DEFAULT_REVIEW_SCHEMA.map((col) => (
                <span
                  key={col.field}
                  style={{
                    fontSize: '11px',
                    background: 'var(--bg-secondary, #181825)',
                    border: '1px solid var(--border-subtle, #313244)',
                    color: 'var(--text-primary, #cdd6f4)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Table size={11} color="var(--accent-primary, #89b4fa)" />
                  {col.headerName}
                </span>
              ))}
            </div>

            {/* Custom Column Input */}
            <form onSubmit={handleAddCustomColumn} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={customColInput}
                onChange={(e) => setCustomColInput(e.target.value)}
                placeholder="Or type a custom research column (e.g. Primary Outcome, Dosage, P-value)..."
                style={{
                  flex: 1,
                  background: 'var(--bg-secondary, #181825)',
                  border: '1px solid var(--border-subtle, #313244)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  color: 'var(--text-primary, #cdd6f4)',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={!customColInput.trim()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'var(--bg-secondary, #181825)',
                  border: '1px solid var(--border-subtle, #313244)',
                  color: 'var(--text-primary, #cdd6f4)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  cursor: customColInput.trim() ? 'pointer' : 'not-allowed',
                  opacity: customColInput.trim() ? 1 : 0.6,
                }}
              >
                <Plus size={13} />
                Add Column
              </button>
            </form>
          </>
        ) : (
          /* STEP 3: Extraction Trigger (Hybrid Zero-Barrier / Live) */
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, rgba(166, 227, 161, 0.2), rgba(137, 180, 250, 0.2))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-success, #a6e3a1)',
                    fontWeight: 700,
                    fontSize: '12px',
                  }}
                >
                  3
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary, #cdd6f4)' }}>
                    Step 3: Extract & Audit Grounded Citations
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary, #a6adc8)' }}>
                    Columns ready ({columns.length} defined). Run AI synthesis to populate findings with verifiable quotes.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleRunDemoExtraction}
                  disabled={isExtracting}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--accent-primary, #89b4fa)',
                    color: '#11111b',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: isExtracting ? 'not-allowed' : 'pointer',
                    opacity: isExtracting ? 0.7 : 1,
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
                      Run Instant Demo (No Key)
                    </>
                  )}
                </button>

                <button
                  onClick={handleRunLiveExtraction}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--bg-secondary, #181825)',
                    border: '1px solid var(--border-subtle, #313244)',
                    color: 'var(--text-primary, #cdd6f4)',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <Key size={13} color="var(--accent-warning, #f9e2af)" />
                  {apiKey ? 'Run Live Gemini' : 'Connect API Key'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
