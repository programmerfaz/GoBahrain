import './loadEnv.js'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import { rateLimit } from 'express-rate-limit'
import pino from 'pino'
import pinoHttp from 'pino-http'
import aiPlanRouter from './routes/aiPlan.js'
import chatRouter from './routes/chat.js'
import { getCacheStats, clearAllCaches } from './services/cacheService.js'

const app = express()
const PORT = process.env.PORT || 4000
const NODE_ENV = process.env.NODE_ENV || 'development'

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            ignore: 'pid,hostname',
          },
        }
      : undefined,
})

app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/health',
    },
  })
)

app.use(helmet())
app.use(compression())

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:8081', 'http://localhost:19000', 'http://localhost:19006']

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || NODE_ENV === 'development') {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true,
  })
)

app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true, limit: '2mb' }))

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
})

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests, please try again later' },
})

app.use('/api/ai-plan', aiLimiter, aiPlanRouter)
app.use('/chat', aiLimiter, chatRouter)
app.use('/api/chat', aiLimiter, chatRouter)

app.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

app.get('/metrics', generalLimiter, (req, res) => {
  const cacheStats = getCacheStats()
  res.json({
    cache: cacheStats,
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    uptime: process.uptime(),
  })
})

app.post('/admin/clear-cache', generalLimiter, (req, res) => {
  const authHeader = req.headers.authorization
  const adminKey = process.env.ADMIN_API_KEY
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  clearAllCaches()
  logger.info('Cache cleared by admin')
  res.json({ success: true, message: 'All caches cleared' })
})

app.use((err, req, res, next) => {
  if (err) {
    logger.error({ err, req }, 'Request error')
    if (err.message === 'Not allowed by CORS') {
      return res.status(403).json({ error: 'CORS policy violation' })
    }
    res.status(err.status || 500).json({
      error: NODE_ENV === 'production' ? 'Internal server error' : err.message,
    })
  } else {
    next()
  }
})

const server = app.listen(PORT, () => {
  logger.info(`SiyahaBH API listening on http://localhost:${PORT}`)
  logger.info('Endpoints: POST /chat, POST /api/chat, POST /api/ai-plan, POST /api/ai-plan/hydrated-catalog')
  logger.info(`Environment: ${NODE_ENV}`)
  logger.info(`CORS origins: ${allowedOrigins.join(', ')}`)
})

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server gracefully')
  server.close(() => {
    logger.info('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  logger.info('SIGINT received, closing server gracefully')
  server.close(() => {
    logger.info('Server closed')
    process.exit(0)
  })
})
