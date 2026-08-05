import React, { useState } from 'react';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { HeaderBar } from './HeaderBar';
import { LeftExplorerPanel } from '../explorer/LeftExplorerPanel';
import { CentralViewerPanel } from '../pdf-viewer/CentralViewerPanel';
import { RightAgentPanel } from '../agent/RightAgentPanel';
import { BottomGridPanel } from '../data-grid/BottomGridPanel';

export const WorkspaceLayout: React.FC = () => {
  const [activeView, setActiveView] = useState<'pdf' | 'master_grid'>('pdf');
  const [activePdfTitle, setActivePdfTitle] = useState('Attention_Is_All_You_Need.pdf');

  const handleSelectPdf = (_id: string, title: string) => {
    setActivePdfTitle(title);
    setActiveView('pdf');
  };

  const handleOpenMasterGrid = () => {
    setActiveView('master_grid');
  };

  return (
    <div className="workspace-container">
      <HeaderBar
        activeView={activeView}
        activePdfTitle={activePdfTitle}
        onToggleView={setActiveView}
      />

      <div className="workspace-body">
        {/* Main Vertical Splitter: Top 3-panel row vs Bottom Table panel */}
        <PanelGroup orientation="vertical">
          <Panel defaultSize={70} minSize={30}>
            {/* Top Horizontal Splitter: Left Explorer, Central Viewer, Right Agent */}
            <PanelGroup orientation="horizontal">
              <Panel defaultSize={20} minSize={15} maxSize={35}>
                <LeftExplorerPanel
                  onSelectPdf={handleSelectPdf}
                  onOpenMasterGrid={handleOpenMasterGrid}
                />
              </Panel>

              <PanelResizeHandle className="resize-handle-horizontal" />

              <Panel defaultSize={55} minSize={30}>
                <CentralViewerPanel
                  activeView={activeView}
                  activePdfTitle={activePdfTitle}
                />
              </Panel>

              <PanelResizeHandle className="resize-handle-horizontal" />

              <Panel defaultSize={25} minSize={20} maxSize={40}>
                <RightAgentPanel />
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="resize-handle-vertical" />

          <Panel defaultSize={30} minSize={15} maxSize={60}>
            <BottomGridPanel activePdfTitle={activePdfTitle} />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
};

export default WorkspaceLayout;
