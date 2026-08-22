import React from 'react';
import { X, Database, FileText, Cpu, ShieldCheck, Heart } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-secondary, #181825)',
          border: '1px solid var(--border-subtle, #313244)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle, #313244)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-tertiary, #11111b)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                fontSize: '20px',
                background: 'rgba(137, 180, 250, 0.15)',
                border: '1px solid rgba(137, 180, 250, 0.3)',
                padding: '4px 8px',
                borderRadius: '8px',
              }}
            >
              ⚡
            </span>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary, #cdd6f4)' }}>
                LitSift Cloud
              </div>
              <div style={{ fontSize: '11px', color: 'var(--accent-primary, #89b4fa)', fontWeight: 500 }}>
                Agentic Literature Synthesis Workspace • v1.0.0
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #6c7086)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-primary, #cdd6f4)';
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover, #313244)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-muted, #6c7086)';
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary, #a6adc8)', lineHeight: 1.6 }}>
            LitSift Cloud is a high-performance, distraction-free workspace designed for researchers and scientists. It combines agentic AI extraction with interactive PDF canvas navigation, AG Grid synthesis, and zero-cloud local persistence.
          </p>

          {/* Feature Highlights Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div
              style={{
                background: 'var(--bg-surface, #252538)',
                border: '1px solid var(--border-subtle, #313244)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              <Cpu size={16} color="var(--accent-primary, #89b4fa)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary, #cdd6f4)' }}>
                  Gemini 2.5 Agent
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted, #6c7086)' }}>
                  Autonomous extraction & citation grounding
                </div>
              </div>
            </div>

            <div
              style={{
                background: 'var(--bg-surface, #252538)',
                border: '1px solid var(--border-subtle, #313244)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              <Database size={16} color="var(--accent-success, #a6e3a1)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary, #cdd6f4)' }}>
                  AG Grid Master
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted, #6c7086)' }}>
                  Spreadsheet schema synthesis & CSV exports
                </div>
              </div>
            </div>

            <div
              style={{
                background: 'var(--bg-surface, #252538)',
                border: '1px solid var(--border-subtle, #313244)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              <FileText size={16} color="var(--accent-secondary, #b4befe)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary, #cdd6f4)' }}>
                  Dual Canvas
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted, #6c7086)' }}>
                  PDF Vector & Structured Article Reader
                </div>
              </div>
            </div>

            <div
              style={{
                background: 'var(--bg-surface, #252538)',
                border: '1px solid var(--border-subtle, #313244)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              <ShieldCheck size={16} color="var(--accent-warning, #f9e2af)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary, #cdd6f4)' }}>
                  Local Privacy
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted, #6c7086)' }}>
                  IndexedDB offline & client-side security
                </div>
              </div>
            </div>
          </div>

          {/* Keyboard Shortcuts Quick Reference */}
          <div
            style={{
              background: 'var(--bg-tertiary, #11111b)',
              border: '1px solid var(--border-subtle, #313244)',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '11px',
              color: 'var(--text-secondary, #a6adc8)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-primary, #cdd6f4)' }}>Quick Shortcuts:</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Toggle Left Sidebar</span>
              <kbd style={{ background: 'var(--bg-surface)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>Ctrl + B</kbd>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Search in Active Paper</span>
              <kbd style={{ background: 'var(--bg-surface)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>Ctrl + F</kbd>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            background: 'var(--bg-tertiary, #11111b)',
            borderTop: '1px solid var(--border-subtle, #313244)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: 'var(--text-muted, #6c7086)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            Crafted with <Heart size={12} color="var(--accent-danger, #f38ba8)" fill="var(--accent-danger, #f38ba8)" /> for open science
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'var(--accent-primary, #89b4fa)',
              color: 'var(--bg-primary, #1e1e2e)',
              border: 'none',
              borderRadius: '6px',
              padding: '5px 14px',
              fontWeight: 700,
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AboutModal;
