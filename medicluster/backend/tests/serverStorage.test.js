const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase } = require('./helpers/supabaseTestDb');

test('server health checks Supabase readiness and storage failures return safe service errors',async t=>{
 await createTestDatabase(t);
 const app=require('../server');
 const previousStaffEmails=process.env.ALLOWED_STAFF_EMAILS;
 process.env.ALLOWED_STAFF_EMAILS='test@example.invalid';
 t.after(()=>{if(previousStaffEmails===undefined)delete process.env.ALLOWED_STAFF_EMAILS;else process.env.ALLOWED_STAFF_EMAILS=previousStaffEmails});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>{server.closeAllConnections();server.close()});
 const origin=`http://127.0.0.1:${server.address().port}`;
 const healthy=await fetch(origin+'/api/health');assert.equal(healthy.status,200);assert.equal((await healthy.json()).database,'supabase');
 const previous={SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY};
 delete process.env.SUPABASE_SECRET_KEY;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 try{
  const unavailable=await fetch(origin+'/api/health');assert.equal(unavailable.status,503);assert.equal((await unavailable.json()).database,'unavailable');
  t.mock.method(console,'error',()=>{});
  const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'test@example.invalid',password:'not-a-real-account'})});
  assert.equal(login.status,503);
  const body=await login.json();assert.match(body.error,/temporarily unavailable/i);assert.doesNotMatch(body.error,/test-service-role|secret|Internal server error/);
 }finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
});
