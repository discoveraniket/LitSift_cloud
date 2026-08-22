import React from 'react';
import {
  Files,
  FileArchive,
  Settings,
  Maximize2,
  Bug,
  HelpCircle,
} from 'lucide-react';
import { getSelectedGeminiModel } from '../../services/geminiService';
import { useLogStore } from '../../store/useLogStore';
import { SidebarViewMode } from '../../types/layout';

interface ActivityBarProps {
  showLeftPanel: boolean;
  activeSidebarView: SidebarViewMode;
  onSelectSidebarView: (view: SidebarViewMode) => void;
  onToggleZenMode: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
  showLeftPanel,
  activeSidebarView,
  onSelectSidebarView,
  onToggleZenMode,
  onOpenSettings,
  onOpenAbout,
}) => {
  const currentModel = getSelectedGeminiModel();
  const logCount = useLogStore((state) => state.logs.length);

  return (
    <aside className="activity-bar">
      <div className="activity-bar-top">
        {/* Brand/Logo Badge */}
        <div className="activity-item brand-item" title="LitSift Cloud — Agentic Research Workspace">
          <span className="activity-logo">⚡</span>
        </div>

        {/* 1. Explorer (Research Papers & Views) */}
        <button
          className={`activity-item ${showLeftPanel && activeSidebarView === 'explorer' ? 'active' : ''}`}
          onClick={() => onSelectSidebarView('explorer')}
          title="Explorer (Research Papers & Views)"
        >
          <Files size={19} />
          <span className="activity-tooltip">Explorer</span>
        </button>

        {/* 2. Workspace Projects (.litsift bundle state & CSV Data) */}
        <button
          className={`activity-item ${showLeftPanel && activeSidebarView === 'workspace' ? 'active' : ''}`}
          onClick={() => onSelectSidebarView('workspace')}
          title="Workspace & Project State (.litsift Packages & CSV Datasets)"
        >
          <FileArchive size={19} />
          <span className="activity-tooltip">Workspace</span>
        </button>

        {/* 3. Debug Logs & Telemetry */}
        <button
          className={`activity-item ${showLeftPanel && activeSidebarView === 'debug' ? 'active' : ''}`}
          onClick={() => onSelectSidebarView('debug')}
          title={`Agent Debug & Telemetry Logs (${logCount} events)`}
          style={{ position: 'relative' }}
        >
          <Bug size={19} color={logCount > 0 ? 'var(--accent-primary)' : undefined} />
          {logCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '5px',
                right: '5px',
                background: 'var(--accent-primary)',
                color: 'var(--bg-primary)',
                borderRadius: '8px',
                fontSize: '8.5px',
                fontWeight: 700,
                padding: '0 3.5px',
                lineHeight: '12px',
                minWidth: '12px',
                textAlign: 'center',
              }}
            >
              {logCount > 99 ? '99+' : logCount}
            </span>
          )}
          <span className="activity-tooltip">Debug & Logs</span>
        </button>
      </div>

      <div className="activity-bar-bottom">
        {/* Zen Mode Toggle */}
        <button
          className="activity-item"
          onClick={onToggleZenMode}
          title="Zen Reader Mode (Toggle Distraction-Free Workspace)"
        >
          <Maximize2 size={18} />
          <span className="activity-tooltip">Zen Reader</span>
        </button>

        {/* Settings Button */}
        <button
          className="activity-item"
          onClick={onOpenSettings}
          title={`AI Settings & Model Selection (Active: ${currentModel})`}
        >
          <Settings size={18} />
          <span className="activity-tooltip">Settings</span>
        </button>

        {/* About LitSift Cloud Button */}
        <button
          className="activity-item"
          onClick={onOpenAbout}
          title="About LitSift Cloud (Architecture & Shortcuts)"
        >
          <HelpCircle size={18} />
          <span className="activity-tooltip">About</span>
        </button>
      </div>
    </aside>
  );
};
