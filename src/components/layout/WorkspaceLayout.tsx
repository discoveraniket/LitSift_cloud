import React, { useState } from 'react';
import { HeaderBar } from './HeaderBar';
import { LeftExplorerPanel } from '../explorer/LeftExplorerPanel';
import { CentralViewerPanel } from '../pdf-viewer/CentralViewerPanel';
import { RightAgentPanel } from '../agent/RightAgentPanel';
import { BottomGridPanel } from '../data-grid/BottomGridPanel';
import { SettingsModal } from '../settings/SettingsModal';

export const WorkspaceLayout: React.FC = () => {
  const [activeView, setActiveView] = useState<'pdf' | 'master_grid'>('pdf');
  const [activePdfId, setActivePdfId] = useState('pdf-1');
  const [activePdfTitle, setActivePdfTitle] = useState('38094623.pdf');
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Side Panel Toggle States
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);

  // Pixel Width/Height State for perfect, non-squashing dragging
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(300);
  const [bottomHeight, setBottomHeight] = useState(240);

  const [isDragging, setIsDragging] = useState<string | null>(null);

  const handleSelectPdf = (id: string, title: string) => {
    setActivePdfId(id);
    setActivePdfTitle(title);
    setActiveView('pdf');
  };

  const handleOpenMasterGrid = () => {
    setActiveView('master_grid');
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
      const newWidth = Math.max(220, Math.min(600, startWidth + deltaX));
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
      const newHeight = Math.max(120, Math.min(500, startHeight + deltaY));
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
    <div className={`workspace-container ${isDragging ? 'is-dragging' : ''}`}>
      <HeaderBar
        activeView={activeView}
        activePdfTitle={activePdfTitle}
        showLeftPanel={showLeftPanel}
        showBottomPanel={showBottomPanel}
        showRightPanel={showRightPanel}
        onToggleView={setActiveView}
        onToggleLeftPanel={() => setShowLeftPanel(!showLeftPanel)}
        onToggleBottomPanel={() => setShowBottomPanel(!showBottomPanel)}
        onToggleRightPanel={() => setShowRightPanel(!showRightPanel)}
        onToggleZenMode={handleToggleZenMode}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      <div className="workspace-body">
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
                <RightAgentPanel />
              </div>
            </>
          )}
        </div>

        {showBottomPanel && (
          <>
            <div
              className="custom-drag-handle vertical"
              onMouseDown={handleMouseDownBottom}
            />
            <div className="layout-row-bottom" style={{ height: `${bottomHeight}px` }}>
              <BottomGridPanel activePdfId={activePdfId} activePdfTitle={activePdfTitle} />
            </div>
          </>
        )}
      </div>

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
    </div>
  );
};

export default WorkspaceLayout;
