#!/usr/bin/env node
// migrate_backup_to_remote_clean.js
// Clean migration script

const fs = require('fs').promises;
const path = require('path');

async function main(){
  const argv = process.argv.slice(2);
  if(argv.length === 0){
    console.error('Usage: node migrate_backup_to_remote_clean.js <backup.json> [--api BASE_URL] [--collection NAME] [--delay ms] [--dry-run]');
    process.exit(1);
  }
  const file = argv[0];
  let API_BASE = process.env.API_BASE || '';
  let collectionArg = null;
  let delay = 100;
  let dryRun = false;
  for(let i=1;i<argv.length;i++){
    const a = argv[i];
    if(a === '--api' && argv[i+1]){ API_BASE = argv[++i]; }
    else if(a === '--collection' && argv[i+1]){ collectionArg = argv[++i]; }
    else if(a === '--delay' && argv[i+1]){ delay = parseInt(argv[++i],10)||100; }
    else if(a === '--dry-run'){ dryRun = true; }
  }

  const raw = await fs.readFile(path.resolve(file), 'utf8');
  let parsed;
  try{ parsed = JSON.parse(raw); }catch(e){ console.error('Invalid JSON in', file); process.exit(2); }

  const tasks = [];
  if(Array.isArray(parsed)) tasks.push({collection: collectionArg || 'bloklar_yeni_demo', records: parsed});
  else if(typeof parsed === 'object' && parsed !== null){ for(const k of Object.keys(parsed)){ if(Array.isArray(parsed[k])) tasks.push({collection: k, records: parsed[k]}); }}
  else { console.error('Unsupported format'); process.exit(3); }

  console.log('Prepared', tasks.length, 'collections (dryRun=' + dryRun + ')');

  if(typeof fetch === 'undefined'){
    try{ global.fetch = (await import('node-fetch')).default; }catch(e){ console.error('Fetch missing; install node-fetch or use Node 18+'); process.exit(4); }
  }

  for(const t of tasks){
    console.log('Collection', t.collection, 'count', t.records.length);
    for(let i=0;i<t.records.length;i++){
      const rec = t.records[i];
      if(dryRun){ console.log('[dry]', t.collection, i+1, '/', t.records.length, rec && rec.id ? rec.id : '(no-id)'); continue; }
      if(!API_BASE){ console.error('No API_BASE'); process.exit(5); }
      try{
        const res = await fetch(API_BASE, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action: 'upsert', collection: t.collection, record: rec }) });
        const txt = await res.text();
        let j=null; try{ j=JSON.parse(txt); }catch(_){}
        console.log('[sent]', i+1, '/', t.records.length, 'status', res.status, j||txt.slice(0,200));
      }catch(e){ console.error('Send failed', e && e.message); }
      await new Promise(r=>setTimeout(r, delay));
    }
  }
  console.log('Done');
}

main().catch(e=>{ console.error(e && e.stack || e); process.exit(99); });
