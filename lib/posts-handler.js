const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const relativeTime = require('dayjs/plugin/relativeTime');
require('dayjs/locale/ja');
const { ADMIN, MAX_CONTENT_LENGTH } = require('./constants');
const { text, render, redirect, formValue } = require('./handler-utils');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.locale('ja');

function formatDate(date) {
  return dayjs(date).tz('Asia/Tokyo').format('YYYY/MM/DD HH:mm:ss');
}

async function listPosts(res, database, { user, theme, csrfToken }) {
  const posts = await database.post.findMany({ orderBy: { id: 'asc' } });
  const displayedPosts = posts.map(post => ({
    ...post,
    relativeTime: dayjs(post.createdAt).fromNow(),
    fullTime: formatDate(post.createdAt) + '（日本時間）'
  }));
  render(res, 'posts', { posts: displayedPosts, user, theme, csrfToken, ADMIN, MAX_CONTENT_LENGTH });
}

async function createPost(res, database, user, form) {
  const content = formValue(form, 'content')?.replace(/\r\n?/g, '\n');
  // 絵文字も1文字として数え、改行・タブ以外の制御文字とXMLで使えない文字は受け付けない。
  const invalidCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u;
  if (!content?.trim() || Array.from(content).length > MAX_CONTENT_LENGTH || invalidCharacters.test(content)) {
    return text(res, 400, `学習内容は1〜${MAX_CONTENT_LENGTH}文字で入力してください。`);
  }

  await database.post.create({ data: { content, postedBy: user } });
  redirect(res, '/posts');
}

async function deletePost(res, database, user, form) {
  const input = formValue(form, 'id');
  const id = Number(input);
  if (!/^\d+$/.test(input) || id < 1 || id > 2147483647) {
    return text(res, 400, '投稿IDが正しくありません。');
  }

  // 削除クエリにも所有者の条件を含める。
  const where = user === ADMIN ? { id } : { id, postedBy: user };
  const result = await database.post.deleteMany({ where });
  if (result.count === 0) {
    const post = await database.post.findUnique({ where: { id }, select: { id: true } });
    if (post) return text(res, 403, 'この学習記録を削除する権限がありません。');
    return text(res, 404, '学習記録が見つかりません。');
  }
  redirect(res, '/posts');
}

module.exports = { listPosts, createPost, deletePost, formatDate };
