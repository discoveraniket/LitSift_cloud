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

### 3. Gemini AI Extractions & Direct Document Processing

- [ ] **3.1 API Key & Model Setup**: Click **Settings (⚙️)** in top header bar, enter/verify your `GEMINI_API_KEY`, select `Gemini 3.6 Flash` (or `Gemini 3.6 Pro`), and click **Save Settings**.
- [ ] **3.2 Schema Columns Setup**: Add extraction columns (e.g. click `+ Column` to add *Methodology*, *Sample Size*, *Key Results*, *Limitations*).
- [ ] **3.3 Trigger Live Extraction**: Click **⚡ Extract Data** on the bottom toolbar (or type in Agent Chat: *"Extract data from this paper"*). Verify Gemini reads the attached PDF and adds a new row to the table.
- [ ] **3.4 Natural Language Document Q&A**: In the Right Agent Command Center, type *"Summarize the main objective of this paper"* or *"What experimental sample size was used?"*. Verify accurate answers grounded directly in the paper.

---

### 4. Human-in-the-Loop AI Review & Diff Badges

- [ ] **4.1 Pending Diff Highlight**: Verify newly extracted or AI-edited rows are highlighted in **Yellow (`Pending Review`)**.
- [ ] **4.2 Confirm AI Edits**: Click **✓ Confirm All AI Edits** on the bottom toolbar. Verify yellow highlights turn into confirmed state (`✓ All Edits Approved`).
- [ ] **4.3 Reject AI Edits**: Test **✗ Reject All AI Edits** to verify unconfirmed AI proposals are cleanly removed.

---

### 5. Evidence Citation Grounding & Bi-Directional Linking

- [ ] **5.1 AI Reasoning Card**: Click on any extracted table cell. Verify the **Right Agent Panel** displays the AI Reasoning Card with confidence score, section name, and exact quote snippet.
- [ ] **5.2 Auto-Scroll & Evidence Highlight**: Watch the Central PDF Viewer when focusing a cell. Verify it automatically scrolls to the cited page and renders a glowing bounding-box evidence highlight over the passage.
- [ ] **5.3 Cell Discussion & Live Refinement**: With a cell selected, type a clarification in the prompt input (e.g. *"Page 3 mentions Illumina NovaSeq"*). Verify the AI refines the cell value and reasoning explanation.

---

### 6. Data Grid Operations & Table Manipulation

- [ ] **6.1 Inline Cell Editing**: Double-click any table cell and edit text. Verify values update immediately.
- [ ] **6.2 Column Renaming**: Double-click any column header to rename it via the inline input.
- [ ] **6.3 Row Merging**: Check 2 or more row checkboxes and click **🔗 Merge**. Verify rows combine with deduplicated bullet points (`• `).
- [ ] **6.4 Row Splitting**: Select a row and click **✂️ Split**. Verify multi-line or delimited cell contents split cleanly into separate sub-rows.
- [ ] **6.5 Smart Delete (`🗑️`)**: Select a column, row, or cell and click `🗑️` (or press `Delete`). Verify contextual deletion.
- [ ] **6.6 Undo / Redo**: Press `Ctrl+Z` / `Ctrl+Y` (or click `↩ Undo` / `↪ Redo`). Verify previous table snapshots revert and restore accurately.

---

### 7. CSV Import / Export & Workspace State Persistence

- [ ] **7.1 CSV Export**: Click **Export CSV Dataset** in the left explorer. Verify a clean `LitSift_Extracted_Dataset.csv` downloads with all current table data.
- [ ] **7.2 CSV Import**: Click **Import CSV Dataset** in the left explorer and upload a `.csv` file. Verify the interactive "Append vs. Replace" agent options work as expected.
- [ ] **7.3 Browser Reload Test**: Refresh the browser page (`F5` / `Ctrl+R`). Verify your table schema, rows, and citations persist from `localStorage`.
