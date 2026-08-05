import React from 'react';

export const RightAgentPanel: React.FC = () => {
  return (
    <aside className="panel right-agent">
      <div className="panel-header">
        <span>AGENTIC AI COMMAND CENTER</span>
      </div>

      <div className="agent-stream-container">
        <div className="message system-msg">
          🤖 <strong>LitSift Agent</strong> is online. Ask me to extract data, generate schemas, or split/merge table cells!
        </div>
        <div className="message user-msg">
          Extract methodology and key findings from Attention_Is_All_You_Need.pdf
        </div>
        <div className="message agent-msg">
          <div className="tool-execution-badge">⚡ Executed Tool: extract_schema_data</div>
          Proposed 2 new table rows with high confidence. Please review the highlighted pending edits in the bottom table grid.
        </div>
      </div>

      <div className="agent-input-container">
        <input
          type="text"
          className="agent-prompt-input"
          placeholder="Type command e.g. 'split row 5 col 6' or 'generate schema'..."
        />
        <button className="agent-send-btn">Send</button>
      </div>
    </aside>
  );
};
