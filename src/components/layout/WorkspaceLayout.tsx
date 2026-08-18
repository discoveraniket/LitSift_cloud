import React, { useState } from 'react';
import { HeaderBar } from './HeaderBar';
import { ActivityBar } from './ActivityBar';
import { StatusBar } from './StatusBar';
import { LeftExplorerPanel } from '../explorer/LeftExplorerPanel';
import { CentralViewerPanel } from '../pdf-viewer/CentralViewerPanel';
import { RightAgentPanel } from '../agent/RightAgentPanel';
import { BottomGridPanel } from '../data-grid/BottomGridPanel';
import { SettingsModal } from '../settings/SettingsModal';

import { usePdfStore } from '../../store/usePdfStore';
import { useGridStore } from '../../store/useGridStore';
import { useAgentStore } from '../../store/useAgentStore';

export const WorkspaceLayout: React.FC = () => {
  const [activeView, setActiveView] = useState<'pdf' | 'master_grid'>('pdf');
  const activePdf = usePdfStore((state) => state.getActivePdf());
  const activePdfId = activePdf?.id || '';
  const activePdfTitle = activePdf?.name || 'No Paper Selected';
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Side Panel Toggle States
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [isGridMaximized, setIsGridMaximized] = useState(false);

  // Pixel Width/Height State for perfect dragging
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(420);
  const [bottomHeight, setBottomHeight] = useState(280);

  const [isDragging, setIsDragging] = useState<string | null>(null);

  const handleSelectPdf = (id: string, title?: string) => {
    useGridStore.getState().resetActiveSelection();
    usePdfStore.getState().setActivePdf(id);
    const resolvedTitle = title || usePdfStore.getState().getPdf(id)?.name;
    useAgentStore.getState().setActivePdfId(id, resolvedTitle);
    setActiveView('pdf');
  };

  const handleOpenMasterGrid = () => {
    useGridStore.getState().resetActiveSelection();
    if (activeView === 'master_grid') {
      setActiveView('pdf');
    } else {
      useAgentStore.getState().setActivePdfId('', 'Master Workspace');
      setActiveView('master_grid');
      setShowBottomPanel(false); // Auto-hide bottom panel when viewing Master Grid in central area
    }
  };

  const handleToggleZenMode = () => {
    if (showLeftPanel || showBottomPanel || showRightPanel) {
      setShowLeftPanel(false);
      setShowBottomPanel(false);
      setShowRightPanel(false);
    } else {
      setShowLeftPanel(true);
      setShowBottomPanel(true);
      setShowRightPanel(true);
    }
  };

  const handleResetWorkspace = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to start a fresh project?\n\nThis will clear all uploaded PDFs, extracted table rows, and chat histories from your workspace.'
    );
    if (!confirmed) return;

    // Reset stores and IndexedDB
    useGridStore.getState().resetActiveSelection();
    useGridStore.getState().clearTable();
    await usePdfStore.getState().clearAllPdfs();
    useAgentStore.getState().clearMessages();
    setActiveView('pdf');
  };

  // Custom Mouse Drag Handlers
  const handleMouseDownLeft = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging('left');
    const startX = e.clientX;
    const startWidth = leftWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(180, Math.min(500, startWidth + deltaX));
      setLeftWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseDownRight = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging('right');
    const startX = e.clientX;
    const startWidth = rightWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.max(280, Math.min(850, startWidth + deltaX));
      setRightWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseDownBottom = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging('bottom');
    const startY = e.clientY;
    const startHeight = bottomHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(140, Math.min(700, startHeight + deltaY));
      setBottomHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className={`workspace-app ${isDragging ? 'is-dragging' : ''}`}>
      {/* 48px VS Code Vertical Activity Bar */}
      <ActivityBar
        showLeftPanel={showLeftPanel}
        showBottomPanel={showBottomPanel}
        activeView={activeView}
        onToggleLeftPanel={() => setShowLeftPanel(!showLeftPanel)}
        onToggleBottomPanel={() => setShowBottomPanel(!showBottomPanel)}
        onOpenMasterGrid={handleOpenMasterGrid}
        onToggleZenMode={handleToggleZenMode}
        onOpenSettings={() => setShowSettingsModal(true)}
        onResetWorkspace={handleResetWorkspace}
      />

      {/* Main Workspace Frame */}
      <div className="workspace-main-frame">
        <HeaderBar
          activeView={activeView}
          activePdfTitle={activePdfTitle}
          showLeftPanel={showLeftPanel}
          showBottomPanel={showBottomPanel}
          showRightPanel={showRightPanel}
          onToggleView={(view) => {
            if (view === 'master_grid') {
              handleOpenMasterGrid();
            } else {
              handleSelectPdf(activePdfId, activePdfTitle);
            }
          }}
          onToggleLeftPanel={() => setShowLeftPanel(!showLeftPanel)}
          onToggleBottomPanel={() => setShowBottomPanel(!showBottomPanel)}
          onToggleRightPanel={() => setShowRightPanel(!showRightPanel)}
        />

        <div className="workspace-body">
          {/* Top Section: Left Explorer | Central Viewer | Right AI Chat */}
          {!isGridMaximized && (
            <div className="layout-row-top">
              {showLeftPanel && (
                <>
                  <div className="layout-col-left" style={{ width: `${leftWidth}px` }}>
                    <LeftExplorerPanel
                      onSelectPdf={handleSelectPdf}
                      onOpenMasterGrid={handleOpenMasterGrid}
                    />
                  </div>
                  <div
                    className="custom-drag-handle horizontal"
                    onMouseDown={handleMouseDownLeft}
                  />
                </>
              )}

              <div className="layout-col-center">
                <CentralViewerPanel
                  activeView={activeView}
                  activePdfId={activePdfId}
                  activePdfTitle={activePdfTitle}
                />
              </div>

              {showRightPanel && (
                <>
                  <div
                    className="custom-drag-handle horizontal"
                    onMouseDown={handleMouseDownRight}
                  />
                  <div className="layout-col-right" style={{ width: `${rightWidth}px` }}>
                    <RightAgentPanel activePdfTitle={activePdfTitle} />
                  </div>
                </>
              )}
            </div>
          )}

          {/* 100% Full-Width Bottom Data Grid Panel */}
          {showBottomPanel && (
            <>
              {!isGridMaximized && (
                <div
                  className="custom-drag-handle vertical"
                  onMouseDown={handleMouseDownBottom}
                />
              )}
              <div
                className={`layout-row-bottom ${isGridMaximized ? 'maximized' : ''}`}
                style={{ height: isGridMaximized ? '100%' : `${bottomHeight}px` }}
              >
                <BottomGridPanel
                  activePdfId={activePdfId}
                  activePdfTitle={activePdfTitle}
                />
              </div>
            </>
          )}
        </div>

        {/* Unified Control & Status Bar */}
        <StatusBar
          activePdfTitle={activePdfTitle}
          showBottomPanel={showBottomPanel}
          isGridMaximized={isGridMaximized}
          onToggleMaximizeGrid={() => setIsGridMaximized(!isGridMaximized)}
        />
      </div>

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
    </div>
  );
};

export default WorkspaceLayout;
