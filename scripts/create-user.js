const { appendFileSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createInterface } = require('node:readline/promises');
const { Writable } = require('node:stream');
const bcrypt = require('bcryptjs');
const { USERS } = require('../lib/constants');

async function main() {
  const [user, file = 'users.htpasswd'] = process.argv.slice(2);
  if (!USERS.includes(user) || !process.stdin.isTTY) {
    throw new Error('端末で npm run users -- student1 のようにユーザー名を指定してください。');
  }

  const filename = resolve(file);
  let current = '';
  try {
    current = readFileSync(filename, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (current.split(/\r?\n/).some(line => line.startsWith(user + ':'))) {
    throw new Error(`${user} は登録済みです。変更する場合は該当する行だけを削除してから実行してください。`);
  }

  // 入力を端末に表示せず、パスワードを引数やログに残さない。
  const hiddenOutput = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    }
  });
  const terminal = createInterface({
    input: process.stdin,
    output: hiddenOutput,
    terminal: true,
    historySize: 0
  });
  const cancel = new AbortController();
  terminal.on('SIGINT', () => cancel.abort());

  async function ask(message) {
    process.stdout.write(message);
    const answer = await terminal.question('', { signal: cancel.signal });
    process.stdout.write('\n');
    return answer;
  }

  try {
    const password = await ask(`${user} のパスワードを入力してください。入力内容は表示されません。\n> `);
    if (password.length < 12 || bcrypt.truncates(password)) {
      throw new Error('パスワードは12文字以上、UTF-8で72バイト以内にしてください。');
    }
    if (password !== await ask('確認のためもう一度入力してください。\n> ')) {
      throw new Error('パスワードが一致しません。');
    }
    const hash = await bcrypt.hash(password, 12);
    const separator = current && !current.endsWith('\n') ? '\n' : '';
    appendFileSync(filename, `${separator}${user}:${hash}\n`, { mode: 0o600 });
    console.log(`${user} を登録しました。`);
  } finally {
    terminal.close();
  }
}

main().catch(error => {
  console.error(error.name === 'AbortError' ? '\n入力を取り消しました。' : error.message);
  process.exitCode = 1;
});
