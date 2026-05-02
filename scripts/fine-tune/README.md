# OpenAI Fine-Tuning Toolkit

This folder contains helper scripts to prepare data, create a fine-tune job, and run a quick local evaluation.

## Build directly from Supabase database (real data)

Use this when you want training examples from your actual DB rows (for example, the `client` table):

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY \
npm run ft:from-db -- client ./data/fine-tune/train.jsonl ./data/fine-tune/valid.jsonl 2000 "client_a_uuid,account_a_uuid,business_name,description,rating,price_range,client_type,client_image,lat,long,timings,tags,qrcode,ai_summary"
```

Arguments:

1. table name (default `client`)
2. train output path (default `./data/fine-tune/train.jsonl`)
3. valid output path (default `./data/fine-tune/valid.jsonl`)
4. row limit (default `2000`)
5. select columns (default in script)

Safety:

- Uses `SUPABASE_SERVICE_ROLE_KEY` server-side only
- Redacts common direct PII fields (email/phone/name-like contact fields) before building examples

## 1) Prepare input from Supabase export

Create a JSON array with this shape:

```json
[
  { "system": "...optional...", "user": "...", "assistant": "..." }
]
```

You can start from:

- `data/fine-tune/supabase-export.example.json`

Then generate train/validation JSONL:

```bash
npm run ft:build -- ./data/fine-tune/supabase-export.example.json ./data/fine-tune/train.jsonl ./data/fine-tune/valid.jsonl
```

## 2) Create fine-tuning job

Set your API key and launch:

```bash
OPENAI_API_KEY=your_key_here npm run ft:create -- ./data/fine-tune/train.jsonl gpt-4.1-mini-2025-04-14 ./data/fine-tune/valid.jsonl
```

Notes:

- Replace the base model with one that supports fine-tuning in your account
- The script uploads files and creates the job

## 3) Evaluate model quickly

Create or reuse a test set:

- `data/fine-tune/eval-set.example.json`

Run:

```bash
OPENAI_API_KEY=your_key_here npm run ft:eval -- ./data/fine-tune/eval-set.example.json ft:your-model-id
```

This prints each case and a basic overlap score.

## Important

- Fine-tuning improves style/format/task behavior
- Keep factual/fast-changing knowledge in RAG (Supabase + Pinecone retrieval)
- Never put secrets or personal data into training examples
