require('dotenv').config();

const fetch = require('node-fetch');
global.fetch = fetch;

const express = require('express');
const path = require('path');
const generatorController = require('./controllers/generator.controller');

const app = express();
const router = express.Router();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===== ROUTES =====

// Debug pipeline
router.post('/fetch', generatorController.fetchRepo);
router.post('/build', generatorController.buildInput);
router.post('/generate-docs', generatorController.generateDocs);
router.post('/generate', generatorController.generate);

app.use('/', router);

// Optional full pipeline
app.post('/generate', generatorController.generate);
// Home page
app.get('/', (req, res) => {
  res.render('index', { title: 'Repository Generator' });
});
// ===== ERROR HANDLING =====

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    message: 'An unexpected error occurred. Please try again later.'
  });
});

app.use((req, res) => {
  res.status(404).render('error', {
    message: 'Page not found'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});