# n8n: Getting a response body back to the app

**If you see "Unused Respond to Webhook node" (500):** Remove **all** "Respond to Webhook" nodes from the workflow and use the method below. Do not use the "Respond to Webhook" node.

## Use: "When last node finishes"

1. **Webhook node**  
   Set **Respond** to **"When last node finishes"** (not "Using Respond to Webhook Node").

2. **Last node in each branch**  
   The **last node that runs** in the branch (e.g. Khalid Chatbot branch) must **output** the JSON that should be sent back.  
   n8n will use that node’s **output** as the **response body**.

3. **For the Chat branch**  
   The last node could be:
   - A **Code** node that takes the AI reply and outputs:  
     `{ "output": "the assistant reply text" }`
   - Or a **Set** node that sets one item with `output` = the reply text.

   So the flow is:  
   `... → Application Agent (Khalid) → [Code or Set node that outputs { "output": "..." }]`  
   and that Code/Set node is the **last** node in the branch.

4. **Response format**  
   - **Chat:** last node output = `{ "output": "reply text" }` (or `"text"` or `"message"`).  
   - **Plan:** last node output = `{ "places": [ { "latitude", "longitude", "title", "description" }, ... ] }`.

5. **Save and activate** the workflow, then test again.

This way the webhook waits for the workflow to finish and sends back whatever the last node returned.
