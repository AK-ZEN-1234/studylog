const { randomBytes } = require('node:crypto');

const TOKEN_LIFETIME = 30 * 60 * 1000;
const MAX_TOKENS = 3000;

function createCsrf() {
  const tokens = new Map();

  function issue(user) {
    const now = Date.now();
    // 発行順に期限が切れるため、期限切れや上限を超えた分は先頭から取り除く。
    for (const [token, entry] of tokens) {
      if (entry.expiresAt > now && tokens.size < MAX_TOKENS) break;
      tokens.delete(token);
    }
    const token = randomBytes(32).toString('hex');
    tokens.set(token, { user, expiresAt: now + TOKEN_LIFETIME });
    return token;
  }

  function consume(user, token) {
    const entry = tokens.get(token);
    if (!entry || entry.user !== user || entry.expiresAt <= Date.now()) return false;
    tokens.delete(token);
    return true;
  }

  return { issue, consume };
}

module.exports = { createCsrf };
