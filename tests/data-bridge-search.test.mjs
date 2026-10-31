import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { createSearchFixture } from './search-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const binary=path.join(root,'build/candidates/alpha-data-bridge');
const runtime=path.join(root,'.runtime/data-bridge-search-tests');
await fs.mkdir(runtime,{recursive:true});
const execute=promisify(execFile);
function client(directory){
 const process=spawn(binary,['--data-dir',directory,'--account-id','synthetic-account'],{stdio:['pipe','pipe','pipe']});
 const pending=new Map();let next=0,stderr='';const lines=createInterface({input:process.stdout});
 process.stderr.on('data',value=>stderr+=value);
 lines.on('line',line=>{const result=JSON.parse(line);const task=pending.get(result.id);pending.delete(result.id);task?.resolve(result)});
 process.once('exit',code=>{for(const task of pending.values())task.reject(new Error(`bridge exit ${code}: ${stderr}`));pending.clear()});
 return {request(op,params={}){return new Promise((resolve,reject)=>{const id=String(++next);pending.set(id,{resolve,reject});process.stdin.write(JSON.stringify({id,op,params})+'\n')})},async close(){if(process.exitCode!==null)return;const closed=new Promise(resolve=>process.once('exit',resolve));process.stdin.end();await closed;lines.close()},get stderr(){return stderr}};
}
async function setup(t,mutate){const outer=await fs.mkdtemp(path.join(runtime,'case-'));const directory=path.join(outer,'data');const fixture=await createSearchFixture({directory});if(mutate)await mutate(directory,fixture);const bridge=client(directory);t.after(async()=>{await bridge.close();await fs.rm(outer,{recursive:true,force:true})});return {directory,fixture,bridge}}
async function ok(bridge,op,params){const result=await bridge.request(op,params);assert.equal(result.ok,true,JSON.stringify(result));return result.result}
async function pages(bridge,op,params){const items=[];let cursor='';for(let page=0;page<40;page++){const result=await ok(bridge,op,{...params,cursor});items.push(...result.items);if(!result.hasMore){assert.equal(result.nextCursor,'');return items}assert.ok(result.nextCursor);assert.notEqual(result.nextCursor,cursor);cursor=result.nextCursor}assert.fail('cursor did not terminate')}
const identity=m=>`${m.source.database}/${m.source.table}/${m.localId}`;
function compare(a,b){const time=BigInt(a.createTime)-BigInt(b.createTime);if(time)return time<0n?-1:1;for(const field of ['database','table']){if(a.source[field]!==b.source[field])return a.source[field]<b.source[field]?-1:1}return BigInt(a.localId)<BigInt(b.localId)?-1:BigInt(a.localId)>BigInt(b.localId)?1:0}
async function hashTree(directory){const result={};for(const entry of await fs.readdir(directory,{recursive:true,withFileTypes:true})){if(entry.isFile()){const file=path.join(entry.parentPath,entry.name);result[path.relative(directory,file)]=createHash('sha256').update(await fs.readFile(file)).digest('hex')}}return result}
async function mutateSQL(directory,script){await execute('/usr/bin/python3',['-c',`import sqlite3,hashlib,sys\nfrom pathlib import Path\nroot=Path(sys.argv[1])\n${script}`,directory])}

test('global literal search covers archived Name2Id conversations, zstd and stable cross-shard time pages',async t=>{
 const {directory,fixture,bridge}=await setup(t);const before=await hashTree(directory);
 const info=await ok(bridge,'account.info');for(const op of ['messages.search','messages.locate','messages.dayCounts','messages.stats'])assert.ok(info.capabilities.includes(op));
 const ascending=await pages(bridge,'messages.search',{query:fixture.query,ascending:true,limit:1});assert.equal(ascending.length,9);assert.deepEqual(ascending.map(identity),ascending.toSorted(compare).map(identity));assert.equal(new Set(ascending.map(identity)).size,9);
 const descending=await pages(bridge,'messages.search',{query:fixture.query,limit:2});assert.deepEqual(descending.map(identity),ascending.toReversed().map(identity));
 assert.ok(ascending.some(row=>row.conversationId==='wxid_archived'));
 const compressed=ascending.find(row=>row.content===fixture.zstdText);assert.ok(compressed);assert.equal(compressed.contentEncoding,'utf8');assert.equal(compressed.contentCompression,'zstd');assert.equal(compressed.contentDecodeStatus,'decoded');assert.equal(compressed.sortSeq,'25');
 assert.equal(ascending.find(row=>row.serverId===fixture.uniqueServerId).localId,'9007199254740993');
 const coverage=await ok(bridge,'messages.search',{query:'NEEDLE'});assert.deepEqual(coverage.coverage,{complete:true,unreadableMessages:'0',unmappedTables:0});assert.equal(coverage.items.length,4);
 assert.equal((await ok(bridge,'messages.search',{query:'100%'})).items.length,2);
 assert.equal((await ok(bridge,'messages.search',{query:'[literal]'})).items.length,1);
 assert.equal((await ok(bridge,'messages.search',{query:'not-found'})).items.length,0);
 assert.deepEqual(await hashTree(directory),before);assert.equal(bridge.stderr,'');
});

