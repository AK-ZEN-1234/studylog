#!/bin/sh
set -eu

# 接続先などをログに残さず、既存のデータを保ったままマイグレーションを適用する。
if ! ./node_modules/.bin/prisma migrate deploy >/dev/null 2>&1; then
  echo 'データベースのマイグレーションに失敗しました。DATABASE_URLとデータベースの状態を確認してください。' >&2
  exit 1
fi

exec node index.js
