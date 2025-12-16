#!/usr/bin/env node
// rollback_delete_ids.js
// Deletes records on the remote Apps Script by id. Default: dry-run (prints what would be deleted).
// Usage: node tools/rollback_delete_ids.js [--backup FILE] [--api URL] [--confirm] [--delay ms]

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

async function main(){
  const argv = process.argv.slice(2);
  let backup = null;
  let API_BASE = process.env.API_BASE || '';
  let dryRun = true;
  let delay = 100;
  for(let i=0;i<argv.length;i++){
    const a = argv[i];
    if(a==='--backup' && argv[i+1]) backup = argv[++i];
    else if(a==='--api' && argv[i+1]) API_BASE = argv[++i];
    else if(a==='--confirm') dryRun = false;
    else if(a==='--delay' && argv[i+1]) delay = parseInt(argv[++i],10)||100;
  }

  // default: find latest backup_full in tools/
  if(!backup){
    const files = fs.readdirSync(path.join(__dirname)).filter(f=> f.startsWith('backup_full_') && f.endsWith('.json'));
    if(files.length>0) backup = path.join(__dirname, files.sort().reverse()[0]);
  }

  if(!backup){ console.error('No backup specified and none found in tools/ (backup_full_*.json)'); process.exit(1); }
  if(!fs.existsSync(backup)){ console.error('Backup file not found:', backup); process.exit(2); }

  const raw = fs.readFileSync(backup,'utf8');
  let arr = [];
  try{ arr = JSON.parse(raw); }catch(e){ console.error('Failed to parse backup JSON', e && e.message); process.exit(3); }
  if(!Array.isArray(arr)){ console.error('Backup JSON not an array'); process.exit(4); }

  const ids = arr.map(r=> r && (r.id||r._id||r.record&&r.record.id) ).filter(Boolean);
  console.log('Found', ids.length, 'ids in backup. dryRun=', dryRun);

  if(dryRun){
    ids.forEach((id,i)=> console.log('[dry] will delete', i+1, '/', ids.length, id));
    console.log('\nTo actually delete, re-run with --confirm and --api <URL> or set API_BASE env var.');
    process.exit(0);
  }

  if(!API_BASE){ console.error('API_BASE not set. Use --api or set env API_BASE'); process.exit(5); }

  // ensure fetch
  if(typeof fetch === 'undefined'){
    try{ global.fetch = (await import('node-fetch')).default; }
    catch(e){ console.error('No global fetch and node-fetch not installed. Please use Node 18+ or install node-fetch.'); process.exit(6); }
  }

  for(let i=0;i<ids.length;i++){
    const id = ids[i];
    try{
      const res = await fetch(API_BASE, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action: 'delete', id }) });
      const txt = await res.text();
      let j=null; try{ j = JSON.parse(txt); }catch(_){ }
      console.log('[deleted]', i+1, '/', ids.length, id, 'status=', res.status, j||txt.slice(0,200));
    }catch(e){ console.error('[error] delete failed', id, e && e.message); }
    await new Promise(r=>setTimeout(r, delay));
  }

  console.log('Done.');
}

main().catch(e=>{ console.error('Fatal', e && e.stack || e); process.exit(99); });
