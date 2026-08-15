# LitSift Cloud — Feature Architecture & Technical Q&A Documentation

A comprehensive guide explaining the implemented capabilities, architecture, and user workflows of LitSift Cloud.

---

## 1. Core Platform & Architecture

### Q: What is LitSift Cloud?
**A:** LitSift Cloud is an intelligent, agentic academic literature synthesis workspace. It pairs native Google Gemini 3.6/3.7 multimodal models directly with interactive research PDF viewing, automated relational tabular data extraction, bi-directional evidence highlighting, and human-in-the-loop data curation.

### Q: How are PDFs processed by the AI? Does it parse text locally first?
**A:** No. LitSift Cloud uses direct multimodal binary attachment (`application/pdf` inline base64). Gemini 3.6/3.7 natively reads the full visual layout of the PDF—including tables, figures, footnotes, and multi-column structures—eliminating client-side OCR or text extraction failures.

### Q: How is user state preserved?
**A:** The entire workspace state (columns, extracted rows, cell citation maps, discussion histories, active PDF selections, and Gemini settings) is automatically synchronized and persisted in `localStorage`.

---

## 2. Multi-Row Tabular Structuring & Disaggregation

### Q: How does the app extract and structure multi-variable research papers?
**A:** When research papers test multiple distinct experimental variables (e.g. testing Phages A & B against Host Strains C & D), Gemini is instructed to emit an array of distinct rows:
> *"If the paper tests multiple distinct variables, experimental groups, treatments, or pairwise combinations (e.g., Sample A × C = E, Sample A × D = F), emit a DISTINCT ROW for each tested subject/observation that has actual experimental results, ignoring background mentions, so that every finding is represented as an atomic, unambiguous entry."*

### Q: Does it generate rows for background mentions in the introduction?
**A:** No. The prompt enforces that a distinct row is only created for subjects with concrete experimental results in the paper's own methods/findings, filtering out peripheral references cited in literature reviews.

---

## 3. Active Cell Focus & Contextual Follow-Up Q&A

### Q: What happens when I select a table cell and ask a follow-up question in the chat?
**A:** When a cell is selected, LitSift Cloud dynamically captures and injects the complete cell context into the prompt:
1. **Target Row ID & Paper Title**: Pinpoints the exact experimental subject/row.
2. **Column Field & Current Extracted Value**: Informs the model of what text is currently recorded.
3. **Grounded Evidence Quote**: Provides the exact sentence quote previously extracted.
4. **Source Page & Section**: Supplies the citation location.
5. **Existing AI Reasoning**: Provides the explanation behind the initial extraction.

### Q: Can Gemini update or refine a cell based on user feedback?
**A:** Yes. If you clarify details in the chat (e.g., *"Actually, Table 3 specifies 10^8 PFU/mL instead of 10^6"*), Gemini invokes the `updateCell` tool to revise the cell value, update the reasoning explanation, and re-link the evidence quote in real time.

---

## 4. Bi-Directional Evidence Grounding & PDF Highlighting

### Q: How does clicking a cell highlight evidence in the PDF viewer?
**A:** Every extracted cell contains a `citationMap` entry with the page number and text quote. Clicking a cell triggers:
1. **Auto-Scroll**: The PDF viewer smoothly navigates to the cited page.
2. **Glowing Visual Bounding Box**: Renders a highlighted overlay over the cited passage.
3. **AI Cell Reasoning Card**: Opens a card in the Right Panel showing confidence score, section name, and exact quote.

---

## 5. Human-in-the-Loop AI Review & Diff Badges

### Q: How are AI-generated changes vetted before committing?
**A:** All AI operations (`extractPDFData`, `updateCell`, `splitRow`) stage changes with an `aiStatus: 'Pending Review'` flag, rendering yellow diff badges in the table:
* Click **`✓ Confirm All AI Edits`** on the bottom toolbar to approve and lock the data into the master dataset.
* Click **`✗ Reject All AI Edits`** to discard unverified changes.

---

## 6. Table Grid Operations

### Q: What table manipulation tools are available?
* **Inline Cell Editing**: Double-click any cell to manually edit text.
* **Column Renaming**: Double-click any column header to rename schema fields.
* **🔗 Row Merge**: Select 2+ rows and click Merge to combine entries with deduplicated bullet points (`• `).
* **✂️ Row Split**: Select a row and click Split to disaggregate multi-value cells into separate sub-rows.
* **🗑️ Contextual Delete**: Delete selected columns, rows, or cell contents with the Delete key or toolbar button.
* **↩ Undo / ↪ Redo**: Full snapshot-based state reversal (`Ctrl+Z` / `Ctrl+Y`).
* **CSV Export / Import**: Download clean CSV datasets or import existing schemas with interactive Append vs. Replace options.

---

## 7. Live Execution Logging & Diagnostics

### Q: How do I monitor long extractions or debug errors?
**A:** Click the **`📜 Logs`** button in the Right Agent Panel header to open the embedded Live Execution Console. It displays real-time timestamps, network latency (e.g. `⏱️ 3.4s`), stage progress indicators (`[1/3] Reading PDF... [2/3] Calling Gemini... [3/3] Populating Grid...`), and expandable JSON request/response payloads.
