# 📋 LitSift Cloud - Progressive Manual Verification Walkthrough

Use this step-by-step checklist to test the entire application smoothly from scratch. Each step naturally builds on the previous one.

---

## 🛠️ Step 0: Starting State Confirmation
- [x] 1. Open the application in your browser (`http://localhost:5173`).
- [x] 2. Open **Settings** (⚙️ top right) and verify your `GEMINI_API_KEY` is configured and model is set (e.g. `gemini-3.7-flash` or `gemini-3.6-flash`).
- [x] 3. In the left **EXPLORER** panel, upload or select your research paper PDF.

---

## Step 1: Upload Your Schema CSV
- [x] **Status:** [ ] Pass / [ ] Fail / [ ] Needs Improvement

### Instructions:
1. In the left **EXPLORER** panel, locate the **CSV DATASETS / SCHEMAS** section.
2. Click the **+** (Upload CSV) button and select your schema CSV file from your computer.
3. Observe the master data grid below.

### Expected Result:
- The column headers defined in your CSV are loaded into the data grid.
- The chat shows an import confirmation message.

### 💬 Your Feedback & Observations:
<!-- the confirmation message is: LitSift Agent
• 01:12 pm
Now viewing "Master Workspace".

LitSift Agent is online. Ask me to extract paper findings, verify citations, or edit table cells! -->


---

## Step 2: Automated Initial Extraction (`extractPDFData`)
- [ ] **Status:** [ ] Pass / [ ] Fail / [x] Needs Improvement

### Instructions:
1. In the bottom toolbar or in the right AI Agent panel, click **⚡ Extract Data** (or type `Extract paper data`).
2. Watch the live progress banner showing the execution step and timer.

### Expected Result:
- The agent calls `extractPDFData`.
- Structured finding rows matching your schema columns appear in the table.
- In **HITL Review Mode**, the extracted rows have a **soft yellow highlight** (status: `Pending Review`).
- The chat displays a summary of the extracted findings.

### 💬 Your Feedback & Observations:
<!-- 1. The timer box have a variable width. when the timer value changes from 3.12sec to 4 and then 4.34, the width of the box shrink and grow. creating a wobbly effect. we need to fix this UI problem. 
2. the agents message bubble shows this: "✓
extractPDFData

details
extractPDFData(36374021.pdf) -> 1 rows
{
  "pdfId": "36374021.pdf"
}
✅ Gemini gemini-3.6-flash extracted 1 structured finding row(s) from "36374021.pdf" in 19.0s! Staged in table (Pending Review)." I dont see any summary or anything else after that. is this suppose to be like that? if yes, I am ok with it for now.
-->


---

## Step 3: Interactive Evidence Navigation in PDF Viewer
- [x] **Status:** [x] Pass / [ ] Fail / [ ] Needs Improvement

### Instructions:
1. Click on any extracted cell in the table (e.g., in Row 1).
2. Look at the top of the right AI panel: the **AI CELL REASONING** card appears with confidence %, rationale, and quote.
3. Click directly on the **AI CELL REASONING** card or the **"Jump to page ↗"** text.

### Expected Result:
- The central PDF Reader smoothly scrolls automatically to the exact page and section referenced by that citation.

### 💬 Your Feedback & Observations:
<!-- 1. the **AI CELL REASONING** card shows this: [AI CELL REASONING
NaN% Grounded
💡 Rationale: The name of the phage characterized throughout the paper.
Source: TITLE (Page 1)
Jump to page ↗
"Characterization of Novel Klebsiella Phage PG14 and Its Antibiofilm Efficacy"].
2.  Click directly on the **AI CELL REASONING** card or the **"Jump to page ↗"** text scrolls the pdf page to the exact page.
3. But I think we need to make the card look simple with less cluter. we will do it later.-->


---

## Step 4: Grounding & Citation Verification (`verifyEvidenceCitation`)
- [x] **Status:** [x] Pass / [ ] Fail / [ ] Needs Improvement

### Instructions:
1. Click on a specific cell in the table you wish to audit.
2. Click the **🔍 Verify Citation** quick chip above the prompt input (or type: `Verify the citation and grounding for the active cell against the paper`).
3. Press **Enter**.

### Expected Result:
- The agent executes `verifyEvidenceCitation`.
- It checks the claim against the attached PDF, returns a grounded confidence score (e.g. 95%), and updates the citation card with verified quotes.

