# LitSift Cloud — Comprehensive Manual Testing Checklist

Follow this step-by-step checklist to test and verify every aspect of your LitSift Cloud workspace using real research PDFs.

---

### 1. Workspace Layout & Navigation

- [ ] **1.1 Pane Resizing**: Drag the splitter bars (Left, Right, Bottom). Verify smooth resizing without panel squashing.
- [ ] **1.2 Zen Mode**: Click the `Zen` button in the top header. Verify all side and bottom panels collapse. Click again to restore.
- [ ] **1.3 Panel Toggles**: Click `Left`, `Bottom`, and `Right` toggles in the header to show/hide individual panels independently.
- [ ] **1.4 View Switching**: Click `Master Table Grid` vs `Document Focus` in the header or left explorer to toggle between Global Master Grid view and Scoped PDF view.

---

### 2. PDF Document Management & Reader

- [ ] **2.1 Default Paper Viewing**: View default sample paper (`38094623.pdf`). Test `Zoom In (+)`, `Zoom Out (-)`, and `Fit Width`.
- [ ] **2.2 Upload Real Research PDF**: Click `+` next to **RESEARCH PAPERS** in the left explorer and upload a real PDF paper from your computer. Verify it appears in the list with `Ready` status.
- [ ] **2.3 Active PDF Switching**: Click your newly uploaded PDF in the explorer tree. Verify the central viewer instantly loads and renders its actual pages.

---

### 3. Gemini AI Extractions & Multi-Row Matrix Structuring

- [ ] **3.1 API Key & Model Setup**: Click **Settings (⚙️)** in top header bar, enter/verify your `GEMINI_API_KEY`, select `Gemini 3.6 Flash` (or `Gemini 3.6 Pro`), and click **Save Settings**.
- [ ] **3.2 Schema Columns Setup**: Add extraction columns (e.g. click `+ Column` to add *Methodology*, *Sample Size*, *Key Results*, *Limitations*).
- [ ] **3.3 Trigger Multi-Row Extraction**: Click **⚡ Extract Data** on the bottom toolbar (or type in Agent Chat: *"Extract data from this paper"*). Verify Gemini analyzes the paper and automatically emits **distinct, unambiguous rows** for each tested variable/phage/cohort with actual measured results.
- [ ] **3.4 Live Timer & Step Banner**: Notice the live progress banner showing ticking milliseconds (`⏱️ 3.2s`) and step indicators (`[1/3] Reading PDF... [2/3] Calling Gemini... [3/3] Populating Grid...`).
- [ ] **3.5 Formatted Markdown Chat**: Ask a general question (e.g. *"Summarize the methodology"*). Verify the agent responds with beautifully formatted Markdown (bold headers, bullet lists, code badges, and tables).
- [ ] **3.6 Live Execution Console (`📜 Logs`)**: Click `📜 Logs` in the Right Panel header to inspect real-time timestamps, network latency, and expandable JSON payloads.

---

### 4. Human-in-the-Loop AI Review & Diff Badges

- [ ] **4.1 Pending Diff Highlight**: Verify newly extracted or AI-edited rows are highlighted in **Yellow (`Pending Review`)**.
- [ ] **4.2 Confirm AI Edits**: Click **✓ Confirm All AI Edits** on the bottom toolbar. Verify yellow highlights turn into confirmed state (`✓ All Edits Approved`).
- [ ] **4.3 Reject AI Edits**: Test **✗ Reject All AI Edits** to verify unconfirmed AI proposals are cleanly removed.

---

### 5. Evidence Citation Grounding & Focused Cell Follow-Up Q&A

- [ ] **5.1 AI Reasoning Card**: Click on any extracted table cell. Verify the **Right Agent Panel** displays the AI Reasoning Card with confidence score, section name, and exact quote snippet.
- [ ] **5.2 Auto-Scroll & Evidence Highlight**: Watch the Central PDF Viewer when focusing a cell. Verify it automatically scrolls to the cited page and renders a glowing bounding-box evidence highlight over the passage.
- [ ] **5.3 Grounded Cell Follow-Up Discussion**: With a specific cell focused, ask a question or provide a correction in the chat (e.g. *"Why was 10^8 PFU/mL chosen here?"* or *"Note: Page 3 mentions Illumina NovaSeq"*). Verify Gemini answers with full awareness of the row, column, current cell value, and citation quote, invoking `updateCell` to refine the cell live.

---

### 6. Data Grid Operations & Table Manipulation

- [ ] **6.1 Inline Cell Editing**: Double-click any table cell and edit text. Verify values update immediately.
- [ ] **6.2 Column Renaming**: Double-click any column header to rename it via the inline input.
- [ ] **6.3 Row Merging**: Check 2 or more row checkboxes and click **🔗 Merge**. Verify rows combine with deduplicated bullet points (`• `).
- [ ] **6.4 Row Splitting**: Select a row and click **✂️ Split**. Verify multi-line or delimited cell contents split cleanly into separate sub-rows.
- [ ] **6.5 Smart Delete (`🗑️`)**: Select a column, row, or cell and click `🗑️` (or press `Delete`). Verify contextual deletion.
- [ ] **6.6 Undo / Redo**: Press `Ctrl+Z` / `Ctrl+Y` (or click `↩ Undo` / `↪ Redo`). Verify previous table snapshots revert and restore accurately.

---

### 7. CSV Import / Export & Local-First IndexedDB Resumption

- [ ] **7.1 CSV Export**: Click **Export CSV Dataset** in the left explorer. Verify a clean `LitSift_Extracted_Dataset.csv` downloads with all current table data.
- [ ] **7.2 CSV Import**: Click **Import CSV Dataset** in the left explorer and upload a `.csv` file. Verify the interactive "Append vs. Replace" agent options work as expected.
- [ ] **7.3 True Workspace Resumption (IndexedDB Reload Test)**:
  - Upload a real PDF research paper.
  - Extract structured rows and verify citations.
  - Refresh the browser tab (`F5` / `Ctrl+R`).
  - **Verify 100% Resumption**:
    1. The uploaded PDF is still in the explorer and opens in the Central Viewer.
    2. Table columns and rows are intact.
    3. Clicking cells re-opens their AI Reasoning Cards and scrolls to the highlighted evidence.
    4. Previous chat conversation history and tool execution logs are preserved.
