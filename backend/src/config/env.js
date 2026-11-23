const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.NODE_ENV === 'test'
      ? (process.env.DB_NAME_TEST || 'controle_estoque_teste')
      : (process.env.DB_NAME || 'controle_estoque')
  },
  sessionSecret: process.env.SESSION_SECRET,
  sessionMinutes: Number(process.env.SESSION_MINUTES || 30),
  trustProxy: process.env.TRUST_PROXY === '1',
  loginMaxTentativas: Number(process.env.LOGIN_MAX_TENTATIVAS || 10),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12)
};

env.isProduction = env.nodeEnv === 'production';
env.isTest = env.nodeEnv === 'test';

if (!env.sessionSecret || env.sessionSecret.length < 32) {
  if (env.isProduction) {
    throw new Error('SESSION_SECRET ausente ou curto demais (mínimo de 32 caracteres).');
  }
  env.sessionSecret = env.sessionSecret || 'segredo-de-desenvolvimento-nao-usar-em-producao-123456';
}

module.exports = env;
