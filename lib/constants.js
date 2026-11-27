const ADMIN = 'admin';
const USERS = ['student1', 'student2', ADMIN];
const MAX_CONTENT_LENGTH = 1000;
const MAX_BODY_BYTES = 16 * 1024;
const THEME_COOKIE = 'studylog_theme';
const THEME_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

module.exports = { ADMIN, USERS, MAX_CONTENT_LENGTH, MAX_BODY_BYTES, THEME_COOKIE, THEME_MAX_AGE };
