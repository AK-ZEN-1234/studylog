const http = require('node:http');
const { join } = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { createRouter } = require('./lib/router');

function createServer({ database, passwordFile, secure = false }) {
  return http.createServer({
    headersTimeout: 10000,
    requestTimeout: 15000,
    maxHeaderSize: 8192
  }, createRouter({ database, passwordFile, secure }));
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8000);
  const secure = process.env.NODE_ENV === 'production';
  const defaultFile = secure ? '/etc/secrets/users.htpasswd' : join(__dirname, 'users.htpasswd');

  try {
    const server = createServer({
      database: new PrismaClient(),
      passwordFile: process.env.HTPASSWD_PATH || defaultFile,
      secure
    });
    server.on('error', () => {
      console.error('HTTPサーバーを起動できませんでした。PORTを確認してください。');
      process.exitCode = 1;
    });
    server.listen(port, '0.0.0.0', () => {
      console.log(`StudyLogをポート ${server.address().port} で起動しました。`);
    });
  } catch {
    console.error('StudyLogを起動できませんでした。設定とusers.htpasswdを確認してください。');
    process.exitCode = 1;
  }
}

module.exports = { createServer };
