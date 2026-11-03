import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
test('message board is removed from public pages without deleting its storage API', () => {
  const page = readFileSync('app/page.tsx', 'utf8');
  assert.doesNotMatch(page, /MessageBoard|hero-method/);
  assert.doesNotMatch(page, /公开资料 · 交叉核验 · 持续修订/);
  assert.match(readFileSync('worker/danmaku.ts', 'utf8'), /handleDanmaku/);
});
test('danmaku saves, limits frequency, validates input, and rejects cross-origin writes', async () => {
  const bundle = await build({entryPoints:['worker/danmaku.ts'],bundle:true,platform:'node',format:'esm',write:false});
  const {handleDanmaku} = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync('drizzle/0001_first_the_order.sql','utf8'));
  function stmt(sql,args=[]) {return {bind:(...values)=>stmt(sql,values),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:db.prepare(sql).run(...args)})};}
  const call=(method,body,headers={})=>handleDanmaku(new Request('http://localhost/api/danmaku',{method,headers:{'Content-Type':'application/json',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),{prepare:stmt});
  assert.deepEqual(await (await call('GET')).json(),{messages:[]});
  assert.equal((await call('POST',{nickname:'',content:'test'})).status,400);
  assert.equal((await call('POST',{nickname:'a',content:'x'.repeat(81)})).status,400);
  assert.equal((await call('POST',{nickname:'a',content:'test'},{Origin:'https://foreign.example'})).status,403);
  assert.equal((await call('POST',{nickname:'测试',content:'<script>test</script>'})).status,201);
  assert.equal((await call('POST',{nickname:'测试',content:'重复'})).status,429);
  const data=await (await call('GET')).json();
  assert.equal(data.messages.length,1);
  assert.equal(data.messages[0].content,'<script>test</script>');
  assert.equal(data.messages[0].sender,undefined);
  assert.equal(typeof data.messages[0].createdAt,'number');
  assert.ok(Math.abs(Date.now()-data.messages[0].createdAt)<10000);
  assert.equal((await call('DELETE')).status,405);
  db.close();
});
