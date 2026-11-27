# StudyLog

StudyLogは、その日に学んだことを記録し、仲間の記録も読めるWebアプリです。「Webアプリケーション開発3」のNNチャットをもとに、Node.js 22の標準HTTPサーバー、Pug、Bootstrap 5.3、PrismaとPostgreSQLで作りました。

## ローカルで起動する

以下はWindows PowerShell用です。Docker Desktopを起動し、このプロジェクトのフォルダーで実行します。Node.jsとPostgreSQLはDockerで起動します。

### 1. データベースの設定を作る

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

`.env` の `POSTGRES_PASSWORD=` の右側に、英数字だけで作った十分長いパスワードを設定し、保存します。Composeで接続URLを組み立てるため、記号を使う場合はURL用のエンコードが必要です。すでに `.env` がある場合は、そのファイルを開いて設定を確認してください。

### 2. 3人分のログイン用パスワードを登録する

```powershell
docker compose build app
$mount = "type=bind,source=$($PWD.Path),target=/setup"
docker run --rm -it --network none --mount $mount --entrypoint node studylog-app:local /app/scripts/create-user.js student1 /setup/users.htpasswd
docker run --rm -it --network none --mount $mount --entrypoint node studylog-app:local /app/scripts/create-user.js student2 /setup/users.htpasswd
docker run --rm -it --network none --mount $mount --entrypoint node studylog-app:local /app/scripts/create-user.js admin /setup/users.htpasswd
```

各コマンドで12文字以上、UTF-8で72バイト以内の異なるパスワードを2回入力します。入力中の文字は画面に表示されません。3人分のbcryptハッシュが `users.htpasswd` に保存されます。Node.js 22をインストール済みなら、`npm ci` のあとに `npm run users -- student1` のように3人分を登録することもできます。

macOSやLinuxのシェルでは、マウント指定に `--mount "type=bind,source=$PWD,target=/setup"` を使います。Linuxのバインドマウントでファイル書き込み権限が必要な場合は、パスワード登録時の `docker run` に `--user "$(id -u):$(id -g)"` を追加し、Compose起動前に `export STUDYLOG_UID="$(id -u)"` を設定します。

### 3. アプリを起動する

```powershell
docker compose up -d
docker compose logs app
```

