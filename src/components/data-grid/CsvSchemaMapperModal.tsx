import React, { useState, useEffect } from 'react';
import {
  X,
  Check,
  FileSpreadsheet,
  Sparkles,
} from 'lucide-react';
import type { ParsedCsvResult } from '../../services/csvImportService';
import {
  sanitizeField,
  alignHeadersWithSchema,
  applyCsvTemplateToStore,
  applyCsvDatasetToStore,
} from '../../services/csvImportService';
import { useGridStore } from '../../store/useGridStore';

interface CsvSchemaMapperModalProps {
  isOpen: boolean;
  onClose: () => void;
  parsedCsv: ParsedCsvResult | null;
  onImportComplete?: () => void;
}

export const CsvSchemaMapperModal: React.FC<CsvSchemaMapperModalProps> = ({
  isOpen,
  onClose,
  parsedCsv,
  onImportComplete,
}) => {
  const existingColumns = useGridStore((state) => state.columns);
  const existingRows = useGridStore((state) => state.rows);

  const [selectedHeaders, setSelectedHeaders] = useState<string[]>([]);
  const [headerOverrides, setHeaderOverrides] = useState<Record<string, string>>({});
  const [clearExistingRows, setClearExistingRows] = useState(false);
  const [datasetMode, setDatasetMode] = useState<'append' | 'replace'>('append');

  useEffect(() => {
    if (parsedCsv && parsedCsv.headers) {
      setSelectedHeaders([...parsedCsv.headers]);
      const initialOverrides: Record<string, string> = {};
      parsedCsv.headers.forEach((h) => {
        initialOverrides[h] = h;
      });
      setHeaderOverrides(initialOverrides);
      setClearExistingRows(existingRows.length === 0);
    }
  }, [parsedCsv, existingRows.length]);

  if (!isOpen || !parsedCsv) return null;

  const isTemplate = parsedCsv.isTemplate;
  const alignment = alignHeadersWithSchema(parsedCsv.headers, existingColumns);

  const toggleHeader = (header: string) => {
    setSelectedHeaders((prev) =>
      prev.includes(header) ? prev.filter((h) => h !== header) : [...prev, header]
    );
  };

  const selectAll = () => {
    setSelectedHeaders([...parsedCsv.headers]);
  };

  const deselectAll = () => {
    setSelectedHeaders([]);
  };

  const handleApply = () => {
    if (isTemplate) {
      const finalHeaders = selectedHeaders.map((h) => headerOverrides[h] || h);
      applyCsvTemplateToStore(finalHeaders, {
        clearExistingRows,
        filename: parsedCsv.filename,
      });
    } else {
      applyCsvDatasetToStore(parsedCsv, datasetMode);
    }

    onImportComplete?.();
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: isTemplate ? '580px' : '720px',
          maxHeight: '90vh',
          background: 'var(--bg-primary, #1e1e2e)',
          border: '1px solid var(--border-subtle, #313244)',
          borderRadius: '10px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
          animation: 'fadeIn 0.15s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-subtle, #313244)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-secondary, #181825)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                background: isTemplate
                  ? 'rgba(137, 180, 250, 0.15)'
                  : 'rgba(166, 227, 161, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isTemplate ? 'var(--accent-primary, #89b4fa)' : 'var(--accent-success, #a6e3a1)',
              }}
            >
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #cdd6f4)' }}>
                {isTemplate ? 'Import CSV Schema Template' : 'Import CSV Dataset'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted, #a6adc8)' }}>
                {parsedCsv.filename || 'Uploaded File'} • {parsedCsv.headers.length} Columns
                {!isTemplate && ` • ${parsedCsv.rows.length} Rows`}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #a6adc8)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: '16px 20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {isTemplate ? (
            /* --- Mode 1: Schema Template --- */
            <>
              <div
                style={{
                  background: 'rgba(137, 180, 250, 0.08)',
                  border: '1px solid rgba(137, 180, 250, 0.25)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  fontSize: '11.5px',
                  color: 'var(--text-secondary, #bac2de)',
                  lineHeight: 1.45,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                }}
              >
                <Sparkles size={16} color="var(--accent-primary, #89b4fa)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ color: 'var(--accent-primary, #89b4fa)' }}>
                    Schema Template Detected:
                  </strong>{' '}
                  This CSV defines column headers for your research. LitSift will set these as your master table columns so the AI extracts exactly these variables.
                </div>
              </div>

              {/* Column Selection Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: 'var(--text-muted, #a6adc8)', fontWeight: 600 }}>
                  Detected Columns ({selectedHeaders.length}/{parsedCsv.headers.length} selected):
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={selectAll}
                    style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary, #89b4fa)', cursor: 'pointer', fontSize: '11px', padding: 0 }}
                  >
                    Select All
                  </button>
                  <span style={{ color: 'var(--border-subtle, #313244)' }}>•</span>
                  <button
                    onClick={deselectAll}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted, #a6adc8)', cursor: 'pointer', fontSize: '11px', padding: 0 }}
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Columns List */}
              <div
                style={{
                  maxHeight: '260px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-subtle, #313244)',
                  borderRadius: '6px',
                  background: 'var(--bg-secondary, #181825)',
                }}
              >
                {parsedCsv.headers.map((h, i) => {
                  const isChecked = selectedHeaders.includes(h);
                  const fieldKey = sanitizeField(headerOverrides[h] || h);

                  return (
                    <div
                      key={i}
                      style={{
                        padding: '8px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: i < parsedCsv.headers.length - 1 ? '1px solid rgba(255, 255, 255, 0.04)' : 'none',
                        background: isChecked ? 'transparent' : 'rgba(0, 0, 0, 0.15)',
                        opacity: isChecked ? 1 : 0.6,
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer', flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleHeader(h)}
                          style={{ cursor: 'pointer' }}
                        />
                        <input
                          type="text"
                          value={headerOverrides[h] || h}
                          onChange={(e) =>
                            setHeaderOverrides((prev) => ({ ...prev, [h]: e.target.value }))
                          }
                          disabled={!isChecked}
                          style={{
                            background: 'transparent',
                            border: '1px solid transparent',
                            color: 'var(--text-primary, #cdd6f4)',
                            fontSize: '11.5px',
                            fontWeight: 500,
                            padding: '2px 4px',
                            borderRadius: '4px',
                            outline: 'none',
                            width: '220px',
                          }}
                          onFocus={(e) => (e.target.style.borderColor = 'var(--accent-primary, #89b4fa)')}
                          onBlur={(e) => (e.target.style.borderColor = 'transparent')}
                        />
                      </label>

                      <span
                        style={{
                          fontSize: '10px',
                          color: 'var(--text-muted, #a6adc8)',
                          fontFamily: 'monospace',
                          background: 'rgba(255, 255, 255, 0.04)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        field: {fieldKey}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Clear existing rows option */}
              {existingRows.length > 0 && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '11px',
                    color: 'var(--text-secondary, #bac2de)',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={clearExistingRows}
                    onChange={(e) => setClearExistingRows(e.target.checked)}
                  />
                  <span>
                    Clear {existingRows.length} existing data row(s) and start with a fresh empty table
                  </span>
                </label>
              )}
            </>
          ) : (
            /* --- Mode 2: Empirical Dataset --- */
            <>
              {/* Alignment Summary Banner */}
              <div
                style={{
                  background: 'rgba(166, 227, 161, 0.08)',
                  border: '1px solid rgba(166, 227, 161, 0.25)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  fontSize: '11.5px',
                  color: 'var(--text-secondary, #bac2de)',
                  lineHeight: 1.45,
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--accent-success, #a6e3a1)', marginBottom: '3px' }}>
                  Dataset Ingestion Preview
                </div>
                Found <strong>{parsedCsv.rows.length} rows</strong> across <strong>{parsedCsv.headers.length} columns</strong>.
                {alignment.matched.length > 0 && (
                  <span style={{ color: 'var(--text-muted, #a6adc8)' }}>
                    {' '}({alignment.matched.length} column(s) align with your current schema).
                  </span>
                )}
              </div>

              {/* Sample Data Table Preview */}
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted, #a6adc8)' }}>
                Sample Data (First {Math.min(parsedCsv.rows.length, 3)} rows):
              </div>

              <div
                style={{
                  overflowX: 'auto',
                  border: '1px solid var(--border-subtle, #313244)',
                  borderRadius: '6px',
                  background: 'var(--bg-secondary, #181825)',
                  maxHeight: '180px',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border-subtle, #313244)' }}>
                      {parsedCsv.headers.slice(0, 6).map((h, i) => (
                        <th
                          key={i}
                          style={{
                            padding: '6px 10px',
                            textAlign: 'left',
                            fontWeight: 600,
                            color: 'var(--text-primary, #cdd6f4)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedCsv.rows.slice(0, 3).map((r, rIdx) => (
                      <tr
                        key={rIdx}
                        style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}
                      >
                        {parsedCsv.headers.slice(0, 6).map((h, cIdx) => (
                          <td
                            key={cIdx}
                            style={{
                              padding: '5px 10px',
                              color: 'var(--text-secondary, #bac2de)',
                              whiteSpace: 'nowrap',
                              maxWidth: '160px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {r[h] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mode Selector: Append vs Replace */}
              {existingRows.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-muted, #a6adc8)' }}>
                    Import Destination:
                  </div>
                  <div style={{ display: 'flex', gap: '14px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="datasetMode"
                        checked={datasetMode === 'append'}
                        onChange={() => setDatasetMode('append')}
                      />
                      <span>Append to current table (+{parsedCsv.rows.length} rows)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="datasetMode"
                        checked={datasetMode === 'replace'}
                        onChange={() => setDatasetMode('replace')}
                      />
                      <span>Replace current table ({existingRows.length} rows will be replaced)</span>
                    </label>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--border-subtle, #313244)',
            background: 'var(--bg-secondary, #181825)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '8px',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle, #313244)',
              color: 'var(--text-secondary, #bac2de)',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '11.5px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          <button
            onClick={handleApply}
            disabled={isTemplate && selectedHeaders.length === 0}
            style={{
              background: 'var(--accent-primary, #89b4fa)',
              color: '#11111b',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '11.5px',
              fontWeight: 600,
              cursor: isTemplate && selectedHeaders.length === 0 ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              opacity: isTemplate && selectedHeaders.length === 0 ? 0.6 : 1,
            }}
          >
            {isTemplate ? (
              <>
                <Check size={13} /> Set as Master Schema ({selectedHeaders.length} cols)
              </>
            ) : (
              <>
                <Check size={13} /> {datasetMode === 'replace' ? 'Replace Table' : 'Append to Table'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
