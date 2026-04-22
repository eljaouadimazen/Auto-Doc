const { setGlobalDispatcher, Agent } = require('undici');
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));


require('dotenv').config();

const express = require('express');
const path = require('path');
const app = express();
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const generatorController = require('./controllers/generator.controller');
const rateLimiter = require('./services/rate-limiter.middleware');

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
app.post('/fetch', rateLimiter.fetchLimit, (req, res) => generatorController.fetchRepo(req, res));
app.post('/build', rateLimiter.buildLimit, (req, res) => generatorController.buildInput(req, res));
app.post('/generate-docs', rateLimiter.generateLimit, (req, res) => generatorController.generateDocs(req, res));
app.post('/generate', rateLimiter.fetchLimit, (req, res) => generatorController.generate(req, res));
app.get('/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// ── Key Validation ────────────────────────────────────────────────
app.post('/validate-key', rateLimiter.defaultLimit, (req, res) => generatorController.validateKey(req, res));

// ── Audit Routes ──────────────────────────────────────────────────
app.get('/audit', rateLimiter.defaultLimit, (req, res) => generatorController.getAuditLogs(req, res));

// ── Custom Rules Routes ───────────────────────────────────────────
app.get('/rules', rateLimiter.defaultLimit, (req, res) => generatorController.listRules(req, res));
app.post('/rules', rateLimiter.defaultLimit, (req, res) => generatorController.addRule(req, res));
app.delete('/rules/:id', rateLimiter.defaultLimit, (req, res) => generatorController.removeRule(req, res));
app.post('/rules/test', rateLimiter.defaultLimit, (req, res) => generatorController.testRule(req, res));

// ── 404 ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found' });
});

// ── Error Handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { message: 'An unexpected error occurred.' });
});

// ── Start ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Auto-Doc running at http://localhost:${PORT}`);
  console.log(`   Groq key: ${process.env.GROQ_API_KEY ? 'loaded from .env' : 'not set — users must provide their own'}`);
});// trigger CI