ブラウザで [http://localhost:8000](http://localhost:8000) を開きます。8000番ポートが使用中なら、`.env` の `STUDYLOG_PORT` を別のポート番号に変更します。初回起動時にPrismaがPostテーブルを作り、以降は未適用のマイグレーションだけを反映します。

停止するには `docker compose down` を実行します。投稿はComposeの `db-data` ボリュームに保存されるため、再起動しても残ります。`docker compose down -v` はボリュームを削除するため、記録を残すときは `-v` を付けないでください。

## 使い方

1. トップページの「学習記録を見る」から、`student1`、`student2`、`admin` のいずれかでログインします。
2. 画面下部のフォームに学習内容を入力し、「投稿」を押します。1〜1000文字で、空白だけの投稿は受け付けません。Ctrl+EnterまたはCommand+Enterでも投稿できます。
3. 記録はIDの昇順で並び、ページを開くと最新の位置まで移動します。自分の投稿は青枠で表示されます。経過時間にカーソルを重ねるか、Tabキーでフォーカスすると、日本時間の投稿日時が表示されます。
4. 一般ユーザーは自分の投稿、`admin` はすべての投稿を削除できます。
5. ナビゲーションの月・太陽アイコンから配色を切り替えられます。選んだ配色はブラウザのCookieに30日間保存されます。
6. 「Excel出力」で自分の記録を `studylog-ユーザー名.xlsx` として保存できます。ID、日本時間の投稿日時、学習内容を出力します。

ログアウトボタンは認証を要求する401を返します。認証ダイアログが表示されたときはキャンセルしてください。Basic認証の認証情報を解除するかどうかはブラウザの挙動に依存します。アカウントを切り替えられないときは、プライベートウィンドウをすべて閉じて開き直すか、別のブラウザを使ってください。

## テストする

起動済みのローカル環境で実行します。

```powershell
docker compose run --rm --no-deps --entrypoint npm app test
docker compose run --rm --no-deps -e STUDYLOG_TEST_POSTGRES=1 --entrypoint npm app test
docker compose run --rm --no-deps --entrypoint npm app audit --omit=dev
```

1行目はメモリー上のデータでHTTP応答を確認します。2行目はPostgreSQLにテスト専用のスキーマを一時作成し、実際のSQL処理とサーバー再起動後の投稿保持を確認します。普段の投稿が入っているスキーマには触れません。3行目は公開前の依存ライブラリ監査です。コードを変更したあとにコンテナでテストする場合は、先に `docker compose build app` でイメージを更新します。

## GitHubに登録する

1. GitHubにログインし、空のリポジトリを作ります。READMEや `.gitignore` はこのプロジェクトにあるため、GitHub側の初期ファイルは追加しません。授業の提出条件に合わせて公開範囲を設定します。[GitHubの手順](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)
2. 次を実行します。`git check-ignore` が2つのファイル名を表示することを確認します。

   ```powershell
   git init -b main
   git check-ignore .env users.htpasswd
   git add .
   git status --short
   git commit -m "StudyLogを追加"
   git remote add origin https://github.com/自分のアカウント名/リポジトリ名.git
   git push -u origin main
   ```

   `origin` にはGitHubのリポジトリ画面でコピーしたURLを指定します。認証を求められたら、表示されたGitHubのログイン手順に従います。

## Renderで公開する

1. Renderにログインして、ダッシュボードの **New → Postgres** でデータベースを作ります。続いて作るWeb Serviceと同じリージョンを選択し、データベースの画面で **Internal Database URL** を控えます。[Render Postgresの手順](https://render.com/docs/postgresql-creating-connecting)
2. **New → Web Service → Git Provider** を選び、GitHubの接続を許可して対象リポジトリと `main` ブランチを選びます。Runtimeを **Docker** にし、リポジトリ直下の `Dockerfile` を使います。Docker Commandは既定のままにし、Health Check Pathは `/` に設定します。CSRFトークンはサーバーのメモリーに保存するため、インスタンスは1台で動かします。[Render Web Serviceの手順](https://render.com/docs/web-services)
3. 環境変数に `DATABASE_URL` と `NODE_ENV` を追加します。`DATABASE_URL` には先ほどのInternal Database URL、`NODE_ENV` には `production` を設定します。待ち受けにはRenderから渡される `PORT` を使います。
4. ローカルとは異なるパスワードで本番用ファイルを作ります。「3人分のログイン用パスワードを登録する」の3つのコマンドで、最後のパスだけを `/setup/users.render.htpasswd` に変更すると別ファイルに保存できます。Renderの **Environment → Secret Files** で、ファイル名に `users.htpasswd` を指定して、本番用ファイルの中身を登録します。アプリは実行時に `/etc/secrets/users.htpasswd` を読み込みます。[RenderのSecret Files](https://render.com/docs/docker-secrets)
5. デプロイ後、Renderが発行した `https://…onrender.com` を開きます。HTTPSでアクセスでき、同じURLのHTTP版がHTTPSに移動することを確認します。続けて、未認証時のアクセス制限、3人のログイン、投稿、Excel出力を確認します。GitHub上に秘密ファイルがなく、Renderでは実行時の環境変数とSecret Filesだけに値を登録していることも確認します。[RenderのTLS仕様](https://render.com/docs/tls)

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `index.js` | HTTPサーバーの起動 |
| `lib/router.js` | URIとHTTPメソッドに応じた振り分けとCSP |
| `lib/auth.js` / `lib/csrf.js` | Basic認証と、認証済みユーザーにひも付いた使い切りトークン |
| `lib/posts-handler.js` / `lib/export-handler.js` | 投稿、一覧、削除、Excel出力 |
| `lib/handler-utils.js` / `lib/constants.js` | レスポンス、入力とCookie、共通定数 |
| `views/` / `public/` | Pugテンプレートと画面のデザイン、ブラウザ側の操作 |
| `prisma/` | Postモデルとマイグレーション |
| `Dockerfile` / `compose.yaml` / `run.sh` | コンテナのビルド、ローカル設定、起動時のスキーマ反映 |
| `test/` | `node:test` と `node:assert` によるテスト |

授業では `prisma db push` を使用しました。このアプリでは変更履歴を残し、起動時に未適用の変更だけを反映するため、`prisma migrate deploy` を使用します。Prisma 6の間接依存で監査指摘のあった `deepmerge-ts` と `effect` は、`package.json` の `overrides` で修正版を指定しています。
