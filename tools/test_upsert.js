// Simple upsert smoke test for Apps Script exec endpoint
// Usage: node tools/test_upsert.js <EXEC_URL>
(async function(){
  const url = process.argv[2] || process.env.API_BASE;
  if(!url){ console.error('Usage: node tools/test_upsert.js <EXEC_URL>'); process.exit(2); }
  const exec = String(url).replace(/\/+$/,'');
  const testRec = { id: 'TEST_PUSH_' + Date.now(), ts: Date.now(), blokNo: 'SMOKE_TEST_' + Math.random().toString(36).slice(2,8), note: 'smoke test' };
  try{
    console.log('[test_upsert] POST', exec);
    const res = await fetch(exec, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert', record: testRec })
    });
    const txt = await res.text();
    try{
      const js = JSON.parse(txt);
      console.log('[test_upsert] OK JSON:');
      console.log(JSON.stringify(js, null, 2));
      process.exit(0);
    }catch(e){
      console.error('[test_upsert] Response not JSON (first 1k chars):');
      console.error(txt.slice(0,1024));
      process.exit(3);
    }
  }catch(e){ console.error('[test_upsert] failed', e); process.exit(1); }
})();
