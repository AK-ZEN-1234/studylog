const { join } = require('node:path');
const pug = require('pug');
const Cookies = require('cookies');
const { MAX_BODY_BYTES, THEME_COOKIE, THEME_MAX_AGE } = require('./constants');

function text(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function render(res, template, data) {
  const html = pug.renderFile(join(__dirname, '../views', template + '.pug'), data);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

async function readForm(req) {
  const type = req.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/x-www-form-urlencoded' || Number(req.headers['content-length']) > MAX_BODY_BYTES) {
    return null;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function formValue(form, key) {
  const values = form.getAll(key);
  return values.length === 1 ? values[0] : null;
}

function getTheme(req, res, secure) {
  const cookies = new Cookies(req, res, { secure });
  return cookies.get(THEME_COOKIE) === 'dark' ? 'dark' : 'light';
}

function setTheme(req, res, secure, theme) {
  const cookies = new Cookies(req, res, { secure });
  cookies.set(THEME_COOKIE, theme, {
    maxAge: THEME_MAX_AGE,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure
  });
}

module.exports = { text, render, redirect, readForm, formValue, getTheme, setTheme };
