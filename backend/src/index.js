import './loadEnv.js'
import express from 'express';
import cors from 'cors';
import aiPlanRouter from './routes/aiPlan.js';
import chatRouter from './routes/chat.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use('/api/ai-plan', aiPlanRouter);
app.use('/chat', chatRouter);
app.use('/api/chat', chatRouter);

app.get('/health', (_, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`SiyahaBH API listening on http://localhost:${PORT}`);
  console.log(
    'Endpoints: POST /chat, POST /api/chat, POST /api/ai-plan, POST /api/ai-plan/hydrated-catalog, GET /health',
  );
});
