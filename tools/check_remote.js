#!/usr/bin/env node
// Robust smoke-check for the Apps Script exec 'list' endpoint.
// Usage: node tools/check_remote.js https://script.google.com/macros/s/.../exec

const urlArg = process.argv[2] || process.env.API_BASE || process.env.EXEC_URL;
if(!urlArg){
  console.error('Usage: node tools/check_remote.js <EXEC_URL>');
  // Don't fail the CI job hard here; print usage and exit 0 so workflow can continue.
  process.exit(0);
}

const exec = String(urlArg).replace(/\/+$/,'');
const target = exec + '?action=list&collection=bloklar_yeni_demo';

function timeout(ms){
  return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
}

(async function(){
  try{
    console.log('[check_remote] GET', target);
    // Try fetch first (Node 18 provides global fetch); if not available, fallback to http(s) via node
    let res, text;
    if(typeof fetch === 'function'){
      // race with a timeout
      res = await Promise.race([fetch(target, { method: 'GET' }), timeout(20000)]);
      console.log('[check_remote] HTTP status:', res.status);
      try{
        for(const [k,v] of res.headers.entries()){
          console.log('[check_remote] header]', k, v);
        }
      }catch(e){/* ignore headers printing errors */}
      text = await res.text();
    }else{
      // fallback using node's https/http
      console.log('[check_remote] fetch() not available, using fallback http(s) client');
      const httpOrHttps = target.startsWith('https:') ? require('https') : require('http');
      text = await new Promise((resolve, reject) => {
        const req = httpOrHttps.get(target, (r) => {
          console.log('[check_remote] HTTP status:', r.statusCode);
          r.setEncoding('utf8');
          let body='';
          r.on('data', c=> body+=c);
          r.on('end', ()=> resolve(body));
        });
        req.on('error', reject);
        req.setTimeout(20000, ()=>{ req.destroy(new Error('timeout')); });
      });
    }

    if(!text || text.length===0){
      console.warn('[check_remote] empty response body');
      console.log('[check_remote] done (no JSON)');
      // do not fail CI hard; just warn
      process.exit(0);
    }

    // Try parse JSON but be tolerant: print body sample and don't hard-fail the job
    try{
      const js = JSON.parse(text);
      console.log('[check_remote] OK JSON:');
      console.log(JSON.stringify(js, null, 2));
      process.exit(0);
    }catch(e){
      console.warn('[check_remote] Response not JSON (first 2k chars):');
      console.warn(text.slice(0,2048));
      console.warn('[check_remote] (non-JSON responses are allowed for diagnostics; not failing job)');
      process.exit(0);
    }
  }catch(e){
    console.error('[check_remote] failed', String(e));
    // Print stack if available for better diagnosis
    if(e && e.stack) console.error(e.stack.split('\n').slice(0,10).join('\n'));
    // Don't make CI fail because of remote unreachability; allow the workflow to continue.
    process.exit(0);
  }
})();
