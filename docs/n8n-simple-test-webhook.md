# Simple n8n webhook for testing

Use this to get a **fixed response** so you can confirm the app receives and shows it. No AI, no embeddings, no Intent Analyzer.

---

## 1. New workflow in n8n

1. In n8n, click **Add workflow** (or create a new one).
2. Name it e.g. **"GoBahrain Test Webhook"**.

---

## 2. Add Webhook trigger

1. Add a **Webhook** node (trigger).
2. Set **HTTP Method** to **POST**.
3. Set **Respond** to **When last node finishes** (so the response is sent after the workflow runs).
4. Copy the **Production URL** (e.g. `http://72.61.111.217:5679/webhook/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). You’ll use this in the app.

---

## 3. Add one node that returns the response

1. Add a **Code** node (or **Set** node) after the Webhook.
2. Connect: **Webhook** → **Code**.

**If using Code node:**

- **Mode:** Run Once for All Items
- **JavaScript:**

```javascript
return [{
  json: {
    output: "Hello from n8n! This is a test reply. Your webhook is working."
  }
}];
```

**If using Set node:**

- Add one field:
  - **Name:** `output`
  - **Value:** `Hello from n8n! This is a test reply. Your webhook is working.`

The Code node is the **last** node, so n8n will send this JSON as the response body.

---

## 4. Save and activate

1. **Save** the workflow.
2. Turn **Active** ON (top-right).

---

## 5. Use it in the app

1. In your app project, open **`src/config/n8n.js`**.
2. Set **N8N_WEBHOOK_URL** to the **Production URL** you copied (the one from this test workflow).
3. Restart the app (e.g. `npx expo start`).
4. In the app, open **Chat** and send any message. You should see: *"Hello from n8n! This is a test reply. Your webhook is working."*

---

## 6. Optional: same format for plan test

To test the **AI Plan** screen with a fixed list of places, use this in the Code node instead:

```javascript
return [{
  json: {
    places: [
      { latitude: 26.2285, longitude: 50.586, title: "Manama Souq", description: "Test spot 1." },
      { latitude: 26.1536, longitude: 50.6065, title: "Bahrain Fort", description: "Test spot 2." }
    ]
  }
}];
```

Then **Generate plan** in the app should show these two places on the map.

---

## Summary

- **Webhook** (POST) → **Code** (returns `{ "output": "..." }` or `{ "places": [...] }`).
- Webhook **Respond** = **When last node finishes**.
- **Active** = ON.
- Point the app at this workflow’s Production URL to test.
