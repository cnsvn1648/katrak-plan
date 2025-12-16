#!/usr/bin/env node
// migrate_resumable_upsert.js
// Robust, resumable migration script with idempotency, retries, and checkpointing.
// Usage: node tools/migrate_resumable_upsert.js <backup.json> [--api URL] [--collection NAME] [--delay ms] [--batch N] [--dry-run] [--checkpoint FILE] [--reset]

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

function now(){ return new Date().toISOString(); }

function uuid(){
  if(typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  try{ const { randomBytes } = require('crypto'); return randomBytes(16).toString('hex'); }catch(e){ return 'id-'+Date.now()+'-'+Math.floor(Math.random()*1000000); }
}

async function loadCheckpoint(file){
  try{ const txt = await fsp.readFile(file,'utf8'); return JSON.parse(txt||'{}'); }catch(e){ return {}; }
}

async function saveCheckpoint(file,obj){
  await fsp.writeFile(file, JSON.stringify(obj, null, 2), 'utf8');
}

async function main(){
  const argv = process.argv.slice(2);
  if(argv.length === 0){
    console.error('Usage: node migrate_resumable_upsert.js <backup.json> [--api URL] [--collection NAME] [--delay ms] [--batch N] [--dry-run] [--checkpoint FILE] [--reset]');
    process.exit(1);
  }
  const file = argv[0];
  let API_BASE = process.env.API_BASE || '';
  let collectionArg = null;
  let delay = 100;
  let batch = 1;
  let dryRun = false;
  let checkpointFile = path.resolve('.migrate_checkpoint.json');
  let reset = false;
  for(let i=1;i<argv.length;i++){
    const a = argv[i];
    if(a==='--api' && argv[i+1]) API_BASE = argv[++i];
    else if(a==='--collection' && argv[i+1]) collectionArg = argv[++i];
    else if(a==='--delay' && argv[i+1]) delay = parseInt(argv[++i],10)||100;
    else if(a==='--batch' && argv[i+1]) batch = Math.max(1, parseInt(argv[++i],10)||1);
    else if(a==='--dry-run') dryRun = true;
    else if(a==='--checkpoint' && argv[i+1]) checkpointFile = path.resolve(argv[++i]);
    else if(a==='--reset') reset = true;
  }

  if(reset){ try{ await fsp.unlink(checkpointFile); console.log('[checkpoint] removed', checkpointFile); }catch(e){} }

  const raw = await fsp.readFile(path.resolve(file),'utf8');
  let parsed;
  try{ parsed = JSON.parse(raw); }catch(e){ console.error('Invalid JSON in', file); process.exit(2); }

  const tasks = [];
  if(Array.isArray(parsed)) tasks.push({ collection: collectionArg||'bloklar_yeni_demo', records: parsed });
  else if(typeof parsed === 'object' && parsed !== null){
    for(const k of Object.keys(parsed)){ if(Array.isArray(parsed[k])) tasks.push({ collection: k, records: parsed[k] }); }
  } else { console.error('Unsupported backup format'); process.exit(3); }

  // prepare fetch
  if(typeof fetch === 'undefined'){
    try{ global.fetch = (await import('node-fetch')).default; }
    catch(e){ /* will check later */ }
  }

  const checkpoint = await loadCheckpoint(checkpointFile);

  console.log(now(), 'Prepared', tasks.length, 'collection(s). dryRun=', dryRun, 'checkpoint=', checkpointFile);

  for(const t of tasks){
    const coll = t.collection;
    const records = t.records || [];
    const total = records.length;
    if(total===0){ console.log('[skip]', coll, 'no records'); continue; }

    let last = checkpoint[coll] || 0; // index of last processed (exclusive)
    console.log(now(), 'Collection', coll, 'total=', total, 'resuming at index', last);

    for(let i=last;i<total; i+=batch){
      const end = Math.min(total, i+batch);
      const batchRecords = records.slice(i,end);
      for(let j=0;j<batchRecords.length;j++){
        const idx = i + j;
        let rec = batchRecords[j] || {};
        // ensure id for idempotency
        if(!rec.id && !rec._id){ rec.id = rec.id || rec._id || uuid(); }

        if(dryRun){ console.log('[dry]', coll, idx+1, '/', total, 'id=', rec.id); continue; }

        if(!API_BASE){ console.error('API_BASE not set. Use --api or set env API_BASE'); process.exit(5); }

        const maxAttempts = 5;
        let attempt = 0;
        let ok = false;
        let lastErr = null;
        while(attempt < maxAttempts && !ok){
          attempt++;
          try{
            const body = { action: 'upsert', collection: coll, record: rec };
            const res = await fetch(API_BASE, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
            const txt = await res.text();
            let jresp = null; try{ jresp = JSON.parse(txt); }catch(e){}
            if(res.ok){
              console.log('[sent]', coll, idx+1, '/', total, 'status=', res.status, 'id=', rec.id);
              ok = true;
            } else {
              lastErr = 'status='+res.status+' body='+ (jresp ? JSON.stringify(jresp).slice(0,200) : txt.slice(0,200));
              console.warn('[warn] attempt', attempt, 'failed for idx', idx, lastErr);
            }
          }catch(e){ lastErr = String(e); console.warn('[err] attempt', attempt, 'exception', e && e.message || e); }
          if(!ok){
            const backoff = Math.min(5000, 200 * Math.pow(2, attempt));
            await new Promise(r=>setTimeout(r, backoff));
          }
        }
        if(!ok){ console.error('[fail] giving up on idx', idx, 'after', maxAttempts, 'attempts. lastErr=', lastErr); process.exit(6); }

        // update checkpoint after each successful record
        checkpoint[coll] = idx+1;
        try{ await saveCheckpoint(checkpointFile, checkpoint); }catch(e){ console.warn('[checkpoint] failed to save', e && e.message); }

        // small delay
        await new Promise(r=>setTimeout(r, delay));
      }
    }

    console.log(now(), 'Collection', coll, 'completed. total processed=', checkpoint[coll] || 0);
  }

  console.log(now(), 'Migration finished.');
}

main().catch(e=>{ console.error('Fatal:', e && e.stack || e); process.exit(99); });
