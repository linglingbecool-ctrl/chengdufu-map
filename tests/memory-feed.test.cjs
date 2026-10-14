const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('script.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const extract=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const ctx=vm.createContext({escapeHtml:s=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),allPoints:[{id:'a',nameModern:'测试点',oldImage:'map.jpg',currentImage:'current.jpg'}],publicLikePending:new Map()});
vm.runInContext(extract('function memoryLikeCount(', 'function findPublicMemory(')+extract('function memoryDisplayText(', 'function renderPublicFeed('),ctx);
const records=[{id:'low',pointId:'a',originalContent:'低票',likeCount:1,imageUrls:['https://test.example/real.jpg']},{id:'high',pointId:'a',originalContent:'<img src=x onerror=alert(1)>',likeCount:5,coverStyle:'current'},{id:'mid',pointId:'a',originalContent:'中票',likeCount:3}];
const before=JSON.stringify(records),html=ctx.renderPublicPostCards(records);
assert.equal(JSON.stringify(records),before);
assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));
assert.match(html,/data:image\/svg\+xml/);assert.doesNotMatch(html,/current.jpg|点位配图|古图配图/);assert.match(html,/https:\/\/test.example\/real.jpg/);
assert.equal((html.match(/data-public-post=/g)||[]).length,3);
assert.equal((html.match(/class="memory-feed-column"/g)||[]).length,2);
assert.doesNotMatch(html,/审核状态|投稿类型|public-memory-types/);
const points=JSON.parse(fs.readFileSync('points.json'));const old=JSON.parse(require('node:child_process').execFileSync('git',['show','5bd73a2:points.json'],{encoding:'utf8'}));
// 地图下架不删除投稿；保留点位 ID、坐标及其余历史资料。
const removedIds=new Set(['dafosi','chengduxianwenmiao','wenchanggong']);
const renamed={tianyashi:'天涯石',mancheng:'满城（宽窄巷子、人民公园一带）',huayangxian:'华阳县治所（正府街一带）',chengdufuwenmiao:'成都府文庙（文翁路一带）'};
// Image additions/previews are maintained separately; keep the historical text,
// IDs and coordinates invariant against the original point-removal release.
const imageFields=new Set(['oldImage','currentImage','oldImagePreview','currentImagePreview','oldImageCaption','imageAttribution','imageSourceUrl','imageLicenseUrl']);
const withoutImages=p=>Object.fromEntries(Object.entries(p).filter(([key])=>!imageFields.has(key)));
for(const previous of old){
 const current=points.find(p=>p.id===previous.id);
 if(removedIds.has(previous.id)){assert.equal(current,undefined);continue;}
 assert.deepEqual(withoutImages(current),withoutImages({...previous,nameModern:renamed[previous.id]||previous.nameModern}));
}
assert.equal(new Set(points.map(p=>p.id)).size,points.length);
assert.equal(points.find(p=>p.id==='wangjianglou').nameAncient,'薛涛井');
assert.equal(points.find(p=>p.id==='wangjianglou').x,68.625);
for(const id of ['zongduyamen','zhijishi','dacisi','dongjiaochang','beijiaochang'])assert.ok(points.some(p=>p.id===id));
for(const p of points)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100);
assert.doesNotMatch(index,/id="publicMemoryHeroButton"[^>]*>公众记忆\s*<span/);
assert.doesNotMatch(index,/馆藏与项目说明\s*[↗→]/);
assert.doesNotMatch(source,/查看大家的照片与故事\s*[↗→]/);
assert.doesNotMatch(source,/在地图查看此地点\s*[↗→]/);
assert.match(source,/\["liked", "已点赞", likedItems.length\]/);
assert.match(source,/item\.likedByMe === true/);
console.log('PASS: mixed cards, descending likes, two columns, labeled stock covers, escaped input, original records and retained point IDs/coordinates preserved');

assert.equal(ctx.memoryDisplayText({originalContent:'原文',collaborativeDraft:'偏好文字',collaborativeDraftAccepted:true}),'偏好文字');
assert.equal(ctx.memoryDisplayText({originalContent:'原文',collaborativeDraft:'未采纳文字',collaborativeDraftAccepted:false}),'原文');
assert.equal(ctx.memoryDisplayText({originalContent:'原文',collaborativeDraft:'偏好文字',publicContent:'公开正文'}),'公开正文');
console.log('PASS: adopted expression only; unaccepted drafts hidden; authoritative public content preserved');

const cover=decodeURIComponent(ctx.memoryTextCover('真实记忆 <script>alert(1)</script> &\n第二行','薛涛井').split(',').slice(1).join(','));
assert.match(cover,/&lt;script&gt;/); assert.doesNotMatch(cover,/<script>/);assert.match(cover,/第二行/);
const longCover=decodeURIComponent(ctx.memoryTextCover('记忆'.repeat(1000)));
assert.equal((longCover.match(/<text x="54" y="(?:183|234|285|336|387|438|489|540|591|642)"/g)||[]).length,10);
assert.match(longCover,/点开阅读完整记忆/);
assert.doesNotMatch(ctx.renderPostCover({originalContent:'有真实照片',imageCount:1,imageFileIds:['cloud://1']}),/data:image/);
console.log('PASS: text image escaping, line limit and long-text hint; uploaded-photo fallback stays distinct');
