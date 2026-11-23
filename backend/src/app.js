const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const { criarSessao } = require('./config/session');
const { verificarCsrf } = require('./middlewares/csrf');
const { rotaNaoEncontrada, tratadorErros } = require('./middlewares/erros');
const rotas = require('./routes');

const DIR_FRONTEND = path.resolve(__dirname, '../../frontend');
const DIR_MODULES = path.resolve(__dirname, '../node_modules');

function criarApp() {
  const app = express();
  const { middleware: sessao, store } = criarSessao();
  app.locals.sessionStore = store;

  if (env.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Cabeçalhos de segurança + Content Security Policy (proteção contra XSS)
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': env.isProduction ? [] : null
      }
    },
    hsts: env.isProduction
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(sessao);

  // API
  const limiteGeral = rateLimit({
    windowMs: 60 * 1000,
    limit: env.isTest ? 100000 : 600,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { erro: { mensagem: 'Muitas requisições. Aguarde um instante.' } }
  });
  app.use('/api', limiteGeral, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', verificarCsrf, rotas);
  app.use('/api', rotaNaoEncontrada);

  // Arquivos de terceiros servidos localmente (funciona sem internet e respeita a CSP)
  app.use('/vendor/bootstrap', express.static(path.join(DIR_MODULES, 'bootstrap/dist'), { maxAge: '7d' }));
  app.use('/vendor/bootstrap-icons', express.static(path.join(DIR_MODULES, 'bootstrap-icons/font'), { maxAge: '7d' }));

  // Frontend
  app.use(express.static(DIR_FRONTEND, { extensions: ['html'], index: 'index.html' }));
  app.use(rotaNaoEncontrada);
  app.use(tratadorErros);

  return app;
}

module.exports = { criarApp };