test('search sender/time filters, grouped counts and cursor binding use all query parameters',async t=>{
 const {fixture,bridge}=await setup(t);
 const all=await pages(bridge,'messages.search',{query:fixture.query,ascending:false,limit:2});
 const grouped=await pages(bridge,'messages.search',{query:fixture.query,groupByConversation:true,limit:1});
 assert.equal(grouped.length,3);assert.deepEqual(Object.fromEntries(grouped.map(row=>[row.conversationId,row.matchCount])),{wxid_beta:'2',wxid_alpha:'6',wxid_archived:'1'});
 for(const row of grouped)assert.equal(identity(row),identity(all.find(value=>value.conversationId===row.conversationId)));
 const oldest=await pages(bridge,'messages.search',{query:fixture.query,groupByConversation:true,ascending:true,limit:2});for(const row of oldest)assert.equal(identity(row),identity(all.toReversed().find(value=>value.conversationId===row.conversationId)));
 const sent=await ok(bridge,'messages.search',{query:fixture.query,senderId:'wxid_self'});assert.equal(sent.items.length,3);assert.ok(sent.items.every(row=>row.sender==='wxid_self'));
 const interval=await ok(bridge,'messages.search',{query:fixture.query,afterTime:'1700000001',beforeTime:'1700000002'});assert.equal(interval.items.length,4);
 const exact=await ok(bridge,'messages.search',{query:fixture.query,afterTime:'1700000001',beforeTime:'1700000001'});assert.equal(exact.items.length,2);
 const first=await ok(bridge,'messages.search',{query:fixture.query,limit:1});
 for(const changed of [{query:'needle'},{senderId:'wxid_self'},{afterTime:'1'},{beforeTime:'1700086400'},{groupByConversation:true},{ascending:true},{conversationId:fixture.conversationId}]){const reply=await bridge.request('messages.search',{query:fixture.query,cursor:first.nextCursor,...changed});assert.equal(reply.error?.code,'INVALID_CURSOR',JSON.stringify(reply))}
});

test('locate returns untimed list cursors, preserves uint64 ids and rejects ambiguous duplicates',async t=>{
 const {fixture,bridge}=await setup(t);const all=await pages(bridge,'messages.list',{conversationId:fixture.conversationId,ascending:true,limit:1});
 assert.equal(all.at(-1).content,fixture.zstdText);assert.equal(all.at(-1).sortSeq,'25');assert.deepEqual(all.map(identity),all.toSorted(compare).map(identity));
 const located=await ok(bridge,'messages.locate',{conversationId:fixture.conversationId,serverId:fixture.uniqueServerId});assert.equal(located.message.localId,'9007199254740993');assert.ok(located.beforeCursor);assert.ok(located.afterCursor);
 const before=await ok(bridge,'messages.list',{conversationId:fixture.conversationId,ascending:false,cursor:located.beforeCursor});const after=await ok(bridge,'messages.list',{conversationId:fixture.conversationId,ascending:true,cursor:located.afterCursor});
 const at=all.findIndex(row=>identity(row)===identity(located.message));assert.deepEqual(before.items.map(identity),all.slice(0,at).toReversed().map(identity));assert.deepEqual(after.items.map(identity),all.slice(at+1).map(identity));
 assert.equal((await bridge.request('messages.list',{conversationId:fixture.conversationId,ascending:true,cursor:located.afterCursor,afterTime:'1'})).error.code,'INVALID_CURSOR');
 assert.equal((await bridge.request('messages.locate',{conversationId:fixture.conversationId,serverId:fixture.ambiguousServerId})).error.code,'MESSAGE_LOCATE_AMBIGUOUS');
 const unsigned=await ok(bridge,'messages.locate',{conversationId:fixture.secondConversationId,serverId:fixture.unsignedServerId});assert.equal(unsigned.message.serverId,'-1');
 assert.deepEqual(await ok(bridge,'messages.locate',{conversationId:fixture.conversationId,serverId:'999'}),{message:null,beforeCursor:'',afterCursor:''});
 for(const serverId of ['0','-1','18446744073709551616','01'])assert.equal((await bridge.request('messages.locate',{conversationId:fixture.conversationId,serverId})).error.code,'INVALID_PARAMS');
});

