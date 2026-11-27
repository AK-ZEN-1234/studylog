const XlsxPopulate = require('xlsx-populate');
const { formatDate } = require('./posts-handler');

async function exportPosts(res, database, user) {
  const posts = await database.post.findMany({
    where: { postedBy: user },
    orderBy: { id: 'asc' }
  });
  const workbook = await XlsxPopulate.fromBlankAsync();
  const sheet = workbook.sheet(0).name('学習記録');

  sheet.range('A1:C1').value([['ID', '投稿日時（日本時間）', '学習内容']]).style({
    bold: true,
    fill: '2949CC',
    fontColor: 'FFFFFF',
    verticalAlignment: 'center'
  });
  sheet.row(1).height(24);
  sheet.column('A').width(10);
  sheet.column('B').width(26);
  sheet.column('C').width(60);

  for (const [index, post] of posts.entries()) {
    const row = index + 2;
    sheet.cell(`A${row}`).value(post.id);
    sheet.cell(`B${row}`).value(formatDate(post.createdAt));
    // valueで本文を文字列として書き込む。先頭が「=」でも数式にはならない。
    sheet.cell(`C${row}`).value(post.content).style('wrapText', true);
  }

  const file = await workbook.outputAsync();
  res.writeHead(200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="studylog-${user}.xlsx"`,
    'Content-Length': file.length
  });
  res.end(file);
}

module.exports = { exportPosts };
