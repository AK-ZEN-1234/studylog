const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const bcrypt = require('bcryptjs');
const XlsxPopulate = require('xlsx-populate');
const { Prisma, PrismaClient } = require('@prisma/client');
const { createServer } = require('../index');
const { USERS, MAX_BODY_BYTES } = require('../lib/constants');

function memoryDatabase() {
  const rows = [];
  let nextId = 1;
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  return {
    post: {
      findMany: async ({ where = {}, orderBy }) => {
        const result = rows.filter(row => matches(row, where)).reverse();
        if (orderBy?.id === 'asc') result.sort((a, b) => a.id - b.id);
        return result;
      },
      create: async ({ data }) => rows.push({ ...data, id: nextId++, createdAt: new Date() }),
      findUnique: async ({ where }) => rows.find(row => matches(row, where)),
      deleteMany: async ({ where }) => {
        const index = rows.findIndex(row => matches(row, where));
        if (index === -1) return { count: 0 };
        rows.splice(index, 1);
        return { count: 1 };
      }
    }
  };
}

test('StudyLogのHTTP動作', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'studylog-test-'));
  const passwordFile = join(temp, 'users.htpasswd');
  const credentials = new Map();
  const users = USERS.map(user => {
    const password = randomBytes(16).toString('hex');
    credentials.set(user, 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64'));
    const hash = bcrypt.hashSync(password, 4);
    // Apacheのhtpasswdコマンドで生成される2y形式も確認する。
    return `${user}:${user === 'admin' ? hash.replace('$2b$', '$2y$') : hash}`;
  });
  await writeFile(passwordFile, users.join('\n'), { mode: 0o600 });

  const postgres = process.env.STUDYLOG_TEST_POSTGRES === '1';
  let schema;
  let databaseUrl;
  let database = memoryDatabase();
  let server;
  let base;
  t.after(async () => {
    try {
      if (server?.listening) await new Promise(resolve => server.close(resolve));
      if (schema && database instanceof PrismaClient) {
        // 外部入力を使わず、このテストが作ったランダム名のスキーマだけを片付ける。
        try {
          await database.$executeRaw`DROP SCHEMA IF EXISTS ${Prisma.raw(schema)} CASCADE`;
        } finally {
          await database.$disconnect();
        }
      }
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  if (postgres) {
    schema = 'studylog_test_' + randomBytes(12).toString('hex');
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.set('schema', schema);
    databaseUrl = url.toString();
    database = new PrismaClient({ datasourceUrl: databaseUrl });
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'ignore'
    });
  }

  async function start(secure = false) {
    server = createServer({ database, passwordFile, secure });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = 'http://127.0.0.1:' + server.address().port;
  }

  await start();

  async function request(path, user, options = {}) {
    const headers = new Headers(options.headers);
    if (user) headers.set('Authorization', credentials.get(user));
    return fetch(base + path, { ...options, headers, redirect: 'manual' });
  }

  async function page(user = 'student1', headers = {}) {
    const response = await request('/posts', user, { headers });
    assert.equal(response.status, 200);
    return response.text();
  }

  async function token(user) {
    const html = await page(user);
    return html.match(/name="csrfToken" value="([a-f0-9]{64})"/)[1];
  }

  function submit(path, user, values) {
    return request(path, user, { method: 'POST', body: new URLSearchParams(values) });
  }

  async function create(user, content, extra = {}) {
    const response = await submit('/posts', user, { csrfToken: await token(user), content, ...extra });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/posts');
  }

  await t.test('トップページと静的ファイルを公開し、不明なURLは404を返す', async () => {
    const top = await request('/');
    assert.equal(top.status, 200);
    assert.match(await top.text(), /<title>StudyLog｜学習記録を共有<\/title>/);
    assert.match(top.headers.get('content-security-policy'), /script-src 'self'/);
    for (const file of ['/favicon.ico', '/style.css', '/studylog.js', '/vendor/bootstrap.css',
      '/vendor/bootstrap.js', '/vendor/bootstrap-icons.css', '/vendor/fonts/bootstrap-icons.woff2']) {
      const response = await request(file);
      assert.equal(response.status, 200, file);
      await response.arrayBuffer();
    }
    assert.equal((await request('/missing')).status, 404);
    assert.equal((await request('/users.htpasswd')).status, 404);
  });

  await t.test('未認証や誤ったパスワードを拒否し、3人がログインできる', async () => {
    for (const path of ['/posts', '/posts/delete', '/theme']) {
      const response = await submit(path, null, {});
      assert.equal(response.status, 401);
      assert.match(response.headers.get('www-authenticate'), /Basic realm="StudyLog"/);
    }
    const wrong = 'Basic ' + Buffer.from('student1:wrong').toString('base64');
    assert.equal((await request('/posts', null, { headers: { Authorization: wrong } })).status, 401);
    assert.equal((await request('/posts')).status, 401);
    for (const user of USERS) assert.match(await page(user), new RegExp(user));
    const logout = await request('/logout', 'student1');
    assert.equal(logout.status, 401);
    assert.match(logout.headers.get('www-authenticate'), /Basic/);
  });

  await t.test('投稿をID順に表示し、本文のHTMLをエスケープして改行を保つ', async () => {
    await create('student1', '最初の学習記録\n<b>タグの例</b>', { postedBy: 'admin' });
    await create('student2', '次の学習記録');
    await create('admin', '管理者の記録');
    const html = await page();
    assert.match(html, /最初の学習記録\n&lt;b&gt;タグの例&lt;\/b&gt;/);
    assert.ok(html.indexOf('最初の学習記録') < html.indexOf('次の学習記録'));
    assert.match(html, /class="card post-card post-own"/);
    assert.match(html, /class="badge text-bg-warning">管理者<\/span>/);
    assert.match(html, /title="[^"]+（日本時間）"/);
    const rows = await database.post.findMany({ orderBy: { id: 'asc' } });
    assert.deepEqual(rows.map(row => row.postedBy), USERS);
  });

  await t.test('空白、文字数超過、重複フィールド、不正な形式やサイズを拒否する', async () => {
    for (const content of [' \n\t　', 'あ'.repeat(1001), '記録\u0000']) {
      const response = await submit('/posts', 'student1', { csrfToken: await token(), content });
      assert.equal(response.status, 400);
    }
    assert.equal((await submit('/posts', 'student1', [
      ['csrfToken', await token()], ['content', '記録'], ['content', '重複']
    ])).status, 400);
    assert.equal((await request('/posts', 'student1', { method: 'POST', body: '記録' })).status, 400);
    assert.equal((await submit('/posts', 'student1', { content: 'a'.repeat(MAX_BODY_BYTES + 1) })).status, 400);
    await create('student1', '📘'.repeat(1000));
  });

  await t.test('CSRFトークンがない場合、不正、別のユーザー、使用済みの場合に拒否する', async () => {
    const first = await token();
    for (const path of ['/posts', '/posts/delete', '/theme']) {
      assert.equal((await submit(path, 'student1', {})).status, 403);
      assert.equal((await submit(path, 'student1', { csrfToken: '0'.repeat(64) })).status, 403);
      assert.equal((await submit(path, 'student2', { csrfToken: first })).status, 403);
    }
    assert.equal((await submit('/posts', 'student1', { csrfToken: first, content: '一度だけ投稿' })).status, 303);
    assert.equal((await submit('/posts', 'student1', { csrfToken: first, content: '使い回し' })).status, 403);
  });

  await t.test('サーバーとPrismaクライアントを再起動しても投稿が残る', { skip: !postgres }, async () => {
    await new Promise(resolve => server.close(resolve));
    await database.$disconnect();
    database = new PrismaClient({ datasourceUrl: databaseUrl });
    await start();
    assert.match(await page(), /最初の学習記録/);
  });

  await t.test('Excelに本人の投稿だけを出力し、学習内容を文字列として保存する', async () => {
    await create('student1', '=1+2');
    assert.equal((await request('/posts/export')).status, 401);

    async function download(user) {
      const response = await request('/posts/export', user);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      assert.equal(response.headers.get('content-disposition'), `attachment; filename="studylog-${user}.xlsx"`);
      const workbook = await XlsxPopulate.fromDataAsync(Buffer.from(await response.arrayBuffer()));
      return workbook.sheet('学習記録');
    }

    const sheet = await download('student1');
    assert.deepEqual(sheet.range('A1:C1').value()[0], ['ID', '投稿日時（日本時間）', '学習内容']);
    assert.equal(sheet.cell('A1').style('bold'), true);
    assert.equal(sheet.column('C').width(), 60);
    assert.match(sheet.cell('B2').value(), /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    const posts = await database.post.findMany({ where: { postedBy: 'student1' }, orderBy: { id: 'asc' } });
    const rows = sheet.usedRange().value().slice(1);
    assert.deepEqual(rows.map(row => [row[0], row[2]]), posts.map(post => [post.id, post.content]));
    assert.equal(sheet.cell(`C${rows.length + 1}`).value(), '=1+2');
    assert.equal(sheet.cell(`C${rows.length + 1}`).formula(), undefined);
    const adminSheet = await download('admin');
    assert.deepEqual(adminSheet.usedRange().value().slice(1).map(row => row[2]), ['管理者の記録']);
  });

  await t.test('本人と管理者だけが削除でき、投稿IDを検証する', async () => {
    const [own, other] = await database.post.findMany({ orderBy: { id: 'asc' } });
    function remove(user, id, csrfToken) {
      return submit('/posts/delete', user, { id, csrfToken });
    }
    assert.equal((await remove('student1', '1x', await token())).status, 400);
    assert.equal((await remove('student1', 2147483648, await token())).status, 400);
    assert.equal((await remove('student1', other.id, await token())).status, 403);
    assert.match(await page(), /次の学習記録/);
    assert.equal((await remove('student1', own.id, await token())).status, 303);
    assert.equal((await remove('student1', own.id, await token())).status, 404);
    assert.equal((await remove('admin', other.id, await token('admin'))).status, 303);
    assert.doesNotMatch(await page(), /次の学習記録/);
  });

  await t.test('配色を切り替え、30日間のCookieを発行して次の表示に反映する', async () => {
    assert.match(await page('student1', { Cookie: 'studylog_theme=other' }), /data-bs-theme="light"/);
    const dark = await submit('/theme', 'student1', { csrfToken: await token(), theme: 'dark' });
    assert.equal(dark.status, 303);
    const cookie = dark.headers.get('set-cookie');
    assert.match(cookie, /^studylog_theme=dark;/);
    assert.match(cookie, /; httponly(?:;|$)/i);
    assert.match(cookie, /; samesite=lax(?:;|$)/i);
    const expiration = Date.parse(cookie.match(/expires=([^;]+)/i)[1]);
    assert.ok(Math.abs(expiration - Date.now() - 30 * 24 * 60 * 60 * 1000) < 2000);
    assert.match(await page('student1', { Cookie: 'studylog_theme=dark' }), /data-bs-theme="dark"/);
    const light = await submit('/theme', 'student1', { csrfToken: await token(), theme: 'light' });
    assert.match(light.headers.get('set-cookie'), /studylog_theme=light/);
    assert.match(await page('student1', { Cookie: 'studylog_theme=light' }), /data-bs-theme="light"/);
    assert.equal((await submit('/theme', 'student1', { csrfToken: await token(), theme: 'other' })).status, 400);
  });

  await t.test('本番モードではHSTSとSecure属性を付ける', async () => {
    await new Promise(resolve => server.close(resolve));
    await start(true);
    const response = await submit('/theme', 'student1', { csrfToken: await token(), theme: 'dark' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
    assert.match(response.headers.get('set-cookie'), /; secure/i);
  });
});
