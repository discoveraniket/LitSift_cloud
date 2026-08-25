In professional software engineering, documentation is treated with the same discipline as code. High-quality documentation reduces onboarding time, prevents bugs, minimizes support overhead, and drastically improves user adoption.

Here is the foundational philosophy, industry frameworks, and a structured strategy to start writing your 3 documentation categories.

---

### 1. Foundational Philosophies & Core Principles

#### **A. The Diátaxis Framework (The Industry Standard)**
Most engineering teams structure documentation around the **[Diátaxis framework](https://diataxis.fr/)**, which divides documentation into four distinct quadrants based on the reader's needs:

```
                  PRACTICAL (Action-oriented)
                              ▲
                              │
            Tutorials         │       How-To Guides
       (Learning / Onboarding)│   (Solving real problems)
                              │
  THEORETICAL ────────────────┼──────────────── RESEARCH-ORIENTED
 (Understanding)              │                    (Information)
                              │
          Explanation         │        Reference
     (Architecture / Why)     │  (API specs / CLI flags)
                              │
                              ▼
```

- **Tutorials**: Lessons for beginners to build an initial mental model (e.g., *"Getting Started in 5 minutes"*).
- **How-To Guides**: Step-by-step recipes for specific tasks (e.g., *"How to deploy to GCP"*, *"How to upload a PDF batch"*).
- **Reference**: Technical descriptions, schemas, CLI parameters, API endpoints (dry, precise, exhaustive).
- **Explanation**: Discussions explaining *why* decisions were made, trade-offs, and architecture overviews.

---

#### **B. Key Philosophical Principles**

1. **Docs as Code (DaC)**
   - Store docs alongside source code in version control (`git`).
   - Use plain text/markdown.
   - Review docs in Pull Requests (PRs) alongside code changes so docs don’t drift out of sync.

2. **Audience-Centricity (Empathy First)**
   - Always write for the reader's mindset at that exact moment.
   - A **user** wants immediate value with minimal technical jargon.
   - A **developer** needs exact setup instructions, mental models of the system, and architecture boundaries.

3. **Single Source of Truth & DRY (Don't Repeat Yourself)**
   - Avoid copying identical technical explanations across multiple files.
   - Link between documents rather than duplicating, preventing outdated information.

4. **Progressive Disclosure**
   - Start with high-level summaries and simple commands, and link out to deep dives. Don’t overwhelm the reader with 50 configuration flags on step 1.

---

### 2. How Your 3 Categories Map to the Real World

Here is how top-tier open-source and enterprise projects divide these three tiers:

```
┌──────────────────────────────────────────────────────────┐
│                      1. README.md                        │
│  "The Storefront": Hook the reader, 30-sec elevator     │
│  pitch, quick demo/preview, 1-line installation.         │
└────────────────────────────┬─────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│       2. Developer Docs     │   │       3. User Guide         │
│         (`docs/dev/`)       │   │        (`docs/user/`)       │
│  • Architecture & Design    │   │  • End-user onboarding      │
│  • Local dev environment    │   │  • Feature walkthroughs     │
│  • Testing & CI/CD          │   │  • Step-by-step tutorials   │
│  • Contribution guidelines  │   │  • Troubleshooting & FAQ    │
│  • API / Schema reference   │   │  • UI/workflow examples     │
└─────────────────────────────┘   └─────────────────────────────┘
```

---

#### **Category 1: GitHub `README.md` (The Front Door)**
* **Objective:** Capture interest and direct users/developers to the right place in under 60 seconds.
* **Core Sections:**
  1. **Title & One-Sentence Pitch:** What is `LitSift`? What problem does it solve?
  2. **Visual Demo:** A GIF, screenshot, or clean terminal recording.
  3. **Key Features:** 3–5 bullet points highlighting core capabilities.
  4. **Quickstart (Zero-to-Hero):** The fastest command to run/see it in action.
  5. **Directory / Navigation:** Links pointing to User Guide, Developer Docs, and License.

---

#### **Category 2: Developer Documentation (`docs/developer/`)**
* **Objective:** Enable another engineer to contribute, debug, and extend the system without asking you questions.
* **Core Sections:**
  1. **System Architecture & Data Flow:** High-level component diagrams (e.g., FastAPI backend, vector DB, LLM pipelines, frontend).
  2. **Local Environment Setup:** Prerequisites, dependencies, environment variables (`.env.example`), starting backend/frontend locally.
  3. **Testing Strategy:** How to run unit tests, integration tests, and linting.
  4. **API / Core Module Reference:** Key classes, services, schemas, and database models.
  5. **Contributing & Git Workflow:** Branching strategy, PR expectations, release process.

---

#### **Category 3: User Guide (`docs/user/` or dedicated docs site)**
* **Objective:** Help end users extract maximum value from LitSift without needing to understand the underlying code.
* **Core Sections:**
  1. **Onboarding / Quickstart:** Step-by-step guide from initial sign-in / launch to completing the first key action.
  2. **Feature Deep-Dives:** How to upload documents, perform semantic search, filter results, export insights.
  3. **Best Practices & Tips:** How to get the best query results or optimize document processing.
  4. **Troubleshooting & FAQ:** Common pitfalls (e.g., failed uploads, file format limits, rate limits).

---

### 3. Step-by-Step Action Plan: How to Start

1. **Step 1: Inventory the System (Mental Dump)**
   - List all user features.
   - List all architectural components, configs, and dependencies.
2. **Step 2: Establish the Documentation Structure**
   - Create a `docs/` folder in your repository:
     ```
     docs/
     ├── user/
     │   ├── quickstart.md
     │   ├── features.md
     │   └── troubleshooting.md
     ├── developer/
     │   ├── architecture.md
     │   ├── setup.md
     │   ├── testing.md
     │   └── contributing.md
     └── README.md (root)
     ```
3. **Step 3: Draft the README first**
   - It acts as the anchor and defines the tone and scope of the product.
4. **Step 4: Draft Developer Setup (`setup.md` & `architecture.md`)**
   - Write instructions while testing them on a clean machine/container to catch implicit assumptions.
5. **Step 5: Write the User Quickstart & Guides**
   - Walk through the application flow from the perspective of someone who has never seen the UI.

---