test('day counts use half-open millisecond ranges, real UTC offsets and raw aggregate stats',async t=>{
 const {fixture,bridge}=await setup(t);
 const beta=fixture.secondConversationId;
 const half=await ok(bridge,'messages.dayCounts',{conversationId:beta,fromUnixMs:'1700000001000',toUnixMs:'1700086400000',utcOffsetMinutes:0});assert.deepEqual(half.days,[{localDay:String(Math.floor(1700000001/86400)),count:'1'}]);
 const empty=await ok(bridge,'messages.dayCounts',{conversationId:beta,fromUnixMs:'1700000001001',toUnixMs:'1700086400000',utcOffsetMinutes:0});assert.deepEqual(empty.days,[]);
 const shifted=await ok(bridge,'messages.dayCounts',{conversationId:beta,fromUnixMs:'1699900000000',toUnixMs:'1700200000000',utcOffsetMinutes:480});assert.deepEqual(shifted.days,[1700000001,1700086400,1700172800].map(time=>({localDay:String(Math.floor((time+480*60)/86400)),count:'1'})));
 for(const filters of [{fromUnixMs:'0',toUnixMs:String(63*86400000),utcOffsetMinutes:0},{fromUnixMs:'2',toUnixMs:'2',utcOffsetMinutes:0},{fromUnixMs:'0',toUnixMs:'1',utcOffsetMinutes:841}])assert.equal((await bridge.request('messages.dayCounts',{conversationId:beta,...filters})).error.code,'INVALID_PARAMS');
 const stats=await ok(bridge,'messages.stats',{conversationId:fixture.conversationId});assert.deepEqual(stats,{conversationId:fixture.conversationId,messageCount:'6',firstTime:'1699999999',lastTime:'1700000004',counts:[{localType:'1',count:'5'},{localType:'49',count:'1'}]});
 assert.equal((await ok(bridge,'messages.stats')).messageCount,'10');
 assert.deepEqual(await ok(bridge,'messages.stats',{conversationId:'wxid_empty'}),{conversationId:'wxid_empty',messageCount:'0',firstTime:'',lastTime:'',counts:[]});
});

test('unreadable payloads and unmapped tables produce explicit scoped partial coverage',async t=>{
 const {fixture,bridge}=await setup(t,async directory=>mutateSQL(directory,`
+db=sqlite3.connect(root/'message'/'message_1.db')
+alpha='Msg_'+hashlib.md5(b'wxid_alpha').hexdigest()
+db.execute('UPDATE '+alpha+' SET message_content=? WHERE local_id=5',(b'\\x28\\xb5\\x2f\\xfd\\x00',))
+unknown='Msg_'+hashlib.md5(b'not_in_any_identity_map').hexdigest()
+db.execute('CREATE TABLE '+unknown+' (local_id INTEGER PRIMARY KEY, server_id INTEGER, sort_seq INTEGER, local_type INTEGER, create_time INTEGER, real_sender_id INTEGER, status INTEGER, message_content BLOB, packed_info_data BLOB)')
+db.execute('INSERT INTO '+unknown+' VALUES(1,88,1,1,1700000004,2,2,?,?)',('维护 hidden',b''))
+db.commit();db.close()
+`.replace(/^\+/gm,'')));
 const global=await ok(bridge,'messages.search',{query:fixture.query});assert.equal(global.items.length,8);assert.deepEqual(global.coverage,{complete:false,unreadableMessages:'1',unmappedTables:1});assert.ok(global.items.every(row=>row.conversationId!=='not_in_any_identity_map'));
 const conversation=await ok(bridge,'messages.search',{query:fixture.query,conversationId:fixture.conversationId});assert.equal(conversation.items.length,5);assert.deepEqual(conversation.coverage,{complete:false,unreadableMessages:'1',unmappedTables:0});
 const filtered=await ok(bridge,'messages.search',{query:fixture.query,beforeTime:'1700000003'});assert.deepEqual(filtered.coverage,{complete:true,unreadableMessages:'0',unmappedTables:0});
 const sender=await ok(bridge,'messages.search',{query:fixture.query,senderId:'wxid_alpha'});assert.deepEqual(sender.coverage,{complete:true,unreadableMessages:'0',unmappedTables:0});
});

