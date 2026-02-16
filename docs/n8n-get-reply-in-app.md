# Get a reply showing in the app (step-by-step)

The app shows "No reply from n8n yet" when n8n returns **no body** or an **empty body**. Follow this exactly so the app gets a real reply.

---

## 1. Webhook node

- **HTTP Method:** POST  
- **Respond:** set to **"When last node finishes"** (not "Immediately" and not "Using Respond to Webhook Node").  
- **Path:** use the path n8n gives you (e.g. `/webhook/hello` or a UUID).  
- **Save** the node.

---

## 2. One node after the Webhook (the “last” node)

- Add **one** node after the Webhook: **Code** (or **Set**).  
- Connect: **Webhook** → **Code**.

**Code node – copy this exactly:**

- **Mode:** Run Once for All Items (or “Run once for all items”).  
- **JavaScript:**

```javascript
return [{
  json: {
    output: "Hello from n8n! Your webhook is working."
  }
}];
```

- **Save** the node.

There must be **no other node** after this Code node in the same branch. This Code node must be the **last** node that runs.

---

## 3. Save and activate

- **Save** the workflow.  
- Turn **Active** ON (top right).

---

## 4. Test with curl

Replace `YOUR_WEBHOOK_URL` with your real URL (e.g. `http://72.61.111.217:5679/webhook/hello`):

```bash
curl -s -X POST "http://72.61.111.217:5679/webhook/chat" -H "Content-Type: application/json" -d '{"message":"Hi"}'
```

You should see something like:

```json
{"output":"Hello from n8n! Your webhook is working."}
```

If you see that, the app will show that text too. If you see nothing or only `{}`, the response is still empty – check again that **Respond** is **"When last node finishes"** and that the **last** node is the Code node above.

---

## 5. Use this URL in the app

In **`src/config/n8n.js`**, set:

```js
'http://72.61.111.217:5679/webhook/YOUR_PATH';
```

Use the same path as in your Webhook node (e.g. `hello` or the full Production URL). Restart the app and send a message in Chat.