### 💬 Your Feedback & Observations:
<!-- This is what the ai replyed: [[Cell: phagename] `Verify the citation and grounding for the active cell against the paper
LitSift Agent
• 01:50 pm

Executed 2 tool actions
✓ Complete
✓ verifyEvidenceCitation
view payload
verifyCitation(phagename -> 100% confidence)
✓ updateCell
view payload
updateCell(Phage Name -> "Klebsiella phage PG14")
Verification & Grounding Summary
The active cell Phage Name (phagename) has been verified and updated with exact quote grounding and citation from the research paper:

Target Cell: Phage Name (phagename)
Extracted Value: Klebsiella phage PG14
Verification Result: 100% Supported
Page Number: Page 2
Section: RESULTS - Isolation, purification, and identification of phage PG14 targeting K. pneumoniae G14
Exact Supporting Quote:
"The phage was named Klebsiella phage PG14 and has been abbreviated as phage PG14 in this article."

Reasoning: The paper explicitly names the isolated bacteriophage as Klebsiella phage PG14 (abbreviated as phage PG14).]] -->


---

## Step 5: Single Cell Targeted Edit (`updateCell`)
- [x] **Status:** [x] Pass / [ ] Fail / [ ] Needs Improvement

### Instructions:
1. Select any cell in Row 1.
2. In the chat box, type:
   ```text
   Update this cell to "Phage cocktail suspension 10^8 PFU/mL" because section 2 describes the dosage.
   ```
3. Press **Enter**.

### Expected Result:
- The chat displays a green `✓ updateCell` tool execution badge.
- The selected cell in the table immediately updates to `"Phage cocktail suspension 10^8 PFU/mL"`.
- The **AI CELL REASONING** card updates to reflect the new explanation and quote.

### 💬 Your Feedback & Observations:
<!-- worked as expected -->


---

## Step 6: Multi-Step Chained Actions (`addColumn` ➔ `updateCell`)
- [ ] **Status:** [ ] Pass / [ ] Fail / [ ] Needs Improvement

### Instructions:
1. In the chat box, type:
   ```text
   Add a new column called "Host Range", and update row 1 in that new column with "E. coli and Salmonella".
   ```
2. Press **Enter**.

### Expected Result:
- The agent plans and executes **two sequential actions** in a single turn:
  1. `✓ addColumn` (Added column "Host Range")
  2. `✓ updateCell` (Updated row 1 cell in "Host Range")
- The new column appears in the table with the value populated.

### 💬 Your Feedback & Observations:
<!-- worked as expected -->


---

## Step 7: Batch Cell Updates (`batchUpdateCells`)
- [x] **Status:** [x] Pass / [ ] Fail / [ ] Needs Improvement

### Instructions:
1. In the chat box, type:
   ```text
   Update the methodology of row 1 to "Bacterial plaque assay" and update sampleSize to "120 samples".
   ```
2. Press **Enter**.

### Expected Result:
- The agent invokes `batchUpdateCells` (or multiple atomic updates).
- Both columns in Row 1 update simultaneously in the data grid.

### 💬 Your Feedback & Observations:
<!-- Write your feedback here -->


---

## Step 8: Document Search Across Paper (`searchDocument`)
- [ ] **Status:** [ ] Pass / [ ] Fail / [ ] Needs Improvement

### Instructions:
1. In the chat box, type:
   ```text
   Search the document for any mention of incubation temperature, pH, or storage.
   ```
2. Press **Enter**.

### Expected Result:
- The agent calls `searchDocument`.
- It returns relevant document excerpts, page numbers, and section names answering the question without modifying table cells.

### 💬 Your Feedback & Observations:
<!-- Write your feedback here -->


---

## Step 9: Row Splitting & Merging (`splitRow` & `mergeRows`)
- [ ] **Status:** [ ] Pass / [ ] Fail / [ ] Needs Improvement

### Instructions:
1. **Split Row:** Type `Split row 1 into separate sub-rows`.
   - *Verify:* The composite row splits into two distinct rows in the table.
2. **Merge Rows:** Type `Merge row 1 and row 2 into a single unified row`.
   - *Verify:* Rows 1 and 2 combine into a single row with bullet-pointed findings.
3. **Delete Row:** Type `Delete row 1 from the table`.
   - *Verify:* The row is cleanly removed from the grid.

### 💬 Your Feedback & Observations:
<!-- Write your feedback here -->


---

## Step 10: Analytical Table Querying (`queryGridData`)
- [ ] **Status:** [ ] Pass / [ ] Fail / [ ] Needs Improvement

### Instructions:
1. Click the **📊 Query Table** quick chip (or type: `Query the table and summarize all rows`).
2. Press **Enter**.

### Expected Result:
- The agent calls `queryGridData`.
- It returns an analytical summary and count of the table rows without altering the data grid.

### 💬 Your Feedback & Observations:
<!-- Write your feedback here -->


---

## Step 11: Human-in-the-Loop (HITL) Review vs Autopilot
- [ ] **Status:** [ ] Pass / [ ] Fail / [ ] Needs Improvement

### Instructions:
1. **HITL Review Mode Test:**
   - Verify the mode pill at the top shows **`🧑‍💻 HITL Review`**.
   - Notice the yellow review banner at the top of the agent panel (`X row(s) staged for review`).
   - Click **[Confirm All]** in the banner or bottom toolbar.
   - *Verify:* All yellow highlights clear and status changes to `Confirmed`.
2. **Autopilot Mode Test:**
   - Click the mode pill in the top header or agent panel to switch to **`🚀 Autopilot`**.
   - Prompt: `Update row 1 methodology to "Autopilot Instant Commit"`.
   - *Verify:* The cell updates immediately as `Confirmed` with no review banner required.

### 💬 Your Feedback & Observations:
<!-- Write your feedback here -->


---

## Step 12: Agent Cancellation (`Stop` Button)
- [ ] **Status:** [ ] Pass / [ ] Fail / [ ] Needs Improvement

### Instructions:
1. Type a long multi-step prompt:
   ```text
   Extract all detailed phage parameters, host ranges, isolation sources, and verify all citations from every page.
   ```
2. While the thinking spinner and live timer are active, immediately click the red **`Stop`** button in the banner.

### Expected Result:
- The agent stops execution immediately, the timer stops, and the agent confirms execution was halted by user.

### 💬 Your Feedback & Observations:
<!-- Write your feedback here -->


---

## 📝 Overall Summary & Next Feature Requests
<!-- Write your overall feedback, observations, and prioritized next steps here -->
