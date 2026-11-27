const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { createAuth, logout } = require('./auth');
const { createCsrf } = require('./csrf');
const { listPosts, createPost, deletePost } = require('./posts-handler');
const { exportPosts } = require('./export-handler');
const { text, render, redirect, readForm, formValue, getTheme, setTheme } = require('./handler-utils');

const ROOT = join(__dirname, '..');
const ICON_DIR = 'node_modules/bootstrap-icons/font/';
const STATIC_FILES = new Map([
  ['/style.css', ['public/style.css', 'text/css; charset=utf-8']],
  ['/studylog.js', ['public/studylog.js', 'text/javascript; charset=utf-8']],
  ['/favicon.ico', ['public/favicon.ico', 'image/x-icon']],
  ['/vendor/bootstrap.css', ['node_modules/bootstrap/dist/css/bootstrap.min.css', 'text/css; charset=utf-8']],
  ['/vendor/bootstrap.js', ['node_modules/bootstrap/dist/js/bootstrap.bundle.min.js', 'text/javascript; charset=utf-8']],
  ['/vendor/bootstrap-icons.css', [ICON_DIR + 'bootstrap-icons.min.css', 'text/css; charset=utf-8']],
  ['/vendor/fonts/bootstrap-icons.woff2', [ICON_DIR + 'fonts/bootstrap-icons.woff2', 'font/woff2']],
  ['/vendor/fonts/bootstrap-icons.woff', [ICON_DIR + 'fonts/bootstrap-icons.woff', 'font/woff']]
]);

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'",
  "font-src 'self'", "img-src 'self' data:", "object-src 'none'",
  "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'"
].join('; ');

function createRouter({ database, passwordFile, secure }) {
  const authenticate = createAuth(passwordFile);
  const csrf = createCsrf();

  async function handleProtected(req, res, route) {
    if (route === 'GET /posts/export') return exportPosts(res, database, req.user);
    if (route === 'GET /posts') {
      return listPosts(res, database, {
        user: req.user,
        theme: getTheme(req, res, secure),
        csrfToken: csrf.issue(req.user)
      });
    }

    const form = await readForm(req);
    if (!form) {
      req.resume();
      return text(res, 400, 'フォームの形式またはサイズが正しくありません。');
    }
    if (!csrf.consume(req.user, formValue(form, 'csrfToken'))) {
      return text(res, 403, 'フォームの有効期限が切れたか、すでに送信されています。ページを開き直してください。');
    }
    if (route === 'POST /posts') return createPost(res, database, req.user, form);
    if (route === 'POST /posts/delete') return deletePost(res, database, req.user, form);

    const theme = formValue(form, 'theme');
    if (theme !== 'light' && theme !== 'dark') return text(res, 400, '配色設定が正しくありません。');
    setTheme(req, res, secure, theme);
    redirect(res, '/posts');
  }

  function handleError(res) {
    console.error('リクエストの処理中にエラーが発生しました。');
    if (res.headersSent) return res.destroy();
    text(res, 500, '処理中にエラーが発生しました。');
  }

  return async (req, res) => {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');

    const path = req.url.split('?')[0];
    const route = `${req.method} ${path}`;
    try {
      const file = STATIC_FILES.get(path);
      if (file && (req.method === 'GET' || req.method === 'HEAD')) {
        const [filename, type] = file;
        const content = await readFile(join(ROOT, filename));
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': content.length });
        return res.end(req.method === 'HEAD' ? undefined : content);
      }
      switch (route) {
        case 'GET /':
          return render(res, 'index', { theme: getTheme(req, res, secure) });
        case 'GET /logout':
          return logout(res);
        case 'GET /posts':
        case 'GET /posts/export':
        case 'POST /posts':
        case 'POST /posts/delete':
        case 'POST /theme':
          return authenticate(req, res, () => {
            handleProtected(req, res, route).catch(() => handleError(res));
          });
        default:
          return text(res, 404, 'ページが見つかりません。');
      }
    } catch {
      handleError(res);
    }
  };
}

module.exports = { createRouter };