test('calendar negative local-day flooring and operation-specific parameter rejection',async t=>{
 const {fixture,bridge}=await setup(t,async directory=>mutateSQL(directory,`db=sqlite3.connect(root/'message'/'message_0.db')\ntable='Msg_'+hashlib.md5(b'wxid_beta').hexdigest()\ndb.execute('INSERT INTO '+table+' VALUES(4,91,0,1,0,3,4,?,?)',('epoch',b''))\ndb.commit();db.close()`));
 assert.deepEqual((await ok(bridge,'messages.dayCounts',{conversationId:fixture.secondConversationId,fromUnixMs:'0',toUnixMs:'1000',utcOffsetMinutes:-720})).days,[{localDay:'-1',count:'1'}]);
 for(const [op,params]of [['messages.stats',{query:'needle'}],['messages.locate',{conversationId:fixture.conversationId,serverId:fixture.uniqueServerId,afterTime:'1'}],['messages.search',{query:'needle',fromUnixMs:'1'}],['messages.dayCounts',{conversationId:fixture.conversationId,fromUnixMs:'0',toUnixMs:'1',utcOffsetMinutes:0,cursor:'x'}],['messages.search',{query:' '.repeat(3)}]])assert.equal((await bridge.request(op,params)).error.code,'INVALID_PARAMS');
});

test('oversized search pages return a bounded error and the same bridge remains usable',async t=>{
 const {fixture,bridge}=await setup(t,async directory=>mutateSQL(directory,`db=sqlite3.connect(root/'message'/'message_0.db')\ntable='Msg_'+hashlib.md5(b'wxid_alpha').hexdigest()\nfor local in range(20,23): db.execute('INSERT INTO '+table+' VALUES(?,?,?,?,?,?,?,?,?)',(local,local,local,1,1700000010+local,1,4,'needle '+('x'*4194200),b''))\ndb.commit();db.close()`));
 const reply=await bridge.request('messages.search',{query:'needle',limit:3});
 assert.equal(reply.ok,false);assert.equal(reply.error.code,'RESPONSE_TOO_LARGE');assert.ok(Buffer.byteLength(JSON.stringify(reply))<1024);
 const small=await ok(bridge,'messages.search',{query:'needle',limit:1});assert.equal(small.items.length,1);assert.equal(small.hasMore,true);assert.ok(small.nextCursor);
 assert.equal((await ok(bridge,'account.info')).readOnly,true);
});

test('oversized joined sender values are bounded before row materialization',async t=>{
 const {fixture,bridge}=await setup(t,async directory=>mutateSQL(directory,`db=sqlite3.connect(root/'message'/'message_0.db')\ndb.execute('UPDATE Name2Id SET user_name=? WHERE rowid=1',('x'*2097152,))\ndb.commit();db.close()`));
 const result=await ok(bridge,'messages.search',{query:'first',conversationId:fixture.conversationId});assert.equal(result.items.length,1);assert.equal(result.items[0].sender,'');assert.equal(result.items[0].realSenderId,'1');
 assert.ok(Buffer.byteLength(JSON.stringify(result))<8192);assert.equal(result.coverage.complete,true);
 const global=await ok(bridge,'messages.search',{query:'first'});assert.equal(global.items[0].conversationId,fixture.conversationId);assert.equal(global.coverage.complete,true);
 assert.equal((await ok(bridge,'messages.search',{query:'first',senderId:'wxid_alpha'})).items.length,0);
});

test('oversized SQLite payloads are bounded before materialization and reported unreadable',async t=>{
 const {fixture,bridge}=await setup(t,async directory=>mutateSQL(directory,`db=sqlite3.connect(root/'message'/'message_1.db')\ntable='Msg_'+hashlib.md5(b'wxid_alpha').hexdigest()\ndb.execute('UPDATE '+table+' SET message_content=?,packed_info_data=zeroblob(4194305) WHERE local_id=5',('中'*1398102,))\ndb.commit();db.close()`));
 const result=await ok(bridge,'messages.search',{query:fixture.query,conversationId:fixture.conversationId});assert.equal(result.items.length,5);assert.deepEqual(result.coverage,{complete:false,unreadableMessages:'1',unmappedTables:0});
 const list=await ok(bridge,'messages.list',{conversationId:fixture.conversationId});const row=list.items.find(item=>item.localId==='5'&&item.source.database.endsWith('message_1.db'));
 assert.equal(row.contentDecodeStatus,'too-large');assert.equal(row.contentBase64,'');assert.equal(row.packedInfoBase64,'');assert.equal(row.packedInfoOmitted,true);
});
