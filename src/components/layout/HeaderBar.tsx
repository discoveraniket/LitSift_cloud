import React from 'react';
import { PanelLeft, PanelBottom, PanelRight, FileText, Table, FileArchive, X } from 'lucide-react';
import { EditorTab } from '../../types/layout';

interface HeaderBarProps {
  tabs: EditorTab[];
  activeTabId: string;
  showLeftPanel: boolean;
  showBottomPanel: boolean;
  showRightPanel: boolean;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onToggleLeftPanel: () => void;
  onToggleBottomPanel: () => void;
  onToggleRightPanel: () => void;
  onOpenWorkspaceHub?: (section: 'export' | 'import') => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  tabs,
  activeTabId,
  showLeftPanel,
  showBottomPanel,
  showRightPanel,
  onSelectTab,
  onCloseTab,
  onToggleLeftPanel,
  onToggleBottomPanel,
  onToggleRightPanel,
  onOpenWorkspaceHub,
}) => {
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  return (
    <header
      className="header-bar"
      style={{
        height: '32px',
        padding: '0 8px 0 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-secondary, #181825)',
        borderBottom: '1px solid var(--border-subtle, #313244)',
        userSelect: 'none',
      }}
    >
      {/* Left: VS Code Dynamic Editor Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          flex: 1,
        }}
      >
        <div style={{ display: 'flex', height: '100%', alignItems: 'stretch' }}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  height: '100%',
                  padding: '0 10px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  background: isActive ? 'var(--bg-primary, #1e1e2e)' : 'transparent',
                  color: isActive ? 'var(--text-primary, #cdd6f4)' : 'var(--text-secondary, #a6adc8)',
                  borderRight: '1px solid var(--border-subtle, #313244)',
                  borderTop: isActive ? '2px solid var(--accent-primary, #89b4fa)' : '2px solid transparent',
                  fontWeight: isActive ? 600 : 400,
                  maxWidth: '220px',
                  minWidth: '110px',
                  position: 'relative',
                  transition: 'all 0.1s ease',
                }}
              >
                {/* Tab Icon */}
                {tab.type === 'pdf' && (
                  <FileText size={12} color="var(--accent-secondary, #b4befe)" style={{ flexShrink: 0 }} />
                )}
                {tab.type === 'master_grid' && (
                  <Table size={12} color="var(--accent-success, #a6e3a1)" style={{ flexShrink: 0 }} />
                )}
                {tab.type === 'workspace_hub' && (
                  <FileArchive size={12} color="var(--accent-primary, #89b4fa)" style={{ flexShrink: 0 }} />
                )}

                {/* Tab Title */}
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={tab.title}
                >
                  {tab.title}
                </span>

                {/* Tab Close Button */}
                {tab.closable !== false && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onCloseTab(tab.id);
                    }}
                    title="Close Tab"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '3px',
                      borderRadius: '3px',
                      color: 'var(--text-muted, #6c7086)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      opacity: isActive ? 0.9 : 0.6,
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.color = 'var(--accent-danger, #f38ba8)';
                      (e.currentTarget as HTMLElement).style.background = 'rgba(243, 139, 168, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.color = 'var(--text-muted, #6c7086)';
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Center: Sleek Muted Breadcrumb */}
      <div
        style={{
          fontSize: '10px',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          opacity: 0.8,
          padding: '0 12px',
          whiteSpace: 'nowrap',
        }}
      >
        <span>LitSift Cloud</span>
        <span>/</span>
        <span>{activeTab?.title || 'Workspace'}</span>
      </div>

      {/* Right: Panel Controls & Workspace Share Action */}
      <div className="header-controls" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {onOpenWorkspaceHub && (
          <button
            onClick={() => onOpenWorkspaceHub('export')}
            style={{
              background: 'rgba(137, 180, 250, 0.12)',
              border: '1px solid rgba(137, 180, 250, 0.3)',
              color: 'var(--accent-primary)',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '10.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '22px',
            }}
            title="Open Workspace Hub Tab (.litsift export & import)"
          >
            <FileArchive size={11} />
            <span>Workspace Hub</span>
          </button>
        )}

        <div className="layout-toggle-group">
          <button
            className={`layout-toggle-btn ${showLeftPanel ? 'active' : ''}`}
            onClick={onToggleLeftPanel}
            title="Toggle Left Explorer (Ctrl+B)"
          >
            <PanelLeft size={14} />
          </button>
          <button
            className={`layout-toggle-btn ${showBottomPanel ? 'active' : ''}`}
            onClick={onToggleBottomPanel}
            title="Toggle Bottom Data Grid Panel"
          >
            <PanelBottom size={14} />
          </button>
          <button
            className={`layout-toggle-btn ${showRightPanel ? 'active' : ''}`}
            onClick={onToggleRightPanel}
            title="Toggle Right AI Copilot"
          >
            <PanelRight size={14} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default HeaderBar;
