/**
 * Backup do banco de dados com mysqldump.
 * Uso: npm run backup
 * Agende no Agendador de Tarefas do Windows ou no cron para execução diária.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const dayjs = require('dayjs');
const env = require('../config/env');

const dir = path.resolve(__dirname, '../../', process.env.BACKUP_DIR || '../backups');
fs.mkdirSync(dir, { recursive: true });
const arquivo = path.join(dir, `${env.db.database}_${dayjs().format('YYYYMMDD_HHmmss')}.sql`);

const args = [
  `--host=${env.db.host}`, `--port=${env.db.port}`, `--user=${env.db.user}`,
  '--single-transaction', '--routines', '--triggers', '--default-character-set=utf8mb4',
  env.db.database
];

const saida = fs.createWriteStream(arquivo);
const proc = spawn(process.env.MYSQLDUMP_PATH || 'mysqldump', args, {
  env: { ...process.env, MYSQL_PWD: env.db.password }
});
proc.stdout.pipe(saida);
proc.stderr.on('data', (d) => process.stderr.write(d));
proc.on('error', (err) => { console.error('Não foi possível executar o mysqldump:', err.message); process.exit(1); });
proc.on('close', (codigo) => {
  if (codigo === 0) console.log(`Backup gravado em ${arquivo}`);
  else { console.error(`mysqldump terminou com código ${codigo}`); process.exit(codigo); }
});
