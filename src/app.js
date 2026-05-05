const { setGlobalDispatcher, Agent } = require('undici');
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));


require('dotenv').config();

const { sanitizeLog } = require('./services/log-sanitizer');

const _originalError = console.error;
console.error = function(...args) {
  const sanitized = args.map(arg => sanitizeLog(arg));
  _originalError.apply(console, sanitized);
};

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const app = express();
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const generatorController = require('./controllers/generator.controller');
const rateLimiter = require('./services/rate-limiter.middleware');

// ── Security Headers ──────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    }
  },
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ──────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-provider', 'x-mode'],
  maxAge: 86400,
}));

// ── Security Middleware ──────────────────────────────────────────────────
function bodySizeLimit(limit) {
  const maxBytes = typeof limit === 'string'
    ? parseSize(limit)
    : limit;
  return (req, res, next) => {
    const len = parseInt(req.headers['content-length'], 10);
    if (len && len > maxBytes) {
      return res.status(413).json({ error: `Request body too large (max ${limit})` });
    }
    next();
  };
}

function parseSize(s) {
  const units = { kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(kb|mb|gb)?$/i);
  if (!match) return parseInt(s, 10);
  return Math.round(parseFloat(match[1]) * (units[match[2]?.toLowerCase()] || 1));
}

// ── Middleware ────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// ── View Engine ───────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Pages ─────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.render('index', { title: 'Auto-Doc — Repository Generator' });
});

// ── Pipeline Routes ───────────────────────────────────────────────
app.post('/fetch', bodySizeLimit('2mb'), rateLimiter.fetchLimit, (req, res) => generatorController.fetchRepo(req, res));
app.post('/build', bodySizeLimit('15mb'), rateLimiter.buildLimit, (req, res) => generatorController.buildInput(req, res));
app.post('/generate-docs', bodySizeLimit('2mb'), rateLimiter.generateLimit, (req, res) => generatorController.generateDocs(req, res));
app.post('/generate', bodySizeLimit('2mb'), rateLimiter.generateLimit, (req, res) => generatorController.generate(req, res));
app.get('/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// ── Key Validation ────────────────────────────────────────────────
app.post('/validate-key', bodySizeLimit('100kb'), rateLimiter.defaultLimit, (req, res) => generatorController.validateKey(req, res));

// ── Audit Routes ──────────────────────────────────────────────────
app.get('/audit', rateLimiter.defaultLimit, (req, res) => generatorController.getAuditLogs(req, res));

// ── Custom Rules Routes ───────────────────────────────────────────
app.get('/rules', rateLimiter.defaultLimit, (req, res) => generatorController.listRules(req, res));
app.post('/rules', bodySizeLimit('10kb'), rateLimiter.defaultLimit, (req, res) => generatorController.addRule(req, res));
app.delete('/rules/:id', rateLimiter.defaultLimit, (req, res) => generatorController.removeRule(req, res));
app.post('/rules/test', bodySizeLimit('100kb'), rateLimiter.defaultLimit, (req, res) => generatorController.testRule(req, res));

// ── 404 ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found' });
});

// ── Error Handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(sanitizeLog(err));
  res.status(500).render('error', { message: 'An unexpected error occurred.' });
});

// ── Start ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Auto-Doc running at http://localhost:${PORT}`);
  console.log(`   Groq key: ${process.env.GROQ_API_KEY ? 'loaded from .env' : 'not set — users must provide their own'}`);
});// trigger CI
