import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import aiPlanRouter from './routes/aiPlan.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use('/api/ai-plan', aiPlanRouter);

app.get('/health', (_, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`GoBahrain API listening on http://localhost:${PORT}`);
});
