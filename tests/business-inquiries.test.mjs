import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const result = await build({ entryPoints: ["worker/business-inquiries.ts"], bundle:true, platform:"node", format:"esm", write:false });
const { handleBusinessInquiry, listBusinessInquiries } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const body = { companyProduct:"Test product", region:"UAE", type:"海外支付", description:"Private request", budget:"待沟通", timeline:"下月", contact:"private contact" };
const req = (value=body, ip=crypto.randomUUID(), origin="https://site.test") => new Request("https://site.test/api/business-inquiries", {method:"POST",headers:{"Content-Type":"application/json",Origin:origin,"CF-Connecting-IP":ip},body:JSON.stringify(value)});
test("inquiries persist validated private fields and rate limit", async () => {
 let writes=[]; const env={DB:{prepare(sql){assert.match(sql,/INSERT INTO business_inquiries/);return {bind(...values){return {async run(){writes.push(values);return {success:true}}}}}}}};
 assert.equal((await handleBusinessInquiry(req({...body,contact:""}),env)).status,400);
 assert.equal((await handleBusinessInquiry(req(body,"cross","https://other.test"),env)).status,403);
 const response=await handleBusinessInquiry(req(body,"same"),env);
 assert.equal(response.status,201);assert.deepEqual(await response.json(),{ok:true});assert.equal(writes.length,1);assert.ok(writes[0].includes(body.contact));
 assert.equal((await handleBusinessInquiry(req(body,"same"),env)).status,429);
});
test("failed database writes never report success",async()=>{
 assert.equal((await handleBusinessInquiry(req(),{DB:{prepare(){throw new Error("unavailable")}}})).status,503);
});
test("inbox requires admin and paginates",async()=>{
 const request=new Request("https://site.test/api/admin/business-inquiries?page=2");let queried=false;
 const env={DB:{prepare(){queried=true;return {bind(offset){assert.equal(offset,20);return {async all(){return {results:Array.from({length:21},(_,id)=>({id,contact:"private"}))}}}}}}}};
 const denied=await listBusinessInquiries(request,env,false);assert.equal(denied.status,401);assert.equal(queried,false);assert.equal(denied.headers.get("Cache-Control"),"no-store");
 const response=await listBusinessInquiries(request,env,true);const data=await response.json();assert.equal(data.items.length,20);assert.equal(data.hasMore,true);
});
