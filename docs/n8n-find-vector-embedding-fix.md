# n8n: Fix "Find Vector Embedding" – 'input' is a required property

The **Find Vector Embedding** node calls an API (e.g. OpenAI embeddings) that expects a request body with an **`input`** property. The app sends **`message`** in the webhook; that text must reach the API as **`input`**.

---

## Option A: Add a Code node before Find Vector Embedding (recommended)

This makes sure the next node always receives an object with **`input`**.

1. **Add a Code node** between the Webhook/Code and **Find Vector Embedding**.
2. **Connect:** Webhook (or your "Code in JavaScript") → **new Code node** → Find Vector Embedding.
3. In the **new Code node**, use this (adjust if your webhook body is under `body`):

```javascript
const items = $input.all();
const out = items.map(item => {
  const json = item.json?.body || item.json || {};
  const text = json.message || json.input || json.text || '';
  return { json: { input: text, ...json } };
});
return out;
```

4. In **Find Vector Embedding** (HTTP Request):
   - **Send Body:** Yes  
   - **Body Content Type:** JSON  
   - **Body** (JSON), use **expression** and set the value for the key the API expects (e.g. `input`):
     - Key: `input`
     - Value: `{{ $json.input }}`
   - Or if the node uses a single JSON string for the whole body, set body to:
     ```json
     {"input": "{{ $json.input }}"}
     ```

5. Save and run the workflow.

---

## Option B: No new node – fix only Find Vector Embedding

1. Open **Find Vector Embedding** (HTTP Request).
2. Set the request **body** so the embeddings API receives **`input`**.
3. Use the expression that matches where the user text is in your workflow.

If the **previous node** is the Webhook and the body is at the root:

- Key: `input`  
- Value: `{{ $json.message }}`

If the webhook puts the body inside `body`:

- Value: `{{ $json.body.message }}`

If the previous node is named **"Code in JavaScript"** and it forwards the webhook data:

- Value: `{{ $json.message }}` or `{{ $('Code in JavaScript').item.json.message }}`

4. Ensure the body is sent as **JSON** (Body Content Type: JSON), not form-data.
5. Save and run the workflow.
