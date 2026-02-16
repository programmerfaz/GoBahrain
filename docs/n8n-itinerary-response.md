# n8n: Return itinerary to the app (AI Itinerary Planner branch)

The GoBahrain app calls your webhook and expects the **HTTP response** to contain the generated plan. Right now the workflow runs but does not send that plan back.

## Where to add it

**In the AI Itinerary Planner branch (gold box):**

1. Open your workflow in n8n.
2. Go to the **AI Itinerary Planner** section (after the Switch routes to it).
3. The branch is: **Suggest top 30 nearest places** → **Make data ready for planning** → **Planning Agent** → **output1** → **Code in JavaScript2** → **HTTP Request**.
4. **Add a "Respond to Webhook" node** at the very end of this branch, after the node that has the final list of places (e.g. after **Code in JavaScript2** or **Planning Agent** output).

So the flow becomes:

```
... → Planning Agent → output1 → Code in JavaScript2 → [Respond to Webhook]  ← ADD HERE
```

(If you use the HTTP Request after that, you can either remove it or put Respond to Webhook after it, as long as the response to the **original** webhook request is sent by Respond to Webhook.)

## Webhook trigger: wait for response

1. Click the **Webhook** node at the start of the workflow.
2. Set **Respond** (or "When to respond") to **When Last Node Finishes** (or equivalent), so the HTTP request from the app waits until the workflow completes and the Respond to Webhook node runs.
3. Save.

## What to send back: response body format

The app expects JSON in the **response body** with a **`places`** array. Each place must have coordinates and a title:

```json
{
  "places": [
    {
      "latitude": 26.2285,
      "longitude": 50.586,
      "title": "Manama Souq",
      "description": "Explore the souq and Corniche."
    },
    {
      "latitude": 26.1536,
      "longitude": 50.6065,
      "title": "Bahrain Fort",
      "description": "History and sunset views."
    }
  ]
}
```

- **Required:** `latitude` (or `lat`), `longitude` (or `lng`)
- **Recommended:** `title` (or `name`), `description` (or `subtitle`)

## Configure the "Respond to Webhook" node

1. Add the **Respond to Webhook** node (search for it in the node list).
2. Connect its input from the node that has the itinerary (e.g. **Code in JavaScript2** or the **Planning Agent** output).
3. In the node settings:
   - **Respond With:** JSON
   - **Response Body:** build the JSON above from the incoming data.

Example (if the previous node outputs an array of places in `$json.places` or `$json`):

- **Response Body** (expression), e.g.:
  ```json
  {
    "places": {{ $json.places || $json }}
  }
  ```
  Or if the structure is different, use an expression that produces an array of objects with `latitude`, `longitude`, `title`, and optionally `description`.

4. If your Planning Agent returns text or a different shape, add a **Code** node before Respond to Webhook that:
   - Takes the agent output.
   - Parses it or maps it into an array of `{ latitude, longitude, title, description }`.
   - Outputs that as `{ places: [...] }` for the Respond to Webhook node.

## Switch: route "plan" to AI Itinerary Planner

Ensure the **Switch** node sends plan-related requests to the **AI Itinerary Planner** branch (the one that ends with Respond to Webhook). For example, a rule like:

- If **intent** (or the field you use) **equals** "itinerary" / "plan" / "trip" → output to the AI Itinerary Planner branch.

Then when the app sends `{ "message": "Create an itinerary for Bahrain. Budget: ... Duration: ...", "type": "plan" }`, the Intent Analyzer should classify it as plan intent and the Switch should route to that branch.

## Quick checklist

- [ ] Webhook node: **Respond** = When last node finishes (or similar).
- [ ] AI Itinerary Planner branch ends with **Respond to Webhook**.
- [ ] Respond to Webhook sends JSON with a **`places`** array.
- [ ] Each place has **latitude**, **longitude**, **title** (and optionally **description**).
- [ ] Switch routes plan/itinerary intents to the AI Itinerary Planner branch.

After this, "Generate plan" in the app should receive the plan and show it on the map.
