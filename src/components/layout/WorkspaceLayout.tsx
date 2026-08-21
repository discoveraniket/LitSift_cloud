import React, { useState, useEffect, useRef } from 'react';
import { HeaderBar } from './HeaderBar';
import { ActivityBar } from './ActivityBar';
import { StatusBar } from './StatusBar';
import { LeftExplorerPanel } from '../explorer/LeftExplorerPanel';
import { CentralViewerPanel } from '../pdf-viewer/CentralViewerPanel';
import { RightAgentPanel } from '../agent/RightAgentPanel';
import { BottomGridPanel } from '../data-grid/BottomGridPanel';
import { SettingsModal } from '../settings/SettingsModal';
import { DebugLogsModal } from '../agent/DebugLogsModal';
import { EditorTab } from '../../types/layout';

import { usePdfStore } from '../../store/usePdfStore';
import { useGridStore } from '../../store/useGridStore';
import { useAgentStore } from '../../store/useAgentStore';

export const WorkspaceLayout: React.FC = () => {
  const activePdf = usePdfStore((state) => state.getActivePdf());
  const activePdfId = activePdf?.id || '';
  const activePdfTitle = activePdf?.name || 'No Paper Selected';

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);

  // Dynamic VS Code Editor Tabs State
  const [tabs, setTabs] = useState<EditorTab[]>([
    {
      id: 'master-grid',
      type: 'master_grid',
      title: 'Master Data Grid',
      closable: true,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('master-grid');
  const [initialHubSection, setInitialHubSection] = useState<'export' | 'import'>('export');
  const [pendingWorkspaceFile, setPendingWorkspaceFile] = useState<File | null>(null);

  // Side Panel Toggle States
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [isGridMaximized, setIsGridMaximized] = useState(false);

  // Pixel Width/Height State for dragging
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(420);
  const [bottomHeight, setBottomHeight] = useState(280);

  const [isDragging, setIsDragging] = useState<string | null>(null);
  const initialPdfSyncedRef = useRef(false);

  // Sync initial PDF tab once hydrated on initial load only
  useEffect(() => {
    if (!initialPdfSyncedRef.current && activePdf) {
      initialPdfSyncedRef.current = true;
      const tabId = `pdf-${activePdf.id}`;
      setTabs((prev) => [
        {
          id: tabId,
          type: 'pdf',
          title: activePdf.name,
          pdfId: activePdf.id,
          closable: true,
        },
        ...prev.filter((t) => t.id !== tabId),
      ]);
      setActiveTabId(tabId);
    }
  }, [activePdf?.id]);

  // Global drag-and-drop listener for .litsift files
  useEffect(() => {
    const handleDragOverWindow = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDropWindow = (e: DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.name.toLowerCase().endsWith('.litsift') || file.name.toLowerCase().endsWith('.json')) {
          setPendingWorkspaceFile(file);
          handleOpenWorkspaceHub('import');
        }
      }
    };

    window.addEventListener('dragover', handleDragOverWindow);
    window.addEventListener('drop', handleDropWindow);

    return () => {
      window.removeEventListener('dragover', handleDragOverWindow);
      window.removeEventListener('drop', handleDropWindow);
    };
  }, []);

  const handleSelectTab = (tabId: string) => {
    setActiveTabId(tabId);
    const targetTab = tabs.find((t) => t.id === tabId);

    if (targetTab?.type === 'pdf' && targetTab.pdfId) {
      useGridStore.getState().resetActiveSelection();
      usePdfStore.getState().setActivePdf(targetTab.pdfId);
      const doc = usePdfStore.getState().getPdf(targetTab.pdfId);
      useAgentStore.getState().setActivePdfId(targetTab.pdfId, doc?.name || targetTab.title);
    } else if (targetTab?.type === 'master_grid') {
      useGridStore.getState().resetActiveSelection();
      useAgentStore.getState().setActivePdfId('', 'Master Workspace');
    }
  };

  const handleCloseTab = (tabId: string) => {
    const remainingTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(remainingTabs);

    if (remainingTabs.length === 0) {
      setActiveTabId('');
      useGridStore.getState().resetActiveSelection();
      usePdfStore.getState().setActivePdf('');
      useAgentStore.getState().setActivePdfId('', 'LitSift Cloud');
      return;
    }

    if (activeTabId === tabId) {
      const closedIndex = tabs.findIndex((t) => t.id === tabId);
      const nextIndex = Math.min(closedIndex, remainingTabs.length - 1);
      const nextTab = remainingTabs[Math.max(0, nextIndex)];

      setActiveTabId(nextTab.id);

      if (nextTab.type === 'pdf' && nextTab.pdfId) {
        useGridStore.getState().resetActiveSelection();
        usePdfStore.getState().setActivePdf(nextTab.pdfId);
        const doc = usePdfStore.getState().getPdf(nextTab.pdfId);
        useAgentStore.getState().setActivePdfId(nextTab.pdfId, doc?.name || nextTab.title);
      } else if (nextTab.type === 'master_grid') {
        useGridStore.getState().resetActiveSelection();
        usePdfStore.getState().setActivePdf('');
        useAgentStore.getState().setActivePdfId('', 'Master Workspace');
      } else if (nextTab.type === 'workspace_hub') {
        useGridStore.getState().resetActiveSelection();
      }
    }
  };

  const handleSelectPdf = (id: string, title?: string) => {
    useGridStore.getState().resetActiveSelection();
    usePdfStore.getState().setActivePdf(id);
    const resolvedTitle = title || usePdfStore.getState().getPdf(id)?.name || 'Research Paper.pdf';
    useAgentStore.getState().setActivePdfId(id, resolvedTitle);

    const tabId = `pdf-${id}`;
    setTabs((prev) => {
      if (prev.some((t) => t.id === tabId)) {
        return prev;
      }
      return [
        ...prev,
        {
          id: tabId,
          type: 'pdf',
          title: resolvedTitle,
          pdfId: id,
          closable: true,
        },
      ];
    });

    setActiveTabId(tabId);
  };

  const handleOpenMasterGrid = () => {
    useGridStore.getState().resetActiveSelection();
    useAgentStore.getState().setActivePdfId('', 'Master Workspace');

    setTabs((prev) => {
      if (prev.some((t) => t.id === 'master-grid')) {
        return prev;
      }
      return [
        ...prev,
        {
          id: 'master-grid',
          type: 'master_grid',
          title: 'Master Data Grid',
          closable: true,
        },
      ];
    });

    setActiveTabId('master-grid');
  };

  const handleOpenWorkspaceHub = (section: 'export' | 'import' = 'export') => {
    setInitialHubSection(section);
    setTabs((prev) => {
      if (prev.some((t) => t.id === 'workspace-hub')) {
        return prev;
      }
      return [
        ...prev,
        {
          id: 'workspace-hub',
          type: 'workspace_hub',
          title: 'Workspace Hub',
          closable: true,
        },
      ];
    });

    setActiveTabId('workspace-hub');
  };

  const handleOpenPaperDiscovery = () => {
    setTabs((prev) => {
      if (prev.some((t) => t.id === 'paper-discovery')) {
        return prev;
      }
      return [
        ...prev,
        {
          id: 'paper-discovery',
          type: 'paper_discovery',
          title: 'Paper Discovery & Ingest',
          closable: true,
        },
      ];
    });

    setActiveTabId('paper-discovery');
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

    useGridStore.getState().resetActiveSelection();
    useGridStore.getState().clearTable();
    await usePdfStore.getState().clearAllPdfs();
    useAgentStore.getState().clearMessages();

    setTabs([
      {
        id: 'master-grid',
        type: 'master_grid',
        title: 'Master Data Grid',
        closable: true,
      },
    ]);
    setActiveTabId('master-grid');
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

  const currentActiveTab = tabs.find((t) => t.id === activeTabId) || null;

  return (
    <div className={`workspace-app ${isDragging ? 'is-dragging' : ''}`}>
      {/* 48px VS Code Vertical Activity Bar */}
      <ActivityBar
        showLeftPanel={showLeftPanel}
        showBottomPanel={showBottomPanel}
        activeView={currentActiveTab?.type === 'master_grid' ? 'master_grid' : 'pdf'}
        onToggleLeftPanel={() => setShowLeftPanel(!showLeftPanel)}
        onToggleBottomPanel={() => setShowBottomPanel(!showBottomPanel)}
        onOpenMasterGrid={handleOpenMasterGrid}
        onOpenDebugLogs={() => setShowLogsModal(true)}
        onToggleZenMode={handleToggleZenMode}
        onOpenSettings={() => setShowSettingsModal(true)}
        onResetWorkspace={handleResetWorkspace}
      />

      {/* Main Workspace Frame */}
      <div className="workspace-main-frame">
        <HeaderBar
          tabs={tabs}
          activeTabId={activeTabId}
          showLeftPanel={showLeftPanel}
          showBottomPanel={showBottomPanel}
          showRightPanel={showRightPanel}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          onOpenWorkspaceHub={handleOpenWorkspaceHub}
          onToggleLeftPanel={() => setShowLeftPanel(!showLeftPanel)}
          onToggleBottomPanel={() => setShowBottomPanel(!showBottomPanel)}
          onToggleRightPanel={() => setShowRightPanel(!showRightPanel)}
        />

        <div className="workspace-body">
          {/* Top Section: Left Explorer | Central Viewer / Hub | Right AI Chat */}
          {!isGridMaximized && (
            <div className="layout-row-top">
              {showLeftPanel && (
                <>
                  <div className="layout-col-left" style={{ width: `${leftWidth}px` }}>
                    <LeftExplorerPanel
                      onSelectPdf={handleSelectPdf}
                      onOpenMasterGrid={handleOpenMasterGrid}
                      onOpenDebugLogs={() => setShowLogsModal(true)}
                      onOpenWorkspaceHub={handleOpenWorkspaceHub}
                      onOpenPaperDiscovery={handleOpenPaperDiscovery}
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
                  activeTab={currentActiveTab}
                  activePdfId={activePdfId}
                  activePdfTitle={activePdfTitle}
                  initialHubSection={initialHubSection}
                  pendingWorkspaceFile={pendingWorkspaceFile}
                  onNavigateToGrid={handleOpenMasterGrid}
                  onNavigateToPdf={handleSelectPdf}
                  onOpenWorkspaceHub={handleOpenWorkspaceHub}
                  onOpenPaperDiscovery={handleOpenPaperDiscovery}
                />
              </div>

              {showRightPanel && (
                <>
                  <div
                    className="custom-drag-handle horizontal"
                    onMouseDown={handleMouseDownRight}
                  />
                  <div className="layout-col-right" style={{ width: `${rightWidth}px` }}>
                    <RightAgentPanel
                      activePdfTitle={currentActiveTab?.type === 'pdf' ? activePdfTitle : (currentActiveTab?.title || 'Workspace')}
                      onOpenSettings={() => setShowSettingsModal(true)}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* 100% Full-Width Bottom Data Grid Panel */}
          {showBottomPanel && currentActiveTab?.type !== 'master_grid' && (
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
          activePdfTitle={currentActiveTab?.title || 'LitSift Cloud'}
          showBottomPanel={showBottomPanel}
          isGridMaximized={isGridMaximized}
          onToggleMaximizeGrid={() => setIsGridMaximized(!isGridMaximized)}
        />
      </div>

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />

      <DebugLogsModal
        isOpen={showLogsModal}
        onClose={() => setShowLogsModal(false)}
      />
    </div>
  );
};

export default WorkspaceLayout;
