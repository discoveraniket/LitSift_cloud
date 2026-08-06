# Updated Research Report: Official Gemini Interactions API & Gemini 3.6 Model Family

---

## Part 1: Latest Official Python Code (Interactions API)

The official Google Gemini documentation (`https://ai.google.dev/gemini-api/docs/get-started`) has transitioned to the **Interactions API** using the `google-genai` SDK (`pip install -U google-genai`).

Instead of the legacy `client.models.generate_content(...)` interface, current official code uses **`client.interactions.create(...)`**.

### Official Python Quickstart Syntax (`google-genai`)

```python
from google import genai

# 1. Initialize Client (reads GEMINI_API_KEY from environment by default)
client = genai.Client()

# 2. Create Interaction using latest model
interaction = client.interactions.create(
    model="gemini-3.6-flash",
    input="Explain how AI works in a few words"
)

# 3. Print extracted text output
print(interaction.output_text)
```

---

### Key Features of the Interactions API

1. **Stateful Conversation Management (`previous_interaction_id`)**:
   - For multi-turn chats and agentic loops, you no longer need to manually pass the full client message history array back and forth.
   - Simply pass `previous_interaction_id=interaction1.id` and the server maintains session state and optimizes context caching automatically:
     ```python
     interaction2 = client.interactions.create(
         model="gemini-3.6-flash",
         input="How many paws are in my house?",
         previous_interaction_id=interaction1.id,
     )
     print(interaction2.output_text)
     ```

2. **Real-time Event Streaming (`stream=True`)**:
   ```python
   stream = client.interactions.create(
       model="gemini-3.6-flash",
       input="Analyze paper methodology",
       stream=True
   )
   for event in stream:
       print(event)
   ```

---

## Part 2: Recent Model Generation & Free Tier Comparison

Google's active model lineup now features the **Gemini 3.6 Generation** (alongside 3.1 and 2.5), built for native agentic workflows, long-context reasoning, and fast multimodal execution.

| Model Family | Active Model ID | Primary Use Case | Free Tier Availability | Rate Limits (Free Tier) |
| :--- | :--- | :--- | :--- | :--- |
| **Gemini 3.6 Flash** | **`gemini-3.6-flash`** | ⚡ **Fast, Agentic Tool Execution & Multimodal Analysis** | ✅ **Active Free Tier** | **15-30 RPM / 1,500 RPD / 1M TPM** |
| **Gemini 3.6 Pro** | **`gemini-3.6-pro`** | 🧠 **Deep Academic Reasoning & Complex Analysis** | ❌ Paid Tier Only | Requires Billing Account |
| **Gemini 2.5 Flash** | **`gemini-2.5-flash`** | Balanced Multimodal baseline | ✅ Active Free Tier | 15 RPM / 1,500 RPD |
| **Gemini Omni Flash** | **`gemini-omni-flash`** | Low-latency audio & vision streaming | ✅ Active Free Tier | 15 RPM / 1,500 RPD |

---

### Why `gemini-3.6-flash` is Recommended for LitSift Cloud:

1. **Native Agentic Tool Integration**: Built specifically to generate function call steps and handle interactive UI clarification loops.
2. **Generous Free Quotas**: Offers high request-per-day ceilings (1,500 RPD) and a 1 Million Token context window, perfect for full PDF document ingestion.
3. **Stateful Chat Optimization**: Works seamlessly with `previous_interaction_id` so LitSift Cloud can chain user table commands efficiently.
