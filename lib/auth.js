const { readFileSync } = require('node:fs');
const auth = require('http-auth');
const bcrypt = require('bcryptjs');
const { USERS } = require('./constants');
const { text } = require('./handler-utils');

const REALM = 'StudyLog';
const BCRYPT_HASH = /^\$2[aby]\$(?:0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/;

function createAuth(passwordFile) {
  const hashes = new Map();
  for (const line of readFileSync(passwordFile, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [user, hash, extra] = line.split(':');
    if (!USERS.includes(user) || hashes.has(user) || !BCRYPT_HASH.test(hash) || extra !== undefined) {
      throw new Error('users.htpasswd の形式が正しくありません。');
    }
    hashes.set(user, hash);
  }
  if (hashes.size !== USERS.length) {
    throw new Error('users.htpasswd に3人分のアカウントが必要です。');
  }

  const basic = auth.basic({
    realm: REALM,
    msg401: '学習記録を利用するにはログインが必要です。',
    contentType: 'text/plain; charset=utf-8'
  }, (user, password, callback) => {
    const hash = hashes.get(user);
    if (!hash || !password || bcrypt.truncates(password)) return callback(false);
    bcrypt.compare(password, hash).then(callback, () => callback(false));
  });
  return (req, res, handler) => basic.check(handler)(req, res);
}

function logout(res) {
  // Basic認証の保存済み情報を解除するかどうかはブラウザが決める。
  res.setHeader('WWW-Authenticate', `Basic realm="${REALM}"`);
  text(res, 401, 'ログアウトしました。認証ダイアログが表示された場合はキャンセルしてください。');
}

module.exports = { createAuth, logout };
