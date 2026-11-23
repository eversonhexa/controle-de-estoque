const env = require('./config/env');
const { pool } = require('./config/database');
const { criarApp } = require('./app');

async function iniciar() {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('Não foi possível conectar ao MySQL:', err.message);
    console.error('Verifique o arquivo .env e se o banco foi criado com "npm run db:init".');
    process.exit(1);
  }

  const app = criarApp();
  const servidor = app.listen(env.port, () => {
    console.log(`Controle de Estoque disponível em http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const encerrar = () => {
    servidor.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}

iniciar();
