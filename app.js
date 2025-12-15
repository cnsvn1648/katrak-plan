"use strict";
// Defensive global fallbacks that run even if the main runAll() hasn't executed yet.
// These avoid ReferenceError in edge cases (file:// loads, partial execution, etc.).
try{
  if(typeof window !== 'undefined'){
    if(typeof window.safeHTML !== 'function'){
      window.safeHTML = function(strings){
        var result = '';
        for(var i=0;i<strings.length;i++){
          result += strings[i];
          if(i+1 < arguments.length){
            try{
              result += (typeof window.escapeHtml === 'function') ? window.escapeHtml(arguments[i+1]) : String(arguments[i+1]||'');
            }catch(e){ result += String(arguments[i+1]||''); }
          }
        }
        // Startup probe: when the page is opened from file:// (origin 'null'), perform a quick probe
        // and prefer the local proxy for the running session if it's reachable. This prevents
        // early fetches from trying the remote Apps Script URL and hitting CORS/404 errors.
        (async function(){
          try{
            if(typeof location !== 'undefined' && (location.protocol === 'file:' || String(location.origin) === 'null')){
              const ok = await probeLocalProxy(500);
              if(ok){
                try{ localStorage.setItem('v92_use_local_proxy','1'); }catch(_){ }
                // Override runtime GS_WEBAPP_URL to route through proxy for the session
                try{ GS_WEBAPP_URL = LOCAL_PROXY_URL; }catch(_){ }
                console.debug('[local_proxy] startup probe: local proxy reachable — using', LOCAL_PROXY_URL);
              }else{
                console.debug('[local_proxy] startup probe: local proxy NOT reachable');
              }
            }
          }catch(e){ console.debug('[local_proxy] startup probe error', e && e.message); }
        })();
        return result;
      };
    }
    // Prepare and enable remote-only helpers
    if(typeof window.prepareRemoteOnly !== 'function'){
      window.prepareRemoteOnly = async function(opts){
        opts = opts || {};
        const keys = Array.isArray(opts.keys) ? opts.keys : (function(){
          const out = [];
          try{
            if(typeof localStorage === 'undefined') return out;
            for(let i=0;i<localStorage.length;i++){
              try{
                const k = localStorage.key(i);
                if(!k) continue;
                // include keys that look relevant: blok*, v91_*, v92_*, __ls_backup_full__ etc.
                if(k.indexOf('blok')===0 || k.indexOf('v91_')===0 || k.indexOf('v92_')===0 || k.indexOf('__ls_backup')===0 || k.indexOf('bloklar')!==-1) out.push(k);
              }catch(_){ }
            }
          }catch(_){ }
          return out;
        })();

        const snap = { ts: Date.now(), keys: {}, keysList: keys.slice(0) };
        try{
          for(const k of keys){
            try{ snap.keys[k] = localStorage.getItem(k); }catch(_){ snap.keys[k] = null; }
          }
        }catch(_){ }

        // trigger download of the snapshot for safe-keeping
        try{
          if(typeof document !== 'undefined' && typeof Blob !== 'undefined'){
            const blob = new Blob([JSON.stringify(snap)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'remote_only_prep_' + snap.ts + '.json';
            document.body.appendChild(a);
            a.click();
            setTimeout(function(){ try{ URL.revokeObjectURL(url); a.parentNode && a.parentNode.removeChild(a); }catch(_){ } }, 600);
          }
        }catch(_){ }

        // best-effort: upload snapshot to remote collection so there's a server-side copy
        let remoteRes = null;
        try{
          if(window.REMOTE_ENABLED && typeof window.remoteUpsert === 'function'){
            try{ remoteRes = await window.remoteUpsert({ id: 'pre_remote_only_' + snap.ts, ts: snap.ts, type: 'pre_remote_only_snapshot', data: snap.keys }, 'pre_remote_only_backups'); }catch(e){ console.warn('[prepareRemoteOnly] remoteUpsert failed', e); }
          }
        }catch(_){ }

        return { ok:true, ts: snap.ts, keys: snap.keysList, remote: remoteRes };
      };
    }

    if(typeof window.enableRemoteOnly !== 'function'){
      window.enableRemoteOnly = async function(opts){
        opts = opts || {};
        // create snapshot (download + remote upload)
        const prep = await (typeof window.prepareRemoteOnly === 'function' ? window.prepareRemoteOnly(opts) : { ok:false });
        try{ if(localStorage && localStorage.setItem){ localStorage.setItem('v92_gs_use_remote','1'); localStorage.setItem('v92_gs_remote_only_enabled', String(Date.now())); } }catch(_){ }
        try{ window.REMOTE_ENABLED = true; window.FORCE_REMOTE_ONLY = true; window.ALLOW_FILE_ORIGIN_REMOTE = true; }catch(_){ }
        try{ window.showToast && window.showToast('Remote-only enabled (snapshot ' + (prep && prep.ts ? prep.ts : 'none') + ')'); }catch(_){ }
        return prep;
      };
    }

    if(typeof window.downloadFullLocalSnapshot !== 'function'){
      window.downloadFullLocalSnapshot = function(){
        try{
          if(typeof localStorage === 'undefined' || typeof document === 'undefined') return { ok:false };
          const obj = {};
          for(let i=0;i<localStorage.length;i++){
            try{ const k = localStorage.key(i); obj[k] = localStorage.getItem(k); }catch(_){ }
          }
          const ts = Date.now();
          const blob = new Blob([JSON.stringify({ ts: ts, data: obj })], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = 'local_full_snapshot_' + ts + '.json'; document.body.appendChild(a); a.click(); setTimeout(function(){ try{ URL.revokeObjectURL(url); a.parentNode && a.parentNode.removeChild(a); }catch(_){ } }, 600);
          return { ok:true, ts: ts };
        }catch(e){ console.warn('downloadFullLocalSnapshot failed', e); return { ok:false, error: String(e) }; }
      };
    }

    // If running from file://, allow file-origin postMessage handling by default to
    // reduce noisy console rejections during local dev. This is safe for local dev
    // but should NOT be used in production. We log a warning to remind developers.
    try{
      if(typeof location !== 'undefined' && String(location.protocol) === 'file:'){
        window._ALLOW_FILE_ORIGIN = true;
        console.warn('[ensar] running in file:// mode — enabling _ALLOW_FILE_ORIGIN to reduce postMessage rejections. Serve files over http(s) for production.');
      }
    }catch(_){ }
  }
}catch(_){ }
/**
 * Ensar Office - App
 * Bu dosya: uygulamanın ana modülleri (dosyadaki BODY scriptleri sırasıyla taşındı).
 * Not: Hepsi tek seferde DOM hazır olduktan sonra çalıştırılır.
 */
(function(){
  function runAll(){
    
    /* ==== BODY inline script #1 ==== */
    // Ensure a robust global numeric parser exists early to avoid ReferenceError in late-loaded modules.
      // Global fallbacks to prevent runtime errors when optional helpers are missing
      try{ if(typeof window.showToast !== 'function'){ window.showToast = function(msg){ try{ console.log('[toast]', msg); }catch(e){ console.error(e); } }; } }catch(e){ console.error(e); }
      try{ if(typeof window.renderYarmaList !== 'function'){ window.renderYarmaList = function(){ /* noop fallback */ }; } }catch(e){ console.error(e); }
      try{ if(typeof window.showUndoChip !== 'function'){ window.showUndoChip = function(){ /* noop fallback */ }; } }catch(e){ console.error(e); }
      
      if(typeof window.num !== 'function'){
        window.num = function(v){
          if(v===undefined||v===null||v==='') return NaN;
          const s = String(v).trim();
          if(s.indexOf('.') !== -1 && s.indexOf(',') !== -1){ return parseFloat(s.replace(/\./g,'').replace(',','.')); }
          if(s.indexOf(',') !== -1){ return parseFloat(s.replace(',','.')); }
          return parseFloat(s);
        };
      }
      // Automatic migration helper: push localStorage bloklar to remote Apps Script when REMOTE_ENABLED
      try{
        window.migrateLocalBlocksToRemote = async function(){
          try{
            if(!window.REMOTE_ENABLED) return false;
            const key = window.BL_KEY || 'bloklar_yeni_demo';
            let raw = null;
            try{ raw = localStorage.getItem(key); }catch(_){ raw = null; }
            if(!raw) return false;
            let localArr = [];
            try{ localArr = JSON.parse(raw||'[]'); }catch(_){ localArr = []; }
            if(!Array.isArray(localArr) || localArr.length === 0) return false;
            // fetch existing remote list
            let remoteArr = [];
            try{ remoteArr = await getBloklar(); }catch(_){ remoteArr = []; }
            const existingNos = new Set((remoteArr||[]).map(r=> String((r && r.blokNo)||r.id||'').trim().toLowerCase()).filter(Boolean));
            // backup local
            try{ localStorage.setItem(key + '_pre_migrate_' + Date.now(), raw); }catch(_){ }
            // upsert missing items
            for(const rec of localArr){
              try{
                const no = String((rec && rec.blokNo)||'').trim().toLowerCase();
                if(no && existingNos.has(no)) continue; // skip duplicates
                if(typeof window.remoteUpsert === 'function'){
                  try{
                    const sendRec = (typeof sanitizeRecord === 'function') ? sanitizeRecord(rec) : rec;
                    const res = await window.remoteUpsert(sendRec);
                    const newId = res && (res.id || (res.data && res.data.id) || (res.result && res.result.id));
                    if(newId) rec.id = newId;
                  }catch(e){ console.error('[migrate] remoteUpsert failed for', rec && rec.blokNo, e); }
                }
              }catch(_){ }
            }
            // refresh remote list and persist locally as cache
            try{ const refreshed = await getBloklar(); localStorage.setItem(key, JSON.stringify(refreshed||[])); window._blokCache = Array.isArray(refreshed)?refreshed:[]; }catch(e){ console.error('[migrate] refresh failed', e); }
            console.info('[migrate] local->remote migration attempted; backup saved to', key + '_pre_migrate_' + Date.now());
            return true;
          }catch(e){ console.error('[migrate] failed', e); return false; }
        };
        // Run migration once on startup when remote is enabled
        try{ if(window.REMOTE_ENABLED){ window.migrateLocalBlocksToRemote().catch(function(e){ console.error('[migrate] auto migration error', e); }); } }catch(_){ }
      }catch(_){ }
      // Replace global fetch monkey-patch with a concise `remoteFetch` wrapper.
      // `remoteFetch(url, opts)` rewrites a small set of legacy local-proxy paths
      // to the configured Apps Script exec endpoint when appropriate, and
      // otherwise forwards to the native fetch. This keeps the runtime surface
      // small and avoids permanently replacing window.fetch.
      try{
        window.remoteFetch = window.remoteFetch || (async function(input, init){
          // bind native fetch once
          var nativeFetch = (typeof window.fetch === 'function') ? window.fetch.bind(window) : null;
          if(!nativeFetch) throw new Error('fetch not available');
          try{
            var url = (typeof input === 'string') ? input : (input && input.url) || '';
            var exec = (window.API_BASE && String(window.API_BASE).replace(/\/+$/,'')) || (localStorage && localStorage.getItem && localStorage.getItem('v92_gs_webapp_url')) || '';
            // If exec isn't an Apps Script-like URL, just forward
            var isAppsScript = !!(exec && (/script.google.com\/macros\/s\//.test(exec) || exec.indexOf('/exec') !== -1));
            // Avoid rewriting when exec points to localhost (explicit local proxy case)
            try{ if(String(exec).indexOf('http://localhost') === 0) isAppsScript = false; }catch(_){ }

            if(url && isAppsScript){
              // Relative /db/blocks -> Apps Script list for bloklar_yeni_demo
              if(url.match(/(^|\/)db\/blocks(\?|$|\/)/)){
                var target = exec + '?action=list&collection=bloklar_yeni_demo';
                return nativeFetch(target, Object.assign({}, init || {}, { credentials: 'same-origin' }));
              }
              // /db/blocks/<id> -> get record by id
              var m = String(url).match(/\/?db\/blocks\/(?:record\/)?([^\/\?#]+)/);
              if(m && m[1]){
                var id = encodeURIComponent(m[1]);
                var t2 = exec + '?action=get&collection=bloklar_yeni_demo&id=' + id;
                return nativeFetch(t2, Object.assign({}, init || {}, { credentials: 'same-origin' }));
              }
            }
          }catch(_){ /* fallthrough to native fetch */ }
          return (typeof nativeFetch === 'function') ? nativeFetch(input, init) : (window.fetch ? window.fetch(input, init) : Promise.reject(new Error('fetch unavailable')));
        });

        // Small bootstrap: if remoteListAndReplaceLocal becomes available shortly,
        // call it once to hydrate localStorage so synchronous render paths can read cached data.
        (function tryCallRemoteSyncOnce(){
          try{
            var _try = function(){
              try{ if(typeof window.remoteListAndReplaceLocal === 'function'){ window.remoteListAndReplaceLocal().catch(function(e){ console.warn('[ensar] initial remote sync failed', e); }); return true; } }catch(_){ }
              return false;
            };
            if(!_try()){
              var _i = setInterval(function(){ if(_try()){ clearInterval(_i); } }, 300);
              setTimeout(function(){ try{ clearInterval(_i); }catch(_){ } }, 10000);
            }
          }catch(_){ }
        })();
      }catch(_){ }

      // Full remote-only migration helper (use when you want to make Apps Script canonical)
      // Usage (in browser console):
      //   performFullRemoteMigration({ clearLocalAfter: false })
      // Returns: { ok:true, backedUpKeys: [...], migratedCount: N }
      if(typeof window.performFullRemoteMigration !== 'function'){
        window.performFullRemoteMigration = async function(opts){
          opts = opts || {};
          const clearLocalAfter = !!opts.clearLocalAfter;
          const keysToBackup = [];
          try{
            // Determine canonical blok keys we may want to backup/migrate
            const baseKeys = [ (typeof window.BL_KEY !== 'undefined' && window.BL_KEY) ? window.BL_KEY : 'bloklar_yeni_demo', 'bloklar', 'v91_sayalanmis_bloklar', 'v92_sayalanmis_bloklar' ];
            baseKeys.forEach(k=>{ try{ if(localStorage.getItem && localStorage.getItem(k) !== null) keysToBackup.push(k); }catch(_){ } });
          }catch(_){ }

          const backupMap = {};
          try{
            const ts = Date.now();
            for(const k of keysToBackup){
              try{
                const raw = localStorage.getItem(k);
                const bk = k + '_preRemoteBackup_' + ts;
                localStorage.setItem(bk, raw === null ? '' : raw);
                backupMap[k] = bk;
              }catch(e){ console.warn('[performFullRemoteMigration] backup failed for', k, e); }
            }
          }catch(_){ }

          // Attempt migration using existing helper
          let migrated = 0;
          try{
            const ok = await (typeof window.migrateLocalBlocksToRemote === 'function' ? window.migrateLocalBlocksToRemote() : false);
            if(ok){
              // best-effort: count migrated items from refreshed cache
              try{ const refreshed = await (typeof window.getBloklar === 'function' ? window.getBloklar() : []); migrated = Array.isArray(refreshed) ? refreshed.length : 0; }catch(_){ }
            }
          }catch(e){ console.error('[performFullRemoteMigration] migrate failed', e); }

          // Enable remote-only flags and persist choice
          try{
            try{ localStorage.setItem('v92_gs_use_remote', '1'); }catch(_){ }
            window.REMOTE_ENABLED = true;
            window.FORCE_REMOTE_ONLY = true;
          }catch(_){ }

          // Optionally clear local keys (only if explicitly requested)
          const cleared = [];
          if(clearLocalAfter){
            try{
              for(const k of keysToBackup){
                try{ localStorage.removeItem(k); cleared.push(k); }catch(_){ }
              }
            }catch(_){ }
          }

          console.info('[performFullRemoteMigration] finished. backups:', backupMap, 'migratedCount=', migrated, 'cleared=', cleared);
          return { ok: true, backedUpKeys: backupMap, migratedCount: migrated, clearedKeys: cleared };
        };
      }
      // Sanitize a small whitelist of known storage keys that should contain JSON arrays/objects.
      // We avoid touching one-off sentinel/flag keys (eg. v92_imported_seed_bloklar) by using an explicit list.
      (function sanitizeKnownBlokKeys(){
        try{
          // Canonical keys we expect to hold JSON arrays/objects. If you add a new persistent
          // blok store, put it here. Keep this list conservative to avoid removing flags.
          const known = new Set([
            (typeof window.BL_KEY !== 'undefined' && window.BL_KEY) ? window.BL_KEY : 'bloklar_yeni_demo',
            'bloklar',
            'v91_sayalanmis_bloklar',
            'v92_sayalanmis_bloklar'
          ]);

          known.forEach(k=>{
            try{
              if(localStorage.getItem(k) === null) return; // not present
              const v = localStorage.getItem(k) || '';
              if(typeof v !== 'string') return;
              const s = v.trim();
              // If it looks like JSON object/array, assume ok
              if(s[0] === '{' || s[0] === '[') return;
              // If very short (likely a sentinel like 'done' or 'true'), try JSON.parse to be safe
              if(s.length < 64){
                try{ JSON.parse(s); return; }catch(_){
                  // Instead of deleting potentially useful sentinel/flag values, migrate them
                  // to a namespaced key so they aren't lost but also won't break JSON consumers.
                  try{
                    const safeKey = 'v92_flag_' + k;
                    localStorage.setItem(safeKey, v);
                    localStorage.removeItem(k);
                    console.warn('[sanitizeKnownBlokKeys] migrated short non-JSON value for', k, '->', safeKey);
                  }catch(_){
                    try{ localStorage.removeItem(k); console.warn('[sanitizeKnownBlokKeys] removed invalid non-JSON value for', k); }catch(__){ }
                  }
                }

                    // If user gave explicit consent to enable remote-only (admin action), set persistent flags here.
                    // This writes safe, reversible markers into localStorage and sets runtime flags so the current
                    // page switches to remote-first/remote-only behavior immediately.
                    try{
                      if(typeof localStorage !== 'undefined'){
                        // Do not override an existing explicit remote-only marker
                        if(!localStorage.getItem('v92_gs_remote_only_enabled')){
                          try{
                            localStorage.setItem('v92_gs_use_remote','1');
                            localStorage.setItem('v92_gs_remote_only_enabled', String(Date.now()));
                            if(window.API_BASE) try{ localStorage.setItem('v92_gs_webapp_url', window.API_BASE); }catch(_){ }
                            window.REMOTE_ENABLED = true;
                            window.FORCE_REMOTE_ONLY = true;
                            window.ALLOW_FILE_ORIGIN_REMOTE = true;
                            console.info('[ensar] remote-only flags set by admin approval');
                          }catch(_){ /* ignore write errors */ }
                        }
                      }
                    }catch(_){ }

              }
            }catch(_){ }
          });
        }catch(_){ }
      })();
      // Global number formatter with up to 3 fraction digits (tr-TR locale)
      if(typeof window.nf3 !== 'object' || typeof window.nf3.format !== 'function'){
        window.nf3 = { format: function(v){ try{ const n = Number(v)||0; return n.toLocaleString('tr-TR', { minimumFractionDigits:0, maximumFractionDigits:3 }); } catch(e){ return String(v); } } };
      }
      // Zero-pad helper for hh:mm etc.
      if(typeof window.pad2 !== 'function'){
      window.pad2 = function(n){ try{ const v = Math.floor(Number(n)); return String(isNaN(v)?0:v).padStart(2,'0'); } catch(e){ console.error(e); return String(n).padStart(2,'0'); } };
      }
      // Küçük debounce yardımcı fonksiyonu (varsayılan 250ms)
      if(typeof window.debounce !== 'function'){
        window.debounce = function(fn, wait){
      let t; return function(){ const ctx=this, args=arguments; clearTimeout(t); t=setTimeout(function(){ try{ fn.apply(ctx,args); }catch(e){ console.error(e); } }, wait||250); };
        };
      }
      // Basic HTML-escape helper to avoid XSS when inserting user-controlled strings into HTML.
      // Use escapeHtml(s) before constructing html with string concatenation.
      if(typeof window.escapeHtml !== 'function'){
        window.escapeHtml = function(s){
          try{
            if(s === undefined || s === null) return '';
            return String(s).replace(/[&<>"]|'/g, function(m){
              return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
            });
      }catch(e){ console.error(e); return String(s||''); }
        };
      }
      // Tagged template helper to safely interpolate values into HTML snippets.
      // Usage: el.innerHTML = safeHTML`<td>${value}</td><td>${other}</td>`;
      if(typeof window.safeHTML !== 'function'){
        window.safeHTML = function(strings){
          var result = '';
          for(var i=0;i<strings.length;i++){
            result += strings[i];
            if(i+1 < arguments.length){
              try{ result += escapeHtml(arguments[i+1]); }catch(e){ console.error(e); result += String(arguments[i+1]||''); }
            }
          }
          return result;
        };
      }
      // Tekil ve tutarlı cm^2 -> m^2 hesaplayıcı (mm/cm destekli)
      // Kullanım: cm2_to_m2(en, boy, adet)
      // Kurallar:
      // - Metinde açıkça 'mm' geçiyorsa mm kabul edilir (mm*mm / 1,000,000)
      // - Sayı >= 1000 ise muhtemelen mm girilmiştir; mm olarak işlenir
      // - Aşırı büyük değerler (>= 10000) şüpheli; NaN döner ve kullanıcı düzeltir
      // - Diğer durumlarda cm kabul edilir (cm*cm / 10,000)
      if(typeof window.cm2_to_m2 !== 'function'){
        window.cm2_to_m2 = function(en, boy, adet){
          try{
            function parseDim(v){
              if(v===undefined||v===null||v==='') return { n: NaN, s: '' };
              const s = String(v).trim();
              const m = s.replace(/\s+/g,'').replace(',', '.').match(/([0-9]+(?:\.[0-9]+)?)/);
              const n = m ? parseFloat(m[1]) : NaN;
              return { n, s };
            }
            const de = parseDim(en); const db = parseDim(boy);
            if(isNaN(de.n) || isNaN(db.n)) return NaN;
            let enVal = de.n, boyVal = db.n;
            const enLooksMm = /mm\b/i.test(de.s) || /millim/i.test(de.s) || (enVal >= 1000);
            const boyLooksMm = /mm\b/i.test(db.s) || /millim/i.test(db.s) || (boyVal >= 1000);
            if(enVal >= 10000 || boyVal >= 10000){
              console.warn('Boyut çok büyük görünüyor, birimleri kontrol edin (cm/mm):', enVal, boyVal);
              return NaN;
            }
            const per = (enLooksMm || boyLooksMm) ? (enVal * boyVal) / 1000000 : (enVal * boyVal) / 10000;
            const a = parseInt(String(adet||'0'), 10);
            return per * (isNaN(a)?0:a);
          }catch(e){ return NaN; }
        };
      }
      // Bloklar storage helpers made available early for all modules
      // REMOTE-ONLY mode: fetch and persist via API_BASE (Google Apps Script exec URL or proxy)
      // JSONP helper (used as fallback when direct fetch to Apps Script is blocked by CORS)
  if(typeof window._jsonpRequest !== 'function'){
        // JSONP is potentially dangerous and is disabled by default.
        // Enable by setting window._ALLOW_JSONP = true explicitly in trusted environments.
        try{
          // If running from file:// or origin null (local dev), auto-enable JSONP to avoid CORS issues.
          var _locProto = (typeof location !== 'undefined' && location && String(location.protocol));
          if(_locProto === 'file:' || String(location.origin) === 'null'){
            window._ALLOW_JSONP = true;
          } else {
            window._ALLOW_JSONP = (typeof window._ALLOW_JSONP === 'undefined') ? false : !!window._ALLOW_JSONP;
          }
        }catch(_){ window._ALLOW_JSONP = (typeof window._ALLOW_JSONP === 'undefined') ? false : !!window._ALLOW_JSONP; }
        window._jsonpRequest = function(url, timeout){
          timeout = typeof timeout === 'number' ? timeout : 15000;
          return new Promise(function(resolve, reject){
            try{
              if(!window._ALLOW_JSONP){
                // JSONP disabled: resolve with null so callers silently skip JSONP fallback.
                try{ resolve(null); }catch(_){ }
                return;
              }
              const cbName = '__jsonp_cb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
              let timer = null;
              window[cbName] = function(data){
                cleanup();
                resolve(data);
              };
              function cleanup(){
                try{ if(timer) clearTimeout(timer); }catch(_){ }
                try{ delete window[cbName]; }catch(_){ }
                try{ if(script && script.parentNode) script.parentNode.removeChild(script); }catch(_){ }
              }
              const script = document.createElement('script');
              script.async = true;
              script.onerror = function(){ cleanup(); reject(new Error('JSONP script error')); };
              // append callback param
              const sep = url.indexOf('?') === -1 ? '?' : '&';
              script.src = url + sep + 'callback=' + encodeURIComponent(cbName);
              document.head.appendChild(script);
              timer = setTimeout(function(){ cleanup(); reject(new Error('JSONP timeout')); }, timeout);
            }catch(err){ try{ reject(err); }catch(_){ } }
          });
        };
      }

      // Security helpers
      try{
        // Require GS_WEBAPP_URL to be HTTPS by default. Set window._ALLOW_INSECURE_GS = true to opt-in (not recommended).
        window._REQUIRE_HTTPS_GS = (typeof window._REQUIRE_HTTPS_GS === 'undefined') ? true : !!window._REQUIRE_HTTPS_GS;
        window._ALLOW_INSECURE_GS = (typeof window._ALLOW_INSECURE_GS === 'undefined') ? false : !!window._ALLOW_INSECURE_GS;
        window._isApiBaseAllowed = function(base){
          try{
            if(!base) return false;
            const s = String(base).trim();
            if(s.indexOf('http://') === 0){
              // Only allow http when explicitly permitted
              return !!window._ALLOW_INSECURE_GS;
            }
            if(s.indexOf('https://') === 0) return true;
            // allow non-http (file:, data:) only when explicitly allowed via flags
            return false;
          }catch(_){ return false; }
        };

        // Log rejected postMessage attempts for admin inspection (stored in localStorage key 'v91_sync_rejections')
        window._logSyncRejection = function(origin, msg){
          try{
            const key = 'v91_sync_rejections';
            let arr = [];
            try{ arr = JSON.parse(localStorage.getItem(key) || '[]') || []; }catch(_){ arr = []; }
            const entry = { ts: Date.now(), origin: origin, msg: (typeof msg === 'string' ? msg : (typeof msg === 'object' ? (msg.type||msg.action||JSON.stringify(msg).slice(0,200)) : String(msg))) };
            arr.push(entry);
            // keep size bounded
            if(arr.length > 200) arr = arr.slice(arr.length - 200);
            try{ localStorage.setItem(key, JSON.stringify(arr)); }catch(_){ }
            try{ console.warn('[postMessage] rejected from', origin, entry); }catch(_){ }
          }catch(_){ }
        };
        // Log skipped JSONP attempts so admins can inspect when JSONP fallback was intentionally disabled
        window._logSkippedJsonp = function(url, context){
          try{
            const key = 'v91_skipped_jsonp';
            let arr = [];
            try{ arr = JSON.parse(localStorage.getItem(key) || '[]') || []; }catch(_){ arr = []; }
            const entry = { ts: Date.now(), url: String(url||''), context: String(context||'') };
            arr.push(entry);
            if(arr.length > 200) arr = arr.slice(arr.length - 200);
            try{ localStorage.setItem(key, JSON.stringify(arr)); }catch(_){ }
            try{ console.info('[JSONP] skipped', entry); }catch(_){ }
          }catch(_){ }
        };
      }catch(_){ }

      // FORCE: Remote-only operation flags
      // If you want the app to always use Apps Script as the source-of-truth and
      // avoid any localStorage persistence, enable these defaults here. This is a
      // minimal, reversible change: it sets the 'v92_gs_use_remote' flag and
      // exposes runtime flags that other parts of the app consult.
      try{
        // Do NOT force remote usage automatically. Determine remote usage only when an API_BASE/GS_WEBAPP_URL
        // is explicitly configured and allowed by policy. This avoids surprising behavior in local/dev environments.
        window.FORCE_REMOTE_ONLY = false;
        window.FORCE_ALLOW_DELETE = false;
        // Derive API base from known sources but do not override existing values stored by the user.
        window.API_BASE = window.API_BASE || window.GS_WEBAPP_URL || (localStorage.getItem ? localStorage.getItem('v92_gs_webapp_url') : null) || '';
        // Evaluate whether remote usage should be enabled (read-only flag). This does not overwrite localStorage flags.
        try{
          if(window.API_BASE && typeof window._isApiBaseAllowed === 'function' && window._isApiBaseAllowed(window.API_BASE)){
            window.REMOTE_ENABLED = true;
          } else {
            window.REMOTE_ENABLED = false;
          }
        }catch(_){ window.REMOTE_ENABLED = false; }
        console.info('[ensar] REMOTE_ENABLED=', !!window.REMOTE_ENABLED, 'API_BASE=', window.API_BASE);
        // If an explicit Apps Script URL was provided by the developer/user, use it as a sensible default.
        try{
          if(!window.API_BASE){
            // Default provided by the developer (Apps Script WebApp)
            window.API_BASE = 'https://script.google.com/macros/s/AKfycbyswQY4spmwSNzMWPNWWPkHXO-yM-CilKbh0aNry917XOVeqGjq7mcXC8pZq8d-awfFrQ/exec';
            try{ if(typeof window._isApiBaseAllowed === 'function' && !window._isApiBaseAllowed(window.API_BASE)){ console.warn('[ensar] provided API_BASE refused by policy'); } else { window.REMOTE_ENABLED = true; } }catch(_){ }
            console.info('[ensar] API_BASE defaulted to provided Apps Script URL');
          }
        }catch(_){ }
        // If remote is enabled by detection, set the saved preference so subsequent
        // page loads prefer the remote backend. We also record a non-destructive
        // 'remote preferred' marker to localStorage so admins can see the change.
        try{
          if(window.REMOTE_ENABLED){
            try{ localStorage.setItem('v92_gs_webapp_url', String(window.API_BASE || '')); }catch(_){ }
            try{ localStorage.setItem('v92_gs_use_remote', '1'); }catch(_){ }
            try{ localStorage.setItem('v92_gs_remote_preferred_at', String(Date.now())); }catch(_){ }
            console.info('[ensar] automatic preference: remote backend preferred and persisted to localStorage');
          }
        }catch(_){ }
        // If API_BASE uses http://localhost for a local proxy, allow insecure for this session (explicit local dev case)
        try{ if(window.API_BASE && String(window.API_BASE).indexOf('http://localhost') === 0){ window._ALLOW_INSECURE_GS = true; } }catch(_){ }
        // Ensure GS_WEBAPP_URL (used by many helper functions) reflects the chosen API_BASE.
        try{ if(window.API_BASE && (!window.GS_WEBAPP_URL || window.GS_WEBAPP_URL.indexOf('REPLACE')===0)){ GS_WEBAPP_URL = window.API_BASE; } else { GS_WEBAPP_URL = window.API_BASE || window.GS_WEBAPP_URL || (localStorage.getItem && localStorage.getItem('v92_gs_webapp_url')) || GS_WEBAPP_URL || ''; } }catch(_){ }
      }catch(_){ }

      // Sanitize API_BASE/GS_WEBAPP_URL values that may include placeholder tokens
      try{
        function _looksLikePlaceholder(s){ try{ if(!s) return true; const str=String(s||'').trim(); if(!str) return true; if(str.indexOf('<')!==-1 || str.indexOf('>')!==-1) return true; if(/YOUR_|SENIN|<YOUR|<SENİN|TEMPLATE/i.test(str)) return true; return false; }catch(_){ return true; } }
        // Sanitize window.API_BASE
        try{
          if(_looksLikePlaceholder(window.API_BASE)){
            console.warn('[ensar] detected placeholder/invalid API_BASE — clearing');
            window.API_BASE = '';
          }
        }catch(_){ }
        // Sanitize window.GS_WEBAPP_URL
        try{
          if(_looksLikePlaceholder(window.GS_WEBAPP_URL)){
            window.GS_WEBAPP_URL = '';
          }
        }catch(_){ }
        // Sanitize saved localStorage value
        try{
          if(localStorage && localStorage.getItem){ const v = localStorage.getItem('v92_gs_webapp_url'); if(_looksLikePlaceholder(v)){ try{ localStorage.removeItem('v92_gs_webapp_url'); console.warn('[ensar] removed placeholder v92_gs_webapp_url from localStorage'); }catch(_){ } } }
        }catch(_){ }
      }catch(_){ }

      if(typeof window.getBloklar !== 'function'){
        window.getBloklar = async function(){
          try{
            // Prefer explicit API_BASE, fall back to window.GS_WEBAPP_URL, then to saved localStorage value.
            const base = window.API_BASE || window.GS_WEBAPP_URL || localStorage.getItem('v92_gs_webapp_url');
            if(!base){
              console.warn('[getBloklar] API base not configured (window.API_BASE or window.GS_WEBAPP_URL or localStorage v92_gs_webapp_url)');
              return [];
            }
            // Enforce HTTPS for remote Apps Script endpoints unless explicitly allowed.
            try{ if(typeof window._isApiBaseAllowed === 'function' && !window._isApiBaseAllowed(base)){ console.warn('[getBloklar] API base refused by security policy (non-HTTPS):', base); return []; } }catch(_){ }
            // If API_BASE points to our local dev proxy with /db, use the simpler local DB endpoints
            const isLocalDb = (String(base).indexOf('localhost:3001') !== -1 || String(base).indexOf('127.0.0.1:3001') !== -1
                              || String(base).indexOf('localhost:3000') !== -1 || String(base).indexOf('127.0.0.1:3000') !== -1
                              || String(base).indexOf('/db/blocks') !== -1);
            if(isLocalDb){
              try{
                const listUrl = (String(base).endsWith('/') ? base.slice(0,-1) : base) + '/db/blocks';
                // Use safe JSON fetch helper to avoid noisy JSON parse errors when upstream sends HTML
                let body;
                try{
                  body = await window._fetchJsonOrExplain(listUrl, { method: 'GET', mode: 'cors' });
                }catch(err){
                  // bubble up to outer catch so GS_WEBAPP_URL fallback can run as before
                  console.error('[getBloklar] local db fetch failed or returned non-JSON', err && err.details ? err.details : (err && err.message));
                  throw err;
                }
                const arr = body && (Array.isArray(body.blocks) ? body.blocks : (Array.isArray(body.data) ? body.data : []));
                try{ window._blokCache = Array.isArray(arr) ? arr : []; }catch(_){ }
                return Array.isArray(arr) ? arr : [];
              }catch(err){
                console.error('[getBloklar] local db fetch failed', err);
                // Fallback: if Apps Script URL is configured, try fetching list from there
                try{
                  if(typeof GS_WEBAPP_URL === 'string' && GS_WEBAPP_URL){
                    const gsUrl = (String(GS_WEBAPP_URL).endsWith('/') ? GS_WEBAPP_URL.slice(0,-1) : GS_WEBAPP_URL) + '?action=list';
                    try{
                        const body2 = await window._fetchJsonOrExplain(gsUrl, { method: 'GET', mode: 'cors' });
                        const raw2 = body2 && (Array.isArray(body2.data) ? body2.data : (Array.isArray(body2.items) ? body2.items : []));
                        const arr2 = (function normalizeServerList(rawArr){
                          try{
                            if(!Array.isArray(rawArr)) return [];
                            const first = rawArr[0];
                            const looksLikeRows = first && (first.key !== undefined || first.id !== undefined) && (first.record !== undefined || first.value !== undefined);
                            if(looksLikeRows){
                              const wantKey = String(window.BL_KEY || 'bloklar');
                              for(const row of rawArr){
                                const k = String(row.key || row.id || '');
                                const rec = row.record || row.value || null;
                                const val = rec && rec.value !== undefined ? rec.value : (rec || null);
                                if(k === wantKey && Array.isArray(val)) return val;
                                if(Array.isArray(val)) return val;
                                if(Array.isArray(rec)) return rec;
                              }
                              return [];
                            }
                            return rawArr.filter(it=>{
                              try{
                                const idish = String((it && (it.blokNo || it.id || it.ID || it.Id))||'');
                                if(!idish) return true;
                                if(idish.indexOf('lock::') === 0) return false;
                                if(idish.indexOf('audit::') === 0) return false;
                                return true;
                              }catch(_){ return true; }
                            });
                          }catch(_){ return Array.isArray(rawArr)?rawArr:[]; }
                        })(raw2);
                        try{ window._blokCache = Array.isArray(arr2) ? arr2 : []; }catch(_){ }
                        return Array.isArray(arr2) ? arr2 : [];
                    }catch(_){ /* ignore gs fetch error and fall through */ }
                  }
                }catch(_){ }
                return [];
              }
            }
            const url = (String(base).endsWith('/') ? base.slice(0,-1) : base) + '?action=list';
            // If remote writes/reads are not explicitly enabled (or we're running from file:// / origin null)
            // prefer showing localStorage data if available so UI doesn't hide recently added items.
            try{
              const lsFlag = (localStorage.getItem && localStorage.getItem('v92_gs_use_remote') === '1');
              const originNull = (typeof location !== 'undefined' && (location.protocol === 'file:' || String(location.origin) === 'null'));
              const forceJsonp = !!(window.GS_FORCE_JSONP);
              // Allow remote usage from file:// when explicitly requested via runtime flag.
              const allowFileOriginRemote = !!window.ALLOW_FILE_ORIGIN_REMOTE || !!window.FORCE_REMOTE_ONLY;
              // Prefer explicit REMOTE_ENABLED (set above if API_BASE is trusted). Otherwise fall back to localStorage flag and other heuristics.
              const useRemote = !!window.REMOTE_ENABLED || (lsFlag && (!originNull || allowFileOriginRemote) && !forceJsonp);
              if(!useRemote){
                try{
                  const key = window.BL_KEY || 'bloklar_yeni_demo';
                  const raw = localStorage.getItem(key);
                  if(raw){
                    try{ const parsed = JSON.parse(raw||'[]'); if(Array.isArray(parsed)){ window._blokCache = parsed; return parsed; } }catch(_){ }
                  }
                }catch(_){ }
              }
            }catch(_){ }
            // Try fetch first
            try{
              // Use safe JSON fetch helper to detect HTML responses and provide clear errors
              let serverBody;
              try{
                serverBody = await window._fetchJsonOrExplain(url, { method: 'GET', mode: 'cors' });
              }catch(err){
                console.error('[getBloklar] remote fetch failed or returned non-JSON', err && err.details ? err.details : (err && err.message));
                throw err;
              }
              const raw = serverBody && (Array.isArray(serverBody.data) ? serverBody.data : (Array.isArray(serverBody.items) ? serverBody.items : []));
              const arr = (function normalizeServerList(rawArr){
                try{
                  if(!Array.isArray(rawArr)) return [];
                  // Rows from Apps Script often come as {id/key, record/value} rows.
                  const first = rawArr[0];
                  const looksLikeRows = first && (first.key !== undefined || first.id !== undefined) && (first.record !== undefined || first.value !== undefined);
                  if(looksLikeRows){
                    // Try to find the canonical blok list row (key === BL_KEY or record.value is array)
                    const wantKey = String(window.BL_KEY || 'bloklar');
                    for(const row of rawArr){
                      const k = String(row.key || row.id || '');
                      const rec = row.record || row.value || null;
                      const val = rec && rec.value !== undefined ? rec.value : (rec || null);
                      if(k === wantKey && Array.isArray(val)) return val;
                      if(Array.isArray(val)) return val;
                      if(Array.isArray(rec)) return rec;
                    }
                    return [];
                  }
                  // Already looks like an array of blok objects. Filter out lock/audit noise.
                  return rawArr.filter(it=>{
                    try{
                      const idish = String((it && (it.blokNo || it.id || it.ID || it.Id))||'');
                      if(!idish) return true;
                      if(idish.indexOf('lock::') === 0) return false;
                      if(idish.indexOf('audit::') === 0) return false;
                      return true;
                    }catch(_){ return true; }
                  });
                }catch(_){ return Array.isArray(rawArr)?rawArr:[]; }
              })(raw);
              try{ window._blokCache = Array.isArray(arr) ? arr : []; }catch(_){ }
              return Array.isArray(arr) ? arr : [];
            }catch(fetchErr){
              // Fetch failed (likely CORS). If this is Apps Script, try JSONP fallback
              try{ console.debug('[getBloklar] fetch failed, trying JSONP fallback', fetchErr && fetchErr.message); }catch(_){ }
              if(String(base).indexOf('script.google.com') !== -1 || String(base).indexOf('googleusercontent.com') !== -1){
                try{
                  let jp = null;
                  if(window._ALLOW_JSONP){
                    jp = await window._jsonpRequest(url, 20000).catch(e=>{ throw e; });
                  } else {
                    try{ window._logSkippedJsonp && window._logSkippedJsonp(url, '[getBloklar] JSONP fallback skipped'); }catch(_){ }
                  }
                  const rawJp = jp && (Array.isArray(jp.data) ? jp.data : (Array.isArray(jp.items) ? jp.items : []));
                  const arr = (function normalizeServerList(rawArr){
                    try{
                      if(!Array.isArray(rawArr)) return [];
                      const first = rawArr[0];
                      const looksLikeRows = first && (first.key !== undefined || first.id !== undefined) && (first.record !== undefined || first.value !== undefined);
                      if(looksLikeRows){
                        const wantKey = String(window.BL_KEY || 'bloklar');
                        for(const row of rawArr){
                          const k = String(row.key || row.id || '');
                          const rec = row.record || row.value || null;
                          const val = rec && rec.value !== undefined ? rec.value : (rec || null);
                          if(k === wantKey && Array.isArray(val)) return val;
                          if(Array.isArray(val)) return val;
                          if(Array.isArray(rec)) return rec;
                        }
                        return [];
                      }
                      return rawArr.filter(it=>{
                        try{
                          const idish = String((it && (it.blokNo || it.id || it.ID || it.Id))||'');
                          if(!idish) return true;
                          if(idish.indexOf('lock::') === 0) return false;
                          if(idish.indexOf('audit::') === 0) return false;
                          return true;
                        }catch(_){ return true; }
                      });
                    }catch(_){ return Array.isArray(rawArr)?rawArr:[]; }
                  })(rawJp);
                  try{ window._blokCache = Array.isArray(arr) ? arr : []; }catch(_){ }
                  return Array.isArray(arr) ? arr : [];
                }catch(jsonpErr){
                  try{ window.showToast && window.showToast('Sunucuya bağlanamadı: ' + (jsonpErr && jsonpErr.message)); }catch(_){ }
                  console.error('[getBloklar] JSONP fallback failed', jsonpErr);
                  return [];
                }
              }
              try{ window.showToast && window.showToast('Sunucuya bağlanamadı: ' + (fetchErr && fetchErr.message)); }catch(_){ }
              return [];
            }
          }catch(e){
            try{ window.showToast && window.showToast('Sunucuya bağlanamadı: ' + (e && e.message)); }catch(_){ }
            console.error('[getBloklar] error', e);
            return [];
          }
        };
      }

      // fetch wrapper: automatically attach dev-proxy token header for local proxy calls
      try{
        if(typeof window._originalFetch === 'undefined' && typeof window.fetch === 'function'){
          window._originalFetch = window.fetch.bind(window);
          window.fetch = async function(input, init){
            try{
              // determine url string
              var url = '';
              if(typeof input === 'string') url = input;
              else if(input && input.url) url = input.url;
              // token sources: explicit global, or localStorage key 'v92_dev_proxy_token'
              var token = (window.DEV_PROXY_TOKEN || window._DEV_PROXY_TOKEN || localStorage.getItem && localStorage.getItem('v92_dev_proxy_token')) || null;
              if(token && url){
                var devHosts = ['localhost:3001','127.0.0.1:3001','localhost:3000','127.0.0.1:3000'];
                var isDev = devHosts.some(function(h){ return url.indexOf(h) !== -1; });
                if(isDev){
                  init = init || {};
                  init.headers = init.headers || {};
                  try{
                    if(typeof Headers !== 'undefined' && init.headers instanceof Headers){ init.headers.set('x-dev-token', token); }
                    else if(Array.isArray(init.headers)){
                      // array of [k,v]
                      init.headers.push(['x-dev-token', token]);
                    }else{
                      init.headers['x-dev-token'] = token;
                    }
                  }catch(_){ try{ init.headers['x-dev-token'] = token; }catch(__){} }
                }
              }
            }catch(_){ }
            return window._originalFetch(input, init);
          };
        }
      }catch(_){ }

      if(typeof window.setBloklar !== 'function'){
        window.setBloklar = async function(arr){
          try{
            // Diagnostic tracing: log caller and snapshot to help debug unexpected add/delete flows
            try{
              const snap = (Array.isArray(arr) ? arr.slice(0,10).map(x=>({blokNo: (x&&x.blokNo)||'', id: (x&&x.id)||''})) : String(arr));
              console.groupCollapsed('[setBloklar] called — len=' + (Array.isArray(arr)?arr.length:0) + ' snapshot=' + JSON.stringify(snap));
              console.trace();
              console.log('[setBloklar] snapshot (first 10)', snap);
              console.groupEnd();
            }catch(_){ }
            // keep an in-memory cache for fast reads by getBloklar()
            try{
              const cleanArr = Array.isArray(arr) ? (arr.filter(function(it){ try{ const idish = String((it && (it.blokNo || it.id || it.ID || it.Id))||''); if(!idish) return true; if(idish.indexOf('lock::')===0) return false; if(idish.indexOf('audit::')===0) return false; return true; }catch(_){ return true; }})) : (Array.isArray(window._blokCache)?window._blokCache:[]);
              window._blokCache = cleanArr;
            }catch(_){ }
            // --- Dual-write safety: always persist a local snapshot immediately so local state remains usable
            try{
              const keyName = (window.BL_KEY||'bloklar_yeni_demo');
              try{ localStorage.setItem(keyName, JSON.stringify(window._blokCache)); }catch(_){ }
              // Create a short-lived snapshot record and attempt to store it remotely (best-effort)
              try{
                const snapTs = Date.now();
                const snapKey = 'v92_remote_migration_snapshot_' + snapTs;
                const snapObj = { ts: snapTs, collection: keyName, count: (Array.isArray(window._blokCache)?window._blokCache.length:0) };
                try{ localStorage.setItem(snapKey, JSON.stringify({ ts: snapTs, collection: keyName, data: window._blokCache })); }catch(_){ }
                // send snapshot to remote as a named collection 'migration_snapshots' (best-effort, non-blocking)
                if(window.REMOTE_ENABLED && typeof window.remoteUpsert === 'function'){
                  try{ window.remoteUpsert({ id: 'snapshot::' + snapTs, ts: snapTs, type: 'snapshot', collection: keyName, data: window._blokCache }, 'migration_snapshots').catch(function(e){ console.warn('[setBloklar] remote snapshot failed', e); }); }catch(_){ }
                }
              }catch(_){ }
            }catch(_){ }
            // If remote usage is not explicitly enabled, persist only to localStorage and
            // do not attempt remote upserts. This prevents unexpected automatic writes.
            try{
              // Consider remote disabled in these cases:
              // - user hasn't explicitly enabled remote via localStorage v92_gs_use_remote === '1'
              // - client is running from file:// or origin is 'null' (CORS/unreliable)
              // - the build forced JSONP fallback via window.GS_FORCE_JSONP
              const lsFlag = (localStorage.getItem && localStorage.getItem('v92_gs_use_remote') === '1');
              const originNull = (typeof location !== 'undefined' && (location.protocol === 'file:' || String(location.origin) === 'null'));
              const forceJsonp = !!(window.GS_FORCE_JSONP);
              const allowFileOriginRemote = !!window.ALLOW_FILE_ORIGIN_REMOTE || !!window.FORCE_REMOTE_ONLY;
              // Prefer explicit REMOTE_ENABLED when deciding to perform remote writes. This lets admins/devs force remote-first when API_BASE is trusted.
              const useRemote = !!window.REMOTE_ENABLED || (lsFlag && (!originNull || allowFileOriginRemote) && !forceJsonp);
              if(!useRemote){ try{ localStorage.setItem((window.BL_KEY||'bloklar_yeni_demo'), JSON.stringify(window._blokCache)); }catch(_){ }
                console.info('[setBloklar] remote disabled; persisted locally only (lsFlag=' + !!lsFlag + ', originNull=' + !!originNull + ', GS_FORCE_JSONP=' + !!forceJsonp + ')');
                return { ok:true, localOnly:true };
              }
            }catch(_){ }
            const base = window.API_BASE || window.GS_WEBAPP_URL || localStorage.getItem('v92_gs_webapp_url');
            if(!base){ throw new Error('API base not configured (window.API_BASE or window.GS_WEBAPP_URL or localStorage v92_gs_webapp_url)'); }
            try{ if(typeof window._isApiBaseAllowed === 'function' && !window._isApiBaseAllowed(base)){ throw new Error('API base refused by security policy (non-HTTPS): ' + base); } }catch(_){ throw _; }
            // Upsert each record via the remote API. Try POST first, fallback to JSONP GET upsert when necessary.
            // If API_BASE points to local proxy DB, use its /db/blocks endpoint for persistence
            const isLocalDb = String(base).indexOf('localhost:3001') !== -1 || String(base).indexOf('127.0.0.1:3001') !== -1;
            if(isLocalDb){
              const upUrl = (String(base).endsWith('/') ? base.slice(0,-1) : base) + '/db/blocks';
              for(let i=0;i<(window._blokCache||[]).length;i++){
                const rec = window._blokCache[i] || {};
                try{
                  if(window.REMOTE_ENABLED && typeof window.remoteUpsert === 'function'){
                    // Prefer remote upsert (Apps Script) when REMOTE_ENABLED; fall back to local proxy if remote fails
                    try{
                      await window.remoteUpsert(rec);
                    }catch(e){
                      console.error('[setBloklar] remoteUpsert failed, falling back to local proxy', e);
                      const r = await fetch(upUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec) });
                      if(!r.ok) throw new Error('post failed ' + r.status);
                    }
                  } else {
                    const r = await fetch(upUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec) });
                    if(!r.ok) throw new Error('post failed ' + r.status);
                  }
                }catch(err){ console.error('[setBloklar] local db upsert failed', err); }
              }
              return { ok:true };
            }
            for(let i=0;i<(window._blokCache||[]).length;i++){
              const rec = window._blokCache[i] || {};
              if(!rec.id) rec.id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('m_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6));
              try{
                if(window.REMOTE_ENABLED && typeof window.remoteUpsert === 'function'){
                  try{
                    await window.remoteUpsert(rec);
                  }catch(e){
                    console.error('[setBloklar] remoteUpsert failed for record', e);
                  }
                } else {
                  // fallback to direct POST to API_BASE when remote helper isn't available
                  const r = await fetch(base, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'upsert', record: rec })
                  });
                  if(!r.ok){ throw new Error('post failed ' + r.status); }
                }
              }catch(err){
                console.error('[setBloklar] upsert failed', err);
              }
            }
            return { ok:true };
          }catch(e){ console.error('[setBloklar] error', e); try{ window.showToast && window.showToast('Kaydetme hatası: ' + (e && e.message)); }catch(_){ } return { ok:false, error: String(e) }; }
        };
      }
      // Scheduling helper: defer expensive UI updates (datalist + full render) to idle so save feels snappier
      if(typeof window.scheduleRenderAndThen !== 'function'){
        window.scheduleRenderAndThen = function(cb){
          try{
            const runner = function(){
              try{ updateBlokListDatalist && updateBlokListDatalist(); }catch(_){ }
              try{ renderBloklar && renderBloklar(); }catch(_){ }
              try{ if(typeof cb === 'function') cb(); }catch(_){ }
            };
            if(typeof window.requestIdleCallback === 'function'){
              window.requestIdleCallback(runner, {timeout: 200});
            } else {
              // slight delay to yield to UI thread
              setTimeout(runner, 40);
            }
          }catch(e){ try{ if(typeof cb === 'function') cb(); }catch(_){ } }
        };
      }
      // İlk kurulum tohumu: dev seed/one-time import removed to enforce remote-first flow.
      // (Previously this IIFE injected sample bloklar into localStorage on first load.)
      (function seedIfEmpty(){
        try{
          // Disabled: use Apps Script as source of truth instead of local demo seeding.
          const KEY = 'blok_seed_done_v1';
          try{ if(!localStorage.getItem(KEY)) localStorage.setItem(KEY,'1'); }catch(_){ }
        }catch(_){ }
      })();
      // Otomatik kurtarma: disabled for remote-first workflow.
      (function autoRestoreBlokBackup(){
        try{
          // Previously this attempted to auto-restore local backups into the blok list.
          // Disabled to avoid local overrides; mark as done so other code paths won't try.
          const DONE_KEY = 'blok_auto_restore_done_v1';
          try{ if(!localStorage.getItem(DONE_KEY)) localStorage.setItem(DONE_KEY,'1'); }catch(_){ }
        }catch(_){ }
      })();

      // Dev helper: hızlı örnek veri importu (geliştirici amaçlı, güvenli ve geri alınabilir)
      // Kullanım:
      // - Konsolda çağır: __devImportSample()
      // - Veya sayfayı ?autoImportSample=1 ile aç: örnek veri otomatik yüklenecek
      try{
        if(typeof window.__devImportSample !== 'function'){
          // Dev import helper disabled: importing sample data is removed to enforce remote-first behavior.
          window.__devImportSample = async function(){
            try{ console.warn('__devImportSample is disabled in this build (embedded seed removed).'); }catch(_){ }
            return { ok:false, reason:'disabled' };
          };
        }
      }catch(_){ }

      // Blok silme yardımcıları (async, localStorage tabanlı)
      if(typeof window.deleteBlok !== 'function'){
        // Enhanced delete: try remote JSONP delete when API is a Google Apps Script endpoint
        window.deleteBlok = async function(blokNo){
          try{
            const key = String(blokNo||'').trim().toLowerCase(); if(!key) return false;
            const base = window.API_BASE || window.GS_WEBAPP_URL || localStorage.getItem('v92_gs_webapp_url');
            try{ if(base && typeof window._isApiBaseAllowed === 'function' && !window._isApiBaseAllowed(base)){ console.warn('[deleteBlok] API base refused by security policy (non-HTTPS):', base); /* treat as local-only delete */ }
            }catch(_){ }
            const isLocalDb = base && (String(base).indexOf('localhost:3001') !== -1 || String(base).indexOf('127.0.0.1:3001') !== -1 || String(base).indexOf('localhost:3000') !== -1 || String(base).indexOf('127.0.0.1:3000') !== -1 || String(base).indexOf('/db/blocks') !== -1);
            // If using local proxy DB, perform delete via /db/blocks?id=...
            if(isLocalDb){
              try{
                const all = await (typeof getBloklar==='function' ? getBloklar() : []);
                const matches = (all||[]).filter(function(x){ return String((x && x.blokNo)||'').trim().toLowerCase() === key; });
                if(matches.length === 0){
                  const nextLocal = (all||[]).filter(function(x){ return String((x && x.blokNo)||'').trim().toLowerCase() !== key; });
                  if(typeof setBloklar === 'function') await setBloklar(nextLocal);
                  try{ renderBloklar && renderBloklar(); updateBlokListDatalist && updateBlokListDatalist(); }catch(_){ }
                  return true;
                }
                for(const rec of matches){
                  const id = rec && (rec.id || rec.ID || rec.Id || rec._id);
                  if(!id) continue;
                    try{
                      const delUrl = (String(base).endsWith('/') ? base.slice(0,-1) : base) + '/db/blocks?id=' + encodeURIComponent(id);
                      if(typeof window.remoteDelete === 'function' && window.REMOTE_ENABLED){
                        try{ await window.remoteDelete(id); }
                        catch(e){ console.error('[deleteBlok] remoteDelete failed', e); }
                      } else {
                        const r = await fetch(delUrl, { method: 'DELETE', mode: 'cors' });
                        if(!r.ok) console.error('[deleteBlok] local delete failed', await r.text().catch(()=>null));
                      }
                    }catch(e){ console.error('[deleteBlok] error deleting local id', e); }
                }
                try{ const refreshed = await getBloklar(); window._blokCache = Array.isArray(refreshed)?refreshed:[]; }catch(_){ }
                try{ renderBloklar && renderBloklar(); updateBlokListDatalist && updateBlokListDatalist(); }catch(_){ }
                return true;
              }catch(err){ console.error('deleteBlok local flow failed', err); /* fall through to other flows */ }
            }
            // If using Apps Script, prefer JSONP-friendly remote delete: fetch list, find id(s), then call action=delete&id=...
            if(base && (String(base).indexOf('script.google.com') !== -1 || String(base).indexOf('googleusercontent.com') !== -1)){
              try{
                const all = await (typeof getBloklar==='function' ? getBloklar() : []);
                const matches = (all||[]).filter(function(x){ return String((x && x.blokNo)||'').trim().toLowerCase() === key; });
                if(matches.length === 0){
                  // nothing on server matched; fall back to local removal via setBloklar
                  const nextLocal = (all||[]).filter(function(x){ return String((x && x.blokNo)||'').trim().toLowerCase() !== key; });
                  if(typeof setBloklar === 'function') await setBloklar(nextLocal);
                  try{ renderBloklar && renderBloklar(); updateBlokListDatalist && updateBlokListDatalist(); }catch(_){ }
                  return true;
                }
                // For each matching record, prefer remote helpers when REMOTE_ENABLED; otherwise fall back to JSONP logic
                for(const rec of matches){
                  const id = rec && (rec.id || rec.ID || rec.Id || rec._id);
                  if(window.REMOTE_ENABLED && typeof window.remoteDelete === 'function'){
                    try{
                      if(id){
                        await window.remoteDelete(id);
                      } else if(typeof window.remoteUpsert === 'function'){
                        // upsert to obtain id, then delete
                        try{
                          const upRes = await window.remoteUpsert(rec).catch(e=>{ throw e; });
                          const newId = upRes && (upRes.id || (upRes.data && upRes.data.id) || (upRes.result && upRes.result.id));
                          if(newId){
                            await window.remoteDelete(newId).catch(e=>{ console.error('remote delete after upsert failed', e); });
                          }
                        }catch(e){ console.error('upsert-then-delete failed', e); }
                      } else {
                        // No remoteUpsert available; proceed to JSONP fallback below
                        // fall through
                      }
                    }catch(e){ console.error('remote delete failed for id=' + String(id), e); }
                    continue;
                  }
                  // JSONP / legacy fallback
                  if(!id){
                    try{
                      const sep = (String(base).indexOf('?') === -1) ? '?' : '&';
                      const recStr = encodeURIComponent(JSON.stringify(rec || {}));
                      const upUrl = (String(base).endsWith('/') ? base.slice(0,-1) : base) + sep + 'action=upsert&record=' + recStr;
                      let upRes = null;
                      if(window._ALLOW_JSONP){
                        upRes = await window._jsonpRequest(upUrl, 20000).catch(e=>{ throw e; });
                        const newId = upRes && (upRes.id || (upRes.data && upRes.data.id));
                        if(newId){
                          const delUrl = (String(base).endsWith('/') ? base.slice(0,-1) : base) + sep + 'action=delete&id=' + encodeURIComponent(newId);
                          await window._jsonpRequest(delUrl, 20000).catch(e=>{ console.error('remote delete after upsert failed', e); });
                        }
                      } else {
                        try{ window._logSkippedJsonp && window._logSkippedJsonp(upUrl, '[deleteBlok] upsert-then-delete skipped'); }catch(_){ }
                      }
                    }catch(e){ console.error('upsert-then-delete failed', e); }
                  } else {
                    try{
                      const sep = (String(base).indexOf('?') === -1) ? '?' : '&';
                      const delUrl = (String(base).endsWith('/') ? base.slice(0,-1) : base) + sep + 'action=delete&id=' + encodeURIComponent(id);
                      if(window._ALLOW_JSONP){
                        await window._jsonpRequest(delUrl, 20000).catch(e=>{ throw e; });
                      } else {
                        try{ window._logSkippedJsonp && window._logSkippedJsonp(id, '[deleteBlok] remote delete skipped for id'); }catch(_){ }
                      }
                    }catch(e){ console.error('remote delete failed for id=' + String(id), e); }
                  }
                }
                // Refresh local cache from server
                try{ const refreshed = await getBloklar(); window._blokCache = Array.isArray(refreshed)?refreshed:[]; }catch(_){ }
                try{ renderBloklar && renderBloklar(); updateBlokListDatalist && updateBlokListDatalist(); }catch(_){ }
                return true;
              }catch(err){ console.error('deleteBlok remote flow failed', err); /* fall through to local fallback */ }
            }
            // Default/local fallback: remove from local array and persist
            const arr = await (typeof getBloklar==='function' ? getBloklar() : []);
            const next = (arr||[]).filter(function(x){ return String(x?.blokNo||'').trim().toLowerCase() !== key; });
            if(typeof setBloklar==='function') await setBloklar(next);
            try{ renderBloklar && renderBloklar(); updateBlokListDatalist && updateBlokListDatalist(); }catch(_){ }
            return true;
          }catch(e){ console.error('deleteBlok failed', e); return false; }
        };
      }
    
      // Emergency force-delete: backs up current blok list and removes matching blokNo without permission checks.
      // Use only when you understand this operation; it creates a preForceDelete backup key.
      if(typeof window.forceDeleteBlok !== 'function'){
        window.forceDeleteBlok = async function(blokNo){
          try{
            const key = window.BL_KEY || 'bloklar_yeni_demo';
            let arr = [];
            try{ arr = JSON.parse(localStorage.getItem(key)||'[]'); }catch(_){ arr = []; }
            const ts = new Date().toISOString().replace(/[:.]/g,'-');
            localStorage.setItem(key + '_preForceDelete_' + ts, JSON.stringify(arr));
            const next = (arr||[]).filter(x=> String((x && x.blokNo)||'').trim().toLowerCase() !== String(blokNo||'').trim().toLowerCase());
            localStorage.setItem(key, JSON.stringify(next));
            try{ if(typeof renderBloklar==='function') renderBloklar(); }catch(_){ }
            console.info('forceDeleteBlok: completed, pre-backup key=', key + '_preForceDelete_' + ts);
            try{ alert('Zorla silme tamamlandı. Önceki versiyon yedeklendi: ' + key + '_preForceDelete_' + ts); }catch(_){ }
            return true;
          }catch(e){ console.error('forceDeleteBlok failed', e); try{ alert('Zorla silme başarısız: ' + (e && e.message)); }catch(_){ } return false; }
        };
      }
      // Normalize blokNo input values coming from datalist which may include a visible label like "56 — Vera Beige".
      // This returns the left-most token before any dash-like separator and trims whitespace.
      if(typeof window.normalizeBlokNo !== 'function'){
        window.normalizeBlokNo = function(s){
          try{
            if(s===undefined || s===null) return '';
            let t = String(s).trim();
            if(!t) return '';
            // Split on common dash characters with optional surrounding spaces
            const parts = t.split(/\s*[–—-]\s*/);
            return (parts[0]||'').trim();
          }catch(_){ return String(s||'').trim(); }
        };
      }
      // Metin standardizasyonu: Türkçe için Title Case (Her kelimenin ilk harfi büyük, kalanlar küçük)
      if(typeof window.toTitleCaseTR !== 'function'){
        window.toTitleCaseTR = function(s){
          try{
            const str = String(s||'').trim();
            if(!str) return '';
            // Birden çok boşluğu tek boşluğa indir; kelime kelime dönüştür
            return str.split(/\s+/).map(w=>{
              const lower = w.toLocaleLowerCase('tr-TR');
              const first = lower.charAt(0).toLocaleUpperCase('tr-TR');
              return first + lower.slice(1);
            }).join(' ');
          }catch(_){ return s; }
        };
      }
      // Durum standardizasyonu: Ensar | Fason
      if(typeof window.normalizeDurum !== 'function'){
        window.normalizeDurum = function(s){
          try{
            const raw = String(s||'').trim();
            if(!raw) return 'Ensar';
            if(/^ensar$/i.test(raw)) return 'Ensar';
            if(/^fason$/i.test(raw)) return 'Fason';
            // Başka bir şey ise Türkçe title-case uygula
            const t = toTitleCaseTR(raw);
            // Yine de boş gelirse güvenli varsayılan
            return t || 'Ensar';
          }catch(_){ return 'Ensar'; }
        };
      }
      // Fasoncu Kodu standardizasyonu: ilk harf büyük, kalan küçük; Ensar bloklarında boş
      if(typeof window.normalizeFasoncuKodu !== 'function'){
        window.normalizeFasoncuKodu = function(s, durum){
          try{
            const d = normalizeDurum(durum);
            if(d === 'Ensar') return '';
            const raw = String(s||'').trim();
            if(!raw) return '';
            if(/^ensar$/i.test(raw)) return '';
            // Türkçe title-case: "CDS" -> "Cds", "cds" -> "Cds"
            return toTitleCaseTR(raw);
          }catch(_){ return ''; }
        };
        // Clean up dimension-like values imported from Excel or entered with units
        if(typeof window.sanitizeDimensionVal !== 'function'){
          window.sanitizeDimensionVal = function(v){
            try{
              if(v===undefined || v===null) return '';
              let s = String(v).trim(); if(!s) return '';
              // remove common unit tokens and squared/m2 markers
              s = s.replace(/cm2|cm²|cm|mm|m2|m²|m\b/gi,'');
              // remove spaces and convert comma decimal to dot
              s = s.replace(/\s+/g,'').replace(/,/g,'.');
              // extract first numeric token (best-effort)
              const m = s.match(/-?[0-9]*\.?[0-9]+/);
              return m ? m[0] : '';
            }catch(_){ return ''; }
          };
    
          // Helper to set form field value with sanitization for dimension fields
          if(typeof window.setFormFieldValue !== 'function'){
            window.setFormFieldValue = function(f, name, val){
              try{
                const v = (val===undefined || val===null) ? '' : String(val);
                const dimFields = ['en','boy','yukseklik','genislik','genislik','kalinlik'];
                if(dimFields.includes(name)){
                  if(f[name]) f[name].value = sanitizeDimensionVal(v);
                  else{ const el = f.querySelector('[name="'+name+'"]'); if(el) el.value = sanitizeDimensionVal(v); }
                } else {
                  if(f[name]) f[name].value = v||'';
                  else{ const el = f.querySelector('[name="'+name+'"]'); if(el) el.value = v||''; }
                }
              }catch(_){ /* noop */ }
            };
          }
        }
      }
      // Blok formu: m3 hesaplama, okuma ve kaydetme yardımcıları
      if(typeof window.calcBlokM3FromForm !== 'function'){
        window.calcBlokM3FromForm = function(){
          try{
            const f = document.getElementById('frmBlok'); if(!f) return;
            const en = num(f.en?.value||'');
            const boy = num(f.boy?.value||'');
            const yuk = num(f.yukseklik?.value||'');
            if(!isNaN(en) && !isNaN(boy) && !isNaN(yuk) && en>0 && boy>0 && yuk>0){
              const m3 = (en*boy*yuk)/1_000_000; // cm -> m3
              if(f.m3) f.m3.value = m3.toFixed(3);
            } else {
              if(f.m3) f.m3.value = '';
            }
          }catch(_){ }
        };
      }
      if(typeof window.readBlokForm !== 'function'){
        window.readBlokForm = function(){
          const f = document.getElementById('frmBlok'); if(!f) return null;
          const val = (n)=> (f[n]?.value||'').trim();
          // m3 yoksa otomatik hesapla
          let en=val('en'), boy=val('boy'), yuk=val('yukseklik');
          let m3 = val('m3');
          const enN=num(en), boyN=num(boy), yukN=num(yuk);
          if((!m3 || m3==='') && !isNaN(enN) && !isNaN(boyN) && !isNaN(yukN) && enN>0 && boyN>0 && yukN>0){
            m3 = ((enN*boyN*yukN)/1_000_000).toFixed(3);
          }
          const d = normalizeDurum(val('durum') || 'Ensar');
          return {
            blokNo: val('blokNo'),
            fasoncuKodu: normalizeFasoncuKodu(val('fasoncuKodu'), d),
            ocakIsmi: toTitleCaseTR(val('ocakIsmi')),
            blokAdi: toTitleCaseTR(val('blokAdi')),
            durum: d,
            en, boy, yukseklik: yuk,
            gelisTarihi: val('gelisTarihi'),
            m3,
            asama: 'Ham'
          };
        };

        // Safe JSON fetch helper: fetches as text first and checks content-type / body
        // If upstream returns HTML (eg. Google sign-in page) this throws a clear Error
        // with contextual information so callers can handle it without noisy JSON parse errors.
        if(typeof window._fetchJsonOrExplain !== 'function'){
          window._fetchJsonOrExplain = async function(fetchUrl, opts){
            opts = opts || {};
            // Use remoteFetch when available so legacy /db/blocks rewrites are handled centrally.
            const r = await (typeof window.remoteFetch === 'function' ? window.remoteFetch(fetchUrl, opts) : fetch(fetchUrl, opts));
            // Keep status check similar to existing code
            if(!r.ok) throw new Error('Network response ' + r.status + ' for ' + fetchUrl);
            const ct = (r.headers && r.headers.get) ? (r.headers.get('content-type') || '') : '';
            const txt = await r.text();
            // If content-type does not indicate JSON and body looks like HTML, surface a helpful error
            if(!/json/i.test(ct) && /^\s*</.test(txt)){
              const snippet = txt.replace(/\s+/g,' ').slice(0,400);
              const e = new Error('[fetchJson] upstream returned HTML instead of JSON');
              e.details = { url: fetchUrl, contentType: ct, snippet: snippet };
              // attach raw body for advanced inspection (may be large)
              e.upstreamBody = txt;
              try{ if(typeof window.showUpstreamError === 'function') window.showUpstreamError(e.details); }catch(_){ }
              throw e;
            }
            try{
              return JSON.parse(txt);
            }catch(err){
              // If content-type claimed JSON but parse failed, include snippet
              const snippet = String(txt).replace(/\s+/g,' ').slice(0,400);
              const e = new Error('[fetchJson] failed to parse JSON from ' + fetchUrl + ' (' + (err && err.message) + ')');
              e.details = { url: fetchUrl, contentType: ct, snippet: snippet };
              e.upstreamBody = txt;
              try{ if(typeof window.showUpstreamError === 'function') window.showUpstreamError(e.details); }catch(_){ }
              throw e;
            }
          };
        }

        // Remote helpers: unified wrappers for Apps Script / proxy upsert/delete/list
        // Numeric sanitizers and record normalizer
        if(typeof window.parseLocaleNumber !== 'function'){
          window.parseLocaleNumber = function(s){
            try{
              if(s === undefined || s === null) return NaN;
              var str = String(s).trim(); if(str === '') return NaN;
              // remove non-digit except comma and dot and minus
              // treat dots as thousand separators when both dot and comma present
              if(str.indexOf('.') !== -1 && str.indexOf(',') !== -1){ str = str.replace(/\./g,'').replace(',','.'); }
              else { str = str.replace(/\./g,'').replace(',','.'); }
              var n = parseFloat(str);
              return isNaN(n) ? NaN : n;
            }catch(_){ return NaN; }
          };
        }
        if(typeof window.sanitizeRecord !== 'function'){
          window.sanitizeRecord = function(r){
            try{
              if(!r || typeof r !== 'object') return r;
              const out = Object.assign({}, r);
              // common numeric fields
              ['en','boy','genislik','kalinlik','m3','adet','kasaAdedi','toplamM2'].forEach(function(f){
                if(out[f] !== undefined && out[f] !== null){
                  var pn = parseLocaleNumber(out[f]);
                  if(!isNaN(pn)) out[f] = pn;
                }
              });
              // normalize nested out array if present
              if(Array.isArray(out.out)){
                out.out = out.out.map(function(o){
                  try{
                    const no = Object.assign({}, o);
                    ['en','boy','m3','adet','sagAdet','kirikAdet'].forEach(function(f){ if(no[f] !== undefined && no[f] !== null){ const pn = parseLocaleNumber(no[f]); if(!isNaN(pn)) no[f] = pn; } });
                    return no;
                  }catch(_){ return o; }
                });
              }
              return out;
            }catch(_){ return r; }
          };
        }

        // Normalizer: Apps Script / proxy upsert response'undan id çıkarıp standart obje döndürür
        // Amaç: farklı sunucu şekillerine karşı istemci tarafında tek bir id alanı kullanabilmek.
        if(typeof window._normalizeUpsertResponse !== 'function'){
          window._normalizeUpsertResponse = function(res){
            try{
              if(!res) return { id: null, raw: res };
              // Yaygın alanlar: id, data.id, result.id, insertedId
              var id = null;
              if(res.id) id = res.id;
              else if(res.data && (res.data.id || res.data.ID)) id = res.data.id || res.data.ID;
              else if(res.result && (res.result.id || res.result.insertedId)) id = res.result.id || res.result.insertedId;
              else if(res.insertedId) id = res.insertedId;
              // bazen Apps Script jsonp'de doğrudan { ok: true, id: '...' } döner
              if(!id){
                // deeper scan: search top-level keys for something that looks like an id string
                try{ Object.keys(res).forEach(function(k){ if(!id){ var v = res[k]; if(typeof v === 'string' && v.length>6) id = v; } }); }catch(_){ }
              }
              return { id: id || null, raw: res };
            }catch(_){ return { id: null, raw: res }; }
          };
        }

        if(typeof window.remoteUpsert !== 'function'){
          // remoteUpsert(record, collection?) -> posts { action:'upsert', collection, record }
          // Accepts optional collection name so callers can choose where to store the record server-side.
          window.remoteUpsert = async function(rec, collection){
            const base = window.API_BASE || window.GS_WEBAPP_URL || (localStorage.getItem && localStorage.getItem('v92_gs_webapp_url')) || '';
            if(!base) throw new Error('API base not configured');
            try{
              if(typeof window._isApiBaseAllowed === 'function' && !window._isApiBaseAllowed(base)) throw new Error('API base refused by security policy (non-HTTPS): ' + base);
            }catch(_){ /* continue */ }
            // Prefer POST JSON upsert
            try{
                // sanitize record before sending
                var recToSend = (typeof sanitizeRecord === 'function') ? sanitizeRecord(rec) : rec;
                const bodyObj = { action: 'upsert', record: recToSend };
                if(collection) bodyObj.collection = collection;
                const postOpts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyObj) };
                const r = await (typeof window.remoteFetch === 'function' ? window.remoteFetch(base, postOpts) : fetch(base, postOpts));
                if(!r.ok) throw new Error('remote upsert failed ' + r.status);
                // try to parse JSON body if present
                try{ return await r.json(); }catch(_){ return { ok:true }; }
            }catch(postErr){
              // fallback to JSONP for Apps Script if explicitly allowed
              if((String(base).indexOf('script.google.com') !== -1 || String(base).indexOf('googleusercontent.com') !== -1) && window._ALLOW_JSONP){
                const sep = (String(base).indexOf('?') === -1) ? '?' : '&';
                // include collection param in JSONP when available
                const collPart = collection ? '&collection=' + encodeURIComponent(collection) : '';
                const url = (String(base).endsWith('/') ? base.slice(0,-1) : base) + sep + 'action=upsert' + collPart + '&record=' + encodeURIComponent(JSON.stringify(recToSend||{}));
                return await window._jsonpRequest(url, 20000).catch(e=>{ throw e; });
              }
              throw postErr;
            }
          };
        }

        if(typeof window.remoteDelete !== 'function'){
          window.remoteDelete = async function(id){
            const base = window.API_BASE || window.GS_WEBAPP_URL || (localStorage.getItem && localStorage.getItem('v92_gs_webapp_url')) || '';
            if(!base) throw new Error('API base not configured');
            try{ if(typeof window._isApiBaseAllowed === 'function' && !window._isApiBaseAllowed(base)) throw new Error('API base refused by security policy (non-HTTPS): ' + base); }catch(_){ }
            try{
              const postOpts = { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ action:'delete', id: id }) };
              const r = await (typeof window.remoteFetch === 'function' ? window.remoteFetch(base, postOpts) : fetch(base, postOpts));
              if(!r.ok) throw new Error('remote delete failed ' + r.status);
              try{ return await r.json(); }catch(_){ return { ok:true }; }
            }catch(err){
              if((String(base).indexOf('script.google.com') !== -1 || String(base).indexOf('googleusercontent.com') !== -1) && window._ALLOW_JSONP){
                const sep = (String(base).indexOf('?') === -1) ? '?' : '&';
                const url = (String(base).endsWith('/') ? base.slice(0,-1) : base) + sep + 'action=delete&id=' + encodeURIComponent(id);
                return await window._jsonpRequest(url, 20000).catch(e=>{ throw e; });
              }
              throw err;
            }
          };
        }
        // Helper to sanitize a record then upsert it (exposed for console use)
        if(typeof window.upsertSanitizedRecord !== 'function'){
          window.upsertSanitizedRecord = async function(raw){
            try{
              const rec = (typeof sanitizeRecord === 'function') ? sanitizeRecord(raw) : raw;
              if(typeof window.remoteUpsert === 'function' && window.REMOTE_ENABLED){
                return await window.remoteUpsert(rec);
              }
              // fallback: direct POST
              const base = window.API_BASE || window.GS_WEBAPP_URL || (localStorage.getItem && localStorage.getItem('v92_gs_webapp_url')) || '';
              const r = await fetch(base, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ action:'upsert', record: rec }) });
              try{ return await r.json(); }catch(_){ return { ok: r.ok }; }
            }catch(e){ console.error('upsertSanitizedRecord failed', e); throw e; }
          };
        }

        // Dev-friendly upstream error toast (non-blocking). Shows a short toast with URL, content-type and a snippet.
        if(typeof window.showUpstreamError !== 'function'){
          window.showUpstreamError = function(details){
            try{
              if(typeof document === 'undefined') return;
              const id = '__ensar_upstream_error_toast';
              let container = document.getElementById(id);
              if(!container){
                container = document.createElement('div');
                container.id = id;
                container.style.position = 'fixed';
                container.style.right = '12px';
                container.style.bottom = '12px';
                container.style.zIndex = 999999;
                container.style.maxWidth = '420px';
                document.body.appendChild(container);
              }
              const box = document.createElement('div');
              box.style.background = '#2b2b2b';
              box.style.color = '#fff';
              box.style.padding = '10px 12px';
              box.style.borderRadius = '6px';
              box.style.boxShadow = '0 6px 18px rgba(0,0,0,0.3)';
              box.style.marginTop = '8px';
              box.style.fontSize = '13px';
              box.style.lineHeight = '1.2';
              const url = (details && details.url) ? details.url : '';
              const ct = (details && details.contentType) ? details.contentType : '';
              const snippet = (details && details.snippet) ? details.snippet : '';
              const title = document.createElement('div');
              title.style.fontWeight = '600';
              title.style.marginBottom = '6px';
              title.textContent = 'Upstream non-JSON response';
              const meta = document.createElement('div');
              meta.style.opacity = '0.9';
              meta.style.fontSize = '12px';
              meta.textContent = url + ' (' + ct + ')';
              const body = document.createElement('div');
              body.style.marginTop = '6px';
              body.style.whiteSpace = 'pre-wrap';
              body.style.maxHeight = '140px';
              body.style.overflow = 'hidden';
              body.textContent = snippet;
              box.appendChild(title);
              box.appendChild(meta);
              box.appendChild(body);
              container.appendChild(box);
              // Auto-dismiss
              setTimeout(function(){ try{ box.style.transition = 'opacity 0.4s'; box.style.opacity = '0'; setTimeout(function(){ try{ box.parentNode && box.parentNode.removeChild(box); }catch(_){} }, 450); }catch(_){} }, 8000);
            }catch(_){ }
          };
        }
      }
      if(typeof window.upsertBlok !== 'function'){
        window.upsertBlok = async function(rec){
          try{
            const arr = await (typeof getBloklar==='function' ? getBloklar() : []);
            const k = (rec.blokNo||'').trim().toLowerCase();
            const i = arr.findIndex(x=> (String(x.blokNo||'').trim().toLowerCase())===k);
            if(i>=0) arr[i] = Object.assign({}, arr[i], rec);
            else arr.unshift(rec);
            if(typeof setBloklar==='function') await setBloklar(arr);
            // Defer heavy UI work so the save action returns quickly
            try{ window.scheduleRenderAndThen(); }catch(_){ try{ updateBlokListDatalist && updateBlokListDatalist(); renderBloklar && renderBloklar(); }catch(_){ } }
            // Best-effort: push change to remote Apps Script WebApp if configured.
            try{
              if(typeof window.remoteUpsert === 'function'){
                // Send a shallow copy to avoid mutation issues; do not attempt complex local id reconciliation here.
                try{
                  const recCopy = Object.assign({}, rec);
                    // call remoteUpsert but don't await it — fire-and-forget
                    try{ window.remoteUpsert(recCopy).catch(function(err){ console.warn('remoteUpsert failed', err); }); }catch(_){ }
                }catch(_){ /* ignore */ }
              }
            }catch(_){ }
          }catch(e){ console.error('upsertBlok failed', e); }
        };
      }
      // Small utility: hide known overlays if they accidentally remain open
      function __forceHideOverlays(){ try{ ['loginOverlay','proformaPreviewModal','csvMappingModal','crmCheckModal'].forEach(id=>{ const el=document.getElementById(id); if(!el) return; el.style.display='none'; el.style.pointerEvents='none'; }); }catch(_){ } }
      // Emergency shortcut: Shift+U to force-hide overlays
      try{ window.addEventListener('keydown', function(e){ try{ if(e.shiftKey && (e.key||'').toLowerCase()==='u'){ __forceHideOverlays(); alert('Tüm üst katman pencereler kapatıldı.'); } }catch(_){ } }); }catch(_){ }
      
      // Station catalog: global tree + helpers (persisted) — used by Personel & Makine Malzemeleri
      (function(){
        const STATION_TREE_KEY = 'v91_station_catalog';
        function defaultStationTree(){
          return {
            'Blok Hazırlık ve Katrak Kesim': [
              'Sayalama Operatör',
              'Sağlamlaştırma',
              'Dış Vinç Operatör',
              'Katrak Operatör',
              'Artıma ve Vagon Temizlik',
              'Genel'
            ],
            'Katlı Fırın': [
              'Yükleme Robot Operatör',
              'Epoxy File Uygulama',
              'Ön Yüz Uygulama',
              'Silim Operatör',
              'Bandıl',
              'Genel'
            ],
            'Fayans Fırın': [
              'Fayans Fırın Operatör',
              'Epoxy File Uygulama',
              'Ön Yüz Epoxy',
              'Fırın Çıkış',
              'Silim Operatör',
              'Seleksiyoncu',
              'Kasalama-Tamir',
              'Genel'
            ],
            'Ara İstasyonlar': [
              'Köprü Kesim Operatör',
              'Plaka Ebatlama Operatör',
              'İç Vinç Operatör',
              'Yarma',
              'Çoklu Ebatlama',
              'Genel'
            ],
            'Genel': [
              'Genel Eleman'
            ]
          };
        }
        function getStationTree(){
          try{
            const raw = localStorage.getItem(STATION_TREE_KEY);
            if(!raw) return defaultStationTree();
            const t = JSON.parse(raw);
            return (t && typeof t==='object') ? t : defaultStationTree();
          }catch(_){ return defaultStationTree(); }
        }
        function setStationTree(tree){
          try{ localStorage.setItem(STATION_TREE_KEY, JSON.stringify(tree||defaultStationTree())); }catch(_){ /* noop */ }
        }
        function getStationLabels(){
          const t = getStationTree();
          const out = [];
          Object.keys(t).forEach(group=>{
            (t[group]||[]).forEach(sub=> out.push(`${group} / ${sub}`));
          });
          return out;
        }
        const LEGACY_STATION_MAP = {
          'Sayalama': 'Blok Hazırlık ve Katrak Kesim / Sayalama Operatör',
          'Sağlamlaştırma': 'Blok Hazırlık ve Katrak Kesim / Sağlamlaştırma',
          'Katrak Kesim': 'Blok Hazırlık ve Katrak Kesim / Katrak Operatör',
          'Plaka Fırın': 'Katlı Fırın / Genel',
          'Fayans Fırın': 'Fayans Fırın / Fayans Fırın Operatör',
          'Plaka Silim': 'Katlı Fırın / Silim Operatör',
          'Fayans Fırın Seleksiyon': 'Fayans Fırın / Seleksiyoncu',
          'Köprü Kesme': 'Ara İstasyonlar / Köprü Kesim Operatör',
          'Ara Makinalar': 'Ara İstasyonlar / Genel'
        };
        function normalizeStations(arr){
          try{
            const labels = new Set(getStationLabels());
            return (arr||[]).map(s=> labels.has(s) ? s : (LEGACY_STATION_MAP[s] || s));
          }catch(_){ return arr||[]; }
        }
        // expose
        window.getStationTree = getStationTree;
        window.setStationTree = setStationTree;
        window.getStationLabels = getStationLabels;
        window.normalizeStations = normalizeStations;
      })();
    
    /* ==== BODY inline script #2 ==== */
    // Excel import post-processing disabled: this script previously normalized and patched imported local data.
    (function(){
      try{
        // Disabled to avoid local modifications; rely on remote Apps Script for canonical data transforms.
      }catch(_){ }
    })();
    
    /* ==== BODY inline script #3 ==== */
    (function(){
        try{
          const KEY = 'fasoncu_fix_done_v1';
          const BL_KEY = 'bloklar_yeni_demo';
          if(localStorage.getItem(KEY)) return; // bir defa çalıştır
          const arr = JSON.parse(localStorage.getItem(BL_KEY)||'[]');
          if(!Array.isArray(arr) || !arr.length) return;
          let changed = 0;
          for(let i=0;i<arr.length;i++){
            const b = arr[i]||{};
            const before = b.fasoncuKodu;
            try{ b.durum = normalizeDurum(b.durum||'Ensar'); }catch(_){ }
            try{ b.fasoncuKodu = normalizeFasoncuKodu(b.fasoncuKodu, b.durum); }catch(_){ }
            if(before !== b.fasoncuKodu) changed++;
            arr[i]=b;
          }
          if(changed>0){ localStorage.setItem(BL_KEY, JSON.stringify(arr)); }
          localStorage.setItem(KEY,'1');
          if(changed>0) console.log('🔧 Fasoncu Kodu düzeltmesi uygulandı:', changed, 'kayıt güncellendi');
          try{ window.renderBloklar && window.renderBloklar(); }catch(_){ }
        }catch(e){ console.error('Fasoncu düzeltme hatası', e); }
      })();
    
    /* ==== BODY inline script #4 ==== */
    // Sayfa açıldığında: aktif kullanıcı yoksa giriş ekranını aç
    document.addEventListener('DOMContentLoaded', function(){
      try{
        var login = document.getElementById('loginOverlay');
        var userSel = document.getElementById('loginUserSelect');
        var passInp = document.getElementById('loginPassword');
        var btn = document.getElementById('btnLogin');
        var err = document.getElementById('loginError');
        function getActiveUserId(){ try{ return localStorage.getItem('v91_active_user_id')||''; }catch(_){ return ''; } }
        function setActiveUserId(id){ try{ localStorage.setItem('v91_active_user_id', id||''); }catch(_){ } }
        function getUsers(){
          try{
            // CRM kullanıcıları varsa onları kullan; yoksa basit demo listesi
            var raw = localStorage.getItem('v91_users');
            var arr = raw ? JSON.parse(raw) : [];
            if(Array.isArray(arr) && arr.length) return arr.map(u => ({ id: u.id, name: u.name, role: u.role }));
            return [ { id:'admin', name:'admin', role:'admin' }, { id:'user', name:'user', role:'user' } ];
          }catch(e){ console.error(e); return [ { id:'admin', name:'admin', role:'admin' } ]; }
        }
        function renderUserOptions(){
          try{
            var users = getUsers(); if(!userSel) return;
            // Güvenli DOM: option elemanlarını oluştur
            try{ // clear safely
              while(userSel.firstChild) userSel.removeChild(userSel.firstChild);
            }catch(_){ }
            users.forEach(function(u){
              try{
                const opt = document.createElement('option');
                opt.value = u.id || u.name || '';
                opt.textContent = u.name || u.id || opt.value;
                userSel.appendChild(opt);
              }catch(_){ /* skip faulty user */ }
            });
          }catch(_){ }
        }
        function showLogin(){ if(login){ login.style.display='flex'; login.style.pointerEvents='auto'; } }
        function hideLogin(){ if(login){ login.style.display='none'; login.style.pointerEvents='none'; } }
    
        // İlk açılışta kullanıcı yoksa overlay göster (host fonksiyonu varsa onu da tetikle)
        if(!getActiveUserId()){
          renderUserOptions();
          try{ if(typeof window.showLoginOverlay === 'function'){ window.showLoginOverlay(); } }catch(_){ }
          showLogin();
          try{ (userSel||{}).focus && userSel.focus(); }catch(_){ }
        }
    
        if(btn) btn.addEventListener('click', function(){
          try{
            var users = getUsers();
            var selId = userSel && userSel.value ? userSel.value : '';
            var u = users.find(function(x){ return (x.id||x.name||'') === selId; });
            // Fallback: seçilen value ile eşleşme yoksa isim bazlı case-insensitive ara
            if(!u && selId){
              var selLower = String(selId||'').toLowerCase();
              u = users.find(function(x){ return String(x.name||'').toLowerCase() === selLower || String(x.id||'').toLowerCase() === selLower; });
            }
            // Eğer hâlâ bulunamadıysa, default admin kullanıcı yoksa oluştur ve tekrar dene
            if(!u){
              try{
                if(typeof ensureDefaultAdminUser === 'function'){
                  ensureDefaultAdminUser();
                  users = getUsers();
                  u = users[0] || null;
                  if(u && userSel){
                    // yeniden doldur ve seçili yap
                    renderUserOptions();
                    try{ userSel.value = u.id || u.name || ''; }catch(_){ }
                  }
                }
              }catch(_){ }
            }
            if(!u){ if(err){ err.textContent='Kullanıcı bulunamadı.'; err.style.display='block'; } return; }
            if(err) err.style.display='none';
            setActiveUserId(u.id||u.name||'');
            try{ if(typeof window.applyPermissions === 'function') window.applyPermissions(); }catch(e){ console.error(e); }
            hideLogin();
            // üst barda kullanıcı kontrollerini yeniden çiz
            try{ if(typeof window.renderUserControls === 'function') window.renderUserControls(); }catch(e){ console.error(e); }
          }catch(e){ console.error(e); }
        });
      }catch(_){ }
    });
    
    /* ==== BODY inline script #5 ==== */
    // Kullanıcı alanı en üstte kalsın; üst bar her zaman görünür olsun
    document.addEventListener('DOMContentLoaded', function(){
      try{
        const header = document.querySelector('.page header');
        const tabs = header?.querySelector('.tabs');
        const uc = document.getElementById('userControls');
        const topbar = header?.querySelector('.topbar');
        // Eğer bir sebeple yanlış yerdeyse, tekrar topbara al
        if(topbar && uc && !topbar.contains(uc)){
          topbar.appendChild(uc);
        }
        // Üst barı görünür tut
        if(topbar){ topbar.style.display = 'flex'; }
        // Sekmelerin üstten biraz boşluğu olduğundan emin ol (CSS ile de verildi)
        if(tabs){ const m = window.getComputedStyle(tabs).marginTop; if(!m || m==='0px'){ tabs.style.marginTop = '8px'; } }
    
        // Veri içe/dışa aktar düğmeleri ekle
        try{
          if(uc){
            const btnImport = document.createElement('button');
            btnImport.className = 'btn ghost';
            btnImport.textContent = 'İçe Aktar';
            btnImport.title = 'JSON dosyasından blok verisi içe aktar';
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'application/json,.json';
            fileInput.style.display = 'none';
            btnImport.addEventListener('click', function(){ fileInput.click(); });
            fileInput.addEventListener('change', function(){
              try{
                const f = (fileInput.files||[])[0]; if(!f) return;
                const reader = new FileReader();
                reader.onload = function(){
                  try{
                    const txt = String(reader.result||'');
                    const data = JSON.parse(txt);
                    if(!Array.isArray(data)) { alert('JSON bir dizi olmalı'); return; }
                    // Basit doğrulama ve normalizasyon
                    const norm = data.map(function(b){
                      const x = b||{};
                      return {
                        blokNo: String(x.blokNo||'').trim(),
                        fasoncuKodu: String(x.fasoncuKodu||'').trim(),
                        ocakIsmi: String(x.ocakIsmi||'').trim(),
                        blokAdi: String(x.blokAdi||'').trim(),
                        durum: normalizeDurum(x.durum||'Ensar'),
                        en: Number(x.en||0),
                        boy: Number(x.boy||0),
                        yukseklik: Number(x.yukseklik||0),
                        gelisTarihi: String(x.gelisTarihi||''),
                        m3: Number(x.m3||(((Number(x.en||0)*Number(x.boy||0)*Number(x.yukseklik||0))/1000000)||0)),
                        asama: String(x.asama||'Ham')
                      };
                    });
                    try{
                      if(typeof setBloklar === 'function'){
                        // prefer centralized save so remoteUpsert/snapshot runs
                        try{ setBloklar(norm).catch && setBloklar(norm).catch(function(){ /* swallow */ }); }catch(_){ try{ setBloklar(norm); }catch(__){ } }
                      } else {
                        localStorage.setItem('bloklar_yeni_demo', JSON.stringify(norm));
                      }
                    }catch(e){ try{ localStorage.setItem('bloklar_yeni_demo', JSON.stringify(norm)); }catch(_){ } }
                    localStorage.setItem('excel_import_done','1');
                    localStorage.setItem('excel_import_fix_done_v2','1');
                    try{ window.renderBloklar && window.renderBloklar(); }catch(_){ }
                    try{ showToast('Veri içe aktarıldı'); }catch(_){ }
                  }catch(e){ alert('İçe aktarma hatası: '+ e.message); }
                };
                reader.readAsText(f);
              }catch(e){ alert('Dosya okuma hatası: '+ e.message); }
            });
    
            const btnExport = document.createElement('button');
            btnExport.className = 'btn ghost';
            btnExport.textContent = 'Dışa Aktar';
            btnExport.title = 'Blok verisini JSON olarak indir';
            btnExport.addEventListener('click', function(){
              try{
                const raw = localStorage.getItem('bloklar_yeni_demo')||'[]';
                const blob = new Blob([raw], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'bloklar.json';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(()=> URL.revokeObjectURL(url), 500);
              }catch(e){ alert('Dışa aktarma hatası: '+ e.message); }
            });
    
            uc.style.display = 'flex';
            uc.appendChild(btnImport);
            uc.appendChild(fileInput);
            uc.appendChild(btnExport);
          }
        }catch(_){ }
      }catch(_){ }
    });
    
    /* ==== BODY inline script #6 ==== */
    // Üst barda kullanıcı alanını (login veya kullanıcı seçimi) çiz
    function renderUserControls(){
      try{
      const uc = document.getElementById('userControls'); if(!uc) return;
        const users = getUsers();
        const aid = getActiveUserId();
        const activeUser = users.find(u=> u.id===aid);
      try{ while(uc.firstChild) uc.removeChild(uc.firstChild); }catch(_){ uc.textContent = ''; }
        // her durumda görünür olsun
        try{ uc.style.display = 'flex'; }catch(_){ }
        if(activeUser){
          try{
            // label + select
            const lbl = document.createElement('label');
            lbl.style.fontSize = '11.5px'; lbl.style.color = '#475569'; lbl.style.display = 'flex'; lbl.style.alignItems = 'center'; lbl.style.gap = '3px'; lbl.style.lineHeight = '20px';
            const sel = document.createElement('select'); sel.id = 'activeUserSelect'; sel.className = 'field small'; sel.style.minWidth = '120px'; sel.style.height='22px'; sel.style.padding='2px 6px';
            lbl.appendChild(sel);
            uc.appendChild(lbl);
            const btnLogout = document.createElement('button'); btnLogout.type='button'; btnLogout.id='btnLogout'; btnLogout.className='btn ghost small'; btnLogout.style.height='22px'; btnLogout.style.lineHeight='20px'; btnLogout.style.padding='0 8px'; btnLogout.textContent='Çıkış';
            uc.appendChild(btnLogout);
            try{ renderActiveUserSelect(); }catch(_){ }
            btnLogout.addEventListener('click', function(){ try{
              const keys=[]; for(let i=0;i<sessionStorage.length;i++){ const k=sessionStorage.key(i); if(k && k.startsWith('v91_auth_role_')) keys.push(k); }
              keys.forEach(k=> sessionStorage.removeItem(k));
            }catch(_){ }
              setActiveUserId(''); applyPermissions(); renderUserControls();
              // Çıkıştan sonra giriş overlay'ini aç
              try{ if(typeof window.showLoginOverlay === 'function'){ window.showLoginOverlay(); } }catch(_){ }
              try{
                const login = document.getElementById('loginOverlay');
                if(login){ login.style.display='flex'; login.style.pointerEvents='auto'; }
                const sel2 = document.getElementById('loginUserSelect'); if(sel2 && typeof sel2.focus === 'function') sel2.focus();
              }catch(_){ }
            });
          }catch(_){ }
        } else {
          try{
            // If there is exactly one user, auto-login them to avoid asking repeatedly
            if(Array.isArray(users) && users.length===1){
              try{ setActiveUserId(users[0].id); applyPermissions(); return renderUserControls(); }catch(_){ }
            }
            // Otherwise prefer the blocking login overlay instead of the inline compact login.
            try{ if(typeof window.showLoginOverlay === 'function') window.showLoginOverlay(); }catch(_){ }
            // As a fallback (very small screens or if overlay missing) still render the inline controls so user can login
            const wrap = document.createElement('div'); wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.gap='8px'; wrap.style.flexWrap='wrap';
            const inpUser = document.createElement('input'); inpUser.id='inlineLoginUser'; inpUser.className='field'; inpUser.placeholder='Kullanıcı adı'; inpUser.style.minWidth='160px'; inpUser.style.padding='4px 6px';
            const btn = document.createElement('button'); btn.id='inlineLoginBtn'; btn.className='btn small primary'; btn.type='button'; btn.textContent='Giriş';
            const spanErr = document.createElement('span'); spanErr.id='inlineLoginError'; spanErr.style.display='none'; spanErr.style.color='#b91c1c'; spanErr.style.fontSize='12px';
            wrap.appendChild(inpUser); wrap.appendChild(btn); wrap.appendChild(spanErr);
            uc.appendChild(wrap);
            btn.addEventListener('click', function(){
              try {
                const name = (document.getElementById('inlineLoginUser')?.value||'').trim();
                const err = document.getElementById('inlineLoginError');
                const users = getUsers();
                const u = users.find(x=> (x.name||'').trim().toLowerCase() === name.toLowerCase());
                if(!u){ if(err){ err.textContent='Kullanıcı bulunamadı.'; err.style.display='inline'; } return; }
                if(err) err.style.display='none';
                setActiveUserId(u.id); applyPermissions(); renderUserControls();
              } catch(e) { console.error(e); }
            });
          }catch(e){ console.error(e); }
        }
      }catch(_){ }
    }
    // Top-level tabs switching: show the selected section by data-target
    document.addEventListener('DOMContentLoaded', function(){
      try{
        const tabs = Array.from(document.querySelectorAll('.tabs .tab'));
        const sections = Array.from(document.querySelectorAll('.section'));
        function showSection(id){
          tabs.forEach(b=> b.classList.toggle('active', b.getAttribute('data-target')===id));
          sections.forEach(s=>{
            const isTarget = (s.id === id);
            s.classList.toggle('active', isTarget);
            // Target section'ı görünür yap, diğerlerini gizle
            if(isTarget) {
              s.style.display = '';
            } else {
              s.style.display = 'none';
            }
          });
        }
        tabs.forEach(b=> b.addEventListener('click', function(){ const id=this.getAttribute('data-target'); if(id) showSection(id); }));
        // Initial selection: keep current active if visible, otherwise first visible
        const current = tabs.find(b=> b.classList.contains('active') && b.style.display !== 'none');
        const firstVisible = current || tabs.find(b=> b.style.display !== 'none') || tabs[0];
        if(firstVisible){ showSection(firstVisible.getAttribute('data-target')); }
      }catch(_){ }
    });
    
    /* ==== BODY inline script #7 ==== */
    // Safer modal handling: ESC ve arkaplana tıklayınca (login hariç) modalları kapat
    document.addEventListener('DOMContentLoaded', function(){
      try{
        const ids = ['proformaPreviewModal','csvMappingModal','crmCheckModal'];
        function hide(id){ const el=document.getElementById(id); if(el){ el.style.display='none'; el.style.pointerEvents='none'; } }
        function show(id){ const el=document.getElementById(id); if(el){ el.style.display='flex'; el.style.pointerEvents='auto'; } }
        // Escape ile kapat (loginOverlay hariç)
        window.addEventListener('keydown', function(e){ if((e.key||'').toLowerCase()==='escape'){ ids.forEach(hide); } });
        // Arkaplana tıkla -> kapat
        ids.forEach(id=>{ const el=document.getElementById(id); if(!el) return; el.addEventListener('click', function(ev){ if(ev.target===el){ hide(id); } }); });
        // Login overlay gösterildiğinde sadece pointer events açık olsun, gizlenince kapalı
        const login = document.getElementById('loginOverlay'); if(login){
          const _showLogin = window.showLoginOverlay; const _hideLogin = window.hideLoginOverlay;
          window.showLoginOverlay = function(){ if(typeof _showLogin==='function') _showLogin(); try{ login.style.pointerEvents='auto'; }catch(_){ } };
          window.hideLoginOverlay = function(){ if(typeof _hideLogin==='function') _hideLogin(); try{ login.style.pointerEvents='none'; }catch(_){ } };
          // İlk durumda; görünürlüğe göre pointer-events ayarla (overlay daha önce gösterilmiş olabilir)
          try{
            var isVisible = false;
            try{ isVisible = (login.style.display && login.style.display !== 'none') || (window.getComputedStyle ? window.getComputedStyle(login).display !== 'none' : false); }catch(_){ isVisible = false; }
            login.style.pointerEvents = isVisible ? 'auto' : 'none';
          }catch(_){ }
        }
      }catch(_){ }
    });
    
    /* ==== BODY inline script #8 ==== */
    // Sağlamlaştırma planı iframe entegrasyonu (bağımsız; köprü yok)
          (function(){
            let frame, loaded = false;
            // iframe origin hesaplayıcı
            function getFrameOrigin(frm){
              try{
                if(!frm) return null;
                const src = frm.getAttribute && frm.getAttribute('src') ? frm.getAttribute('src') : frm.src || '';
                if(!src) return null;
                return new URL(src, location.href).origin;
              }catch(_){ return null; }
            }
            function postToChild(type, payload){
              try{
                if(!frame || !frame.contentWindow) return;
                const origin = getFrameOrigin(frame) || '*';
                frame.contentWindow.postMessage(Object.assign({ type: type }, payload||{}), origin);
              }catch(_){ }
            }
    
            function ensureIframe(){
              if(loaded) return;
              frame = document.getElementById('saglam_iframe');
              if(!frame) return;
              const url = encodeURI('sağlamlaştırma planla.html');
              frame.addEventListener('load', function(){
                try{
                  document.getElementById('saglam_iframe_placeholder')?.remove();
                  frame.style.display = '';
                  // Handshake: gönder host origin bilgisi
                  try{ postToChild('host.init', { origin: window.location.origin || location.origin }); }catch(_){ }
                }catch(_){ }
              });
              frame.src = url;
              loaded = true;
            }
            // Parent <- Child: güvenli mesaj dinleyici (origin doğrulamalı)
            window.addEventListener('message', function(ev){
              try{
                const data = ev && ev.data; if(!data || !data.type) return;
                const allowedOrigin = frame ? getFrameOrigin(frame) : null;
                if(allowedOrigin && ev.origin !== allowedOrigin){ return; }
                switch(data.type){
                  case 'saglam.heightChanged':{
                    try{ if(frame){ const h = Math.max(200, parseInt(data.height||'600',10)||600); frame.style.height = h + 'px'; } }catch(_){ }
                    break;
                  }
                  case 'saglam.ready':{
                    // child hazır — ileride veri paylaşımı gerekirse buradan gönderilir
                    try{ postToChild('host.init', { origin: window.location.origin || location.origin }); }catch(_){ }
                    break;
                  }
                }
              }catch(_){ /* malformed/unauthorized messages ignored */ }
            });
            function wireLazyLoad(){
              try{
                const btn = document.querySelector('#planlama-subtabs .subtab[data-sub="plan_saglamlastirma"]');
                if(!btn) return;
                btn.addEventListener('click', function(){ setTimeout(ensureIframe, 20); }, { once:false });
                if(btn.classList.contains('active')){ setTimeout(ensureIframe, 20); }
              }catch(_){ }
            }
            if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireLazyLoad); else wireLazyLoad();
          })();
    
    /* ==== BODY inline script #9 ==== */
    // IFRAME mikro-frontend entegrasyonu (postMessage köprüsü)
          (function(){
            let frame, loaded = false;
            function getBloklarHost(){
              try{
                if(typeof window.getBloklar === 'function') return window.getBloklar() || [];
                const raw = localStorage.getItem('bloklar_yeni_demo') || localStorage.getItem('bloklar') || '[]';
                try{ return JSON.parse(raw||'[]'); }catch(e){ if(typeof raw === 'string' && raw.trim() === 'done'){ try{ localStorage.removeItem('bloklar_yeni_demo'); }catch(_){ } } return []; }
              }catch(_){ return []; }
            }
            function getAltBloklarHost(){
              try{
                const raw = localStorage.getItem('v91_sayalanmis_bloklar') || '[]';
                try{ const arr = JSON.parse(raw||'[]'); return Array.isArray(arr) ? arr : []; }catch(_){ return []; }
              }catch(_){ return []; }
            }
            function getFrameOrigin(frm){
              try{
                if(!frm) return null;
                const src = frm.getAttribute && frm.getAttribute('src') ? frm.getAttribute('src') : frm.src || '';
                if(!src) return null;
                return new URL(src, location.href).origin;
              }catch(_){ return null; }
            }
            function postToChild(type, payload){
              try{
                if(!frame || !frame.contentWindow) return;
                const origin = getFrameOrigin(frame) || '*';
                frame.contentWindow.postMessage(Object.assign({ type: type }, payload||{}), origin);
              }catch(_){ }
            }
            function ensureIframe(){
              if(loaded) return;
              frame = document.getElementById('katrak_iframe');
              if(!frame) return;
              const url = encodeURI('katrak planla.html') + (('' + ('?embed=1')));
              frame.addEventListener('load', function(){
                try{
                  document.getElementById('katrak_iframe_placeholder')?.remove();
                  frame.style.display = '';
                  // İlk blok listesi sağla
                  postToChild('katrak.provideBlokList', { bloklar: getBloklarHost() });
                  postToChild('katrak.provideAltBlokList', { altBloklar: getAltBloklarHost() });
                  // Handshake: gönder host origin bilgisi
                  try{ postToChild('host.init', { origin: window.location.origin || location.origin }); }catch(_){ }
                }catch(_){ }
              });
              frame.src = url;
              loaded = true;
            }
    
            // Parent <- Child mesajları (gelen mesajın origin'i iframe.src ile eşleşiyorsa işleme al)
            window.addEventListener('message', function(ev){
              try{
                const data = ev && ev.data; if(!data || !data.type) return;
                // Only accept messages from the iframe origin (if known)
                const allowedOrigin = frame ? getFrameOrigin(frame) : null;
                if(allowedOrigin && ev.origin !== allowedOrigin){ return; }
                switch(data.type){
                case 'katrak.requestBlokList':{
                  postToChild('katrak.provideBlokList', { bloklar: getBloklarHost() });
                  break;
                }
                case 'katrak.requestAltBlokList':{
                  postToChild('katrak.provideAltBlokList', { altBloklar: getAltBloklarHost() });
                  break;
                }
                case 'katrak.saveRequest':{
                  try{
                    const rec = Object.assign({}, data.rec||{});
                    const bloklar = getBloklarHost();
                    const found = bloklar.find(b=> (b.blokNo||b.blok_no||b.id||b.blok||'') == (rec.blok||''));
                    if(!found){ postToChild('katrak.saveResponse', { ok:false, reason:'Seçili blok bulunamadı' }); break; }
                    rec.blokAdi = rec.blokAdi || found.blokAdi || '';
                    // İsteğe bağlı: host içinde yerel kaydetme/Log tutma yapılabilir
                    postToChild('katrak.saveResponse', { ok:true, rec: rec });
                  }catch(e){ postToChild('katrak.saveResponse', { ok:false, reason: (e && e.message)||'Hata' }); }
                  break;
                }
                case 'katrak.heightChanged':{
                  try{ if(frame){ const h = Math.max(200, parseInt(data.height||'600',10)||600); frame.style.height = h + 'px'; } }catch(_){ }
                  break;
                }
                case 'katrak.ready':{
                  // Child hazır: blok listesini tekrar gönder
                  postToChild('katrak.provideBlokList', { bloklar: getBloklarHost() });
                  postToChild('katrak.provideAltBlokList', { altBloklar: getAltBloklarHost() });
                  break;
                }
              }
              }catch(_){ /* ignore malformed/unauthorized messages */ }
            });
    
            // Sekme tıklanınca/lazily yükle
            function wireLazyLoad(){
              try{
                const btn = document.querySelector('#planlama-subtabs .subtab[data-sub="plan_katrak"]');
                if(!btn) return;
                btn.addEventListener('click', function(){ setTimeout(ensureIframe, 20); }, { once:false });
                if(btn.classList.contains('active')){ setTimeout(ensureIframe, 20); }
              }catch(_){ }
            }
            if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireLazyLoad); else wireLazyLoad();
          })();
    
    /* ==== BODY inline script #10 ==== */
    (function(){
        const wrapper = document.getElementById('planlama'); if(!wrapper) return;
        const tabs = Array.from(document.querySelectorAll('#planlama-subtabs .subtab'));
        const cards = Array.from(wrapper.querySelectorAll(':scope .plan-subcard'));
        function show(sub){ tabs.forEach(t=> t.classList.toggle('active', t.dataset.sub===sub)); cards.forEach(c=> c.style.display = (c.id === sub+'-content') ? '' : 'none'); }
        tabs.forEach(t=> t.addEventListener('click', function(){ show(t.dataset.sub); }));
        const first = tabs.find(t=> t.classList.contains('active')) || tabs[0]; if(first) show(first.dataset.sub);
    
        // Simple add handlers which persist basic plan items in localStorage under keys
        function listKey(k){ return 'plan_'+k; }
        function getList(k){ try{ return JSON.parse(localStorage.getItem(listKey(k))||'[]'); }catch(e){ return []; } }
        function setList(k,a){ localStorage.setItem(listKey(k), JSON.stringify(a)); }
      function renderList(k, elId){ const el = document.getElementById(elId); if(!el) return; const arr = getList(k) || []; el.innerHTML = ''; if(!arr.length){ const d = document.createElement('div'); d.style.color = '#64748b'; d.textContent = 'Plan yok'; el.appendChild(d); return; } const ul = document.createElement('ul'); ul.style.margin = '0'; ul.style.paddingLeft = '18px'; arr.forEach(function(i){ const li = document.createElement('li'); li.textContent = (i.date||'') + ' — ' + (i.note||''); ul.appendChild(li); }); el.appendChild(ul); }
    
        // wire add buttons (also schedule remote sync)
        [['sayalama','plan_sayalama_date','plan_sayalama_add','plan_sayalama_list'], ['saglam','plan_saglam_date','plan_saglam_add','plan_saglam_list'], ['katrak','plan_katrak_date','plan_katrak_add','plan_katrak_list'], ['plaka','plan_plaka_date','plan_plaka_add','plan_plaka_list'], ['fayans','plan_fayans_date','plan_fayans_add','plan_fayans_list']].forEach(function(cfg){
          const key = cfg[0]; const dateId = cfg[1]; const btnId = cfg[2]; const listId = cfg[3];
          renderList(key, listId);
          document.getElementById(btnId)?.addEventListener('click', function(){
            const d = document.getElementById(dateId)?.value || ''; if(!d) return alert('Tarih seçin');
            const arr = getList(key);
            // create a local record id so remote can upsert and we can reconcile later
            const rec = { id: 'local-' + Date.now(), date: d, note: '', ts: Date.now() };
            arr.unshift(rec);
            setList(key, arr);
            renderList(key, listId);
            try{ // try to sync immediately, enqueue on failure
              try{ scheduleSync(listKey(key), rec); }catch(e){ try{ enqueueSync({ key: listKey(key), rec: rec }); }catch(_){ } }
            }catch(_){ }
            showToast('Plan eklendi');
          });
        });
      })();
      // Başarı çipi: üst barda görünür, otomatik gizlenir
      function showSuccessChip(blokNo){
        try{
          const bar = document.getElementById('successChipBar');
          if(!bar) return;
          // clear and build chip using DOM APIs to avoid injecting untrusted HTML
          while(bar.firstChild) bar.removeChild(bar.firstChild);
          const chip = document.createElement('div');
          chip.className = 'success-chip';
          const dot = document.createElement('span'); dot.className = 'dot';
          const txt = document.createElement('span'); txt.textContent = 'Blok kaydedildi';
          chip.appendChild(dot);
          chip.appendChild(txt);
          if(blokNo){ const strong = document.createElement('strong'); strong.textContent = '#'+String(blokNo); strong.style.marginLeft = '6px'; chip.appendChild(strong); }
          bar.appendChild(chip);
          bar.style.display = 'block';
      setTimeout(function(){ try{ bar.style.display = 'none'; while(bar.firstChild) bar.removeChild(bar.firstChild); }catch(_){ try{ bar.textContent=''; }catch(_){ } } }, 2500);
        }catch(_){ }
      }
    
      // Duplicate uyarısı için küçük modal
      function showDuplicateModal(blokNo, onShowExisting){
        try{
          let modal = document.getElementById('blokDuplicateModal');
          if(!modal){
            modal = document.createElement('div');
            modal.id = 'blokDuplicateModal';
            modal.style.position='fixed'; modal.style.inset='0'; modal.style.background='rgba(0,0,0,0.25)'; modal.style.display='none'; modal.style.zIndex='9999';
            const box = document.createElement('div');
            box.style.maxWidth='420px'; box.style.margin='12% auto'; box.style.background='#ffffff'; box.style.borderRadius='10px'; box.style.boxShadow='0 10px 30px rgba(0,0,0,0.15)'; box.style.padding='16px'; box.style.border='1px solid #e5e7eb';
            box.innerHTML = [
              '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">',
              '<div style="width:10px;height:10px;border-radius:9999px;background:#f59e0b"></div>',
              '<div style="font-weight:700;color:#111827">Aynı Blok No zaten var</div>',
              '</div>',
              '<div id="dupModalMsg" style="color:#374151;margin-bottom:12px;"></div>',
              '<div style="display:flex;gap:8px;justify-content:flex-end">',
              '<button id="dupShowBtn" class="btn primary">Var olanı göster</button>',
              '<button id="dupCloseBtn" class="btn ghost">Kapat</button>',
              '</div>'
            ].join('');
            modal.appendChild(box);
            document.body.appendChild(modal);
            box.querySelector('#dupCloseBtn').addEventListener('click', function(){ modal.style.display='none'; });
            box.querySelector('#dupShowBtn').addEventListener('click', function(){ try{ modal.style.display='none'; onShowExisting && onShowExisting(); }catch(_){ } });
          }
          const msgEl = modal.querySelector('#dupModalMsg');
          if(msgEl) msgEl.textContent = 'Bu Blok No: #' + String(blokNo) + ' zaten kayıtlı. Var olan satıra gidebilirsiniz.';
          modal.style.display = 'block';
        }catch(_){ alert('Bu Blok No zaten kayıtlı: '+String(blokNo)); }
      }
    
    /* ==== BODY inline script #11 ==== */
    document.addEventListener('DOMContentLoaded', function(){
      // Başarı çipi yardımcıları
      function showSuccessChip(msg){
        try{
          let chip = document.getElementById('blokSaveSuccessChip');
          // Eksikse dinamik oluştur
          if(!chip){
            const toolbar = document.querySelector('#blok_listesi-content .bloklistesi-toolbar');
            if(toolbar){
              chip = document.createElement('span');
              chip.id = 'blokSaveSuccessChip';
              chip.style.display = 'none';
              chip.style.alignItems = 'center';
              chip.style.gap = '6px';
              chip.style.padding = '4px 10px';
              chip.style.borderRadius = '999px';
              chip.style.fontWeight = '700';
              chip.style.fontSize = '12px';
              chip.style.background = '#ecfdf5';
              chip.style.color = '#065f46';
              chip.style.border = '1px solid #a7f3d0';
              chip.style.boxShadow = '0 1px 6px rgba(16,185,129,0.15)';
              // create content safely: text node + span for detail
              chip.appendChild(document.createTextNode('✓ Kaydedildi '));
              const detailSpan = document.createElement('span');
              detailSpan.id = 'blokSaveSuccessDetail';
              detailSpan.style.fontWeight = '600';
              detailSpan.style.color = '#047857';
              chip.appendChild(detailSpan);
              toolbar.appendChild(chip);
            }
          }
          const det = document.getElementById('blokSaveSuccessDetail');
          if(!chip) return;
          if(det) det.textContent = msg ? ' (' + String(msg) + ')' : '';
          chip.style.display = 'inline-flex';
          chip.style.opacity = '0';
          chip.style.transition = 'opacity .25s ease';
          requestAnimationFrame(function(){ chip.style.opacity = '1'; });
          setTimeout(function(){ try{ chip.style.opacity = '0'; setTimeout(function(){ chip.style.display = 'none'; }, 250); }catch(_){ } }, 1600);
        }catch(_){ }
      }
      try{ window.showSuccessChip = showSuccessChip; }catch(_){ }
      // Geri al çipi yardımcıları
      let __lastDeletedBlok = null; // { rec, at }
      function showUndoChip(blokNo){
        try{
          const chip = document.getElementById('blokUndoChip');
          const det = document.getElementById('blokUndoDetail');
          const btn = document.getElementById('btnUndoBlok');
          if(!chip || !btn) return;
          if(det) det.textContent = blokNo ? ' (' + String(blokNo) + ')' : '';
          chip.style.display = 'inline-flex';
          chip.style.opacity = '0';
          chip.style.transition = 'opacity .25s ease';
          requestAnimationFrame(function(){ chip.style.opacity = '1'; });
          // Otomatik gizleme (5sn sonra)
          setTimeout(function(){ try{ chip.style.opacity = '0'; setTimeout(function(){ chip.style.display = 'none'; }, 250); }catch(_){ } }, 5000);
          // Undo davranışı
          btn.onclick = async function(){
            try{
              if(!__lastDeletedBlok || !__lastDeletedBlok.rec) return;
              const arr = await (typeof getBloklar==='function' ? getBloklar() : []);
              const k = String(__lastDeletedBlok.rec.blokNo||'').trim().toLowerCase();
              const exists = (arr||[]).some(x=> String(x?.blokNo||'').trim().toLowerCase()===k);
              if(!exists){ arr.unshift(__lastDeletedBlok.rec); }
              if(typeof setBloklar==='function') await setBloklar(arr);
              try{ renderBloklar && renderBloklar(); updateBlokListDatalist && updateBlokListDatalist(); }catch(_){ }
              chip.style.opacity = '0'; setTimeout(function(){ chip.style.display = 'none'; }, 250);
            }catch(e){ console.error('Undo failed', e); }
          };
        }catch(_){ }
      }
      // Blok formunu kaydet: submit -> readBlokForm -> upsertBlok
      try{
        const frm = document.getElementById('frmBlok');
        if(frm){
          frm.addEventListener('submit', async function(ev){
            ev.preventDefault();
            try{
              // Konfigürasyon: satır vurgusu
              const HIGHLIGHT_MS = 2500; // süre (ms) – görünürlüğü artırıldı
              const HIGHLIGHT_BG = '#fef3c7'; // amber-100 (daha belirgin)
              let rec = (typeof readBlokForm==='function') ? readBlokForm() : null;
              // Emniyet: blokNo'yu doğrudan inputtan oku ve trimle
              try{ const directBlokNo = (frm.querySelector('[name=blokNo]')?.value||'').trim(); if(rec) rec.blokNo = directBlokNo; else rec = { blokNo: directBlokNo }; }catch(_){ }
              // Blok No doğrulaması: doğrudan frm üzerinden kontrol et
              if(!rec || !String(rec.blokNo||'').trim()){ try{ frm.querySelector('[name=blokNo]')?.focus(); }catch(_){ } alert('Blok No zorunlu'); return; }
              // Duplicate kontrolü
              let existing = await (typeof getBloklar==='function' ? getBloklar() : []);
              if(!Array.isArray(existing)){ try{ existing = []; }catch(_){ existing = []; } }
              const key = String(rec.blokNo||'').trim().toLowerCase();
              const dupIndex = existing.findIndex(x => String((x && x.blokNo) || '').trim().toLowerCase() === key);
              // Edit modu: __editKey mevcut ve aynı blokNo ise duplicate uyarısını atla
              const editKeyEl = frm.querySelector('[name="__editKey"]');
              const editKey = String((editKeyEl && editKeyEl.value) || '').trim().toLowerCase();
              const isEditMode = !!editKey && editKey === key;
              if(dupIndex >= 0 && !isEditMode){
                // Kullanıcı dostu diyalog: var olan satıra git veya kapat
                showDuplicateModal(rec.blokNo, function(){
                  try{
                    renderBloklar && renderBloklar();
                    const tbody = document.getElementById('tbodyBlok');
                    const rows = Array.from(tbody?.querySelectorAll('tr')||[]);
                    const target = rows.find(tr => {
                      const tds = tr.querySelectorAll('td');
                      return tds && tds[1] && (tds[1].textContent||'').trim().toLowerCase() === key;
                    });
                    if(target){
                      target.style.transition = 'background-color 0.6s ease';
                      target.style.backgroundColor = HIGHLIGHT_BG;
                      target.scrollIntoView({ behavior:'smooth', block:'center' });
                      setTimeout(function(){ target.style.backgroundColor=''; }, HIGHLIGHT_MS);
                    }
                  }catch(_){ }
                });
                return;
              }
              // --- Optimistic UI: hızlıca bir geçici satır ekle (kullanıcı algısı için)
              let __optimisticRow = null;
              try{
                const tbody = document.getElementById('tbodyBlok');
                if(tbody){
                  const tr = document.createElement('tr');
                  tr.className = 'optimistic-row';
                  // Minimal hücre yapısı: Tarih, Blok No, Taş İsmi, En, Boy, Yükseklik, İşlem
                  const now = new Date();
                  const dateCell = document.createElement('td'); dateCell.textContent = (rec.gelisTarihi||(''+now.getFullYear()+'-'+(now.getMonth()+1)+'-'+now.getDate()));
                  const blokCell = document.createElement('td'); blokCell.textContent = rec.blokNo || '';
                  const tasCell = document.createElement('td'); tasCell.textContent = rec.blokAdi || '';
                  const zamanCell = document.createElement('td'); zamanCell.textContent = rec.zaman || '';
                  const enCell = document.createElement('td'); enCell.textContent = rec.en || '';
                  const boyCell = document.createElement('td'); boyCell.textContent = rec.boy || '';
                  const yukCell = document.createElement('td'); yukCell.textContent = rec.yukseklik || '';
                  const opsCell = document.createElement('td'); opsCell.innerHTML = '<span style="opacity:.7">Kaydediliyor…</span>';
                  tr.appendChild(dateCell); tr.appendChild(blokCell); tr.appendChild(tasCell); tr.appendChild(zamanCell); tr.appendChild(enCell); tr.appendChild(boyCell); tr.appendChild(yukCell); tr.appendChild(opsCell);
                  // Insert at top to match unshift behavior
                  try{ tbody.insertBefore(tr, tbody.firstChild); }catch(_){ tbody.appendChild(tr); }
                  __optimisticRow = tr;
                }
              }catch(_){ __optimisticRow = null; }
              function highlightLastBlok(blokNo){
                try{
                  const tbody = document.getElementById('tbodyBlok');
                  if(!tbody) return;
                  // Son eklenen satırı bulmak için blokNo eşleşmesini ara
                  const rows = Array.from(tbody.querySelectorAll('tr'));
                  const target = rows.find(tr => {
                    const tds = tr.querySelectorAll('td');
                    // Blok No kolonu index 1
                    return tds && tds[1] && (tds[1].textContent||'').trim().toLowerCase() === String(blokNo||'').trim().toLowerCase();
                  });
                  if(target){
                    // Yumuşak vurgulama efekti
                    target.style.transition = 'background-color 0.6s ease';
                    target.style.backgroundColor = HIGHLIGHT_BG;
                    setTimeout(function(){ target.style.backgroundColor = ''; }, HIGHLIGHT_MS);
                    // Tabloya kaydır
                    target.scrollIntoView({ behavior:'smooth', block:'center' });
                  }
                }catch(_){ }
              }
              Promise.resolve()
                .then(function(){ return upsertBlok(rec); })
                .then(function(){
                  // Remove optimistic row if still present; real render will replace it
                  try{ if(__optimisticRow && __optimisticRow.parentNode){ __optimisticRow.parentNode.removeChild(__optimisticRow); __optimisticRow = null; } }catch(_){ }
                  // Defer UI feedback until after render has been scheduled and executed so main thread isn't blocked
                  try{
                    window.scheduleRenderAndThen(function(){
                      try{ showToast && showToast('Blok kaydedildi'); }catch(_){ }
                      try{ showSuccessChip(rec.blokNo); }catch(_){ }
                      try{ highlightLastBlok(rec.blokNo); }catch(_){ }
                      try{
                        // Edit modunu temizle ve buton metnini geri al
                        if(editKeyEl) editKeyEl.value = '';
                        const sb = frm.querySelector('button[type="submit"]'); if(sb) sb.textContent = 'Kaydet';
                        // BlokNo kilidini kaldır ve rozet gizle
                        const blokNoInput = frm.querySelector('[name="blokNo"]'); if(blokNoInput){ blokNoInput.removeAttribute('disabled'); blokNoInput.title=''; }
                        const badge = document.getElementById('editModeBadge'); const badgeNo = document.getElementById('editModeBadgeNo'); if(badge && badgeNo){ badge.style.display='none'; badgeNo.textContent=''; }
                        frm.reset(); frm.blokNo && frm.blokNo.focus && frm.blokNo.focus();
                      }catch(_){ }
                    });
                  }catch(e){
                    // Fallback: immediate actions
                    try{ showToast && showToast('Blok kaydedildi'); }catch(_){ }
                    try{ showSuccessChip(rec.blokNo); }catch(_){ }
                    try{ renderBloklar && renderBloklar(); }catch(_){ }
                    try{ highlightLastBlok(rec.blokNo); }catch(_){ }
                  }
                })
                .catch(function(err){
                  // Ensure any errors in upsert flow are visible but do not leave the UI stuck
                  try{ console.error('upsert flow error', err); }catch(_){ }
                })
                .finally(function(){
                  // Final safety cleanup in case optimistic UI didn't get removed
                  try{ if(__optimisticRow && __optimisticRow.parentNode){ __optimisticRow.parentNode.removeChild(__optimisticRow); __optimisticRow = null; } }catch(_){ }
                  try{ const sb = frm.querySelector('button[type="submit"]'); if(sb) sb.textContent = 'Kaydet'; }catch(_){ }
                });
            }catch(e){ console.error('Blok kaydetme hatası', e); alert('Kayıt sırasında hata: ' + (e && e.message)); }
          });
        }
      }catch(_){ }
      const btn = document.getElementById('btnExportBloklar');
      if(btn) btn.addEventListener('click', function(){
        try{
          const candidates = [
            (typeof window.BL_KEY === 'string' && window.BL_KEY) ? window.BL_KEY : null,
            'bloklar_yeni_demo',
            'bloklar',
            'v91_sayalanmis_bloklar'
          ].filter(Boolean);
          let foundKey = candidates.find(k => !!localStorage.getItem(k));
          if(!foundKey){
            // Heuristik: 'blok' içeren bir key varsa onu kullan
            const keys = Object.keys(localStorage||{});
            const maybe = keys.find(k=> /blok/i.test(k));
            if(maybe) foundKey = maybe;
          }
          if(!foundKey){
            alert('Blok verisi bulunamadı. Lütfen uygulamayı normal URL ile açtığınızdan ve verinin localStorage içinde olduğundan emin olun (konsolda Object.keys(localStorage) ile kontrol edin).');
            console.log('localStorage keys:', Object.keys(localStorage));
            return;
          }
    
          const raw = localStorage.getItem(foundKey);
          let arr;
          try{ arr = JSON.parse(raw||'[]'); }catch(e){ arr = [raw]; }
    
          // JSON indir
          const jblob = new Blob([JSON.stringify(arr, null, 2)], {type: 'application/json;charset=utf-8'});
          const jurl = URL.createObjectURL(jblob);
          const a1 = document.createElement('a'); a1.href = jurl; a1.download = 'bloklar_' + foundKey + '.json'; document.body.appendChild(a1); a1.click(); a1.remove(); URL.revokeObjectURL(jurl);
    
          // CSV/Plain indir
          const isArr = Array.isArray(arr);
          if(isArr){
            const keys = Array.from(new Set(arr.flatMap(o => (o && typeof o === 'object') ? Object.keys(o) : [])));
            if(keys.length){
              const lines = [];
              lines.push(keys.map(k=> '"' + k.replace(/"/g,'""') + '"').join(','));
              arr.forEach(o=>{
                lines.push(keys.map(k=> '"' + String((o && o[k]) || '').replace(/"/g,'""') + '"').join(','));
              });
              const cblob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8'});
              const curl = URL.createObjectURL(cblob);
              const a2 = document.createElement('a'); a2.href = curl; a2.download = 'bloklar_' + foundKey + '.csv'; document.body.appendChild(a2); a2.click(); a2.remove(); URL.revokeObjectURL(curl);
            } else {
              const tblob = new Blob([arr.join('\n')], {type:'text/plain;charset=utf-8'});
              const turl = URL.createObjectURL(tblob);
              const a3 = document.createElement('a'); a3.href = turl; a3.download = 'bloklar_' + foundKey + '.txt'; document.body.appendChild(a3); a3.click(); a3.remove(); URL.revokeObjectURL(turl);
            }
          } else {
            const tblob = new Blob([String(arr)], {type:'text/plain;charset=utf-8'});
            const turl = URL.createObjectURL(tblob);
            const a3 = document.createElement('a'); a3.href = turl; a3.download = 'bloklar_' + foundKey + '.txt'; document.body.appendChild(a3); a3.click(); a3.remove(); URL.revokeObjectURL(turl);
          }
    
          alert('Blok verisi indirildi: ' + foundKey + '\n(İndirilen dosyalar tarayıcınızın İndirilenler klasöründe olacak)');
        }catch(e){ console.error(e); alert('İndirme sırasında hata: ' + (e && e.message)); }
      });
      
      // Ensar Fiyat/Stock paneli artık Özet modal içinde 'ensar-fiyat' sekmesinde render ediliyor.
    });
    
    /* ==== BODY inline script #12 ==== */
    // Blok listesi: arama ve sütun filtrelerinde küçük debounce ile performans iyileştirme
    document.addEventListener('DOMContentLoaded', function(){
      try{
        // Datalist: blok listesi (Firestore veya localStorage üzerinden)
        async function updateBlokListDatalist(){
          try{
            const dl = document.getElementById('blokList'); if(!dl) return;
            const arr = await (typeof getBloklar==='function' ? getBloklar() : []);
            const uniq = new Set();
            // Create a fragment once and append option elements safely
            const frag = document.createDocumentFragment();
            (arr||[]).forEach(b=>{
              const no = (b && (b.blokNo||b.id||b.blok||b.blok_no||'')).toString().trim();
              if(!no) return;
              // Görünür etiket: "BlokNo — BlokAdı" (varsa), aksi halde sadece blokNo
              const possibleName = (b && (b.blokAdi || b.tasIsmi || b.blok_adi || '')) ? String(b.blokAdi || b.tasIsmi || b.blok_adi) : '';
              const display = possibleName ? `${no} — ${possibleName}` : no;
              const key = no.toLowerCase(); if(uniq.has(key)) return; uniq.add(key);
              // Güvenli DOM: doğrudan option oluştur
              try{
                const opt = document.createElement('option');
                opt.value = no;
                try{ opt.label = display; }catch(_){ /* ignore label set failures on older browsers */ }
                opt.textContent = display;
                frag.appendChild(opt);
              }catch(_){ /* ignore */ }
            });
      try{ while(dl.firstChild) dl.removeChild(dl.firstChild); }catch(_){ dl.textContent=''; }
      dl.appendChild(frag);
          }catch(_){ /* ignore */ }
        }
        // İlk yüklemede ve 3 saniye sonra tekrar (async veri gecikmesine karşı)
        updateBlokListDatalist(); setTimeout(updateBlokListDatalist, 3000);
        // Global’e erişilebilir yap (diğer modüller çağırıyor)
        window.updateBlokListDatalist = updateBlokListDatalist;
    
        // Arama kutusu (blokAraInput)
        const inpSearch = document.getElementById('blokAraInput');
        if(inpSearch){
          const _debouncedRenderSearch = (typeof debounce==='function') ? debounce(function(){ try{ renderBloklar?.(); }catch(_){ } }, 200) : function(){ try{ renderBloklar?.(); }catch(_){ } };
          inpSearch.addEventListener('input', _debouncedRenderSearch);
        }
    
        // Sütun filtreleri (thead ikinci satır)
        const fr = document.getElementById('blokFilterRow');
        if(fr){
          const _debouncedRenderFilters = (typeof debounce==='function') ? debounce(function(){ try{ renderBloklar?.(); }catch(_){ } }, 200) : function(){ try{ renderBloklar?.(); }catch(_){ } };
          Array.from(fr.querySelectorAll('input, select')).forEach(function(el){ el.addEventListener('input', _debouncedRenderFilters); el.addEventListener('change', _debouncedRenderFilters); });
    
          // Kalıcı filtre durumu: açık/kapalı ve alan değerleri
          try{
            window.BL_FILTERS_STATE_KEY = 'BL_COL_FILTERS_STATE';
            window.loadBlokFilterState = function(){ try{ return JSON.parse(localStorage.getItem(window.BL_FILTERS_STATE_KEY)||'{}'); }catch(_){ return {}; } };
            window.saveBlokFilterState = function(p){ try{ const cur = window.loadBlokFilterState()||{}; localStorage.setItem(window.BL_FILTERS_STATE_KEY, JSON.stringify(Object.assign({}, cur, p))); }catch(_){ } };
            window.clearBlokFilterState = function(){ try{ localStorage.removeItem(window.BL_FILTERS_STATE_KEY); }catch(_){ } };
    
            const ids = ['f_gelis_from','f_gelis_to','f_blokNo','f_fason','f_ocak','f_blokAdi','f_durum'];
            const st = window.loadBlokFilterState()||{};
            // Açık/kapalı durumunu uygula ve üst temizle butonunu senkronize et
            const clearBtnTop = document.getElementById('btnClearColumnFilters');
            if(st.open){ fr.style.display = 'table-row'; if(clearBtnTop){ clearBtnTop.style.display=''; } }
            else { fr.style.display = 'none'; if(clearBtnTop){ clearBtnTop.style.display='none'; } }
    
            // Kayıtlı değerleri geri yükle
            if(st.values){ ids.forEach(function(id){ const el=document.getElementById(id); if(el && st.values[id]!==undefined){ el.value = st.values[id]; } }); }
    
            // Değerler değiştiğinde kaydet
            const saveValues = (function(){
              const fn = function(){ try{ const vals={}; ids.forEach(function(id){ const el=document.getElementById(id); if(el){ vals[id] = el.value||''; } }); window.saveBlokFilterState({ values: vals }); }catch(_){ } };
              return (typeof debounce==='function') ? debounce(fn, 250) : fn;
            })();
            ids.forEach(function(id){ const el=document.getElementById(id); if(el){ el.addEventListener('input', saveValues); el.addEventListener('change', saveValues); } });
          }catch(_){ }
        }
    
        // Sayalanmış alt bloklar açılır panelindeki arama
        const sblSearch = document.getElementById('sblDropSearch');
        if(sblSearch){
          const _debouncedRenderSbl = (typeof debounce==='function') ? debounce(function(){ try{ renderSBloklarDropdown?.(); }catch(_){ } }, 200) : function(){ try{ renderSBloklarDropdown?.(); }catch(_){ } };
          sblSearch.addEventListener('input', _debouncedRenderSbl);
        }
      }catch(_){ }
    });
    
    /* ==== BODY inline script #13 ==== */
    // Blok listesi: satır içi Sil butonu için olay delegasyonu
    document.addEventListener('DOMContentLoaded', function(){
      try{
        const tbody = document.getElementById('tbodyBlok');
        if(!tbody) return;
        tbody.addEventListener('click', function(ev){
          try{
            const btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
            if(!btn) return;
            const isDelete = /sil/i.test(btn.textContent||'') || btn.classList.contains('btn-danger') || btn.classList.contains('danger');
            if(!isDelete) return;
            // Blok No ikinci sütunda
            const tr = btn.closest('tr');
            const blokCell = tr && tr.querySelectorAll('td')[1];
            const blokNo = blokCell ? (blokCell.textContent||'').trim() : '';
            if(!blokNo){ alert('Blok numarası okunamadı.'); return; }
            if(!confirm('Bu blok silinsin mi?\nBlok No: ' + blokNo)) return;
            (async function(){
              // Silmeden önce kayıt snapshot al
              let snapshot = null;
              try{
                let arr = await (typeof getBloklar==='function' ? getBloklar() : []);
                if(!Array.isArray(arr)) arr = [];
                snapshot = arr.find(function(x){ return String((x && x.blokNo)||'').trim().toLowerCase() === String(blokNo).trim().toLowerCase(); }) || null;
              }catch(_){ }
              const ok = await (typeof deleteBlok==='function' ? deleteBlok(blokNo) : false);
              if(!ok){ alert('Silme işlemi sırasında hata oluştu.'); return; }
              // Geri al için son silineni sakla ve çipi göster
              try{ __lastDeletedBlok = { rec: snapshot, at: Date.now() }; }catch(_){ }
              try{ if(typeof showUndoChip==='function') showUndoChip(blokNo); }catch(_){ }
            })();
          }catch(e){ console.error('Silme tıklama hatası', e); }
        });
      }catch(_){ }
    });
    
    /* ==== BODY inline script #14 ==== */
    (function(){
        // Global hata toplayıcı: window.error, unhandledrejection ve console.error kayıtlarını localStorage'a atar
        try{
          const ERR_KEY = 'v91_app_errors';
          function pushErr(obj){
            try{
              const raw = localStorage.getItem(ERR_KEY) || '[]';
              const arr = JSON.parse(raw || '[]');
              arr.unshift(obj);
              if(arr.length > 500) arr.length = 500;
              localStorage.setItem(ERR_KEY, JSON.stringify(arr));
            }catch(_){ }
          }
    
          // capture window.onerror
          window.addEventListener('error', function(ev){
            try{
              pushErr({ type:'error', message: ev && ev.message, filename: ev && ev.filename, lineno: ev && ev.lineno, colno: ev && ev.colno, stack: ev && ev.error && ev.error.stack || null, ts: Date.now() });
            }catch(_){ }
          });
    
          window.addEventListener('unhandledrejection', function(ev){
            try{ pushErr({ type:'unhandledrejection', reason: (ev && ev.reason && (ev.reason.stack || ev.reason.message)) || String(ev && ev.reason), ts: Date.now() }); }catch(_){ }
          });
    
          const origConsoleError = console.error.bind(console);
          console.error = function(...args){
            try{
              const mapped = args.map(a => {
                try{ if(a && a.stack) return a.stack; if(typeof a === 'object') return JSON.stringify(a); return String(a); }catch(e){ return String(a); }
              });
              pushErr({ type:'console.error', args: mapped, ts: Date.now() });
            }catch(_){ }
            try{ origConsoleError(...args); }catch(_){ }
          };
    
          window.dumpAppErrors = function(){ try{ return JSON.parse(localStorage.getItem(ERR_KEY)||'[]'); }catch(e){ return []; } };
          window.clearAppErrors = function(){ try{ localStorage.removeItem(ERR_KEY); }catch(e){ } };
        }catch(e){ /* ignore */ }
      })();
    // Migration helper: normalize existing Kasa records stored in localStorage.
    // Usage (in browser console): normalizeKasaRecords();
    function normalizeKasaRecords(){
      try{
        const KEY = 'v91_kasa_stok_kayitlar';
        const raw = localStorage.getItem(KEY);
        if(!raw){ console.info('Kasa kaydı bulunamadı: ' + KEY); return; }
        let arr = JSON.parse(raw||'[]');
        if(!Array.isArray(arr)){ console.warn('Beklenmeyen veri formatı, işlem durduruldu.'); return; }
        const backupKey = KEY + '_backup_' + Date.now();
        localStorage.setItem(backupKey, JSON.stringify(arr));
        console.info('Yedek oluşturuldu: ' + backupKey + ' (' + arr.length + ' kayıt)');
    
        function fixDimValue(v){
          // keep empty as-is
          if(v===undefined || v===null || String(v).trim()==='') return '';
          const s = String(v).trim();
          // try to parse number using existing global num() if present, else fallback
          let n = (typeof num === 'function') ? num(s) : Number(String(s).replace(/\./g,'').replace(',', '.'));
          if(isNaN(n)) return s; // non-numeric, keep original
          // Heuristic: if numeric value looks like mm (greater than 100) convert to cm
          if(n > 100){ n = n / 10; }
          // return string with maximum one decimal when needed
          return (Math.round(n) === n) ? String(n) : String(n);
        }
    
        arr = arr.map(rec => {
          try{
            const r = Object.assign({}, rec);
            // normalize en/boy
            r.en = fixDimValue(r.en);
            r.boy = fixDimValue(r.boy);
            // recalc kasaIciM2 using global cm2_to_m2 if available
            const adet = (r.kasaIciAdet || r.adet || r.kasaIciAdet || '0');
            const m2 = (typeof cm2_to_m2 === 'function') ? cm2_to_m2(r.en, r.boy, adet) : NaN;
            r.kasaIciM2 = isNaN(m2) ? (r.kasaIciM2 || '') : Number(m2).toFixed(3);
            // recalc toplamM2 if we have a kasa adedi field
            const kasaAdedi = (r.kasaMiktari || r.kasaAdedi || r.miktar || r.adet_kasa || r.adet || 0);
            const ka = (typeof num === 'function') ? num(kasaAdedi) : Number(kasaAdedi) || 0;
            r.toplamM2 = (!isNaN(m2) && ka) ? (Number(m2) * ka).toFixed(3) : (r.toplamM2 || '');
            return r;
          }catch(e){ return rec; }
        });
    
        localStorage.setItem(KEY, JSON.stringify(arr));
        console.info('Normalize tamamlandı. Orijinal veriler yedeklendi ve güncellendi.');
        // attempt to trigger storage event listeners
        window.dispatchEvent(new Event('storage'));
      }catch(err){ console.error('Normalize sırasında hata:', err); }
    }
    
    /* ==== BODY inline script #15 ==== */
    document.addEventListener('DOMContentLoaded', function(){
      const Y_KEY = 'v91_yarma_kayitlar';
      function getYarma(){ try { return JSON.parse(localStorage.getItem(Y_KEY)||'[]'); } catch(e){ return []; } }
      function setYarma(arr){ localStorage.setItem(Y_KEY, JSON.stringify(arr)); }
    
      function calcYarmaGirisM2(){ const f = document.getElementById('frmYarma'); if(!f) return; const m = window.cm2_to_m2 ? cm2_to_m2(f.en.value, f.boy.value, f.adet.value) : NaN; f.m2.value = (m && !isNaN(m)) ? m.toFixed(3) : ''; }
      // Debounced input hesaplama (Yarma giriş m²)
      const _debouncedYarmaCalc = (typeof debounce==='function') ? debounce(calcYarmaGirisM2, 250) : calcYarmaGirisM2;
      ['en','boy','adet'].forEach(n=> document.addEventListener('input', function(e){ if(e.target && e.target.name===n && e.target.closest && e.target.closest('#frmYarma')) _debouncedYarmaCalc(); }));
    
      function addYarmRow(){
        const tb = document.getElementById('yarmOutBody'); if(!tb) return;
        const tr = document.createElement('tr');
        function makeInput(cls, props){ const td = document.createElement('td'); const inp = document.createElement('input'); inp.className = 'field small ' + cls; if(props && props.inputmode) inp.setAttribute('inputmode', props.inputmode); if(props && props.placeholder) inp.placeholder = props.placeholder; if(props && props.readOnly) inp.readOnly = true; td.appendChild(inp); return {td, inp}; }
        const e1 = makeInput('y-en', { inputmode:'decimal', placeholder:'En' });
        const e2 = makeInput('y-boy', { inputmode:'decimal', placeholder:'Boy' });
        const e3 = makeInput('y-cadet', { inputmode:'numeric', placeholder:'Çıkan Adet' });
        const e4 = makeInput('y-cm2', { readOnly:true, placeholder:'Çıkan m²' });
        const e5 = makeInput('y-kadet', { inputmode:'numeric', placeholder:'Kırık Adet' });
        const e6 = makeInput('y-km2', { readOnly:true, placeholder:'Kırık m²' });
        const tdBtn = document.createElement('td'); const btn = document.createElement('button'); btn.className='btn ghost small btnDel'; btn.type='button'; btn.textContent='Sil'; tdBtn.appendChild(btn);
        tr.appendChild(e1.td); tr.appendChild(e2.td); tr.appendChild(e3.td); tr.appendChild(e4.td); tr.appendChild(e5.td); tr.appendChild(e6.td); tr.appendChild(tdBtn);
        tb.appendChild(tr);
        const en = e1.inp; const boy = e2.inp; const cadet = e3.inp; const cm2El = e4.inp; const kadet = e5.inp; const km2El = e6.inp;
        function recalc(){
          const enV = en.value, boyV = boy.value;
          const cAd = cadet.value || '0'; const kAd = kadet.value || '0';
          const cm2 = window.cm2_to_m2 ? cm2_to_m2(enV, boyV, cAd) : NaN;
          const km2 = window.cm2_to_m2 ? cm2_to_m2(enV, boyV, kAd) : NaN;
          cm2El.value = (!isNaN(cm2) && cm2!==0) ? Number(cm2).toFixed(3) : '';
          km2El.value = (!isNaN(km2) && km2!==0) ? Number(km2).toFixed(3) : '';
          computeYarmaSummary();
        }
        [en,boy,cadet,kadet].forEach(i=> i.addEventListener('input', recalc));
        tr.querySelector('.btnDel').addEventListener('click', ()=>{ tr.remove(); computeYarmaSummary(); });
        return tr;
      }
    
      document.getElementById('yarmAddOutBtn')?.addEventListener('click', function(e){ e.preventDefault(); addYarmRow(); });
      document.getElementById('yarmSaveBtn')?.addEventListener('click', function(e){ e.preventDefault(); saveYarma(); try{ updateBlokListDatalist?.(); }catch(_){ } });
    
      renderYarmaList();
    });
    
    /* ==== BODY inline script #16 ==== */
    document.addEventListener('DOMContentLoaded', function(){
      try{
        // Apply the helper class to all table-wraps inside the Üretim Kayıt section (#kayit)
        // Apply to all .table-wrap elements across the document so every table area is centered
        document.querySelectorAll('.table-wrap').forEach(function(div){
          if(!div.classList.contains('center-under-headers')) div.classList.add('center-under-headers');
        });
      }catch(_){ }
    });
    
    /* ==== BODY inline script #17 ==== */
    // Çoklu Ebatlama V2 - behavior
    document.addEventListener('DOMContentLoaded', function(){
      const sub = document.querySelector('#ara-subtabs .subtab[data-sub="ara_coklu_ebat"]');
      const wrapper = document.getElementById('ara_makinalar-content');
      const ourCard = document.getElementById('ara_coklu_ebat_v2-content');
      function showOurCard(){ const old = document.getElementById('ara_coklu_ebat-content'); if(old) old.style.display='none'; if(wrapper){ Array.from(wrapper.querySelectorAll(':scope > .card')).forEach(c=> c.style.display='none'); } if(ourCard) ourCard.style.display=''; }
      if(sub){ sub.addEventListener('click', function(){ setTimeout(showOurCard,30); }); }
      if(sub && sub.classList.contains('active')){ setTimeout(showOurCard,30); }
    
      const KEY='v91_coklu_ebat_kayitlar_v2';
      function getAll(){ try{ return JSON.parse(localStorage.getItem(KEY)||'[]'); }catch(e){ return []; } }
      function setAll(a){ localStorage.setItem(KEY, JSON.stringify(a)); }
      function cm2_to_m2_local(en,boy,adet){
        // Global hesaplayıcıya delege edin; hata durumunda NaN
        try{ return (typeof window.cm2_to_m2 === 'function') ? window.cm2_to_m2(en,boy,adet) : NaN; }catch(e){ return NaN; }
      }
    
      function calcGiris(){ const f=document.getElementById('frmCokluEbatV2'); if(!f) return; const v=cm2_to_m2_local(f.en.value,f.boy.value,f.adet.value); f.m2.value = (!isNaN(v) && v!==0) ? Number(v).toFixed(3) : ''; }
      const _debouncedCokluCalc = (typeof debounce==='function') ? debounce(calcGiris, 250) : calcGiris;
      ['en','boy','adet'].forEach(n=> document.addEventListener('input', function(e){ if(e.target && e.target.name===n && e.target.closest && e.target.closest('#frmCokluEbatV2')) _debouncedCokluCalc(); }));
    
      function addOutRow(){
        const tb=document.getElementById('cokluOutBodyV2'); if(!tb) return;
        const tr=document.createElement('tr');
        const makeInput = (cls, attrs={})=>{ const td=document.createElement('td'); const inp = document.createElement('input'); inp.className = 'field small ' + cls; Object.keys(attrs).forEach(k=> inp.setAttribute(k, attrs[k])); td.appendChild(inp); tr.appendChild(td); return inp; };
        const en = makeInput('c-en', { inputmode:'decimal', placeholder:'En' });
        const boy = makeInput('c-boy', { inputmode:'decimal', placeholder:'Boy' });
        const cad = makeInput('c-adet', { inputmode:'numeric', placeholder:'Adet' });
        const m2elTd = document.createElement('td'); const m2el = document.createElement('input'); m2el.className='field small c-m2'; m2el.readOnly = true; m2el.placeholder = 'Çıkış m²'; m2elTd.appendChild(m2el); tr.appendChild(m2elTd);
        const note = makeInput('c-note', { placeholder:'Açıklama' });
        const tdBtn = document.createElement('td'); const btn = document.createElement('button'); btn.className='btn ghost small btnDel'; btn.type='button'; btn.textContent='Sil'; tdBtn.appendChild(btn); tr.appendChild(tdBtn);
        tb.appendChild(tr);
        function recalc(){ const v=cm2_to_m2_local(en.value,boy.value,cad.value); m2el.value = (!isNaN(v) && v!==0) ? Number(v).toFixed(3) : ''; }
        [en,boy,cad].forEach(i=>i.addEventListener('input',recalc)); btn.addEventListener('click', ()=> tr.remove());
      }
    
      function readForm(){ const f=document.getElementById('frmCokluEbatV2'); if(!f) return null; const rec={ id: Date.now().toString(36), tarih: f.tarih?.value||'', blokNo: f.blokNo?.value||'', tasIsmi: f.tasIsmi?.value||'', kalinlik: f.kalinlik?.value||'', en: f.en?.value||'', boy: f.boy?.value||'', adet: f.adet?.value||'', m2: f.m2?.value||'', aciklama: f.aciklama?.value||'', out:[] }; Array.from(document.querySelectorAll('#cokluOutBodyV2 tr')).forEach(tr=>{ rec.out.push({ en: tr.querySelector('.c-en')?.value||'', boy: tr.querySelector('.c-boy')?.value||'', adet: tr.querySelector('.c-adet')?.value||'', m2: tr.querySelector('.c-m2')?.value||'', note: tr.querySelector('.c-note')?.value||'' }); }); return rec; }
    
      function save(){ const rec=readForm(); if(!rec) return; if(!rec.tarih){ alert('Tarih zorunlu'); return; } if(!(rec.out && rec.out.length)){ alert('Lütfen en az bir çıkış satırı ekleyin'); return; } const arr=getAll(); arr.unshift(rec); setAll(arr); render(); document.getElementById('frmCokluEbatV2').reset(); try{ const out=document.getElementById('cokluOutBodyV2'); while(out && out.firstChild) out.removeChild(out.firstChild); }catch(_){ }
  try{ scheduleSync(KEY, rec); }catch(_){ }
     }
    
      function render(){
      const tbody=document.getElementById('cokluListBodyV2'); if(!tbody) return; const arr=getAll(); try{ while(tbody.firstChild) tbody.removeChild(tbody.firstChild); }catch(_){ tbody.textContent=''; }
        arr.forEach(rec=>{
          const totalOutAd=(rec.out||[]).reduce((s,o)=>s+(parseInt(o.adet||'0',10)||0),0);
          const totalOutM2=(rec.out||[]).reduce((s,o)=>s+(num(o.m2)||0),0);
          const tr=document.createElement('tr');
          const vals = [ rec.tarih||'', '', rec.tasIsmi||'', rec.kalinlik||'', rec.adet||'', rec.m2||'', String(totalOutAd||0), isNaN(totalOutM2)?'0':nf3.format(totalOutM2), rec.aciklama||'' ];
          // first cell: tarih
          const tdTarih = document.createElement('td'); tdTarih.textContent = vals[0]; tr.appendChild(tdTarih);
          // second cell: blokNo bold
          const tdBlok = document.createElement('td'); const b = document.createElement('b'); b.textContent = rec.blokNo || ''; tdBlok.appendChild(b); tr.appendChild(tdBlok);
          // remaining cells
          for(let i=2;i<vals.length;i++){ const td = document.createElement('td'); td.textContent = vals[i]; tr.appendChild(td); }
          const tdAct=document.createElement('td'); tdAct.style.display='flex'; tdAct.style.gap='6px';
          const btnEdit=document.createElement('button'); btnEdit.className='btn ghost small'; btnEdit.textContent='Düzenle'; btnEdit.addEventListener('click', ()=> load(rec));
          const btnDel=document.createElement('button'); btnDel.className='btn danger small'; btnDel.textContent='Sil'; btnDel.addEventListener('click', ()=>{ if(confirm('Silinsin mi?')){ const a=getAll(); const i=a.findIndex(x=>x.id===rec.id); if(i>=0){ a.splice(i,1); setAll(a); render(); } } });
          tdAct.appendChild(btnEdit); tdAct.appendChild(btnDel); tr.appendChild(tdAct); tbody.appendChild(tr);
        });
      }
    
      function load(rec){
        const f=document.getElementById('frmCokluEbatV2'); if(!f) return;
        try{ f.tarih.value = rec.tarih||''; }catch(_){ }
      try{ setFormFieldValue(f, 'blokNo', normalizeBlokNo(rec.blokNo||'')); }catch(_){ if(f.blokNo) f.blokNo.value = normalizeBlokNo(rec.blokNo||''); }
        try{ f.tasIsmi.value = rec.tasIsmi||''; }catch(_){ }
      try{ setFormFieldValue(f, 'kalinlik', rec.kalinlik||''); }catch(_){ if(f.kalinlik) f.kalinlik.value = sanitizeDimensionVal(rec.kalinlik||''); }
      try{ setFormFieldValue(f, 'en', rec.en||''); }catch(_){ if(f.en) f.en.value = sanitizeDimensionVal(rec.en||''); }
      try{ setFormFieldValue(f, 'boy', rec.boy||''); }catch(_){ if(f.boy) f.boy.value = sanitizeDimensionVal(rec.boy||''); }
      try{ setFormFieldValue(f, 'adet', rec.adet||''); }catch(_){ if(f.adet) f.adet.value = sanitizeDimensionVal(rec.adet||''); }
      try{ setFormFieldValue(f, 'm2', rec.m2||''); }catch(_){ if(f.m2) f.m2.value = sanitizeDimensionVal(rec.m2||''); }
        try{ f.aciklama.value = rec.aciklama||''; }catch(_){ }
      const body=document.getElementById('cokluOutBodyV2'); if(!body) return; try{ while(body.firstChild) body.removeChild(body.firstChild); }catch(_){ body.textContent=''; }
        (rec.out||[]).forEach(o=>{
          addOutRow();
          const tr = body.querySelector('tr:last-child');
          if(tr){
            const e = tr.querySelector('.c-en'); if(e) e.value = sanitizeDimensionVal(o.en||'');
            const b = tr.querySelector('.c-boy'); if(b) b.value = sanitizeDimensionVal(o.boy||'');
            const ad = tr.querySelector('.c-adet'); if(ad) ad.value = sanitizeDimensionVal(o.adet||'');
            const m2el = tr.querySelector('.c-m2'); if(m2el) m2el.value = sanitizeDimensionVal(o.m2||'');
            const note = tr.querySelector('.c-note'); if(note) note.value = o.note||'';
          }
        });
      }
    
    
      document.getElementById('cokluAddOutBtnV2')?.addEventListener('click', (e)=>{ e.preventDefault(); addOutRow(); });
      document.getElementById('cokluSaveBtnV2')?.addEventListener('click', (e)=>{ e.preventDefault(); save(); try{ updateBlokListDatalist?.(); }catch(_){ } });
    
      render();
    });
    
    /* ==== BODY inline script #18 ==== */
    // Plaka Ebatlama V2 - behavior (kayıt + düzenleme/güncelleme)
    document.addEventListener('DOMContentLoaded', function(){
      const sub = document.querySelector('#ara-subtabs .subtab[data-sub="ara_plaka_ebat"]');
      const wrapper = document.getElementById('ara_makinalar-content');
      const ourCard = document.getElementById('ara_plaka_ebat_v2-content');
      function showOurCard(){ if(wrapper){ Array.from(wrapper.querySelectorAll(':scope > .card')).forEach(c=> c.style.display='none'); } if(ourCard) ourCard.style.display=''; }
      if(sub){ sub.addEventListener('click', function(){ setTimeout(showOurCard,30); }); }
      if(sub && sub.classList.contains('active')){ setTimeout(showOurCard,30); }
    
      const KEY = 'v91_plaka_ebat_kayitlar_v2';
      function getAll(){ try{ return JSON.parse(localStorage.getItem(KEY)||'[]'); }catch(e){ return []; } }
      function setAll(a){ localStorage.setItem(KEY, JSON.stringify(a)); }
    
      function cm2_to_m2_local(en,boy,adet){
        // Global hesaplayıcıya delege edin; hata durumunda NaN
        try{ return (typeof window.cm2_to_m2 === 'function') ? window.cm2_to_m2(en,boy,adet) : NaN; }catch(e){ return NaN; }
      }
    
      function calcGiris(){ const f=document.getElementById('frmPlakaEbatV2'); if(!f) return; const v=cm2_to_m2_local(f.en.value,f.boy.value,f.adet.value); f.m2.value = (!isNaN(v) && v!==0) ? Number(v).toFixed(3) : ''; }
      const _debouncedPlakaCalc = (typeof debounce==='function') ? debounce(calcGiris, 250) : calcGiris;
      ['en','boy','adet'].forEach(n=> document.addEventListener('input', function(e){ if(e.target && e.target.name===n && e.target.closest && e.target.closest('#frmPlakaEbatV2')) _debouncedPlakaCalc(); }));
    
      function addOutRow(){ const tb=document.getElementById('plakaOutBodyV2'); if(!tb) return; const tr=document.createElement('tr');
        const makeInput = (cls, attrs={})=>{ const td=document.createElement('td'); const inp = document.createElement('input'); inp.className = 'field small ' + cls; Object.keys(attrs).forEach(k=> inp.setAttribute(k, attrs[k])); td.appendChild(inp); tr.appendChild(td); return inp; };
        const en = makeInput('p-en', { inputmode:'decimal', placeholder:'En' });
        const boy = makeInput('p-boy', { inputmode:'decimal', placeholder:'Boy' });
        const sad = makeInput('p-sadet', { inputmode:'numeric', placeholder:'Sağlam Adet' });
        const sm2Td = document.createElement('td'); const sm2 = document.createElement('input'); sm2.className='field small p-sm2'; sm2.readOnly = true; sm2.placeholder='Sağlam m²'; sm2Td.appendChild(sm2); tr.appendChild(sm2Td);
        const kad = makeInput('p-kadet', { inputmode:'numeric', placeholder:'Kırık Adet' });
        const km2Td = document.createElement('td'); const km2 = document.createElement('input'); km2.className='field small p-km2'; km2.readOnly = true; km2.placeholder='Kırık m²'; km2Td.appendChild(km2); tr.appendChild(km2Td);
        const tdBtn = document.createElement('td'); const btn = document.createElement('button'); btn.className='btn ghost small btnDel'; btn.type='button'; btn.textContent='Sil'; tdBtn.appendChild(btn); tr.appendChild(tdBtn);
        tb.appendChild(tr);
        function recalc(){ const v1 = cm2_to_m2_local(en.value,boy.value,sad.value); sm2.value = (!isNaN(v1) && v1!==0) ? Number(v1).toFixed(3) : ''; const v2 = cm2_to_m2_local(en.value,boy.value,kad.value); km2.value = (!isNaN(v2) && v2!==0) ? Number(v2).toFixed(3) : ''; }
        [en,boy,sad,kad].forEach(i=> i.addEventListener('input', recalc)); btn.addEventListener('click', ()=> tr.remove());
      }
    
      function readForm(){ const f=document.getElementById('frmPlakaEbatV2'); if(!f) return null; const rec={ id: f.idHidden?.value || Date.now().toString(36), tarih: f.tarih?.value||'', blokNo: f.blokNo?.value||'', tasIsmi: f.tasIsmi?.value||'', kalinlik: f.kalinlik?.value||'', en: f.en?.value||'', boy: f.boy?.value||'', adet: f.adet?.value||'', m2: f.m2?.value||'', out:[] }; Array.from(document.querySelectorAll('#plakaOutBodyV2 tr')).forEach(tr=>{ rec.out.push({ en: tr.querySelector('.p-en')?.value||'', boy: tr.querySelector('.p-boy')?.value||'', sagAdet: tr.querySelector('.p-sadet')?.value||'', sagM2: tr.querySelector('.p-sm2')?.value||'', kirikAdet: tr.querySelector('.p-kadet')?.value||'', kirikM2: tr.querySelector('.p-km2')?.value||'' }); }); return rec; }
    
      function save(){ const rec=readForm(); if(!rec) return; if(!rec.tarih){ alert('Tarih zorunlu'); return; } if(!(rec.out && rec.out.length)){ alert('Lütfen en az bir Çıkan satırı ekleyin'); return; } const arr=getAll(); if(document.getElementById('frmPlakaEbatV2').idHidden.value){ const i=arr.findIndex(x=>x.id===rec.id); if(i>=0) arr[i]=rec; else arr.unshift(rec); } else { arr.unshift(rec); } setAll(arr); render(); document.getElementById('frmPlakaEbatV2').reset(); try{ const out=document.getElementById('plakaOutBodyV2'); while(out && out.firstChild) out.removeChild(out.firstChild); }catch(_){ }
  try{ scheduleSync(KEY, rec); }catch(_){ }
     }
    
      function render(){ const tbody=document.getElementById('plakaListBodyV2'); if(!tbody) return; const arr=getAll(); tbody.innerHTML=''; arr.forEach(rec=>{ const totalOutAd=(rec.out||[]).reduce((s,o)=> s + (parseInt(o.sagAdet||'0',10)||0) + (parseInt(o.kirikAdet||'0',10)||0),0); const totalOutM2=(rec.out||[]).reduce((s,o)=> s + (num(o.sagM2)||0) + (num(o.kirikM2)||0), 0); const sagM2Total=(rec.out||[]).reduce((s,o)=> s + (num(o.sagM2)||0),0); const kirikM2Total=(rec.out||[]).reduce((s,o)=> s + (num(o.kirikM2)||0),0); const giris=num(rec.m2)||0; const fire=Math.max(0, giris - sagM2Total); const pct = giris>0 ? (fire/giris*100) : 0;
        const tr = document.createElement('tr');
        const tdDate = document.createElement('td'); tdDate.textContent = rec.tarih||'';
        const tdBlok = document.createElement('td'); const bBlok = document.createElement('b'); bBlok.textContent = rec.blokNo||''; tdBlok.appendChild(bBlok);
        const tdTas = document.createElement('td'); tdTas.textContent = rec.tasIsmi||'';
        const tdKal = document.createElement('td'); tdKal.textContent = rec.kalinlik||'';
        const tdAdet = document.createElement('td'); tdAdet.textContent = rec.adet||'';
        const tdM2 = document.createElement('td'); tdM2.textContent = rec.m2||'';
        const tdTotalOutAd = document.createElement('td'); tdTotalOutAd.textContent = String(totalOutAd||0);
        const tdTotalOutM2 = document.createElement('td'); tdTotalOutM2.textContent = isNaN(totalOutM2)?'0':nf3.format(totalOutM2);
        const tdFire = document.createElement('td'); tdFire.textContent = isNaN(fire)?'':nf3.format(fire);
        const tdPct = document.createElement('td'); tdPct.textContent = isNaN(pct)?'':nf3.format(pct);
        tr.appendChild(tdDate); tr.appendChild(tdBlok); tr.appendChild(tdTas); tr.appendChild(tdKal); tr.appendChild(tdAdet); tr.appendChild(tdM2); tr.appendChild(tdTotalOutAd); tr.appendChild(tdTotalOutM2); tr.appendChild(tdFire); tr.appendChild(tdPct);
        const tdAct=document.createElement('td'); tdAct.style.display='flex'; tdAct.style.gap='6px'; const btnEdit=document.createElement('button'); btnEdit.className='btn ghost small'; btnEdit.textContent='Düzenle'; btnEdit.addEventListener('click', ()=> load(rec)); const btnDel=document.createElement('button'); btnDel.className='btn danger small'; btnDel.textContent='Sil'; btnDel.addEventListener('click', ()=>{ if(confirm('Silinsin mi?')){ const a=getAll(); const i=a.findIndex(x=>x.id===rec.id); if(i>=0){ a.splice(i,1); setAll(a); render(); } } }); tdAct.appendChild(btnEdit); tdAct.appendChild(btnDel); tr.appendChild(tdAct); tbody.appendChild(tr); });
        // after rendering list, show summary for latest record if exists
        try{ if(arr.length>0){ const last = arr[0]; computePlakaSummary(num(last.m2)||0, last.out||[]); } else { computePlakaSummary(); } }catch(_){ }
      }
    
      // compute and render a small summary (live preview) for Plaka form / saved record
      function computePlakaSummary(girisM2, outs){
        let summ = document.getElementById('plakaSummaryV2');
        if(!summ){ const card = document.getElementById('ara_plaka_ebat_v2-content'); if(card){ summ = document.createElement('div'); summ.id='plakaSummaryV2'; summ.style.display='flex'; summ.style.gap='10px'; summ.style.marginTop='8px'; summ.style.marginBottom='8px'; const measurementsBox = card.querySelector('div[style*="border:1px dashed"]'); if(measurementsBox && measurementsBox.parentNode) measurementsBox.parentNode.insertBefore(summ, measurementsBox.nextSibling); else card.insertBefore(summ, card.firstChild); } }
        if(!summ) return;
        let sag=0, kirik=0;
        if(Array.isArray(outs) && outs.length>0){ sag = outs.reduce((s,o)=> s + (num(o.sagM2)||0), 0); kirik = outs.reduce((s,o)=> s + (num(o.kirikM2)||0), 0); }
        else {
          const rows = Array.from(document.querySelectorAll('#plakaOutBodyV2 tr'));
          if(rows.length>0){
            sag = rows.reduce((s,tr)=> s + (num(tr.querySelector('.p-sm2')?.value)||0), 0);
            kirik = rows.reduce((s,tr)=> s + (num(tr.querySelector('.p-km2')?.value)||0), 0);
          }
        }
        const g = isNaN(num(girisM2)) ? 0 : num(girisM2);
        const totalOut = sag + kirik;
        const fire = Math.max(0, g - sag);
        const pct = g>0 ? (fire/g*100) : 0;
      // build pills safely using DOM APIs
      while(summ.firstChild) summ.removeChild(summ.firstChild);
      function makePill(label, value){ const d = document.createElement('div'); d.className='pill'; const t = document.createTextNode(label + ' '); const b = document.createElement('b'); b.textContent = value; d.appendChild(t); d.appendChild(b); return d; }
      summ.appendChild(makePill('Giriş m²:', g? nf3.format(g): '0'));
      summ.appendChild(makePill('Sağlam m²:', nf3.format(sag)));
      summ.appendChild(makePill('Kırık m²:', nf3.format(kirik)));
      summ.appendChild(makePill('Çıkan m²:', nf3.format(totalOut)));
      summ.appendChild(makePill('Fire m²:', nf3.format(fire)));
      summ.appendChild(makePill('Fire %:', isNaN(pct)?'0':nf3.format(pct)));
      }
      function load(rec){
        const f=document.getElementById('frmPlakaEbatV2'); if(!f) return;
        try{ f.tarih.value = rec.tarih||''; }catch(_){ }
      try{ setFormFieldValue(f, 'blokNo', normalizeBlokNo(rec.blokNo||'')); }catch(_){ if(f.blokNo) f.blokNo.value = normalizeBlokNo(rec.blokNo||''); }
        try{ f.tasIsmi.value = rec.tasIsmi||''; }catch(_){ }
      try{ setFormFieldValue(f, 'kalinlik', rec.kalinlik||''); }catch(_){ if(f.kalinlik) f.kalinlik.value = sanitizeDimensionVal(rec.kalinlik||''); }
      try{ setFormFieldValue(f, 'en', rec.en||''); }catch(_){ if(f.en) f.en.value = sanitizeDimensionVal(rec.en||''); }
      try{ setFormFieldValue(f, 'boy', rec.boy||''); }catch(_){ if(f.boy) f.boy.value = sanitizeDimensionVal(rec.boy||''); }
      try{ setFormFieldValue(f, 'adet', rec.adet||''); }catch(_){ if(f.adet) f.adet.value = sanitizeDimensionVal(rec.adet||''); }
      try{ setFormFieldValue(f, 'm2', rec.m2||''); }catch(_){ if(f.m2) f.m2.value = sanitizeDimensionVal(rec.m2||''); }
        try{ f.idHidden.value = rec.id||''; }catch(_){ }
      const body=document.getElementById('plakaOutBodyV2'); if(!body) return; try{ while(body.firstChild) body.removeChild(body.firstChild); }catch(_){ body.textContent=''; }
        (rec.out||[]).forEach(o=>{
          addOutRow();
          const tr = body.querySelector('tr:last-child');
          if(tr){
            const pEn = tr.querySelector('.p-en'); if(pEn) pEn.value = sanitizeDimensionVal(o.en||'');
            const pBoy = tr.querySelector('.p-boy'); if(pBoy) pBoy.value = sanitizeDimensionVal(o.boy||'');
            const pSad = tr.querySelector('.p-sadet'); if(pSad) pSad.value = sanitizeDimensionVal(o.sagAdet||'');
            const pSm2 = tr.querySelector('.p-sm2'); if(pSm2) pSm2.value = sanitizeDimensionVal(o.sagM2||'');
            const pKad = tr.querySelector('.p-kadet'); if(pKad) pKad.value = sanitizeDimensionVal(o.kirikAdet||'');
            const pKm2 = tr.querySelector('.p-km2'); if(pKm2) pKm2.value = sanitizeDimensionVal(o.kirikM2||'');
          }
        });
        try{ computePlakaSummary(num(f.m2?.value||'')||0, rec.out||[]); }catch(_){ }
      }
    
      document.getElementById('plakaAddOutBtnV2')?.addEventListener('click', (e)=>{ e.preventDefault(); addOutRow(); });
      document.getElementById('plakaSaveBtnV2')?.addEventListener('click', (e)=>{ e.preventDefault(); save(); try{ updateBlokListDatalist?.(); }catch(_){ } });
    
      // live preview: when any output inputs or form inputs change, recompute Plaka summary
      if(ourCard){
        ourCard.addEventListener('input', function(e){ try{ if(!e.target) return; setTimeout(()=>{ const f = document.getElementById('frmPlakaEbatV2'); const g = f ? num(f.m2?.value||'') : 0; computePlakaSummary(g); }, 30); }catch(_){ } });
      }
    
      render();
    });
    
    /* ==== BODY inline script #19 ==== */
    document.addEventListener('DOMContentLoaded', function(){
      // show our v2 card when the subtab is clicked (keeps original subtab behavior)
      const sub = document.querySelector('#ara-subtabs .subtab[data-sub="ara_pah_makinesi"]');
      const wrapper = document.getElementById('ara_makinalar-content');
      const ourCard = document.getElementById('ara_pah_makinesi_v2-content');
      function showOurCard(){ if(wrapper){ Array.from(wrapper.querySelectorAll(':scope > .card')).forEach(c=> c.style.display='none'); } if(ourCard) ourCard.style.display=''; }
      if(sub){ sub.addEventListener('click', function(){ setTimeout(showOurCard,30); }); }
      if(sub && sub.classList.contains('active')){ setTimeout(showOurCard,30); }
    
      const KEY = 'v91_pah_kayitlar';
      function getAll(){ try{ return JSON.parse(localStorage.getItem(KEY)||'[]'); }catch(e){ return []; } }
      function setAll(a){ localStorage.setItem(KEY, JSON.stringify(a)); }
    
      function cm2ToM2(en,boy,adet){
        // legacy alias -> delegate to cm2_to_m2_local for consistent mm/cm handling
        try{ return cm2_to_m2_local(en,boy,adet); }catch(e){ return NaN; }
      }
    
      function calcGiris(){ const f=document.getElementById('frmPah'); if(!f) return; const v = cm2ToM2(f.en.value,f.boy.value,f.girisAdet.value); f.girisM2.value = (!isNaN(v) && v!==0) ? Number(v).toFixed(3) : ''; }
      function calcCikis(){ const f=document.getElementById('frmPah'); if(!f) return; const v = cm2ToM2(f.en.value,f.boy.value,f.cikisAdet.value); f.cikisM2.value = (!isNaN(v) && v!==0) ? Number(v).toFixed(3) : ''; }
      function calcKirik(){ const f=document.getElementById('frmPah'); if(!f) return; const v = cm2ToM2(f.en.value,f.boy.value,f.kirikAdet.value); f.kirikM2.value = (!isNaN(v) && v!==0) ? Number(v).toFixed(3) : ''; }
    
      ['en','boy','girisAdet','cikisAdet','kirikAdet'].forEach(n=> document.addEventListener('input', function(e){ if(!e.target) return; if(e.target.closest && e.target.closest('#frmPah')){ if(['en','boy','girisAdet'].includes(e.target.name)) calcGiris(); if(['en','boy','cikisAdet'].includes(e.target.name)) calcCikis(); if(['en','boy','kirikAdet'].includes(e.target.name)) calcKirik(); } }));
    
      function readForm(){ const f=document.getElementById('frmPah'); if(!f) return null; return { id: f.idHidden?.value || Date.now().toString(36), tarih: f.tarih?.value||'', tasIsmi: f.tasIsmi?.value||'', kalinlik: f.kalinlik?.value||'', en: f.en?.value||'', boy: f.boy?.value||'', girisAdet: f.girisAdet?.value||'', girisM2: f.girisM2?.value||'', cikisAdet: f.cikisAdet?.value||'', cikisM2: f.cikisM2?.value||'', kirikAdet: f.kirikAdet?.value||'', kirikM2: f.kirikM2?.value||'', aciklama: f.aciklama?.value||'' }; }
    
      function save(){ const rec = readForm(); if(!rec) return; if(!rec.tarih){ alert('Tarih zorunlu'); return; } const arr = getAll(); if(document.getElementById('frmPah').idHidden.value){ const i = arr.findIndex(x=>x.id===rec.id); if(i>=0) arr[i]=rec; else arr.unshift(rec); } else { arr.unshift(rec); } setAll(arr); render(); document.getElementById('frmPah').reset(); }
  try{ scheduleSync(KEY, readForm()); }catch(_){ }
    
      function render(){ const tbody = document.getElementById('pahListBody'); if(!tbody) return; const arr = getAll(); tbody.innerHTML=''; arr.forEach(rec=>{ const tr = document.createElement('tr'); tr.innerHTML = safeHTML`<td>${rec.tarih||''}</td><td>${rec.tasIsmi||''}</td><td>${rec.kalinlik||''}</td><td>${rec.en||''}</td><td>${rec.boy||''}</td><td>${rec.girisAdet||''}</td><td>${rec.girisM2||''}</td><td>${rec.cikisAdet||''}</td><td>${rec.cikisM2||''}</td><td>${rec.kirikAdet||''}</td><td>${rec.kirikM2||''}</td><td>${rec.aciklama||''}</td>`; const tdAct = document.createElement('td'); tdAct.style.display='flex'; tdAct.style.gap='6px'; const btnEdit=document.createElement('button'); btnEdit.className='btn ghost small'; btnEdit.textContent='Düzenle'; btnEdit.addEventListener('click', ()=> load(rec)); const btnDel=document.createElement('button'); btnDel.className='btn danger small'; btnDel.textContent='Sil'; btnDel.addEventListener('click', ()=>{ if(confirm('Silinsin mi?')){ const a=getAll(); const i=a.findIndex(x=>x.id===rec.id); if(i>=0){ a.splice(i,1); setAll(a); render(); } } }); tdAct.appendChild(btnEdit); tdAct.appendChild(btnDel); tr.appendChild(tdAct); tbody.appendChild(tr); }); }
    
      function load(rec){
        const f=document.getElementById('frmPah'); if(!f) return;
        try{ f.tarih.value = rec.tarih||''; }catch(_){ }
        try{ f.tasIsmi.value = rec.tasIsmi||''; }catch(_){ }
      try{ setFormFieldValue(f, 'kalinlik', rec.kalinlik||''); }catch(_){ if(f.kalinlik) f.kalinlik.value = sanitizeDimensionVal(rec.kalinlik||''); }
      try{ setFormFieldValue(f, 'en', rec.en||''); }catch(_){ if(f.en) f.en.value = sanitizeDimensionVal(rec.en||''); }
      try{ setFormFieldValue(f, 'boy', rec.boy||''); }catch(_){ if(f.boy) f.boy.value = sanitizeDimensionVal(rec.boy||''); }
      try{ f.girisAdet.value = sanitizeDimensionVal(rec.girisAdet||''); }catch(_){ try{ f.girisAdet.value = sanitizeDimensionVal(rec.girisAdet||''); }catch(_){} }
      try{ f.girisM2.value = sanitizeDimensionVal(rec.girisM2||''); }catch(_){ try{ f.girisM2.value = sanitizeDimensionVal(rec.girisM2||''); }catch(_){} }
      try{ f.cikisAdet.value = sanitizeDimensionVal(rec.cikisAdet||''); }catch(_){ try{ f.cikisAdet.value = sanitizeDimensionVal(rec.cikisAdet||''); }catch(_){} }
      try{ f.cikisM2.value = sanitizeDimensionVal(rec.cikisM2||''); }catch(_){ try{ f.cikisM2.value = sanitizeDimensionVal(rec.cikisM2||''); }catch(_){} }
      try{ f.kirikAdet.value = sanitizeDimensionVal(rec.kirikAdet||''); }catch(_){ try{ f.kirikAdet.value = sanitizeDimensionVal(rec.kirikAdet||''); }catch(_){} }
      try{ f.kirikM2.value = sanitizeDimensionVal(rec.kirikM2||''); }catch(_){ try{ f.kirikM2.value = sanitizeDimensionVal(rec.kirikM2||''); }catch(_){} }
        try{ f.aciklama.value = rec.aciklama||''; }catch(_){ }
        try{ f.idHidden.value = rec.id||''; }catch(_){ }
      }
    
      document.getElementById('pahSaveBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); save(); });
      document.getElementById('pahClearBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); const f=document.getElementById('frmPah'); if(f){ f.reset(); } });
    
      render();
    });
    
    /* ==== BODY inline script #20 ==== */
    // Aylık Kar&Zarar (Fatura Yönetimi) Modülü - Mermer Dashboard Entegrasyon
    (function(){
      'use strict';
      
      // İlk yükleme - sekme sistemiyle entegrasyon
      function initFaturaModule() {
        console.log('Fatura modülü iframe ile yüklendi');
        const yotSection = document.getElementById('yoteneci');
        if (!yotSection) {
          console.log('yoteneci section not found');
          return;
        }
        
        // Zaten başlatılmışsa tekrar başlatma
        if (yotSection.dataset.faturaInitialized === 'true') {
          console.log('already initialized');
          return;
        }
        yotSection.dataset.faturaInitialized = 'true';
        
        console.log('Fatura dashboard initialized via iframe!');
      }
      
      // Global API'ye export et
      if (typeof window.faturaModul === 'undefined') {
        window.faturaModul = {};
      }
      window.faturaModul.init = initFaturaModule;
      
      // Sayfa yüklendiğinde veya sekme geçişinde çalışsın
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
          console.log('DOM ready, setting up tab listener');
          setupTabListener();
        });
      } else {
        console.log('DOM already ready, setting up tab listener now');
        setupTabListener();
      }
      
      function setupTabListener() {
        // Sekme görünür olduğunda modülü başlat
        const yotSection = document.getElementById('yoteneci');
        if (!yotSection) {
          console.log('Yoteneci section not found!');
          return;
        }
        
        // Sekme görünür hale geldiğinde iframe'i yükle
        const observer = new MutationObserver(function(mutations) {
          mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
              const section = mutation.target;
              // Sekme görünür hale geldiğinde (display !== 'none')
              if (section.style.display !== 'none' && section.dataset.faturaInitialized !== 'true') {
                console.log('Yoteneci section became visible, initializing module');
                setTimeout(initFaturaModule, 50);
              }
            }
          });
        });
        
        // Section'ın style değişikliklerini izle
        observer.observe(yotSection, { attributes: true, attributeFilter: ['style'] });
        
        // Eğer sayfa açıldığında zaten yoteneci aktifse direkt başlat
        if (yotSection.style.display !== 'none' || yotSection.classList.contains('active')) {
          console.log('Yoteneci already visible on load');
          setTimeout(initFaturaModule, 50);
        }
      }
    })();
    
    /* ==== BODY inline script #21 ==== */
    (function(){
      'use strict';
      
      // Global state - fatura sistemi için
      let faturaCariler = [];
      let faturaFaturalar = [];
      let faturaAnaMaliyet = [];
      let faturaAltMaliyet = [];
      let faturaDovizKurlari = { USD_TRY: 32.50, EUR_TRY: 35.30 };
      
      // LocalStorage anahtarları
      const STORAGE_KEYS = {
        cariler: 'fx111_fatura_cariler',
        faturalar: 'fx111_fatura_faturalar',
        anaMaliyet: 'fx111_fatura_ana_maliyet',
        altMaliyet: 'fx111_fatura_alt_maliyet',
        dovizKurlari: 'fx111_fatura_doviz_kurlari',
        dovizTarih: 'fx111_fatura_doviz_tarih'
      };
      
      // Yardımcı fonksiyonlar
      function formatSayiFatura(sayi, ondalik = 2) {
        return Number(sayi).toLocaleString('tr-TR', {minimumFractionDigits: ondalik, maximumFractionDigits: ondalik});
      }
      
      function formatTarihFatura(tarihStr) {
        if (!tarihStr) return '-';
        const d = new Date(tarihStr);
        return d.toLocaleDateString('tr-TR');
      }
      
      // LocalStorage işlemleri
      function yukleVerilerFatura() {
        try {
          faturaCariler = JSON.parse(localStorage.getItem(STORAGE_KEYS.cariler) || '[]');
          faturaFaturalar = JSON.parse(localStorage.getItem(STORAGE_KEYS.faturalar) || '[]');
          faturaAnaMaliyet = JSON.parse(localStorage.getItem(STORAGE_KEYS.anaMaliyet) || '[]');
          faturaAltMaliyet = JSON.parse(localStorage.getItem(STORAGE_KEYS.altMaliyet) || '[]');
          faturaDovizKurlari = JSON.parse(localStorage.getItem(STORAGE_KEYS.dovizKurlari) || '{"USD_TRY":32.50,"EUR_TRY":35.30}');
        } catch(e) {
          console.error('Veri yükleme hatası:', e);
        }
      }
      
      function kaydetCarilerFatura() {
        localStorage.setItem(STORAGE_KEYS.cariler, JSON.stringify(faturaCariler));
      }
      
      function kaydetFaturaFaturalar() {
        localStorage.setItem(STORAGE_KEYS.faturalar, JSON.stringify(faturaFaturalar));
      }
      
      function kaydetAnaMaliyetFatura() {
        localStorage.setItem(STORAGE_KEYS.anaMaliyet, JSON.stringify(faturaAnaMaliyet));
      }
      
      function kaydetAltMaliyetFatura() {
        localStorage.setItem(STORAGE_KEYS.altMaliyet, JSON.stringify(faturaAltMaliyet));
      }
      
      // Sekme değiştirme
      function initFaturaSubTabs() {
        console.log('initFaturaSubTabs called');
        const subtabs = document.querySelectorAll('[data-fatura-tab]');
        console.log('Found subtabs:', subtabs.length);
        
        if (subtabs.length === 0) {
          console.error('No subtabs found!');
          return;
        }
        
        subtabs.forEach(btn => {
          btn.addEventListener('click', function() {
            console.log('Subtab clicked:', this.getAttribute('data-fatura-tab'));
            subtabs.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const tab = this.getAttribute('data-fatura-tab');
            renderFaturaContent(tab);
          });
        });
        
        // İlk yükleme - aktif sekmeyi render et
        const activeTab = document.querySelector('[data-fatura-tab].active');
        if (activeTab) {
          const tab = activeTab.getAttribute('data-fatura-tab');
          console.log('Rendering initial tab:', tab);
          renderFaturaContent(tab);
        } else {
          console.log('No active tab found, rendering gelen-fatura');
          renderFaturaContent('gelen-fatura');
        }
      }
      
      // İçerik render
      function renderFaturaContent(tab) {
        console.log('renderFaturaContent called with tab:', tab);
        const wrap = document.getElementById('fatura-content-wrap');
        if (!wrap) {
          console.error('fatura-content-wrap not found!');
          return;
        }
        
        console.log('Rendering content for tab:', tab);
        
        switch(tab) {
          case 'gelen-fatura':
            wrap.innerHTML = getGelenFaturaHTML();
            break;
          case 'giden-fatura':
            wrap.innerHTML = getGidenFaturaHTML();
            break;
          case 'yeni-cari':
            wrap.innerHTML = getYeniCariHTML();
            break;
          case 'kayitli-faturalar':
            wrap.innerHTML = getKayitliFaturalarHTML();
            break;
          case 'kayitli-cariler':
            wrap.innerHTML = getKayitliCarilerHTML();
            break;
          case 'ana-maliyet':
            wrap.innerHTML = getAnaMaliyetHTML();
            break;
          case 'alt-maliyet':
            wrap.innerHTML = getAltMaliyetHTML();
            break;
          case 'rapor':
            wrap.innerHTML = getRaporHTML();
            break;
          default:
            console.error('Unknown tab:', tab);
        }
        
        console.log('Content rendered, innerHTML length:', wrap.innerHTML.length);
        
        // Event listener'ları bağla
        attachEventListeners(tab);
      }
      
      // HTML şablonları (basitleştirilmiş versiyonlar)
      function getGelenFaturaHTML() {
        const bugun = new Date().toISOString().split('T')[0];
        return `
          <div class="alert info" style="margin-bottom:16px;">
            📥 Tedarikçilerden gelen faturaları (giderlerinizi) buradan kaydedin.
          </div>
          <h4 style="margin-bottom:16px;">Yeni Gelen Fatura Ekle (Gider)</h4>
          <div class="form-grid">
            <div class="form-group">
              <label>Fatura Tarihi *</label>
              <input type="date" id="gf-tarih" class="field" value="${bugun}" required />
            </div>
            <div class="form-group">
              <label>Cari Seçin *</label>
              <select id="gf-cari" class="field" required>
                <option value="">Seçiniz...</option>
              </select>
            </div>
            <div class="form-group">
              <label>Ana Maliyet Merkezi *</label>
              <select id="gf-ana-maliyet" class="field">
                <option value="">Seçiniz...</option>
              </select>
            </div>
            <div class="form-group">
              <label>Alt Maliyet Merkezi</label>
              <select id="gf-alt-maliyet" class="field">
                <option value="">Seçiniz...</option>
              </select>
            </div>
            <div class="form-group">
              <label>Para Birimi *</label>
              <select id="gf-para-birimi" class="field">
                <option value="TRY">TL</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div class="form-group">
              <label>Tutar *</label>
              <input type="number" id="gf-tutar" class="field" step="0.01" placeholder="0.00" required />
            </div>
            <div class="form-group">
              <label>KDV (%)</label>
              <select id="gf-kdv" class="field">
                <option value="0">0</option>
                <option value="1">1</option>
                <option value="10">10</option>
                <option value="20" selected>20</option>
              </select>
            </div>
            <div class="form-group">
              <label>KDV Tutarı</label>
              <input type="number" id="gf-kdv-tutar" class="field" readonly />
            </div>
            <div class="form-group">
              <label>Toplam</label>
              <input type="number" id="gf-toplam" class="field" readonly />
            </div>
          </div>
          <div class="actions">
            <button id="gf-kaydet" class="btn primary">💾 Gider Faturasını Kaydet</button>
            <button id="gf-temizle" class="btn ghost">🔄 Temizle</button>
          </div>
        `;
      }
      
      function getGidenFaturaHTML() {
        const bugun = new Date().toISOString().split('T')[0];
        return `
          <div class="alert success" style="margin-bottom:16px;">
            📤 Müşterilere kestiğiniz faturaları (gelirlerinizi) buradan kaydedin.
          </div>
          <h4 style="margin-bottom:16px;">Yeni Giden Fatura Ekle (Gelir)</h4>
          <div class="form-grid">
            <div class="form-group">
              <label>Fatura Tarihi *</label>
              <input type="date" id="giden-f-tarih" class="field" value="${bugun}" required />
            </div>
            <div class="form-group">
              <label>Müşteri Seçin *</label>
              <select id="giden-f-cari" class="field" required>
                <option value="">Seçiniz...</option>
              </select>
            </div>
            <div class="form-group">
              <label>Kategori *</label>
              <select id="giden-f-kategori" class="field" required>
                <option value="">Seçiniz...</option>
                <option value="Fason Plaka">Fason Plaka</option>
                <option value="Ensar Blok">Ensar Blok</option>
              </select>
            </div>
            <div class="form-group">
              <label>Para Birimi *</label>
              <select id="giden-f-para-birimi" class="field">
                <option value="TRY">TL</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div class="form-group">
              <label>Tutar *</label>
              <input type="number" id="giden-f-tutar" class="field" step="0.01" placeholder="0.00" required />
            </div>
            <div class="form-group">
              <label>KDV (%)</label>
              <select id="giden-f-kdv" class="field">
                <option value="0">0</option>
                <option value="1">1</option>
                <option value="10">10</option>
                <option value="20" selected>20</option>
              </select>
            </div>
            <div class="form-group">
              <label>KDV Tutarı</label>
              <input type="number" id="giden-f-kdv-tutar" class="field" readonly />
            </div>
            <div class="form-group">
              <label>Toplam</label>
              <input type="number" id="giden-f-toplam" class="field" readonly />
            </div>
          </div>
          <div class="actions">
            <button id="giden-f-kaydet" class="btn primary" style="background:linear-gradient(90deg, #10b981 0%, #059669 100%);">💾 Gelir Faturasını Kaydet</button>
            <button id="giden-f-temizle" class="btn ghost">🔄 Temizle</button>
          </div>
        `;
      }
      
      function getYeniCariHTML() {
        return `
          <h4 style="margin-bottom:16px;">Yeni Cari Ekle</h4>
          <div class="form-grid" style="max-width:600px;">
            <div class="form-group">
              <label>Cari Ünvanı *</label>
              <input type="text" id="cari-unvan" class="field" required />
            </div>
          </div>
          <div class="actions">
            <button id="cari-kaydet" class="btn primary">💾 Cariyi Kaydet</button>
            <button id="cari-temizle" class="btn ghost">🔄 Temizle</button>
          </div>
        `;
      }
      
      function getKayitliFaturalarHTML() {
        let html = '<h4>Kayıtlı Faturalar</h4>';
        html += '<div id="fatura-liste-container"></div>';
        return html;
      }
      
      function getKayitliCarilerHTML() {
        let html = '<h4>Kayıtlı Cariler</h4>';
        if (faturaCariler.length === 0) {
          html += '<p style="color:#64748b;">Henüz kayıtlı cari bulunmuyor.</p>';
        } else {
          html += '<div class="table-wrap"><table><thead><tr><th>Kod</th><th>Ünvan</th><th>İşlem</th></tr></thead><tbody>';
          faturaCariler.forEach(c => {
            html += `<tr><td>${c.kod}</td><td>${c.unvan}</td><td><button class="btn danger small" onclick="window.faturaModul.cariSil(${c.id})">Sil</button></td></tr>`;
          });
          html += '</tbody></table></div>';
        }
        return html;
      }
      
      function getAnaMaliyetHTML() {
        let html = '<h4>Ana Maliyet Merkezleri</h4>';
        html += `<div style="display:grid;grid-template-columns:1fr 1fr 150px;gap:12px;margin-bottom:16px;max-width:800px;">
          <div><label>Ana Maliyet Adı *</label><input type="text" id="ana-m-ad" class="field" required /></div>
          <div></div>
          <div style="display:flex;align-items:flex-end;"><button id="ana-m-kaydet" class="btn primary" style="width:100%;">💾 Kaydet</button></div>
        </div>`;
        
        if (faturaAnaMaliyet.length > 0) {
          html += '<div class="table-wrap" style="margin-top:20px;"><table><thead><tr><th>Kod</th><th>Ad</th><th>İşlem</th></tr></thead><tbody>';
          faturaAnaMaliyet.forEach(a => {
            html += `<tr><td>${a.kod}</td><td>${a.ad}</td><td><button class="btn danger small" onclick="window.faturaModul.anaMaliyetSil(${a.id})">Sil</button></td></tr>`;
          });
          html += '</tbody></table></div>';
        }
        return html;
      }
      
      function getAltMaliyetHTML() {
        let html = '<h4>Alt Maliyet Merkezleri</h4>';
        html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 150px;gap:12px;margin-bottom:16px;max-width:1000px;">
          <div><label>Ana Maliyet *</label><select id="alt-m-ana" class="field"><option value="">Seçiniz...</option></select></div>
          <div><label>Alt Maliyet Adı *</label><input type="text" id="alt-m-ad" class="field" required /></div>
          <div></div>
          <div style="display:flex;align-items:flex-end;"><button id="alt-m-kaydet" class="btn primary" style="width:100%;">💾 Kaydet</button></div>
        </div>`;
        
        if (faturaAltMaliyet.length > 0) {
          html += '<div class="table-wrap" style="margin-top:20px;"><table><thead><tr><th>Kod</th><th>Ana</th><th>Alt</th><th>İşlem</th></tr></thead><tbody>';
          faturaAltMaliyet.forEach(a => {
            const ana = faturaAnaMaliyet.find(x => x.id === a.anaId);
            html += `<tr><td>${a.kod}</td><td>${ana ? ana.ad : '-'}</td><td>${a.ad}</td><td><button class="btn danger small" onclick="window.faturaModul.altMaliyetSil(${a.id})">Sil</button></td></tr>`;
          });
          html += '</tbody></table></div>';
        }
        return html;
      }
      
      function getRaporHTML() {
        const bugun = new Date();
        const yil = bugun.getFullYear();
        const ay = String(bugun.getMonth() + 1).padStart(2, '0');
        const donem = `${yil}-${ay}`;
        
        return `
          <h4>📊 Raporlar ve Kar/Zarar Analizi</h4>
          <div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:20px;max-width:600px;">
            <div style="flex:1;"><label>Rapor Dönemi</label><input type="month" id="rapor-donem" class="field" value="${donem}" /></div>
            <button id="rapor-guncelle" class="btn primary">🔄 Güncelle</button>
          </div>
          <div id="rapor-container"></div>
        `;
      }
      
      // Event listeners
      function attachEventListeners(tab) {
        if (tab === 'gelen-fatura') {
          doldurCariSelect('gf-cari');
          doldurAnaMaliyetSelect('gf-ana-maliyet');
          
          const tutarEl = document.getElementById('gf-tutar');
          const kdvEl = document.getElementById('gf-kdv');
          tutarEl?.addEventListener('input', () => kdvHesaplaGelen());
          kdvEl?.addEventListener('change', () => kdvHesaplaGelen());
          
          document.getElementById('gf-ana-maliyet')?.addEventListener('change', () => {
            doldurAltMaliyetSelect('gf-alt-maliyet', document.getElementById('gf-ana-maliyet').value);
          });
          
          document.getElementById('gf-kaydet')?.addEventListener('click', gelenFaturaKaydet);
          document.getElementById('gf-temizle')?.addEventListener('click', () => renderFaturaContent('gelen-fatura'));
        }
        
        if (tab === 'giden-fatura') {
          doldurCariSelect('giden-f-cari');
          
          const tutarEl = document.getElementById('giden-f-tutar');
          const kdvEl = document.getElementById('giden-f-kdv');
          tutarEl?.addEventListener('input', () => kdvHesaplaGiden());
          kdvEl?.addEventListener('change', () => kdvHesaplaGiden());
          
          document.getElementById('giden-f-kaydet')?.addEventListener('click', gidenFaturaKaydet);
          document.getElementById('giden-f-temizle')?.addEventListener('click', () => renderFaturaContent('giden-fatura'));
        }
        
        if (tab === 'yeni-cari') {
          document.getElementById('cari-kaydet')?.addEventListener('click', cariKaydet);
          document.getElementById('cari-temizle')?.addEventListener('click', () => renderFaturaContent('yeni-cari'));
        }
        
        if (tab === 'kayitli-faturalar') {
          renderFaturaListesi();
        }
        
        if (tab === 'ana-maliyet') {
          document.getElementById('ana-m-kaydet')?.addEventListener('click', anaMaliyetKaydet);
        }
        
        if (tab === 'alt-maliyet') {
          doldurAnaMaliyetSelect('alt-m-ana');
          document.getElementById('alt-m-kaydet')?.addEventListener('click', altMaliyetKaydet);
        }
        
        if (tab === 'rapor') {
          document.getElementById('rapor-guncelle')?.addEventListener('click', raporGuncelle);
          raporGuncelle();
        }
      }
      
      // Helper: Cari select doldur
      function doldurCariSelect(selectId) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        // Clear existing options and populate safely
        while(sel.firstChild) sel.removeChild(sel.firstChild);
        const dOpt = document.createElement('option'); dOpt.value = ''; dOpt.textContent = 'Seçiniz...'; sel.appendChild(dOpt);
        faturaCariler.forEach(c => {
          const o = document.createElement('option');
          o.value = c.id || '';
          o.textContent = (c.kod || '') + (c.unvan ? (' - ' + c.unvan) : '');
          sel.appendChild(o);
        });
      }
      
      // Helper: Ana maliyet select doldur
      function doldurAnaMaliyetSelect(selectId) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        while(sel.firstChild) sel.removeChild(sel.firstChild);
        const dOpt = document.createElement('option'); dOpt.value = ''; dOpt.textContent = 'Seçiniz...'; sel.appendChild(dOpt);
        faturaAnaMaliyet.forEach(a => {
          const o = document.createElement('option');
          o.value = a.id || '';
          o.textContent = (a.kod || '') + (a.ad ? (' - ' + a.ad) : '');
          sel.appendChild(o);
        });
      }
      
      // Helper: Alt maliyet select doldur
      function doldurAltMaliyetSelect(selectId, anaId) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        while(sel.firstChild) sel.removeChild(sel.firstChild);
        const dOpt = document.createElement('option'); dOpt.value = ''; dOpt.textContent = 'Seçiniz...'; sel.appendChild(dOpt);
        if (!anaId) return;
        const altlar = faturaAltMaliyet.filter(a => a.anaId == anaId);
        altlar.forEach(a => {
          const o = document.createElement('option');
          o.value = a.id || '';
          o.textContent = (a.kod || '') + (a.ad ? (' - ' + a.ad) : '');
          sel.appendChild(o);
        });
      }
      
      // KDV hesapla
      function kdvHesaplaGelen() {
        const tutar = parseFloat(document.getElementById('gf-tutar')?.value || 0);
        const kdv = parseFloat(document.getElementById('gf-kdv')?.value || 0);
        const kdvTutar = (tutar * kdv) / 100;
        const toplam = tutar + kdvTutar;
        document.getElementById('gf-kdv-tutar').value = kdvTutar.toFixed(2);
        document.getElementById('gf-toplam').value = toplam.toFixed(2);
      }
      
      function kdvHesaplaGiden() {
        const tutar = parseFloat(document.getElementById('giden-f-tutar')?.value || 0);
        const kdv = parseFloat(document.getElementById('giden-f-kdv')?.value || 0);
        const kdvTutar = (tutar * kdv) / 100;
        const toplam = tutar + kdvTutar;
        document.getElementById('giden-f-kdv-tutar').value = kdvTutar.toFixed(2);
        document.getElementById('giden-f-toplam').value = toplam.toFixed(2);
      }
      
      // Fatura kaydet işlemleri
      function gelenFaturaKaydet() {
        const tarih = document.getElementById('gf-tarih')?.value;
        const cariId = parseInt(document.getElementById('gf-cari')?.value);
        const anaMaliyetId = parseInt(document.getElementById('gf-ana-maliyet')?.value) || null;
        const altMaliyetId = parseInt(document.getElementById('gf-alt-maliyet')?.value) || null;
        const paraBirimi = document.getElementById('gf-para-birimi')?.value;
        const tutar = parseFloat(document.getElementById('gf-tutar')?.value);
        const kdvOran = parseFloat(document.getElementById('gf-kdv')?.value);
        const kdvTutar = parseFloat(document.getElementById('gf-kdv-tutar')?.value);
        const toplam = parseFloat(document.getElementById('gf-toplam')?.value);
        
        if (!tarih || !cariId || !tutar) {
          alert('⚠️ Lütfen zorunlu alanları doldurun!');
          return;
        }
        
        const no = yeniFaturaNoOlustur('gelen');
        const fatura = {
          id: Date.now(),
          no, tarih, cariId, tur: 'gelen',
          anaMaliyetId, altMaliyetId, paraBirimi, tutar, kdvOran, kdvTutar, toplam
        };
        
        faturaFaturalar.push(fatura);
        kaydetFaturaFaturalar();
        alert('✅ Gider faturası kaydedildi! No: ' + no);
        renderFaturaContent('gelen-fatura');
      }
      
      function gidenFaturaKaydet() {
        const tarih = document.getElementById('giden-f-tarih')?.value;
        const cariId = parseInt(document.getElementById('giden-f-cari')?.value);
        const kategori = document.getElementById('giden-f-kategori')?.value;
        const paraBirimi = document.getElementById('giden-f-para-birimi')?.value;
        const tutar = parseFloat(document.getElementById('giden-f-tutar')?.value);
        const kdvOran = parseFloat(document.getElementById('giden-f-kdv')?.value);
        const kdvTutar = parseFloat(document.getElementById('giden-f-kdv-tutar')?.value);
        const toplam = parseFloat(document.getElementById('giden-f-toplam')?.value);
        
        if (!tarih || !cariId || !kategori || !tutar) {
          alert('⚠️ Lütfen zorunlu alanları doldurun!');
          return;
        }
        
        const no = yeniFaturaNoOlustur('giden');
        const fatura = {
          id: Date.now(),
          no, tarih, cariId, tur: 'giden', kategori,
          anaMaliyetId: null, altMaliyetId: null, paraBirimi, tutar, kdvOran, kdvTutar, toplam
        };
        
        faturaFaturalar.push(fatura);
        kaydetFaturaFaturalar();
        alert('✅ Gelir faturası kaydedildi! No: ' + no);
        renderFaturaContent('giden-fatura');
      }
      
      // Cari kaydet
      function cariKaydet() {
        const unvan = document.getElementById('cari-unvan')?.value.trim();
        if (!unvan) {
          alert('⚠️ Cari ünvanı zorunludur!');
          return;
        }
        
        // Aynı ünvana sahip cari var mı kontrol et
        const mevcutCari = faturaCariler.find(c => c.unvan.toLowerCase() === unvan.toLowerCase());
        if (mevcutCari) {
          alert('⚠️ Bu ünvana sahip bir cari zaten kayıtlı! (' + mevcutCari.kod + ' - ' + mevcutCari.unvan + ')');
          return;
        }
        
        const kod = yeniCariKoduOlustur();
        const cari = { id: Date.now(), kod, unvan };
        faturaCariler.push(cari);
        kaydetCarilerFatura();
        alert('✅ Cari kaydedildi! Kod: ' + kod);
        renderFaturaContent('yeni-cari');
      }
      
      // Ana maliyet kaydet
      function anaMaliyetKaydet() {
        const ad = document.getElementById('ana-m-ad')?.value.trim();
        if (!ad) {
          alert('⚠️ Ana maliyet adı zorunludur!');
          return;
        }
        
        const kod = yeniAnaMaliyetKoduOlustur();
        const ana = { id: Date.now(), kod, ad };
        faturaAnaMaliyet.push(ana);
        kaydetAnaMaliyetFatura();
        alert('✅ Ana maliyet kaydedildi! Kod: ' + kod);
        renderFaturaContent('ana-maliyet');
      }
      
      // Alt maliyet kaydet
      function altMaliyetKaydet() {
        const anaId = parseInt(document.getElementById('alt-m-ana')?.value);
        const ad = document.getElementById('alt-m-ad')?.value.trim();
        if (!anaId || !ad) {
          alert('⚠️ Lütfen tüm alanları doldurun!');
          return;
        }
        
        const kod = yeniAltMaliyetKoduOlustur(anaId);
        const alt = { id: Date.now(), anaId, kod, ad };
        faturaAltMaliyet.push(alt);
        kaydetAltMaliyetFatura();
        alert('✅ Alt maliyet kaydedildi! Kod: ' + kod);
        renderFaturaContent('alt-maliyet');
      }
      
      // Kod oluşturucular
      function yeniCariKoduOlustur() {
        const num = faturaCariler.length + 1;
        return `CRI-${String(num).padStart(3, '0')}`;
      }
      
      function yeniFaturaNoOlustur(tur) {
        const bugun = new Date();
        const yil = bugun.getFullYear();
        const ay = String(bugun.getMonth() + 1).padStart(2, '0');
        const turFaturalar = faturaFaturalar.filter(f => f.tarih.startsWith(`${yil}-${ay}`) && f.tur === tur);
        const sira = turFaturalar.length + 1;
        const prefix = tur === 'giden' ? 'STS' : 'FTR';
        return `${prefix}-${yil}-${ay}-${String(sira).padStart(3, '0')}`;
      }
      
      function yeniAnaMaliyetKoduOlustur() {
        const num = faturaAnaMaliyet.length + 1;
        return `AMM-${String(num).padStart(3, '0')}`;
      }
      
      function yeniAltMaliyetKoduOlustur(anaId) {
        const altlar = faturaAltMaliyet.filter(a => a.anaId === anaId);
        const num = altlar.length + 1;
        const ana = faturaAnaMaliyet.find(a => a.id === anaId);
        const anaKod = ana ? ana.kod : 'AMM-000';
        return `${anaKod}-${String(num).padStart(2, '0')}`;
      }
      
      // Fatura listesi render
      function renderFaturaListesi() {
        const container = document.getElementById('fatura-liste-container');
        if (!container) return;
        
        if (faturaFaturalar.length === 0) {
          container.innerHTML = '<p style="color:#64748b;">Henüz kayıtlı fatura bulunmuyor.</p>';
          return;
        }
        
        let html = '<div class="table-wrap"><table><thead><tr>';
        html += '<th>Tarih</th><th>No</th><th>Tür</th><th>Cari</th><th>Kategori</th><th>Tutar</th><th>Toplam</th><th>İşlem</th>';
        html += '</tr></thead><tbody>';
        
        const sorted = [...faturaFaturalar].sort((a, b) => new Date(b.tarih) - new Date(a.tarih));
        sorted.forEach(f => {
          const cari = faturaCariler.find(c => c.id === f.cariId);
          const cariAd = cari ? `${cari.kod} - ${cari.unvan}` : 'Bilinmiyor';
          const turIcon = f.tur === 'giden' ? '📤' : '📥';
          const turText = f.tur === 'giden' ? 'Gelir' : 'Gider';
          const rowStyle = f.tur === 'giden' ? 'background:#f0fdf4;' : 'background:#fef2f2;';
          
          html += `<tr style="${rowStyle}">`;
          html += `<td>${formatTarihFatura(f.tarih)}</td>`;
          html += `<td><strong>${f.no}</strong></td>`;
          html += `<td>${turIcon} ${turText}</td>`;
          html += `<td>${cariAd}</td>`;
          html += `<td>${f.kategori || '-'}</td>`;
          html += `<td>${formatSayiFatura(f.tutar, 2)} ${f.paraBirimi}</td>`;
          html += `<td><strong>${formatSayiFatura(f.toplam, 2)} ${f.paraBirimi}</strong></td>`;
          html += `<td><button class="btn danger small" onclick="window.faturaModul.faturaSil(${f.id})">Sil</button></td>`;
          html += '</tr>';
        });
        
        html += '</tbody></table></div>';
        container.innerHTML = html;
      }
      
      // Rapor güncelle
      function raporGuncelle() {
        const donem = document.getElementById('rapor-donem')?.value;
        const container = document.getElementById('rapor-container');
        if (!container) return;
        
        let faturalarFiltre = [...faturaFaturalar];
        if (donem) {
          const [yil, ay] = donem.split('-');
          faturalarFiltre = faturalarFiltre.filter(f => {
            const fTarih = new Date(f.tarih);
            return fTarih.getFullYear() === parseInt(yil) && (fTarih.getMonth() + 1) === parseInt(ay);
          });
        }
        
        const gelen = faturalarFiltre.filter(f => f.tur === 'gelen');
        const giden = faturalarFiltre.filter(f => f.tur === 'giden');
        const toplamGider = gelen.reduce((sum, f) => sum + f.toplam, 0);
        const toplamGelir = giden.reduce((sum, f) => sum + f.toplam, 0);
        const net = toplamGelir - toplamGider;
        const karMarji = toplamGelir > 0 ? ((net / toplamGelir) * 100) : 0;
        
        let html = '<h5>Dönem Özeti</h5>';
        html += `
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px;">
            <div class="stat-card blue" style="padding:16px;border-radius:8px;border-left:3px solid var(--primary);">
              <div style="font-size:12px;color:var(--muted);">Fatura Sayısı</div>
              <div style="font-size:24px;font-weight:700;">${faturalarFiltre.length}</div>
              <div style="font-size:11px;color:var(--muted);">${gelen.length} Gider | ${giden.length} Gelir</div>
            </div>
            <div class="stat-card red" style="padding:16px;border-radius:8px;border-left:3px solid var(--danger);">
              <div style="font-size:12px;color:var(--muted);">📥 Toplam Gider</div>
              <div style="font-size:24px;font-weight:700;">${formatSayiFatura(toplamGider, 0)} ₺</div>
            </div>
            <div class="stat-card green" style="padding:16px;border-radius:8px;border-left:3px solid var(--accent);">
              <div style="font-size:12px;color:var(--muted);">📤 Toplam Gelir</div>
              <div style="font-size:24px;font-weight:700;">${formatSayiFatura(toplamGelir, 0)} ₺</div>
            </div>
            <div class="stat-card" style="padding:16px;border-radius:8px;border-left:3px solid ${net >= 0 ? 'var(--accent)' : 'var(--danger)'};">
              <div style="font-size:12px;color:var(--muted);">💰 Net Kar/Zarar</div>
              <div style="font-size:24px;font-weight:700;color:${net >= 0 ? 'var(--accent)' : 'var(--danger)'};">${formatSayiFatura(net, 0)} ₺</div>
              <div style="font-size:11px;color:var(--muted);">Kar Marjı: %${formatSayiFatura(karMarji, 1)}</div>
            </div>
          </div>
        `;
        
        container.innerHTML = html;
      }
      
      // Silme fonksiyonları
      function faturaSil(id) {
        if (!confirm('Bu faturayı silmek istediğinizden emin misiniz?')) return;
        faturaFaturalar = faturaFaturalar.filter(f => f.id !== id);
        kaydetFaturaFaturalar();
        renderFaturaListesi();
        alert('✅ Fatura silindi!');
      }
      
      function cariSil(id) {
        if (!confirm('Bu cariyi silmek istediğinizden emin misiniz?')) return;
        const faturaVar = faturaFaturalar.some(f => f.cariId === id);
        if (faturaVar) {
          alert('⚠️ Bu cariye ait faturalar var. Önce faturaları silmelisiniz!');
          return;
        }
        faturaCariler = faturaCariler.filter(c => c.id !== id);
        kaydetCarilerFatura();
        renderFaturaContent('kayitli-cariler');
        alert('✅ Cari silindi!');
      }
      
      function anaMaliyetSil(id) {
        if (!confirm('Bu ana maliyet merkezini silmek istediğinizden emin misiniz?')) return;
        const altVar = faturaAltMaliyet.some(a => a.anaId === id);
        if (altVar) {
          alert('⚠️ Bu ana merkeze bağlı alt maliyet merkezleri var!');
          return;
        }
        faturaAnaMaliyet = faturaAnaMaliyet.filter(a => a.id !== id);
        kaydetAnaMaliyetFatura();
        renderFaturaContent('ana-maliyet');
        alert('✅ Ana maliyet silindi!');
      }
      
      function altMaliyetSil(id) {
        if (!confirm('Bu alt maliyet merkezini silmek istediğinizden emin misiniz?')) return;
        faturaAltMaliyet = faturaAltMaliyet.filter(a => a.id !== id);
        kaydetAltMaliyetFatura();
        renderFaturaContent('alt-maliyet');
        alert('✅ Alt maliyet silindi!');
      }
      
      // İlk yükleme - sekme sistemiyle entegrasyon
      function initFaturaModule() {
        console.log('initFaturaModule called');
        const yotSection = document.getElementById('yoteneci');
        if (!yotSection) {
          console.log('yoteneci section not found');
          return;
        }
        
        // Zaten başlatılmışsa tekrar başlatma
        if (yotSection.dataset.faturaInitialized === 'true') {
          console.log('already initialized');
          return;
        }
        yotSection.dataset.faturaInitialized = 'true';
        
        console.log('Loading fatura data...');
        yukleVerilerFatura();
        console.log('Initializing subtabs...');
        initFaturaSubTabs();
        console.log('Fatura module initialized!');
      }
      
      // Global API'ye export et
      if (typeof window.faturaModul === 'undefined') {
        window.faturaModul = {};
      }
      window.faturaModul.faturaSil = faturaSil;
      window.faturaModul.cariSil = cariSil;
      window.faturaModul.anaMaliyetSil = anaMaliyetSil;
      window.faturaModul.altMaliyetSil = altMaliyetSil;
      window.faturaModul.init = initFaturaModule;
      
      // Sayfa yüklendiğinde veya sekme geçişinde çalışsın
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
          console.log('DOM ready, setting up tab listener');
          setupTabListener();
        });
      } else {
        console.log('DOM already ready, setting up tab listener now');
        setupTabListener();
      }
      
      function setupTabListener() {
        // Yoteneci sekmesine tıklama event'i ekle - MutationObserver ile sekme gösterilme anını yakala
        const yotSection = document.getElementById('yoteneci');
        if (!yotSection) {
          console.log('Yoteneci section not found!');
          return;
        }
        
        // Sekme görünür olduğunda modülü başlat
        const observer = new MutationObserver(function(mutations) {
          mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
              const section = mutation.target;
              // Sekme görünür hale geldiğinde (display !== 'none')
              if (section.style.display !== 'none' && section.dataset.faturaInitialized !== 'true') {
                console.log('Yoteneci section became visible, initializing module');
                setTimeout(initFaturaModule, 50);
              }
            }
          });
        });
        
        // Section'ın style değişikliklerini izle
        observer.observe(yotSection, { attributes: true, attributeFilter: ['style'] });
        
        // Eğer sayfa açıldığında zaten yoteneci aktifse direkt başlat
        if (yotSection.style.display !== 'none' || yotSection.classList.contains('active')) {
          console.log('Yoteneci already visible on load');
          setTimeout(initFaturaModule, 50);
        }
      }
    })();
    
    /* ==== BODY inline script #22 ==== */
    (function(){
      // Minimal local helpers (fall back if global helpers not present)
      function num(v){ if(v===undefined||v===null||v==='') return NaN; try{ const s=String(v).replace(/\s+/g,'').replace(',','.'); return Number(s); }catch(e){ return NaN; } }
      // expose numeric parser globally so deeply nested/async blocks can access it reliably
      try{ window.num = num; }catch(_){ }
      var nf3 = { format: (v)=> { try{ const n = Number(v)||0; return n.toLocaleString('tr-TR', {minimumFractionDigits:0, maximumFractionDigits:3}); }catch(e){ return String(v); } } };
    
        // Generic storage helpers
        function getKey(k){ return 'crm_' + k; }
        function getAll(key){ try{ return JSON.parse(localStorage.getItem(getKey(key))||'[]'); }catch(e){ return []; } }
        function setAll(key, arr){ localStorage.setItem(getKey(key), JSON.stringify(arr)); }
    
        // Simple entity helpers
        function upsertEntity(key, rec){ const arr = getAll(key); if(!rec.id){ rec.id = Date.now().toString(36); arr.unshift(rec); } else { const i = arr.findIndex(x=>x.id===rec.id); if(i>=0) arr[i] = rec; else arr.unshift(rec); } setAll(key, arr); }
        function deleteEntity(key, id){ const arr = getAll(key).filter(x=> x.id!==id); setAll(key, arr); }
    
        /*
          Backend sync design (offline-first, optional):
          - Purpose: keep localStorage as primary store and optionally sync to a remote REST API.
          - Approach:
            1) Add a sync queue stored as `crm_sync_queue` in localStorage. Each local write pushes a small operation {id, key, op:'upsert'|'delete', ts, payload}.
            2) A background sync worker (timer) tries to POST queued ops to /api/crm/sync with Authorization header (JWT). On success, remove from queue. On 401 -> pause and surface auth UI.
            3) Initial bootstrap: GET /api/crm/changes?since=<timestamp> to pull server-side changes and merge (by id) into localStorage.
            4) Conflict resolution: last-write-wins by timestamp, or surface conflicts in UI for manual resolution.
          - Security: use HTTPS, JWT or OAuth2 for auth, refresh tokens if needed. Attach attachments (files) via separate upload endpoint and store returned URLs in records.
          - Next steps to implement: add queue helpers, background sync toggle in settings, and a small auth modal.
        */
    
        // --- Customers ---
        function renderCustomers(filter){
          const body = document.getElementById('crmCustomersBody'); if(!body) return;
          const arr = getAll('customers'); body.innerHTML='';
          const q = (filter||'').toLowerCase();
          arr.filter(r=>{ if(!q) return true; return (r.name||'').toLowerCase().includes(q) || (r.company||'').toLowerCase().includes(q) || (r.city||'').toLowerCase().includes(q); }).forEach(rec=>{
            const tr = document.createElement('tr');
            // name, company, phone, email, city
            const fields = ['name','company','phone','email','city'];
            fields.forEach(function(f){ const td = document.createElement('td'); td.textContent = rec[f] || ''; tr.appendChild(td); });
            const td = document.createElement('td'); td.style.display='flex'; td.style.gap='6px';
            const btnEdit = document.createElement('button'); btnEdit.className='btn ghost small'; btnEdit.textContent='Düzenle'; btnEdit.addEventListener('click', ()=> loadCustomer(rec));
            const btnDel = document.createElement('button'); btnDel.className='btn danger small'; btnDel.textContent='Sil'; btnDel.addEventListener('click', ()=>{ if(confirm('Silinsin mi?')){ deleteEntity('customers', rec.id); renderCustomers(document.getElementById('crmCustomerSearch').value); renderReports(); } });
            td.appendChild(btnEdit); td.appendChild(btnDel);
            const tdWrap = document.createElement('td'); tdWrap.appendChild(td); tr.appendChild(tdWrap); body.appendChild(tr);
          });
        }
    
        function readCustomerForm(){ const f = document.getElementById('crmCustomerForm'); if(!f) return null; return { id: f.id.value||'', name: f.name.value.trim(), company: f.company.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), city: f.city.value.trim() }; }
        function loadCustomer(rec){ const f=document.getElementById('crmCustomerForm'); f.id.value = rec.id||''; f.name.value = rec.name||''; f.company.value = rec.company||''; f.phone.value = rec.phone||''; f.email.value = rec.email||''; f.city.value = rec.city||''; }
      // simple validators
      function isValidEmail(v){ if(!v) return true; return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
      function isValidPhone(v){ if(!v) return true; return /^[0-9+\-() \s]{6,30}$/.test(v); }
    
      document.getElementById('crmCustomerSave')?.addEventListener('click', function(e){ e.preventDefault(); const formEl = document.getElementById('crmCustomerForm'); clearFormError(formEl); const rec = readCustomerForm(); if(!rec || !rec.name){ showFormError(formEl, 'Müşteri adı gerekli'); return; } if(rec.email && !isValidEmail(rec.email)){ showFormError(formEl, 'Geçersiz e-posta adresi'); return; } if(rec.phone && !isValidPhone(rec.phone)){ showFormError(formEl, 'Geçersiz telefon numarası'); return; } upsertEntity('customers', rec); formEl.reset(); renderCustomers(); renderReports(); try{ populateCustomerDatalist(); }catch(e){} clearFormError(formEl); });
        document.getElementById('crmCustomerClear')?.addEventListener('click', ()=>{ document.getElementById('crmCustomerForm').reset(); });
        document.getElementById('crmCustomerSearch')?.addEventListener('input', function(){ renderCustomers(this.value); });
        document.getElementById('crmCustomerExport')?.addEventListener('click', function(){ const arr = getAll('customers'); if(!arr.length){ alert('Dışa aktarılacak kayıt yok'); return; } const headers=['id','name','company','phone','email','city']; const rows=[headers.join(',')]; arr.forEach(r=> rows.push(headers.map(h=> '"'+String(r[h]||'').replace(/"/g,'""')+'"').join(','))); const blob = new Blob([rows.join('\n')], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='crm_customers_'+(new Date().toISOString().slice(0,10))+'.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });
    
        // Contacts, Opportunities and Pipeline removed per user request.
    
        // --- Orders ---
      // render confirmed / non-proforma orders only
      function renderOrders(){
        const body=document.getElementById('crmOrdersBody'); if(!body) return;
        const arr=getAll('orders').filter(r=> String(r.status||'').toLowerCase() !== 'proforma'); body.innerHTML='';
        arr.forEach(rec=>{
          const tr=document.createElement('tr');
          const cust = resolveCustomerName(rec.customer||'') || '';
          const status = rec.status || '';
          let productLabel = '';
          try{ if(rec.products && rec.products.length){ const p0 = rec.products[0] || {}; productLabel = p0.stoneName||''; if(rec.products.length > 1) productLabel += ' (+' + (rec.products.length-1) + ' diğer)'; } }catch(e){}
          const vals = [ rec.orderNo || rec.proformaNo || '', cust, productLabel, rec.date||'', rec.amount||'', status ];
          vals.forEach(v=>{ const td=document.createElement('td'); td.textContent = v; tr.appendChild(td); });
          const td=document.createElement('td'); td.style.display='flex'; td.style.gap='6px';
          const be=document.createElement('button'); be.className='btn ghost small'; be.textContent='Düzenle'; be.addEventListener('click', ()=> loadOrder(rec));
          const bd=document.createElement('button'); bd.className='btn danger small'; bd.textContent='Sil'; bd.addEventListener('click', ()=>{ if(confirm('Silinsin mi?')){ deleteEntity('orders', rec.id); renderOrders(); renderReports(); } });
          const bdet=document.createElement('button'); bdet.className='btn ghost small'; bdet.textContent='Detay'; bdet.addEventListener('click', ()=> viewOrder(rec.id)); td.appendChild(be); td.appendChild(bdet); td.appendChild(bd); tr.appendChild(td); body.appendChild(tr);
        });
      }
    
        
      // render proformas only (status === 'proforma') in its own tab
      function renderProformas(){
        const body=document.getElementById('crmProformasBody'); if(!body) return;
        // read filter value from the select (defaults to 'all')
        const filterEl = document.getElementById('proformaFilterStatus');
        const rawFilter = filterEl ? (String(filterEl.value||'').trim() || 'all') : 'all';
        const filterLower = String(rawFilter).toLowerCase();
        let arr = getAll('orders').filter(r=> String(r.status||'').toLowerCase() === 'proforma');
        if(filterLower && filterLower !== 'all' && filterLower !== 'tümü'){
          arr = arr.filter(r=> String(r.proformaStatus || '').toLowerCase() === filterLower);
        }
        // render rows via DOM APIs (avoid innerHTML)
        body.innerHTML = '';
        arr.forEach(rec=>{
          const tr = document.createElement('tr');
          const cust = resolveCustomerName(rec.customer||'') || '';
          const status = rec.proformaStatus||rec.status||'';
          let productLabel = '';
          try{ if(rec.products && rec.products.length){ const p0 = rec.products[0] || {}; productLabel = p0.stoneName||''; if(rec.products.length > 1) productLabel += ' (+' + (rec.products.length-1) + ' diğer)'; } }catch(e){}
          const addTd = (txt, opts={})=>{ const td = document.createElement('td'); if(opts.style) td.style.cssText = opts.style; td.textContent = txt; tr.appendChild(td); };
          addTd(rec.proformaNo||''); addTd(cust); addTd(productLabel); addTd(rec.date||''); addTd(rec.amount||''); addTd(status);
          const tdAct = document.createElement('td'); tdAct.style.display='flex'; tdAct.style.gap='6px';
          const be = document.createElement('button'); be.className='btn ghost small'; be.textContent='Düzenle'; be.addEventListener('click', ()=> loadOrder(rec));
          const bApprove = document.createElement('button'); bApprove.className='btn primary small'; bApprove.textContent='Onayla'; bApprove.addEventListener('click', ()=>{ if(confirm('Proformayı onaylayıp kesin siparişe çevirmek istiyor musunuz?')){ approveProforma(rec.id); } });
          const bReject = document.createElement('button'); bReject.className='btn danger small'; bReject.textContent='Reddet'; bReject.addEventListener('click', ()=>{ if(!confirm('Proformayı iptal etmek istiyor musunuz?')) return; const arr2 = getAll('orders'); const i = arr2.findIndex(x=> x.id===rec.id); if(i<0) return alert('Kayıt bulunamadı'); arr2[i].proformaStatus = 'Iptal'; arr2[i].status = 'cancelled'; arr2[i].tracking = arr2[i].tracking || []; arr2[i].tracking.unshift({ ts: new Date().toISOString(), status: 'cancelled', note: 'Proforma iptal edildi' }); setAll('orders', arr2); renderProformas(); renderOrders(); renderReports(); showToast('Proforma iptal edildi'); });
          const bdet = document.createElement('button'); bdet.className='btn ghost small'; bdet.textContent='Detay'; bdet.addEventListener('click', ()=>{ const btn = document.querySelector('.subtabs .subtab[data-crm="orders"]'); if(btn) btn.click(); setTimeout(()=>{ try{ viewOrder(rec.id); }catch(e){} },200); });
          tdAct.appendChild(be); tdAct.appendChild(bApprove); tdAct.appendChild(bReject); tdAct.appendChild(bdet);
          tr.appendChild(tdAct); body.appendChild(tr);
        });
      }
      // wire proforma status filter to re-render list when changed
      try{
        const pfEl = document.getElementById('proformaFilterStatus');
        // persist selected filter to localStorage and re-render
        pfEl?.addEventListener('change', function(){ try{ localStorage.setItem('crm_proforma_filter', String(this.value||'all')); renderProformas(); }catch(e){} });
        // restore saved filter on load
        try{ const saved = localStorage.getItem('crm_proforma_filter'); if(saved && pfEl) pfEl.value = saved; }catch(e){}
      }catch(e){}
      function readOrderForm(){
        const f=document.getElementById('crmOrderForm'); if(!f) return null;
        const cust = (f.customer.value||'').trim();
        const custId = (f.customerId && f.customerId.value) ? f.customerId.value : '';
        const deliveryMethod = f.deliveryMethod ? f.deliveryMethod.value.trim() : (f.querySelector('input[name="deliveryMethod"]')? f.querySelector('input[name="deliveryMethod"]').value.trim() : '');
    
        // gather product rows if any exist; fall back to single stone fields for legacy imports
        const products = [];
        try{
          const rows = Array.from(document.querySelectorAll('#orderProductsList .order-product-row'));
          rows.forEach(r=>{
            const p = (sel)=>{ const el = r.querySelector(sel); return el ? (el.value||'').trim() : ''; };
            const prod = {
              stoneName: p('input[name="product_stoneName"]'),
              surface: p('input[name="product_surface"]'),
              quality: p('input[name="product_quality"]'),
              thickness: p('input[name="product_thickness"]'),
              width: p('input[name="product_width"]'),
              length: p('input[name="product_length"]'),
              description: p('input[name="product_description"]'),
              kasaAdet: p('input[name="product_kasaAdet"]'),
              kasaM2: p('input[name="product_kasaM2"]'),
              m2Price: p('input[name="product_m2Price"]'),
              productTotal: p('input[name="product_total"]')
            };
            // only push if some meaningful value is present
            if(Object.values(prod).some(v=> v !== '')) products.push(prod);
          });
        }catch(e){}
    
        // legacy single-product fallback
        if(!products.length){
          const single = {
            stoneName: f.stoneName ? (f.stoneName.value||'').trim() : (f.querySelector('input[name="stoneName"]')? (f.querySelector('input[name="stoneName"]').value||'').trim() : ''),
            surface: f.surface ? (f.surface.value||'').trim() : (f.querySelector('input[name="surface"]')? (f.querySelector('input[name="surface"]').value||'').trim() : ''),
            quality: f.quality ? (f.quality.value||'').trim() : (f.querySelector('input[name="quality"]')? (f.querySelector('input[name="quality"]').value||'').trim() : ''),
            thickness: f.thickness ? (f.thickness.value||'').trim() : (f.querySelector('input[name="thickness"]')? (f.querySelector('input[name="thickness"]').value||'').trim() : ''),
            width: f.width ? (f.width.value||'').trim() : (f.querySelector('input[name="width"]')? (f.querySelector('input[name="width"]').value||'').trim() : ''),
            length: f.length ? (f.length.value||'').trim() : (f.querySelector('input[name="length"]')? (f.querySelector('input[name="length"]').value||'').trim() : ''),
            description: f.description ? (f.description.value||'').trim() : (f.querySelector('input[name="description"]')? (f.querySelector('input[name="description"]').value||'').trim() : ''),
            kasaAdet: '', kasaM2: ''
          };
          if(Object.values(single).some(v=> v !== '')) products.push(single);
        }
    
        return {
          id: f.id.value||'',
          orderNo: (f.orderNo.value||'').trim(),
          customerId: custId,
          customer: custId || cust,
          date: f.date.value||'',
          amount: (f.amount.value||'').trim(),
          status: f.status ? (f.status.value || 'new') : (f.querySelector('select[name="status"]')? f.querySelector('select[name="status"]').value : 'new'),
          proformaStatus: f.proformaStatus ? (f.proformaStatus.value || '') : (f.querySelector('select[name="proformaStatus"]') ? (f.querySelector('select[name="proformaStatus"]').value || '') : ''),
          deliveryMethod: deliveryMethod,
          products: products,
          tracking: []
        };
      }
        // generate sequential order number padded to 3 digits (001,002,...)
        function generateOrderNo(){ const KEY = 'v91_last_order_seq'; try{ let n = parseInt(localStorage.getItem(KEY) || '0',10) || 0; n = n + 1; const padded = String(n).padStart(3,'0'); localStorage.setItem(KEY, padded); return padded; }catch(e){ return '001'; } }
    
      // peek next order number without consuming the sequence (used to show preview in the form)
      function peekNextOrderNo(){ const KEY = 'v91_last_order_seq'; try{ let n = parseInt(localStorage.getItem(KEY) || '0',10) || 0; n = n + 1; return String(n).padStart(3,'0'); }catch(e){ return '001'; } }
    
      // generate/peek proforma numbers per type (type: 'ebatli' or 'plaka') stored separately
      function _proformaKey(type){ try{ const t = String(type||'ebatli').toLowerCase().replace(/[^a-z0-9]/g,''); return 'v91_last_proforma_seq_' + (t || 'ebatli'); }catch(e){ return 'v91_last_proforma_seq_ebatli'; } }
      function generateProformaNo(type){ const KEY = _proformaKey(type); try{ let n = parseInt(localStorage.getItem(KEY) || '0',10) || 0; n = n + 1; const padded = String(n).padStart(3,'0'); localStorage.setItem(KEY, padded); return padded; }catch(e){ return '001'; } }
      function peekNextProformaNo(type){ const KEY = _proformaKey(type); try{ let n = parseInt(localStorage.getItem(KEY) || '0',10) || 0; n = n + 1; return String(n).padStart(3,'0'); }catch(e){ return '001'; } }
    
        // reusable save function for orders — returns saved id or null
        function saveOrderFromForm(){ const formEl = document.getElementById('crmOrderForm'); if(!formEl) return null; clearFormError(formEl); const rec = readOrderForm(); if(!rec) return null;
          // determine save mode: 'proforma_ebatli'|'proforma_plaka'|'order'
          const mode = (formEl.saveMode && formEl.saveMode.value) ? formEl.saveMode.value : 'order';
          // handle proforma saves separately (store proformaNo + type, do not consume order sequence)
          if(mode && mode.startsWith('proforma')){
            rec.status = 'proforma';
            const parts = mode.split('_'); const ptype = parts[1] || 'ebatli'; rec.proformaType = ptype;
            // persist proforma sub-status from the form (Taslak/Gonderildi/Revizyonda/Onaylandi/Iptal)
            rec.proformaStatus = formEl.proformaStatus ? (formEl.proformaStatus.value || '') : (rec.proformaStatus || 'Taslak');
            if(!rec.proformaNo){ try{ rec.proformaNo = generateProformaNo(ptype); formEl.orderNo.value = rec.proformaNo; }catch(e){} }
            if(!rec.proformaNo){ showFormError(formEl, 'Proforma No atanamadı'); return null; }
          } else {
            // normal confirmed order behavior
            rec.status = rec.status || 'confirmed';
            if(!rec.orderNo){ try{ rec.orderNo = generateOrderNo(); formEl.orderNo.value = rec.orderNo; }catch(e){} }
            if(!rec.orderNo){ showFormError(formEl, 'Sipariş No gerekli'); return null; }
          }
    
          // basic validations
          if(!(rec.customer || rec.customerId)){ showFormError(formEl, 'Müşteri gerekli'); return null; }
          if(rec.amount && isNaN(num(rec.amount))){ showFormError(formEl, 'Tutar numerik olmalı'); return null; }
    
          // preserve existing tracking when editing
          if(rec.id){ const arr = getAll('orders'); const ex = arr.find(x=> x.id===rec.id); if(ex){ rec.tracking = ex.tracking || []; } }
          // ensure initial tracking entry when new
          if(!rec.tracking || !rec.tracking.length){ rec.tracking = [{ ts: new Date().toISOString(), status: rec.status||'new', note: rec.status === 'proforma' ? 'Proforma oluşturuldu' : 'Sipariş oluşturuldu' }]; }
          upsertEntity('orders', rec);
          try{ formEl.reset(); }catch(e){}
          renderOrders(); renderReports(); clearFormError(formEl); showToast(rec.status === 'proforma' ? 'Proforma kaydedildi' : 'Sipariş kaydedildi'); return rec.id || null; }
    
      document.getElementById('crmOrderSave')?.addEventListener('click', function(e){ e.preventDefault(); saveOrderFromForm(); });
      document.getElementById('crmOrderSaveAndList')?.addEventListener('click', function(e){ e.preventDefault(); const id = saveOrderFromForm(); if(id){ // switch to ordertracking tab and open details
        const btn = document.querySelector('.subtabs .subtab[data-crm="orders"]'); if(btn) btn.click(); setTimeout(()=>{ try{ viewOrder(id); }catch(e){} },200); } });
      document.getElementById('crmOrderClear')?.addEventListener('click', function(){
        const form = document.getElementById('crmOrderForm');
        if(form){ try{ form.reset(); }catch(e){}
        // restore preview order no after clearing (non-consuming)
        try{ // choose peek depending on saveMode
          const mode = (form.saveMode && form.saveMode.value) ? form.saveMode.value : 'order';
          if(mode && mode.startsWith('proforma')){
            const ptype = mode.split('_')[1] || 'ebatli'; if(!form.orderNo || !(form.orderNo.value && form.orderNo.value.trim())) form.orderNo.value = peekNextProformaNo(ptype);
          } else { if(!form.orderNo || !(form.orderNo.value && form.orderNo.value.trim())) form.orderNo.value = peekNextOrderNo(); }
        }catch(_){ }
        // ensure proformaStatus control visibility/default after clear
        try{
          const mode = (form.saveMode && form.saveMode.value) ? form.saveMode.value : 'order';
          if(form.proformaStatus){ if(mode && mode.startsWith('proforma')){ form.proformaStatus.style.display = ''; if(!form.proformaStatus.value) form.proformaStatus.value = 'Taslak'; } else { form.proformaStatus.style.display = 'none'; } }
        }catch(_){ }
        }
      });
    
      // update preview when the saveMode select changes
      try{
        const crmForm = document.getElementById('crmOrderForm');
        if(crmForm && crmForm.saveMode){ crmForm.saveMode.addEventListener('change', function(){ try{ if(this.value && this.value.startsWith('proforma')){ const p = this.value.split('_')[1] || 'ebatli'; crmForm.orderNo.value = peekNextProformaNo(p); } else { crmForm.orderNo.value = peekNextOrderNo(); } }catch(e){} }); }
      }catch(e){}
    
      // also toggle the proformaStatus select when saveMode changes
      try{
        if(crmForm && crmForm.saveMode){ crmForm.saveMode.addEventListener('change', function(){ try{
            if(this.value && this.value.startsWith('proforma')){
              const p = this.value.split('_')[1] || 'ebatli';
              if(crmForm.orderNo && (!crmForm.orderNo.value || !crmForm.orderNo.value.trim())) crmForm.orderNo.value = peekNextProformaNo(p);
              if(crmForm.proformaStatus){ crmForm.proformaStatus.style.display = ''; if(!crmForm.proformaStatus.value) crmForm.proformaStatus.value = 'Taslak'; }
            } else {
              if(crmForm.orderNo && (!crmForm.orderNo.value || !crmForm.orderNo.value.trim())) crmForm.orderNo.value = peekNextOrderNo();
              if(crmForm.proformaStatus) crmForm.proformaStatus.style.display = 'none';
            }
          }catch(e){} }); }
      }catch(e){}
    
      // --- Order products UI helpers ---
      function addProductRow(product){
        try{
          const list = document.getElementById('orderProductsList'); if(!list) return;
          const p = product || {};
          const wrap = document.createElement('div'); wrap.className = 'order-product-row'; wrap.style.display='flex'; wrap.style.gap='6px'; wrap.style.alignItems='center';
          wrap.innerHTML = `
            <input class="field small" name="product_stoneName" placeholder="Taş İsmi" list="tasIsmi_dlist" style="min-width:160px;" value="${escapeHtml(p.stoneName||'') }" />
            <input class="field small" name="product_surface" placeholder="Yüzey" list="yuzeyIslem_dlist" style="min-width:120px;" value="${escapeHtml(p.surface||'') }" />
            <input class="field small" name="product_quality" placeholder="Kalite" list="seleksiyon_dlist" style="min-width:90px;" value="${escapeHtml(p.quality||'') }" />
      <input class="field small" name="product_thickness" placeholder="Kalınlık" list="kalinlik_dlist" style="min-width:90px;" value="${escapeHtml(p.thickness||'') }" />
            <input class="field small" name="product_width" placeholder="En" style="min-width:70px;" value="${escapeHtml(p.width||'') }" />
            <input class="field small" name="product_length" placeholder="Boy" style="min-width:70px;" value="${escapeHtml(p.length||'') }" />
            <input class="field small" name="product_description" placeholder="Açıklama" style="min-width:140px;" value="${escapeHtml(p.description||'') }" />
            <input class="field small" name="product_kasaAdet" placeholder="Kasa Adet" style="min-width:80px;" value="${escapeHtml(p.kasaAdet||'') }" />
            <input class="field small" name="product_kasaM2" placeholder="Kasa m²" style="min-width:90px;" value="${escapeHtml(p.kasaM2||'') }" />
            <input class="field small" name="product_m2Price" placeholder="m² Satış Fiyatı" style="min-width:110px;" value="${escapeHtml(p.m2Price||'') }" />
            <input class="field small" name="product_total" placeholder="Ürün Tutarı" style="min-width:110px;" readonly value="${escapeHtml(p.productTotal||'') }" />
            <button type="button" class="btn danger small btnRemoveProduct">Sil</button>
          `;
          list.appendChild(wrap);
          // ensure secondary area is visible when a row is added
          try{ const sec = document.getElementById('orderSecondary'); if(sec && sec.style.display==='none') sec.style.display='flex'; }catch(e){}
          const btn = wrap.querySelector('.btnRemoveProduct'); if(btn) btn.addEventListener('click', ()=>{ wrap.remove(); recalcOrderAmount(); });
          // wire input listeners to recalc per-product and order totals
          try{
            ['product_kasaM2','product_m2Price','product_kasaAdet'].forEach(name=>{
              const el = wrap.querySelector(`input[name="${name}"]`);
              if(el) el.addEventListener('input', function(){ try{ const kasaM2 = num(wrap.querySelector('input[name="product_kasaM2"]').value||''); const price = num(wrap.querySelector('input[name="product_m2Price"]').value||''); const totalEl = wrap.querySelector('input[name="product_total"]'); const total = (!isNaN(kasaM2) && !isNaN(price)) ? (kasaM2 * price) : 0; if(totalEl) totalEl.value = total ? Number(total).toFixed(2) : ''; recalcOrderAmount(); }catch(e){} });
            });
          }catch(e){ }
        }catch(e){ console.warn('addProductRow error', e); }
      }
    
      // recalc overall order amount from product rows
      function recalcOrderAmount(){ try{ const rows = Array.from(document.querySelectorAll('#orderProductsList .order-product-row')); let sum = 0; rows.forEach(r=>{ const t = r.querySelector('input[name="product_total"]'); if(t){ const v = num(t.value||''); if(!isNaN(v)) sum += Number(v); } }); const f = document.getElementById('crmOrderForm'); if(f && f.amount) f.amount.value = sum ? Number(sum).toFixed(2) : ''; }catch(e){ console.warn('recalcOrderAmount', e); } }
    
      // wire Add Product button: show secondary area and add initial product row
      document.getElementById('btnAddOrderProduct')?.addEventListener('click', function(e){ e.preventDefault(); try{ const sec = document.getElementById('orderSecondary'); if(sec) sec.style.display = 'flex'; }catch(_){} addProductRow(); });
    
      // Tasks removed per user request
    
        // --- Reports ---
      function renderReports(){ const totalCustomers = getAll('customers').length; const orders = getAll('orders')||[]; const openOrders = orders.filter(o=> (o.status || '').toLowerCase() !== 'delivered' && (o.status || '').toLowerCase() !== 'cancelled').length; const totalOrders = orders.reduce((s,o)=> s + (num(o.amount)||0), 0); document.getElementById('rep_total_customers').textContent = totalCustomers; document.getElementById('rep_open_opps').textContent = openOrders; document.getElementById('rep_total_orders').textContent = nf3.format(totalOrders); }
    
        // -- simple form error helpers --
        function showFormError(formEl, msg){ if(!formEl) return alert(msg); let e = formEl.querySelector('.form-error'); if(!e){ e = document.createElement('div'); e.className='form-error'; e.style.background='#fee2e2'; e.style.color='#991b1b'; e.style.padding='8px'; e.style.border='1px solid #fecaca'; e.style.borderRadius='6px'; e.style.marginBottom='8px'; formEl.insertBefore(e, formEl.firstChild); } e.textContent = msg; }
        function clearFormError(formEl){ if(!formEl) return; const e = formEl.querySelector('.form-error'); if(e) e.remove(); }
    
      // small toast helper
      function showToast(msg, timeout=2000){ try{ let t = document.getElementById('crm-toast'); if(!t){ t = document.createElement('div'); t.id='crm-toast'; t.style.position='fixed'; t.style.right='20px'; t.style.bottom='20px'; t.style.padding='10px 14px'; t.style.background='rgba(15,23,42,0.95)'; t.style.color='#fff'; t.style.borderRadius='8px'; t.style.zIndex='9999'; t.style.boxShadow='0 6px 18px rgba(2,6,23,0.2)'; document.body.appendChild(t); } t.textContent = msg; t.style.opacity = '1'; setTimeout(()=>{ t.style.transition='opacity 400ms'; t.style.opacity='0'; }, timeout); }catch(e){} }
    
      // remove leftover entity storages (opps/tasks/contacts)
      function removeLeftoverStorages(){ try{ const keys = ['opps','tasks','contacts']; const removed = []; keys.forEach(k=>{ const full = getKey(k); if(localStorage.getItem(full) !== null){ localStorage.removeItem(full); removed.push(full); } }); return removed; }catch(e){ return []; } }
    
      // general sanity check: build structured results and show modal
      function runSanityCheck(){ const customers = getAll('customers')||[]; const orders = getAll('orders')||[]; const orphanOrders = orders.filter(o=> o.customerId && !getCustomerById(o.customerId)); const invalidAmount = orders.filter(o=> o.amount && isNaN(num(o.amount))); const missingOrderNo = orders.filter(o=> !o.orderNo); const missingCustomerNames = customers.filter(c=> !c.name);
        const summary = { totalCustomers: customers.length, totalOrders: orders.length, missingOrderNo: missingOrderNo.length, invalidAmount: invalidAmount.length, missingCustomerNames: missingCustomerNames.length, orphanOrders: orphanOrders.length };
        // build HTML for modal
        const area = document.getElementById('crmCheckArea'); if(!area) { alert('Kontrol sonuçları gösterilemiyor'); return summary; }
        // Build summary header safely (avoid long template literals that may break when editing)
        var parts = [];
        parts.push('<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;">');
        parts.push('<div class="pill">Müşteri: <b>' + summary.totalCustomers + '</b></div>');
        parts.push('<div class="pill">Sipariş: <b>' + summary.totalOrders + '</b></div>');
        parts.push('<div class="pill">Eksik Sipariş No: <b>' + summary.missingOrderNo + '</b></div>');
        parts.push('<div class="pill">Geçersiz Tutar: <b>' + summary.invalidAmount + '</b></div>');
        parts.push('<div class="pill">Müşteri Adı Eksik: <b>' + summary.missingCustomerNames + '</b></div>');
        parts.push('<div class="pill">Orphan Sipariş: <b>' + summary.orphanOrders + '</b></div>');
        parts.push('</div>');
    
        // lists (show up to 50 items each)
        function renderList(title, items, renderFn){
          if(!items || !items.length) return '<div style="margin-bottom:8px;"><strong>' + title + ':</strong> Yok</div>';
          var s = '<div style="margin-bottom:8px;"><strong>' + title + ' (ilk ' + Math.min(items.length,50) + '):</strong><div style="max-height:200px;overflow:auto;border:1px solid #eef2f7;padding:8px;margin-top:6px;">';
          items.slice(0,50).forEach(function(it){ s += '<div style="padding:4px 0;border-bottom:1px dashed #f8fafc;">' + renderFn(it) + '</div>'; });
          s += '</div></div>';
          return s;
        }
    
        parts.push(renderList('Eksik Sipariş No', missingOrderNo, function(o){ return 'id:' + (o.id||'') + ' — ' + escapeHtml(o.orderNo||'') + ' — ' + escapeHtml(o.customer||''); }));
        parts.push(renderList('Geçersiz Tutar', invalidAmount, function(o){ return 'id:' + (o.id||'') + ' — ' + escapeHtml(o.orderNo||'') + ' — tutar:' + escapeHtml(o.amount||''); }));
        parts.push(renderList('Müşteri Adı Eksik', missingCustomerNames, function(c){ return 'id:' + (c.id||'') + ' — company:' + escapeHtml(c.company||''); }));
        parts.push(renderList('Sipariş (Müşteri bulunamadı)', orphanOrders, function(o){ return 'id:' + (o.id||'') + ' — ' + escapeHtml(o.orderNo||'') + ' — customerId:' + escapeHtml(o.customerId||o.customer||''); }));
        var html = parts.join('');
        area.innerHTML = html;
        // wire export button inside modal
        document.getElementById('crmCheckExport')?.addEventListener('click', function(){
          try{
            const rows = [];
            rows.push(['type','id','orderNo','customer','customerId','amount','status'].join(','));
            missingOrderNo.forEach(function(o){ rows.push(['missingOrderNo', o.id||'', o.orderNo||'', o.customer||'', o.customerId||'', o.amount||'', o.status||''].map(function(v){ return '"'+String(v||'').replace(/"/g,'""')+'"'; }).join(',')); });
            invalidAmount.forEach(function(o){ rows.push(['invalidAmount', o.id||'', o.orderNo||'', o.customer||'', o.customerId||'', o.amount||'', o.status||''].map(function(v){ return '"'+String(v||'').replace(/"/g,'""')+'"'; }).join(',')); });
            orphanOrders.forEach(function(o){ rows.push(['orphanOrder', o.id||'', o.orderNo||'', o.customer||'', o.customerId||'', o.amount||'', o.status||''].map(function(v){ return '"'+String(v||'').replace(/"/g,'""')+'"'; }).join(',')); });
            const blob = new Blob([rows.join('\n')], {type:'text/csv;charset=utf-8;'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'crm_sanity_' + (new Date().toISOString().slice(0,10)) + '.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
          }catch(e){ alert('Dışa aktar hata: '+e.message); }
        });
        // show modal
        document.getElementById('crmCheckModal').style.display='flex';
        showToast('Genel kontrol tamamlandı',3000);
        console.group('CRM Sanity Check');
        console.log({ missingOrderNo, invalidAmount, missingCustomerNames, orphanOrders });
        console.groupEnd();
        return { missingOrderNo: missingOrderNo, invalidAmount: invalidAmount, missingCustomerNames: missingCustomerNames, orphanOrders: orphanOrders };
      }
    
        // -- Reports: sales by period and export all --
        function computeSalesByPeriod(start, end){ const orders = getAll('orders')||[]; const s = start ? new Date(start) : null; const e = end ? new Date(end) : null; const filtered = orders.filter(o=>{ if(!o.date) return false; const d = new Date(o.date); if(isNaN(d)) return false; if(s && d < s) return false; if(e && d > e) return false; return true; }); const total = filtered.reduce((sum, o)=> sum + (num(o.amount)||0), 0); return { total: total, count: filtered.length, rows: filtered }; }
    
        function renderSalesSummary(){ const start = document.getElementById('rep_start').value; const end = document.getElementById('rep_end').value; const out = computeSalesByPeriod(start, end); const el = document.getElementById('rep_sales_summary'); if(!el) return;
          try{ while(el.firstChild) el.removeChild(el.firstChild); }catch(_){ el.textContent=''; }
          const wrap = document.createElement('div'); wrap.style.display='flex'; wrap.style.gap='12px'; wrap.style.alignItems='center';
          const pill1 = document.createElement('div'); pill1.className='pill'; pill1.innerHTML = 'Sipariş Adeti: <b>' + String(out.count) + '</b>';
          const pill2 = document.createElement('div'); pill2.className='pill'; pill2.innerHTML = 'Toplam: <b>' + String(nf3.format(out.total)) + '</b>';
          wrap.appendChild(pill1); wrap.appendChild(pill2); el.appendChild(wrap);
        }
    
        function exportAllEntities(){ const customers = getAll('customers')||[]; const orders = getAll('orders')||[]; if(!customers.length && !orders.length){ alert('Dışa aktarılacak kayıt yok'); return; } // trigger downloads sequentially
          if(customers.length) downloadCsv('crm_customers_'+(new Date().toISOString().slice(0,10))+'.csv', ['id','name','company','phone','email','city'], customers);
      if(orders.length) {
        const headers=['id','orderNo','customer','customerId','stoneName','surface','quality','thickness','width','length','description','date','amount','status','products','deliveryMethod'];
        const rows = orders.map(r=> { const copy = Object.assign({}, r); try{ copy.products = copy.products ? JSON.stringify(copy.products) : ''; }catch(e){ copy.products = ''; } return copy; });
        downloadCsv('crm_orders_'+(new Date().toISOString().slice(0,10))+'.csv', headers, rows);
      }
        }
    
        // wire report UI
        document.getElementById('rep_compute')?.addEventListener('click', function(){ renderSalesSummary(); });
        document.getElementById('rep_export_all')?.addEventListener('click', function(){ exportAllEntities(); });
      document.getElementById('rep_cleanup_unused')?.addEventListener('click', function(){ try{ const removed = removeLeftoverStorages(); if(!removed || !removed.length){ alert('Temizlenecek artık bulunamadı'); } else { alert('Kaldırılan anahtarlar: '+removed.join(', ')); showToast('Artıklar temizlendi'); } renderAll(); }catch(e){ alert('Temizlik sırasında hata: '+e.message); } });
      document.getElementById('rep_run_check')?.addEventListener('click', function(){ try{ runSanityCheck(); }catch(e){ alert('Kontrol sırasında hata: '+e.message); } });
    
        // --- Order details / tracking helpers ---
        function loadOrder(rec){ const f=document.getElementById('crmOrderForm'); if(!f) return; f.id.value = rec.id||''; f.orderNo.value = rec.orderNo || rec.proformaNo || ''; // resolve customer
          const byId = getCustomerById(rec.customer||rec.customerId||''); if(byId){ f.customerId.value = byId.id; f.customer.value = byId.name; } else { f.customerId.value = rec.customerId || ''; f.customer.value = rec.customer || ''; }
          // set saveMode according to status/proformaType
          try{ if(f.saveMode){ if(rec.status === 'proforma'){ f.saveMode.value = 'proforma_' + (rec.proformaType || 'ebatli'); } else { f.saveMode.value = 'order'; } } }catch(e){}
      // set stone fields
      try{ if(f.stoneName) f.stoneName.value = rec.stoneName || ''; else if(f.querySelector('input[name="stoneName"]')) f.querySelector('input[name="stoneName"]').value = rec.stoneName || ''; if(f.surface) f.surface.value = rec.surface || ''; else if(f.querySelector('input[name="surface"]')) f.querySelector('input[name="surface"]').value = rec.surface || ''; if(f.quality) f.quality.value = rec.quality || ''; else if(f.querySelector('input[name="quality"]')) f.querySelector('input[name="quality"]').value = rec.quality || ''; if(f.thickness) f.thickness.value = rec.thickness || ''; else if(f.querySelector('input[name="thickness"]')) f.querySelector('input[name="thickness"]').value = rec.thickness || ''; if(f.width) f.width.value = rec.width || ''; else if(f.querySelector('input[name="width"]')) f.querySelector('input[name="width"]').value = rec.width || ''; if(f.length) f.length.value = rec.length || ''; else if(f.querySelector('input[name="length"]')) f.querySelector('input[name="length"]').value = rec.length || ''; if(f.description) f.description.value = rec.description || ''; else if(f.querySelector('input[name="description"]')) f.querySelector('input[name="description"]').value = rec.description || ''; }catch(e){}
      f.date.value = rec.date||''; f.amount.value = rec.amount||''; // set status select
          try{ const s = f.querySelector('select[name="status"]'); if(s) s.value = rec.status || 'new'; }catch(e){}
          try{ if(f.deliveryMethod) f.deliveryMethod.value = rec.deliveryMethod || ''; else if(f.querySelector('input[name="deliveryMethod"]')) f.querySelector('input[name="deliveryMethod"]').value = rec.deliveryMethod || ''; }catch(e){}
          // set proformaStatus visibility/value when loading a proforma record
          try{
            const ps = f.querySelector('select[name="proformaStatus"]');
            if(ps){
              if(rec.status === 'proforma'){
                ps.style.display = '';
                ps.value = rec.proformaStatus || 'Taslak';
              } else {
                ps.style.display = 'none';
              }
            }
          }catch(e){}
          // populate dynamic product rows (clear existing then add)
          try{
      const list = document.getElementById('orderProductsList'); if(list){ try{ while(list.firstChild) list.removeChild(list.firstChild); }catch(_){ list.textContent=''; } if(rec.products && rec.products.length){ rec.products.forEach(p=> addProductRow(p)); } else {
              // legacy single-product fallback: create one row populated from stoneName etc so user can edit
              const single = { stoneName: rec.stoneName||'', surface: rec.surface||'', quality: rec.quality||'', thickness: rec.thickness||'', width: rec.width||'', length: rec.length||'', description: rec.description||'', kasaAdet: '', kasaM2: '' };
              if(Object.values(single).some(v=> v !== '')) addProductRow(single);
            } }
          }catch(e){ /* ignore */ }
          // if record has products, reveal secondary area so user sees them
          try{ const sec = document.getElementById('orderSecondary'); if(sec && rec.products && rec.products.length) sec.style.display = 'flex'; }catch(e){}
        }
    
      function viewOrder(id){ const arr=getAll('orders'); const rec = arr.find(x=> x.id===id); if(!rec) return alert('Kayıt bulunamadı');
        // show proforma label if applicable
        try{ const titleEl = document.getElementById('od_orderNo'); if(titleEl){ if(rec.status === 'proforma'){ titleEl.textContent = 'Proforma: ' + (rec.proformaNo || rec.orderNo || ''); } else { titleEl.textContent = 'Sipariş: ' + (rec.orderNo || rec.proformaNo || ''); } } }catch(e){}
        document.getElementById('od_customer').textContent = resolveCustomerName(rec.customer||''); document.getElementById('od_stone').textContent = rec.stoneName||''; document.getElementById('od_surface').textContent = rec.surface||''; document.getElementById('od_quality').textContent = rec.quality||''; document.getElementById('od_thickness').textContent = rec.thickness||''; document.getElementById('od_width').textContent = rec.width||''; document.getElementById('od_length').textContent = rec.length||''; document.getElementById('od_note').textContent = rec.description||''; document.getElementById('od_date').textContent = rec.date||''; document.getElementById('od_amount').textContent = nf3.format(rec.amount||0); document.getElementById('od_status').textContent = (rec.status||''); document.getElementById('od_tracking_no').textContent = rec.trackingNo||''; document.getElementById('od_carrier').textContent = rec.carrier||''; document.getElementById('od_delivery_method').textContent = rec.deliveryMethod||''; // render tracking
        const list = document.getElementById('od_tracking_list'); try{ while(list.firstChild) list.removeChild(list.firstChild); }catch(_){ list.textContent=''; } (rec.tracking||[]).forEach(t=>{
          const d = document.createElement('div'); d.style.padding='6px 0'; d.style.borderBottom='1px dashed #f3f4f6';
          const dt = document.createElement('div'); dt.style.fontSize='12px'; dt.style.color='#64748b'; dt.textContent = new Date(t.ts).toLocaleString();
          const dn = document.createElement('div'); dn.style.marginTop='4px'; dn.textContent = (t.status||'') + ' — ' + (t.note||'');
          d.appendChild(dt); d.appendChild(dn); list.appendChild(d);
        });
        // render products list into details table
        try{
          const wrap = document.getElementById('od_products_table'); if(wrap){ wrap.innerHTML = ''; const products = rec.products && rec.products.length ? rec.products : (rec.stoneName ? [{ stoneName: rec.stoneName||'', surface: rec.surface||'', quality: rec.quality||'', thickness: rec.thickness||'', width: rec.width||'', length: rec.length||'', description: rec.description||'', kasaAdet: '', kasaM2: '' }] : []);
            if(!products.length){ wrap.textContent = 'Ürün yok'; }
            else{
              const table = document.createElement('table'); table.style.width='100%'; table.style.borderCollapse='collapse';
              const thead = document.createElement('thead');
              const thr = document.createElement('tr'); thr.style.color = '#64748b'; thr.style.borderBottom = '1px solid #eef2f7';
              ['Taş İsmi','Yüzey','Kalite','Kalınlık','En','Boy','Açıklama','Kasa Adet','Kasa m²'].forEach((h, idx)=>{
                const th = document.createElement('th'); th.style.padding = '6px'; if(idx>=7) th.style.textAlign = 'right'; th.textContent = h; thr.appendChild(th);
              }); thead.appendChild(thr); table.appendChild(thead);
              const tbody = document.createElement('tbody'); let totalAdet = 0; let totalM2 = 0;
              products.forEach(p=>{
                const tr = document.createElement('tr');
                const addCell = (txt, styleRight)=>{ const td = document.createElement('td'); td.style.padding='6px'; if(styleRight) td.style.textAlign='right'; td.textContent = txt; tr.appendChild(td); };
                addCell(p.stoneName||''); addCell(p.surface||''); addCell(p.quality||''); addCell(p.thickness||''); addCell(p.width||''); addCell(p.length||''); addCell(p.description||''); addCell(p.kasaAdet||'', true); addCell(p.kasaM2||'', true);
                tbody.appendChild(tr);
                totalAdet += Number(p.kasaAdet||0); totalM2 += Number(num(p.kasaM2)||0);
              });
              const ftr = document.createElement('tr');
              const tdSum = document.createElement('td'); tdSum.style.padding='6px'; tdSum.colSpan = 7; const strong = document.createElement('strong'); strong.textContent = 'Toplam'; tdSum.appendChild(strong); ftr.appendChild(tdSum);
              const tdSumAd = document.createElement('td'); tdSumAd.style.padding='6px'; tdSumAd.style.textAlign='right'; const sa = document.createElement('strong'); sa.textContent = String(totalAdet); tdSumAd.appendChild(sa); ftr.appendChild(tdSumAd);
              const tdSumM = document.createElement('td'); tdSumM.style.padding='6px'; tdSumM.style.textAlign='right'; const sm = document.createElement('strong'); sm.textContent = Number(totalM2).toFixed(3); tdSumM.appendChild(sm); ftr.appendChild(tdSumM);
              tbody.appendChild(ftr);
              table.appendChild(tbody); wrap.appendChild(table);
            }
          }
        }catch(e){ console.warn('render products failed', e); }
        // show panel
        document.getElementById('crmOrderDetails').style.display='block'; // store current id on panel for convenience
        document.getElementById('crmOrderDetails').dataset.orderId = id;
        // show/hide approve button for proformas
        try{ const approveBtn = document.getElementById('od_approve_proforma'); if(approveBtn){ if(rec.status === 'proforma'){ approveBtn.style.display=''; approveBtn.onclick = function(){ if(confirm('Proformayı onaylayıp kesin siparişe çevirmek istiyor musunuz?')) approveProforma(rec.id); }; } else { approveBtn.style.display='none'; approveBtn.onclick = null; } } }catch(e){}
      }
    
        document.getElementById('od_close')?.addEventListener('click', function(){ document.getElementById('crmOrderDetails').style.display='none'; });
        document.getElementById('od_add_track')?.addEventListener('click', function(){ const panel = document.getElementById('crmOrderDetails'); const id = panel && panel.dataset && panel.dataset.orderId; if(!id) return; const status = document.getElementById('od_new_status').value; const note = document.getElementById('od_new_note').value||''; const arr = getAll('orders'); const i = arr.findIndex(x=> x.id===id); if(i<0) return alert('Kayıt bulunamadı'); arr[i].status = status; arr[i].tracking = arr[i].tracking || []; arr[i].tracking.unshift({ ts: new Date().toISOString(), status: status, note: note }); setAll('orders', arr); viewOrder(id); renderOrders(); renderReports(); document.getElementById('od_new_note').value=''; });
    
        // approve a proforma into a confirmed order (assign orderNo and change status)
        function approveProforma(id){
          try{
            const arr = getAll('orders');
            const i = arr.findIndex(x=> x.id === id);
            if(i < 0){ alert('Kayıt bulunamadı'); return false; }
            const rec = arr[i];
            if(String(rec.status||'').toLowerCase() !== 'proforma'){ alert('Bu kayıt bir proforma değil'); return false; }
    
            // assign order number if not present (wrap in try to surface generation errors)
            try{
              if(!rec.orderNo){ rec.orderNo = generateOrderNo(); }
              if(!rec.orderNo){ alert('Sipariş numarası atanamadı'); return false; }
            }catch(genErr){ console.error('generateOrderNo failed', genErr); alert('Sipariş numarası oluşturulamadı: '+ (genErr && genErr.message)); return false; }
    
            // mark proforma sub-status as approved
            try{ rec.proformaStatus = 'Onaylandi'; }catch(_){ }
            rec.status = 'confirmed';
            rec.tracking = rec.tracking || [];
            rec.tracking.unshift({ ts: new Date().toISOString(), status: 'confirmed', note: 'Proforma onaylandı — kesin sipariş oluşturuldu' });
            setAll('orders', arr);
            renderOrders(); renderReports(); viewOrder(id);
            try{ showToast('Proforma onaylandı ve sipariş numarası atandı', 2000); }catch(_){ }
            return true;
          }catch(e){ console.error('approveProforma error', e); alert('Onay sırasında hata: '+(e && e.message)); return false; }
        }
    
        // --- Utilities & wiring ---
      function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    
      // populate datalist used for customer autocomplete
      function populateCustomerDatalist(){ try{ const d=document.getElementById('crmCustomersDatalist'); if(!d) return; d.innerHTML=''; const arr = getAll('customers')||[]; arr.forEach(c=>{ const opt = document.createElement('option'); opt.value = (c.name||''); d.appendChild(opt); }); }catch(e){ /* ignore */ } }
    
      // helper to get customer by id
      function getCustomerById(id){ if(!id) return null; try{ const arr = getAll('customers')||[]; return arr.find(x=> x.id === id) || null; }catch(e){ return null; } }
    
      // resolve stored customer (id or free text) to a display name
      function resolveCustomerName(idOrName){ if(!idOrName) return ''; const c = getCustomerById(idOrName); if(c) return c.name + (c.company? ' — '+c.company : ''); return idOrName; }
    
      // attach a lightweight autocomplete for customer fields in a form
      function attachCustomerAutocomplete(formId, inputName){ try{
        const form = document.getElementById(formId); if(!form) return; if(form.dataset.autocompleteAttached==='1') return; const input = form.querySelector(`input[name="${inputName}"]`); const hid = form.querySelector(`input[name="${inputName}Id"]`); const box = form.querySelector('.ac-list'); if(!input || !box) return; form.dataset.autocompleteAttached='1';
        input.addEventListener('input', function(){ try{ if(hid) hid.value=''; const q = (this.value||'').trim().toLowerCase(); if(!q){ box.style.display='none'; box.innerHTML=''; return; } const matches = (getAll('customers')||[]).filter(c=> ((c.name||'').toLowerCase().includes(q) || (c.company||'').toLowerCase().includes(q))).slice(0,50); box.innerHTML=''; matches.forEach(m=>{ const el = document.createElement('div'); el.textContent = (m.name||'') + (m.company? ' — '+m.company : ''); el.style.padding='6px 8px'; el.style.cursor='pointer'; el.style.borderBottom='1px solid #f3f4f6'; el.addEventListener('mousedown', function(e){ e.preventDefault(); input.value = m.name; if(hid) hid.value = m.id; box.style.display='none'; }); box.appendChild(el); }); box.style.display = matches.length ? 'block' : 'none'; }catch(e){ console.warn(e); } });
        input.addEventListener('blur', function(){ setTimeout(()=>{ box.style.display='none'; },200); });
        input.addEventListener('focus', function(){ input.dispatchEvent(new Event('input')); });
      }catch(e){ /* ignore */ } }
    
      // --- CSV helpers: simple RFC4180-ish parser ---
      // --- Proforma preview & template helpers ---
      function getProformaTemplate(){ try{ return localStorage.getItem('crm_proforma_template') || ('<div style="font-family:Arial,Helvetica,sans-serif;color:#111;"><h2>Proforma: {{proformaNo}}</h2><div><strong>Müşteri:</strong> {{customer}}</div><div><strong>Tarih:</strong> {{date}}</div><div style="margin-top:8px;">{{products}}</div><div style="margin-top:12px;"><strong>Toplam Tutar:</strong> {{amount}}</div></div>'); }catch(e){ return '<div>Proforma şablonu okunamadı</div>'; } }
      function setProformaTemplate(t){ try{ localStorage.setItem('crm_proforma_template', String(t||'')); return true; }catch(e){ return false; } }
    
      function renderProformaHtml(rec){ try{
          const tpl = getProformaTemplate();
          // build products table
          const products = rec.products && rec.products.length ? rec.products : [];
          var prodHtml = '';
          if(!products.length) prodHtml = '<div>Ürün yok</div>'; else {
            var parts = [];
            parts.push('<table style="width:100%;border-collapse:collapse;border:1px solid #eef2f7;">');
            parts.push('<thead><tr style="background:#fafafa;color:#334155"><th style="padding:6px;text-align:left">Taş</th><th style="padding:6px">Yüzey</th><th style="padding:6px">Kalite</th><th style="padding:6px">Kalınlık</th><th style="padding:6px;text-align:right">Kasa Adet</th><th style="padding:6px;text-align:right">Kasa m²</th><th style="padding:6px;text-align:right">Tutar</th></tr></thead>');
            parts.push('<tbody>');
            var totalM = 0; var totalAmt = 0; products.forEach(function(p){ var kasaM2 = Number(num(p.kasaM2)||0); var kasaAdet = Number(p.kasaAdet||0); var lineTotal = Number(num(p.productTotal)||0); totalM += kasaM2; totalAmt += lineTotal; parts.push('<tr><td style="padding:6px">'+escapeHtml(p.stoneName||'')+'</td><td style="padding:6px">'+escapeHtml(p.surface||'')+'</td><td style="padding:6px">'+escapeHtml(p.quality||'')+'</td><td style="padding:6px">'+escapeHtml(p.thickness||'')+'</td><td style="padding:6px;text-align:right">'+(kasaAdet? kasaAdet:'')+'</td><td style="padding:6px;text-align:right">'+(isNaN(kasaM2)?'':Number(kasaM2).toFixed(3))+'</td><td style="padding:6px;text-align:right">'+(isNaN(lineTotal)?'':Number(lineTotal).toFixed(2))+'</td></tr>'); });
            parts.push('<tr><td colspan="5" style="padding:6px"><strong>Toplam</strong></td><td style="padding:6px;text-align:right"><strong>'+Number(totalM).toFixed(3)+'</strong></td><td style="padding:6px;text-align:right"><strong>'+Number(totalAmt).toFixed(2)+'</strong></td></tr>');
            parts.push('</tbody></table>'); prodHtml = parts.join('');
          }
          var html = String(tpl||''); html = html.replace(/{{\s*proformaNo\s*}}/g, escapeHtml(rec.proformaNo||'')).replace(/{{\s*customer\s*}}/g, escapeHtml(rec.customer||'')).replace(/{{\s*date\s*}}/g, escapeHtml(rec.date||'')); html = html.replace(/{{\s*amount\s*}}/g, escapeHtml(rec.amount||'')); html = html.replace(/{{\s*products\s*}}/g, prodHtml);
          return html;
        }catch(e){ return '<div>Önizleme oluşturulamadı: '+escapeHtml(String(e&&e.message||e))+'</div>'; } }
    
      // wire preview modal and buttons
      document.getElementById('crmProformaPreview')?.addEventListener('click', function(){ try{
        const form = document.getElementById('crmOrderForm'); if(!form) return alert('Form bulunamadı'); const rec = readOrderForm() || {}; const mode = (form.saveMode && form.saveMode.value) ? form.saveMode.value : 'proforma_ebatli'; const ptype = (mode.indexOf('proforma')===0) ? (mode.split('_')[1]||'ebatli') : 'ebatli'; rec.proformaType = ptype; rec.date = rec.date || (new Date()).toISOString().slice(0,10); rec.amount = rec.amount || (function(){ let s=0; (rec.products||[]).forEach(p=> s += Number(num(p.productTotal)||0)); return s ? Number(s).toFixed(2) : ''; })(); rec.proformaNo = rec.proformaNo || peekNextProformaNo(ptype);
        const area = document.getElementById('proformaPreviewArea'); if(!area) return; area.innerHTML = renderProformaHtml(rec); document.getElementById('proformaTemplateEditor').style.display='none'; document.getElementById('proformaPreviewModal').style.display='flex'; }catch(e){ alert('Önizleme hatası: '+(e&&e.message)); } });
      document.getElementById('proformaClose')?.addEventListener('click', function(){ try{ document.getElementById('proformaPreviewModal').style.display='none'; }catch(_){} });
      document.getElementById('proformaEditTemplate')?.addEventListener('click', function(){ try{ const ta = document.getElementById('proformaTemplateTextarea'); if(!ta) return; ta.value = getProformaTemplate(); document.getElementById('proformaTemplateEditor').style.display='block'; }catch(e){} });
      document.getElementById('proformaCancelEdit')?.addEventListener('click', function(){ try{ document.getElementById('proformaTemplateEditor').style.display='none'; }catch(_){} });
      document.getElementById('proformaSaveTemplate')?.addEventListener('click', function(){ try{ const ta = document.getElementById('proformaTemplateTextarea'); if(!ta) return; setProformaTemplate(ta.value||''); // re-render preview if open
        const area = document.getElementById('proformaPreviewArea'); if(area){ // attempt to re-read current form values to regenerate
          const f = document.getElementById('crmOrderForm'); const rec = (f? readOrderForm() : {}) || {}; const mode = (f && f.saveMode && f.saveMode.value) ? f.saveMode.value : 'proforma_ebatli'; const ptype = (mode.indexOf('proforma')===0) ? (mode.split('_')[1]||'ebatli') : 'ebatli'; rec.proformaType = ptype; rec.date = rec.date || (new Date()).toISOString().slice(0,10); rec.proformaNo = rec.proformaNo || peekNextProformaNo(ptype); area.innerHTML = renderProformaHtml(rec); }
        document.getElementById('proformaTemplateEditor').style.display='none'; showToast('Şablon kaydedildi'); }catch(e){ alert('Şablon kaydedilemedi: '+(e&&e.message)); } });
      function parseCSV(text){
        const rows = [];
        let cur = '';
        let row = [];
        let i = 0; let inQuotes = false;
        while(i < text.length){ const ch = text[i]; if(inQuotes){ if(ch === '"'){ if(text[i+1] === '"'){ cur += '"'; i += 2; continue; } else { inQuotes = false; i++; continue; } } else { cur += ch; i++; continue; } } else { if(ch === '"'){ inQuotes = true; i++; continue; } if(ch === ','){ row.push(cur); cur = ''; i++; continue; } if(ch === '\r'){ // skip
            i++; continue; } if(ch === '\n'){ row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; } cur += ch; i++; continue; } }
        // push remaining
        if(cur !== '' || row.length){ row.push(cur); rows.push(row); }
        return rows;
      }
    
      function csvToObjects(text){ const rows = parseCSV(text); if(!rows || !rows.length) return []; const headers = rows[0].map(h=> String(h||'').trim()); const out = []; for(let r=1;r<rows.length;r++){ const row = rows[r]; if(row.length === 1 && headers.length>1 && row[0].trim()==='') continue; const obj={}; for(let c=0;c<headers.length;c++){ obj[headers[c]] = row[c]!==undefined? row[c] : ''; } out.push(obj); } return out; }
    
      function downloadCsv(filename, headers, rows){ const lines = [headers.join(',')]; rows.forEach(r=> lines.push(headers.map(h=> '"'+String(r[h]||'').replace(/"/g,'""')+'"').join(','))); const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
    
      // Helpers: flexible product parsing and numeric normalization for imports
      function normalizeNumericString(v, decimals){
        if(v === undefined || v === null) return '';
        const s = String(v).trim(); if(s === '') return '';
        // Handle different locale formats:
        // - "1.234,56"  => remove dots, replace comma with dot -> 1234.56
        // - "1234.56"   => keep dot as decimal
        // - "1,234.56"  => ambiguous; prefer treating comma as thousands (remove) and dot as decimal
        let normalized = s;
        const hasDot = /\./.test(s);
        const hasComma = /,/.test(s);
        if(hasComma && hasDot){
          // assume dot is thousand separator and comma is decimal
          normalized = s.replace(/\./g, '').replace(/,/g, '.');
        } else if(hasComma && !hasDot){
          // comma as decimal separator
          normalized = s.replace(/,/g, '.');
        } else {
          // only dots (keep them) — numeric conversion will handle
          normalized = s;
        }
        const n = Number(normalized);
        if(isNaN(n)) return s;
        if(typeof decimals === 'number') return Number(n).toFixed(decimals);
        return String(n);
      }
    
      function parseProductsFlexible(raw){
        // Accept: JSON array string, single product fallback fields, or compact delimited product list
        if(!raw) return [];
        if(Array.isArray(raw)) return raw;
        const s = String(raw).trim();
        // try JSON first
        try{ const j = JSON.parse(s); if(Array.isArray(j)) return j; }
        catch(_){
          // try a lenient fallback: sometimes JSON is single-quoted — attempt a safe replace
          try{
            if(/^[\[{].*[\]}]$/.test(s)){
              const alt = s.replace(/'/g,'"');
              const j2 = JSON.parse(alt);
              if(Array.isArray(j2)) return j2;
            }
          }catch(__){}
        }
        // try common delimiter patterns: separate products by ; or || or \n
        const productChunks = s.split(/\s*;\s*|\s*\|\|\s*|\r?\n/).map(x => x.trim()).filter(Boolean);
        const out = [];
        productChunks.forEach(chunk => {
          // try pipe-separated fields: stone|surface|quality|thickness|width|length|description|kasaAdet|kasaM2
          const parts = chunk.split('|').map(p=>p.trim());
          if(parts.length >= 3){
            const p = { stoneName: parts[0]||'', surface: parts[1]||'', quality: parts[2]||'', thickness: parts[3]||'', width: parts[4]||'', length: parts[5]||'', description: parts[6]||'', kasaAdet: parts[7]||'', kasaM2: parts[8]||'' };
            out.push(p); return;
          }
          // fallback: if chunk contains commas and matches key:value pairs, try to parse k:v,k:v
          if(chunk.indexOf(':') !== -1 && chunk.indexOf(',') !== -1){
            const p = {};
            chunk.split(',').forEach(pair => { const kv = pair.split(':'); if(kv.length>=2){ p[kv[0].trim()] = kv.slice(1).join(':').trim(); } });
            if(Object.keys(p).length) { out.push(p); return; }
          }
          // last fallback: treat chunk as stoneName
          out.push({ stoneName: chunk });
        });
        return out;
      }
    
      // Test helpers removed: CSV roundtrip test was removed per maintainer request.
      window.runCSVRoundtripTest = async function(){
        console.warn('runCSVRoundtripTest has been removed');
        return { error: 'runCSVRoundtripTest removed' };
      };
    
      // Generic import helper: maps CSV objects to entity keys and upserts
      function importCsvEntities(key, rows, mappingFn){ try{ if(!rows || !rows.length) return 0; let added = 0; rows.forEach(r => { const rec = mappingFn(r); if(!rec) return; // ensure id
            if(!rec.id) rec.id = Date.now().toString(36) + Math.random().toString(36).slice(2,6);
            upsertEntity(key, rec); added++; }); return added; }catch(e){ console.warn(e); return 0; } }
    
      // Wire CSV import/export buttons
      // Orders export: include proforma-related top-level fields when present
      document.getElementById('crmOrderExport')?.addEventListener('click', function(){
        const arr = getAll('orders')||[]; if(!arr.length){ alert('Dışa aktarılacak kayıt yok'); return; }
        const headers = ['id','orderNo','proformaNo','proformaType','proformaStatus','customer','customerId','stoneName','surface','quality','thickness','width','length','description','date','amount','status','products','deliveryMethod'];
        const rows = arr.map(r=>{ const copy = Object.assign({}, r); try{ copy.products = copy.products ? JSON.stringify(copy.products) : ''; }catch(e){ copy.products = ''; } // ensure proforma fields exist
          copy.proformaNo = copy.proformaNo || '';
          copy.proformaType = copy.proformaType || '';
          copy.proformaStatus = copy.proformaStatus || '';
          return copy; });
        downloadCsv('crm_orders_'+(new Date().toISOString().slice(0,10))+'.csv', headers, rows);
      });
    
      // Proformas export: export only proforma records (status === 'proforma') with top-level proforma fields
      document.getElementById('crmProformaExport')?.addEventListener('click', function(){
        const all = getAll('orders')||[];
        const proformas = all.filter(r=> String(r.status||'').toLowerCase() === 'proforma');
        if(!proformas.length){ alert('Dışa aktarılacak proforma yok'); return; }
        const headers = ['id','proformaNo','proformaType','proformaStatus','customer','customerId','date','amount','status','products'];
        const rows = proformas.map(r=>{ const copy = Object.assign({}, r); try{ copy.products = copy.products ? JSON.stringify(copy.products) : ''; }catch(e){ copy.products = ''; } copy.proformaNo = copy.proformaNo || ''; copy.proformaType = copy.proformaType || ''; copy.proformaStatus = copy.proformaStatus || ''; return copy; });
        downloadCsv('crm_proformas_'+(new Date().toISOString().slice(0,10))+'.csv', headers, rows);
      });
    
      document.getElementById('crmOrderImportFile')?.addEventListener('change', function(e){ const f = e.target.files && e.target.files[0]; if(!f) return; const rdr = new FileReader(); rdr.onload = function(){ try{ const rows = csvToObjects(String(rdr.result||'')); const added = importCsvEntities('orders', rows, function(r){ // parse products JSON if present, otherwise fallback to legacy single-product mapping
                // robust product parsing and numeric normalization
                let products = [];
                try{ if(r.products){ products = parseProductsFlexible(r.products); if(!Array.isArray(products)) products = []; } }catch(_){ products = []; }
                if(!products.length){ const p = { stoneName: r.stoneName||r['stoneName']||r['Taş İsmi']||'', surface: r.surface||'', quality: r.quality||'', thickness: r.thickness||'', width: r.width||'', length: r.length||'', description: r.description||r.note||'', kasaAdet: r.kasaAdet||'', kasaM2: r.kasaM2||'' }; if(Object.values(p).some(v=> v !== '')) products.push(p); }
                const amount = normalizeNumericString(r.amount, 2) || '';
                const tracking = (function(){ try{ return r.tracking ? JSON.parse(r.tracking) : []; }catch(e){ return []; } })();
                return { id: r.id||'', orderNo: r.orderNo||r['Sipariş No']||r.order_no||'', customer: r.customer||'', customerId: r.customerId||'', date: r.date||'', amount: amount, status: r.status||'new', deliveryMethod: r.deliveryMethod||'', products: products, tracking: tracking }; }); alert('İçe aktarılan satır: '+added); renderAll(); }catch(e){ alert('Dosya okunurken hata: '+e.message); } }; rdr.readAsText(f,'utf-8'); });
    
      // Customers import
      document.getElementById('crmCustomerImportFile')?.addEventListener('change', function(e){ const f = e.target.files && e.target.files[0]; if(!f) return; const rdr = new FileReader(); rdr.onload = function(){ try{ const rows = csvToObjects(String(rdr.result||'')); const added = importCsvEntities('customers', rows, function(r){ return { id: r.id||'', name: r.name||r['name']||r['ad']||'', company: r.company||r['company']||'', phone: r.phone||r['phone']||'', email: r.email||r['email']||'', city: r.city||r['city']||'' }; }); alert('Müşteri içe aktarılan satır: '+added); renderAll(); }catch(e){ alert('Dosya okunurken hata: '+e.message); } }; rdr.readAsText(f,'utf-8'); });
    
      
      // New CSV import: preview & mapping flow (Orders & Customers)
      let __csvImportBuffer = null;
      let __csvImportKey = null;
      function showCsvPreview(entityKey, rawRows){ try{ if(!rawRows || !rawRows.length) return alert('CSV boş veya okunamadı'); __csvImportBuffer = rawRows; __csvImportKey = entityKey; const headers = rawRows[0].map(h=> String(h||'').trim()); const sample = rawRows.slice(1,4).map(r=> r.map(c=> String(c||'')));
        // extend orders mapping to include proforma top-level fields for proper CSV roundtrip
        const targetFields = {
          customers: ['ignore','id','name','company','phone','email','city'],
          orders: ['ignore','id','orderNo','proformaNo','proformaType','proformaStatus','customer','customerId','stoneName','surface','quality','thickness','width','length','description','date','amount','status','products','deliveryMethod','tracking']
        };
          const fields = targetFields[entityKey] || ['ignore']; const area = document.getElementById('csvPreviewArea'); area.innerHTML=''; const table = document.createElement('table'); table.style.width='100%'; table.style.borderCollapse='collapse'; const thead = document.createElement('thead'); const hr = document.createElement('tr'); headers.forEach((h,idx)=>{ const th = document.createElement('th'); th.style.border='1px solid #eef2ff'; th.style.padding='6px'; th.innerHTML = `<div style="font-weight:600">${escapeHtml(h)}</div><div style="margin-top:6px">Eşle: <select data-hidx="${idx}"></select></div>`; hr.appendChild(th); }); thead.appendChild(hr); table.appendChild(thead); const tbody = document.createElement('tbody'); sample.forEach(row=>{ const tr = document.createElement('tr'); row.forEach((c,idx)=>{ const td = document.createElement('td'); td.style.border='1px solid #f8fafc'; td.style.padding='6px'; td.textContent = c; tr.appendChild(td); }); tbody.appendChild(tr); }); table.appendChild(tbody); area.appendChild(table);
          // populate selects
          area.querySelectorAll('select').forEach(sel=>{ const idx = sel.dataset.hidx; fields.forEach(f=>{ const opt = document.createElement('option'); opt.value = f; opt.textContent = f; sel.appendChild(opt); }); // try to auto-match by name
            const header = headers[Number(idx)] || ''; const guess = fields.find(ff=> header.toLowerCase().includes(ff.toLowerCase())); if(guess) sel.value = guess; });
          document.getElementById('csvMappingModal').style.display='flex';
      }catch(e){ alert('Preview hata: '+e.message); } }
    
      document.getElementById('csvImportCancel')?.addEventListener('click', function(){ __csvImportBuffer=null; __csvImportKey=null; document.getElementById('csvMappingModal').style.display='none'; });
    
      // close sanity check modal
      document.getElementById('crmCheckClose')?.addEventListener('click', function(){ document.getElementById('crmCheckModal').style.display='none'; });
    
      document.getElementById('csvImportConfirm')?.addEventListener('click', function(){ try{ if(!__csvImportBuffer || !__csvImportKey) return alert('İçerik yok'); const headers = __csvImportBuffer[0].map(h=> String(h||'').trim()); // build mapping
          const selects = Array.from(document.getElementById('csvPreviewArea').querySelectorAll('select')); const headerToField = {}; selects.forEach(s=>{ const idx = Number(s.dataset.hidx); const val = s.value; if(val && val !== 'ignore') headerToField[headers[idx]] = val; }); // convert rows to objects
          const csvText = __csvImportBuffer.map(r=> r.map(c=> '"'+String(c||'').replace(/"/g,'""')+'"').join(',')).join('\n'); const objs = csvToObjects(csvText);
          const mappingFn = function(r){
            const rec = {};
            Object.keys(r).forEach(h=>{
              const target = headerToField[h]; if(!target) return;
              // handle products JSON specially
              if(target === 'products'){
                try{ rec.products = parseProductsFlexible(r[h]); }catch(e){ rec.products = []; }
                return;
              }
              // normalize amount fields at mapping time
              if(target === 'amount'){
                rec.amount = normalizeNumericString(r[h], 2);
                return;
              }
              rec[target] = r[h];
            });
            // if products not present but single product fields exist, build products array
            if(!rec.products){ const p = { stoneName: rec.stoneName||'', surface: rec.surface||'', quality: rec.quality||'', thickness: rec.thickness||'', width: rec.width||'', length: rec.length||'', description: rec.description||'' }; if(Object.values(p).some(v=> v !== '')) rec.products = [p]; }
            return rec;
          };
          const added = importCsvEntities(__csvImportKey, objs, mappingFn); alert('İçe aktarılan satır: '+added); document.getElementById('csvMappingModal').style.display='none'; __csvImportBuffer=null; __csvImportKey=null; renderAll(); }catch(e){ alert('Import hata: '+e.message); } });
    
      // override old import handlers to use preview
      document.getElementById('crmOrderImportFile')?.addEventListener('change', function(e){ const f = e.target.files && e.target.files[0]; if(!f) return; const rdr = new FileReader(); rdr.onload = function(){ try{ const raw = parseCSV(String(rdr.result||'')); showCsvPreview('orders', raw); }catch(err){ alert('Dosya okunurken hata: '+err.message); } }; rdr.readAsText(f,'utf-8'); });
      document.getElementById('crmCustomerImportFile')?.addEventListener('change', function(e){ const f = e.target.files && e.target.files[0]; if(!f) return; const rdr = new FileReader(); rdr.onload = function(){ try{ const raw = parseCSV(String(rdr.result||'')); showCsvPreview('customers', raw); }catch(err){ alert('Dosya okunurken hata: '+err.message); } }; rdr.readAsText(f,'utf-8'); });
    
      // CRM subtabs switching (scoped to CRM section only)
      (function(){
        const crm = document.getElementById('siparis');
        if(!crm) return;
        const crmSubtabs = Array.from(crm.querySelectorAll('.subtabs .subtab'));
        crmSubtabs.forEach(btn=> btn.addEventListener('click', function(){
          // Remove active only within this subtabs group
          const group = this.closest('.subtabs');
          if(group){ Array.from(group.querySelectorAll('.subtab')).forEach(b=> b.classList.remove('active')); }
          this.classList.add('active');
          const t=this.getAttribute('data-crm');
          // Toggle only CRM cards inside CRM section
          crm.querySelectorAll('.crm-card').forEach(c=> c.style.display='none');
          const map = { customers:'crm-customers', neworder:'crm-neworder', proformas:'crm-proformas', orders:'crm-orders', reports:'crm-reports' };
          const show = crm.querySelector('#'+(map[t] || ('crm-'+t)));
          if(show) {
            show.style.display='block';
            // focus first input/select/button for accessibility
            setTimeout(()=>{ try{ const focusEl = show.querySelector('input,select,textarea,button'); if(focusEl) focusEl.focus(); }catch(e){} },60);
            // when opening the New Order card, show a non-consuming preview of the next order number
            try{
              if(t === 'neworder'){
                const form = document.getElementById('crmOrderForm');
                if(form){ try{
                    const mode = (form.saveMode && form.saveMode.value) ? form.saveMode.value : 'order';
                    if(mode && mode.startsWith('proforma')){
                      const ptype = mode.split('_')[1] || 'ebatli';
                      if(!form.orderNo || !(form.orderNo.value && form.orderNo.value.trim())) form.orderNo.value = peekNextProformaNo(ptype);
                    } else {
                      if(!form.orderNo || !(form.orderNo.value && form.orderNo.value.trim())) form.orderNo.value = peekNextOrderNo();
                    }
                  }catch(_){ }
                }
              }
            }catch(_){ }
          }
          renderAll();
          // Auto-clean leftover storages on first load (opps/tasks/contacts)
          try{ const removed = removeLeftoverStorages(); if(removed && removed.length){ showToast('Artıkları otomatik temizledim',3500); console.log('Removed leftover CRM keys:', removed); } }catch(e){}
        }));
      })();
    
      function renderAll(){ renderCustomers(document.getElementById('crmCustomerSearch')?.value||''); try{ populateCustomerDatalist(); attachCustomerAutocomplete('crmOrderForm','customer'); }catch(e){} renderProformas(); renderOrders(); renderReports(); }
    
        // initial render
        renderAll();
        
        // --- Quick-create Yeni Müşteri wiring for crmOrderForm ---
        try{
          // show/hide quick form
          const btnQuick = document.getElementById('btnNewCustomerQuick');
          const quickForm = document.getElementById('newCustomerQuickForm');
          const hint = document.getElementById('newCustomerQuickHint');
          if(btnQuick && quickForm){
            btnQuick.addEventListener('click', function(e){ e.preventDefault(); try{ quickForm.style.display = quickForm.style.display === 'none' ? 'flex' : 'none'; if(quickForm.style.display !== 'none'){ document.getElementById('qc_name')?.focus(); } }catch(_){ } });
          }
          // cancel
          document.getElementById('qc_cancel')?.addEventListener('click', function(e){ e.preventDefault(); try{ quickForm.style.display='none'; }catch(_){ } });
          // save handler: validate name, upsertEntity('customers', rec), update datalist and form inputs
          document.getElementById('qc_save')?.addEventListener('click', function(e){ e.preventDefault(); try{
            const name = (document.getElementById('qc_name')?.value||'').trim(); if(!name) { alert('Müşteri adı gerekli'); document.getElementById('qc_name')?.focus(); return; }
            const rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2,6), name: name, company: (document.getElementById('qc_company')?.value||'').trim(), phone: (document.getElementById('qc_phone')?.value||'').trim(), email: (document.getElementById('qc_email')?.value||'').trim(), city: (document.getElementById('qc_city')?.value||'').trim() };
            upsertEntity('customers', rec);
            try{ populateCustomerDatalist(); }catch(_){ }
            // set order form customer fields
            try{ const of = document.getElementById('crmOrderForm'); if(of){ of.customer.value = rec.name; const hid = of.querySelector('input[name="customerId"]'); if(hid) hid.value = rec.id; } }catch(_){ }
            quickForm.style.display='none'; // clear quick inputs
            ['qc_name','qc_company','qc_phone','qc_email','qc_city'].forEach(id=>{ const el = document.getElementById(id); if(el) el.value=''; });
            showToast('Müşteri eklendi');
          }catch(err){ console.error('qc save', err); alert('Müşteri kaydedilemedi: '+(err && err.message)); } });
        }catch(e){}
        // Proforma smoke test helper — creates sample customers/proformas and tests render + approve/reject flows.
        // Quick-create smoke test removed per maintainer request.
        function runQuickCreateSmokeTest(){
          console.warn('runQuickCreateSmokeTest has been removed');
          return { error: 'runQuickCreateSmokeTest removed' };
        }
      // run non-destructive quick-create verification immediately (safe)
      // NOTE: disabled automatic quick-create smoke run to avoid noisy side-effects on page load.
      // To re-enable for debugging, set window.__autoRunQuickCreate = true and reload.
      try{ if(window.__autoRunQuickCreate) runQuickCreateSmokeTest(); }catch(_){ }
        // Proforma smoke tests removed per maintainer request.
        function runProformaSmokeTests(){ console.warn('runProformaSmokeTests has been removed'); return { error: 'runProformaSmokeTests removed' }; }
    
        // CSV roundtrip test UI removed; stub click handler (no-op)
        document.getElementById('crmCsvRoundtripTest')?.addEventListener('click', function(e){ e.preventDefault(); console.warn('CSV roundtrip test UI removed'); alert('CSV roundtrip testi kaldırıldı'); });
    
        // Run consolidated non-destructive tests and offer JSON download of results
        // Run all tests UI removed; stub click handler
        document.getElementById('crmRunAllTests')?.addEventListener('click', function(e){ e.preventDefault(); console.warn('Run all tests UI removed'); alert('Testler kaldırıldı'); });
    
        // Sequence test removed — stub
        function runProformaSeqTest(){ console.warn('runProformaSeqTest has been removed'); return { error: 'runProformaSeqTest removed' }; }
        // Proforma row-action simulator removed
        function runProformaRowActionSim(){ console.warn('runProformaRowActionSim has been removed'); return { error: 'runProformaRowActionSim removed' }; }
        document.getElementById('crmProformaRowSim')?.addEventListener('click', function(e){ e.preventDefault(); alert('Satır aksiyon simülasyonu kaldırıldı'); });
        // Remove console helpers and consolidated test runner
        try{ window.runRowSim = function(){ console.warn('runRowSim removed'); throw new Error('runRowSim removed'); };
          window.runCRMNonDestructiveTests = async function(){ console.warn('runCRMNonDestructiveTests removed'); return { error: 'runCRMNonDestructiveTests removed' }; };
        }catch(_){ }
      })();
    
    /* ==== BODY inline script #23 ==== */
    (function(){
        // Basit çizim yardımcıları (harici kütüphane yok)
        function ensureCanvasSize(canvas, cssHeight){
          const dpr = window.devicePixelRatio || 1;
          const parentW = Math.max(320, Math.floor((canvas.parentElement?.clientWidth || canvas.clientWidth || 380)));
          const h = cssHeight || 160;
          canvas.style.width = '100%';
          canvas.style.height = h+'px';
          canvas.width = Math.floor(parentW * dpr);
          canvas.height = Math.floor(h * dpr);
          const ctx = canvas.getContext('2d');
          if(ctx && dpr !== 1){ ctx.setTransform(dpr,0,0,dpr,0,0); }
          return { ctx, w: parentW, h };
        }
    
        function formatLabelKey(key){
          try{
            if(/^\d{4}-\d{2}-\d{2}$/.test(key)){ const [y,m,d]=key.split('-'); return `${d}.${m}`; }
            if(/^\d{4}-W\d{2}$/.test(key)){ const [y,rest]=key.split('-W'); return 'W'+rest; }
            if(/^\d{4}-\d{2}$/.test(key)){ const [y,m]=key.split('-'); return `${m}.${y.slice(-2)}`; }
            return key;
          }catch(_){ return key; }
        }
    
        // Basit bar-grafik çizici + hover verisi üretir (canvas.__bars)
        function drawBars(canvas, labels, values, color){
          try{
            if(!canvas) return; const {ctx, w, h} = ensureCanvasSize(canvas, 180); if(!ctx) return; ctx.clearRect(0,0,w,h);
            const padL=40, padB=46, padT=10, padR=12; const chartW = Math.max(10, w-padL-padR), chartH = Math.max(10, h-padT-padB);
            const n = values.length || 0; if(n===0){ ctx.fillStyle='#94a3b8'; ctx.font='12px -apple-system,Segoe UI,Roboto'; ctx.fillText('Kayıt yok', padL+6, padT+18); return; }
            const maxV = Math.max(...values, 0.0001) * 1.08; // %8 tepe boşluk
            const barW = Math.max(6, Math.floor(chartW / Math.max(1, n*1.8)));
            const stepX = chartW / Math.max(1, n);
            // grid (x axis)
            ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(padL, h-padB+0.5); ctx.lineTo(w-padR, h-padB+0.5); ctx.stroke();
            // y-axis ticks
            ctx.fillStyle = '#94a3b8'; ctx.font='11px -apple-system,Segoe UI,Roboto'; ctx.textAlign='right'; ctx.textBaseline='alphabetic';
            const tickCnt = 3; for(let t=1;t<=tickCnt;t++){ const yv = (maxV/tickCnt)*t; const y = Math.round(h - padB - (yv/maxV)*chartH) + 0.5; ctx.strokeStyle='#eef2f7'; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w-padR, y); ctx.stroke(); ctx.fillText(yv.toLocaleString('tr-TR',{maximumFractionDigits:0}), padL-4, y-2); }
            // bars
            ctx.fillStyle = color || '#0ea5e9';
            const rects = [];
            for(let i=0;i<n;i++){
              const v = values[i]; const bh = Math.max(1, Math.round((v/maxV) * chartH));
              const x = Math.round(padL + i*stepX + (stepX-barW)/2);
              const y = Math.round(h - padB - bh);
              const xSafe = Math.min(w - padR - barW, Math.max(padL, x));
              ctx.fillRect(xSafe, y, barW, bh);
              rects.push({ x: xSafe, y, w: barW, h: bh, label: labels[i], value: v });
            }
            // x labels (sparse) — kartın içinde kalsın diye eksen altındaki pad alanına yazıyoruz (rotasyonsuz)
            ctx.fillStyle = '#334155'; ctx.font='12px -apple-system,Segoe UI,Roboto'; ctx.textAlign='center'; ctx.textBaseline='top';
            const lblStep = Math.max(1, Math.ceil(n/7));
            for(let i=0;i<n;i++){
              if(i%lblStep!==0 && i!==n-1 && i!==0) continue;
              const lx = Math.round(padL + i*stepX + (stepX/2)); const ly = h - padB + 4; // eksen altı pad alanı
              let text = String(formatLabelKey(labels[i]||''));
              // Çok dar aralıkta metni kısalt
              const maxW = Math.max(24, stepX - 6);
              let m = ctx.measureText(text);
              if(m.width > maxW){
                if(text.length > 5) text = text.slice(0, 5); // günü: '7.10', hafta: 'W42', ay: '11.25'
              }
              // arka plan zırhı
              m = ctx.measureText(text); const bw = Math.ceil(m.width)+6; const bhTxt = 16;
              ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(lx - bw/2, ly - 2, bw, bhTxt);
              ctx.fillStyle = '#334155'; ctx.fillText(text, lx, ly);
            }
    
            // hover datasını canvasa iliştir ve etkileşimi bağla
            try{ canvas.__bars = { rects, color: (color||'#0ea5e9'), padL, padR, padB, padT, chartW, chartH, stepX, h, w }; attachBarHover(canvas, labels, values); }catch(_){ }
          }catch(_){ }
        }
    
        // Tek bir tooltip öğesi yarat/yeniden kullan
        function getTooltip(){
          let tip = document.getElementById('rg_tip');
          if(!tip){
            tip = document.createElement('div'); tip.id='rg_tip';
            tip.style.position='fixed'; tip.style.zIndex='99999'; tip.style.pointerEvents='none';
            tip.style.background='#fff'; tip.style.border='1px solid #e5e7eb'; tip.style.boxShadow='0 4px 16px rgba(2,6,23,0.15)';
            tip.style.borderRadius='8px'; tip.style.padding='6px 8px'; tip.style.font='12px -apple-system,Segoe UI,Roboto'; tip.style.color='#0f172a';
            tip.style.display='none'; document.body.appendChild(tip);
          }
          return tip;
        }
    
        function showTip(x,y, html){ const t = getTooltip(); try{ // avoid injecting raw HTML into tooltip; use textContent so it is escaped
          t.textContent = String(html || '');
        }catch(e){ t.textContent = '' + (html||''); }
        t.style.left = Math.round(x+10)+'px'; t.style.top = Math.round(y+10)+'px'; t.style.display='block'; }
        function hideTip(){ const t=getTooltip(); t.style.display='none'; }
    
        function attachBarHover(canvas, labels, values){
          if(!canvas) return;
          if(canvas.__hoverWired) return; // bir kere bağla
          canvas.__hoverWired = true;
          canvas.addEventListener('mousemove', function(ev){
            try{
              const rect = canvas.getBoundingClientRect();
              const mx = ev.clientX - rect.left; const my = ev.clientY - rect.top;
              const d = canvas.__bars; if(!d || !Array.isArray(d.rects)) { hideTip(); return; }
              // Sütun (bin) bazlı geniş hit alanı: x ekseninde sütunu bul, y'yi kısıtlamadan tooltip göster
              if(mx < d.padL || mx > d.padL + d.chartW){ hideTip(); return; }
              let idx = Math.floor((mx - d.padL) / d.stepX);
              if(idx < 0) idx = 0; if(idx >= d.rects.length) idx = d.rects.length - 1;
              const hit = d.rects[idx]; if(!hit){ hideTip(); return; }
              const label = formatLabelKey(hit.label||'');
              const valStr = (Number(hit.value)||0).toLocaleString('tr-TR',{ maximumFractionDigits:3 });
              showTip(ev.clientX, ev.clientY, `<div style=\"font-weight:700;margin-bottom:2px;\">${label}</div><div>${valStr} m²</div>`);
            }catch(_){ }
          });
          canvas.addEventListener('mouseleave', function(){ hideTip(); });
          canvas.addEventListener('wheel', function(){ hideTip(); });
        }
    
        function drawHBarCompare(canvas, labels, values, colors){
          try{
            if(!canvas) return; const ctx = canvas.getContext('2d'); const w=canvas.width, h=canvas.height; ctx.clearRect(0,0,w,h);
            const pad=12, rowH=26, gap=8; const maxW = w - pad*2; const maxV = Math.max(...values, 0.0001);
            ctx.font='12px -apple-system,Segoe UI,Roboto';
            for(let i=0;i<labels.length;i++){
              const y = pad + i*(rowH+gap);
              const ratio = (values[i]||0)/maxV; const bw = Math.round(maxW*ratio);
              ctx.fillStyle = colors?.[i] || ['#0ea5e9','#22c55e','#a78bfa','#f97316'][i%4];
              ctx.fillRect(pad, y, bw, rowH);
              ctx.fillStyle = '#0f172a'; ctx.fillText(String(labels[i]||''), pad+6, y+17);
              ctx.fillStyle = '#334155'; ctx.textAlign='right'; ctx.fillText((values[i]||0).toLocaleString('tr-TR',{maximumFractionDigits:3}), w-pad, y+17); ctx.textAlign='left';
            }
          }catch(_){ }
        }
    
        function parseDate(str){ try{ if(!str) return null; const d = new Date(str); if(!isNaN(d)) return d; }catch(_){ } return null; }
        function ymd(d){ return d.toISOString().slice(0,10); }
        function ym(d){ return d.toISOString().slice(0,7); }
        function isoWeek(d){ // ISO week key: YYYY-Www
          const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
          const dayNum = (tmp.getUTCDay() || 7); tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
          const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
          const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1)/7);
          const y = tmp.getUTCFullYear(); return y + '-W' + String(weekNo).padStart(2,'0');
        }
    
        function parseNumTr(val){
          try{
            if(val===undefined || val===null) return NaN;
            let s = String(val).trim();
            if(!s) return NaN;
            // remove spaces, remove thousands separators '.', then replace decimal comma with dot
            s = s.replace(/\s+/g,'').replace(/\./g,'').replace(/,/g,'.');
            const n = Number(s);
            return Number.isFinite(n) ? n : NaN;
          }catch(_){ return NaN; }
        }
    
        function bucketSeries(arr, period){
          const map = new Map();
          arr.forEach(r=>{
            const d=parseDate(r.tarih||r.date||r.girTarih||''); if(!d) return;
            let key=''; if(period==='daily') key=ymd(d); else if(period==='weekly') key=isoWeek(d); else key=ym(d);
            let m2 = parseNumTr(r.m2);
            if(isNaN(m2)) m2 = parseNumTr(r.sm2);
            if(isNaN(m2)) m2 = 0;
            map.set(key, (map.get(key)||0) + m2);
          });
          const keys = Array.from(map.keys()).sort(); return { labels: keys, values: keys.map(k=> map.get(k)||0) };
        }
    
        function sum(arr){ return arr.reduce((s,v)=> s+(Number(v)||0), 0); }
        function avg(arr){ if(!arr.length) return 0; return sum(arr)/arr.length; }
    
      function getPF(){ return getFromStorage('v91_plaka_firin_kayitlar'); }
      function getFF(){ return getFromStorage('v91_fayans_firin_kayitlar'); }
      function getPS(){ return getFromStorage('v91_plaka_silim_kayitlar'); }
      function getFFS(){ return getFromStorage('v91_fayans_firin_seleksiyon_kayitlar'); }
      function setFFS(arr){ try{ localStorage.setItem('v91_fayans_firin_seleksiyon_kayitlar', JSON.stringify(arr||[])); }catch(_){ } }
        function getBloklar(){
          try{
            const raw = localStorage.getItem('bloklar_yeni_demo') || localStorage.getItem('bloklar') || '[]';
            try{ return JSON.parse(raw || '[]'); }catch(e){
              // handle stray non-JSON sentinels like 'done'
              try{ if(typeof raw === 'string' && raw.trim() === 'done'){ localStorage.removeItem('bloklar_yeni_demo'); return []; } }catch(_){ }
              return [];
            }
          }catch(_){ return []; }
        }
    
        function renderEF(){
          const body = document.getElementById('rg_ef_body'); if(!body) return; const arr = getBloklar();
          const g = { Ensar:{count:0,m3:0}, Fason:{count:0,m3:0} };
          arr.forEach(b=>{
            const who = (String(b.durum||'Ensar').trim()==='Fason')?'Fason':'Ensar';
            let m3 = parseNumTr(b.m3);
            if(!isFinite(m3) || m3===0){
              const en=parseNumTr(b.en);
              const boy=parseNumTr(b.boy);
              const yuk=parseNumTr(b.yukseklik);
              const calc = (isFinite(en)&&isFinite(boy)&&isFinite(yuk)) ? (en*boy*yuk/1_000_000) : NaN;
              if(isFinite(calc)) m3 = calc;
            }
            g[who].count += 1; g[who].m3 += (isNaN(m3)?0:m3);
          });
          body.innerHTML = '';
          [['Ensar', g.Ensar], ['Fason', g.Fason]].forEach(([k,obj])=>{
            const tr=document.createElement('tr'); tr.innerHTML = safeHTML`<td style="padding:6px 4px;">${k}</td><td style="padding:6px 4px;">${(obj.count||0).toLocaleString('tr-TR')}</td><td style="padding:6px 4px;">${(obj.m3||0).toLocaleString('tr-TR',{maximumFractionDigits:3})}</td>`; body.appendChild(tr);
          });
          const c = document.getElementById('rg_ef_chart'); drawHBarCompare(c, ['Ensar','Fason'], [g.Ensar.m3||0, g.Fason.m3||0]);
        }
    
        let period = 'daily';
        function renderAll(){
          const pf = getPF(); const ff = getFF(); const ps = getPS(); const ffs = getFFS();
          const sPF = bucketSeries(pf, period); drawBars(document.getElementById('rg_pf_chart'), sPF.labels, sPF.values, '#0ea5e9');
          const sFF = bucketSeries(ff, period); drawBars(document.getElementById('rg_ff_chart'), sFF.labels, sFF.values, '#22c55e');
          const sPS = bucketSeries(ps, period); drawBars(document.getElementById('rg_ps_chart'), sPS.labels, sPS.values, '#a78bfa');
          const sFFS = bucketSeries(ffs, period); drawBars(document.getElementById('rg_ffs_chart'), sFFS.labels, sFFS.values, '#f97316');
          document.getElementById('rg_pf_total').textContent = sum(sPF.values).toLocaleString('tr-TR',{maximumFractionDigits:3});
          document.getElementById('rg_pf_avg').textContent = avg(sPF.values).toLocaleString('tr-TR',{maximumFractionDigits:3});
          document.getElementById('rg_ff_total').textContent = sum(sFF.values).toLocaleString('tr-TR',{maximumFractionDigits:3});
          document.getElementById('rg_ff_avg').textContent = avg(sFF.values).toLocaleString('tr-TR',{maximumFractionDigits:3});
          document.getElementById('rg_ps_total').textContent = sum(sPS.values).toLocaleString('tr-TR',{maximumFractionDigits:3});
          document.getElementById('rg_ps_avg').textContent = avg(sPS.values).toLocaleString('tr-TR',{maximumFractionDigits:3});
          document.getElementById('rg_ffs_total').textContent = sum(sFFS.values).toLocaleString('tr-TR',{maximumFractionDigits:3});
          document.getElementById('rg_ffs_avg').textContent = avg(sFFS.values).toLocaleString('tr-TR',{maximumFractionDigits:3});
          renderEF();
          renderBlokDetail();
        }
        
        // ---- Blok Detay (Ensar/Fason) ----
        function normNum(v){ return parseNumTr(v); }
        function deriveM3(b){ let m3 = parseNumTr(b.m3); if(!isFinite(m3) || m3===0){ const en=parseNumTr(b.en), boy=parseNumTr(b.boy), yuk=parseNumTr(b.yukseklik); if(isFinite(en)&&isFinite(boy)&&isFinite(yuk)) m3 = (en*boy*yuk)/1_000_000; }
          return isFinite(m3)?m3:0; }
        function deriveTon(m3){ const dens = 2.7; const t = (isFinite(m3)?m3:0) * dens; return t; }
        function groupBlocks(owner, groupBy){ const arr = getBloklar(); const map = new Map();
          arr.forEach(b=>{
            const durum = String(b.durum||'Ensar').trim()==='Fason' ? 'Fason' : 'Ensar';
            if(owner!=='all' && durum!==owner) return;
            const key = groupBy==='durum' ? durum : (String(b[groupBy]||'').trim()||'(boş)');
            const m3 = deriveM3(b); const ton = deriveTon(m3);
            const obj = map.get(key) || { key, count:0, m3:0, ton:0 };
            obj.count += 1; obj.m3 += m3; obj.ton += ton; map.set(key, obj);
          });
          const rows = Array.from(map.values());
          rows.sort((a,b)=> (b.m3||0) - (a.m3||0));
          return rows;
        }
        function renderBlokDetail(){ const owner = (document.getElementById('rg_owner_filter')?.value)||'all'; const groupBy = (document.getElementById('rg_group_by')?.value)||'durum'; const body = document.getElementById('rg_blok_group_body'); if(!body) return; const rows = groupBlocks(owner, groupBy); body.innerHTML=''; rows.forEach(r=>{ const tr=document.createElement('tr'); const avg = (r.count>0) ? (r.m3/r.count) : 0; tr.innerHTML = `<td style=\"padding:6px 4px;\"><b>${r.key}</b></td><td style=\"padding:6px 4px;\">${r.count.toLocaleString('tr-TR')}</td><td style=\"padding:6px 4px;\">${r.m3.toLocaleString('tr-TR',{maximumFractionDigits:3})}</td><td style=\"padding:6px 4px;\">${r.ton.toLocaleString('tr-TR',{maximumFractionDigits:3})}</td><td style=\"padding:6px 4px;\">${avg.toLocaleString('tr-TR',{maximumFractionDigits:3})}</td>`; body.appendChild(tr); }); }
        function exportBlokDetailCsv(){ const owner = (document.getElementById('rg_owner_filter')?.value)||'all'; const groupBy = (document.getElementById('rg_group_by')?.value)||'durum'; const rows = groupBlocks(owner, groupBy); const headers = ['Grup','Blok Sayısı','Toplam m3','Toplam Ton','Ort m3/Blok']; const csv = [headers.join(',')]; rows.forEach(r=>{ const avg = (r.count>0)?(r.m3/r.count):0; const line = [r.key, r.count, r.m3.toFixed(3), r.ton.toFixed(3), avg.toFixed(3)].map(x=> '"'+String(x).replace(/"/g,'""')+'"').join(','); csv.push(line); }); const blob = new Blob([csv.join('\n')], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='blok_detay_'+(new Date().toISOString().slice(0,10))+'.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
        
    
        document.addEventListener('DOMContentLoaded', function(){
          try{
            // Period controls
            const lbls = Array.from(document.querySelectorAll('#rg_periods label'));
            lbls.forEach(l=>{
              l.addEventListener('click', function(){
                try{ lbls.forEach(x=> x.classList.remove('active')); this.classList.add('active'); }catch(_){ }
                const inp = this.querySelector('input'); if(inp){ period = inp.value||'daily'; renderAll(); }
              });
            });
            // Varsayılan aktif label
            const first = lbls[0]; if(first){ first.classList.add('active'); }
            // Blok detay filtre/aksiyonları
            const ownerSel = document.getElementById('rg_owner_filter');
            const grpSel = document.getElementById('rg_group_by');
            const expBtn = document.getElementById('rg_export_csv');
            ownerSel?.addEventListener('change', renderBlokDetail);
            grpSel?.addEventListener('change', renderBlokDetail);
            expBtn?.addEventListener('click', function(e){ e.preventDefault(); exportBlokDetailCsv(); });
      renderAll();
      try{ if(typeof renderFFSList === 'function') renderFFSList(); }catch(_){ }
            // Pencere yeniden boyutlanınca grafikleri yeniden çiz
            let _rsTimer; window.addEventListener('resize', function(){ clearTimeout(_rsTimer); _rsTimer = setTimeout(()=>{ renderAll(); }, 120); });
            window.addEventListener('storage', function(e){
              if(['v91_plaka_firin_kayitlar','v91_fayans_firin_kayitlar','v91_plaka_silim_kayitlar','v91_fayans_firin_seleksiyon_kayitlar','bloklar_yeni_demo'].includes(e.key||'')){
                renderAll();
                try{ if(typeof renderFFSList === 'function') renderFFSList(); }catch(_){ }
              }
            });
          }catch(_){ }
        });
      })();
    
    /* ==== BODY inline script #24 ==== */
    document.addEventListener('DOMContentLoaded', function(){
          const KASA_KEY = 'v91_kasa_stok_kayitlar';
          function getKasa(){ try{ return JSON.parse(localStorage.getItem(KASA_KEY)||'[]'); }catch(e){ return []; } }
          function setKasa(a){ localStorage.setItem(KASA_KEY, JSON.stringify(a)); }
    
          // Görünüm tercihi: sadece son 5 kayıt
          const RECENT_KEY = 'v91_kasa_show_recent_only';
          function loadRecentPref(){ try{ const v = localStorage.getItem(RECENT_KEY); return v==null ? true : JSON.parse(v); }catch(_){ return true; } }
          function saveRecentPref(v){ try{ localStorage.setItem(RECENT_KEY, JSON.stringify(!!v)); }catch(_){ } }
          let showRecentOnly = loadRecentPref();
          let oneDayOnly = false;
          // Toggle buton etiketini güncelle ve olay bağla
          (function(){ try{
            const btn = document.getElementById('kasaToggleRecent');
            const dayBtn = document.getElementById('kasaToggleDay');
            if(btn){
              function syncLabel(){ btn.textContent = showRecentOnly ? 'Sadece Son 5' : 'Tümü (Kaydırmalı)'; }
              syncLabel();
              btn.addEventListener('click', function(){ showRecentOnly = !showRecentOnly; saveRecentPref(showRecentOnly); syncLabel(); renderKasaMovements(); });
            }
            if(dayBtn){
              function syncDayLabel(){ dayBtn.textContent = oneDayOnly ? 'Son 1 Gün (Açık)' : 'Son 1 Gün'; }
              syncDayLabel();
              dayBtn.addEventListener('click', function(){ oneDayOnly = !oneDayOnly; syncDayLabel(); renderKasaMovements(); });
            }
          }catch(_){ } })();
    
          // Türkçe Title Case yardımcı fonksiyonu (I/İ uyumlu)
          function titleCaseTR(s){
            try{
              const lower = String(s||'').toLocaleLowerCase('tr-TR');
              return lower.replace(/(^|\s+)([\p{L}])/gu, (m,p1,p2)=> p1 + p2.toLocaleUpperCase('tr-TR'));
            }catch(_){
              return String(s||'');
            }
          }
    
          function cm2_to_m2_local(en,boy,adet){
            try{
              const parseDim = v => { if(v===undefined||v===null||v==='') return NaN; const s = String(v).trim(); const m = s.replace(/\s+/g,'').replace(',', '.').match(/([0-9]+(?:\.[0-9]+)?)/); if(!m) return NaN; const n = parseFloat(m[1]); return Number.isFinite(n) ? { n, s } : NaN; };
              const de = parseDim(en); const db = parseDim(boy); if(!de || !db || isNaN(de.n) || isNaN(db.n)) return NaN;
              let enVal = de.n; let boyVal = db.n;
              const enLooksMm = /mm\b/i.test(de.s) || (enVal >= 100 && enVal < 1000);
              const boyLooksMm = /mm\b/i.test(db.s) || (boyVal >= 100 && boyVal < 1000);
              if(enVal >= 1000 || boyVal >= 1000){ console.warn('Dimension value unusually large, please check units (expected cm or mm):', enVal, boyVal); return NaN; }
              const per = (enLooksMm || boyLooksMm) ? (enVal * boyVal) / 1000000 : (enVal * boyVal) / 10000;
              const a = parseInt(adet||'0',10);
              if(isNaN(per)) return NaN; return per * (isNaN(a)?0:a);
            }catch(e){ return NaN; }
          }
    
          const f = document.getElementById('frmKasaStok');
          function calcKasaDerived(){ if(!f) return; const en=f.en.value, boy=f.boy.value, kasaIciAdet=f.kasaIciAdet.value, kasaMiktari=f.kasaMiktari.value; const perKasa = cm2_to_m2_local(en,boy,kasaIciAdet); f.kasaIciM2.value = (!isNaN(perKasa) && perKasa!==0) ? Number(perKasa).toFixed(3) : ''; const total = (!isNaN(perKasa) && perKasa!==0 && !isNaN(parseFloat(kasaMiktari))) ? (perKasa * Number(kasaMiktari)) : NaN; f.toplamM2.value = (!isNaN(total) && total!==0) ? Number(total).toFixed(3) : ''; }
          ['en','boy','kasaIciAdet','kasaMiktari'].forEach(n=> document.addEventListener('input', function(e){ if(e.target && e.target.name===n && e.target.closest && e.target.closest('#frmKasaStok')) calcKasaDerived(); }));
    
          function readKasaForm(){ if(!f) return null; return {
            id: Date.now().toString(36),
            tarih: f.tarih.value||'',
            islem: f.islemType.value||'giris',
            tasIsmi: f.tasIsmi.value||'',
            kalite: f.kalite.value||'',
            yuzey: f.yuzeyIslem.value||'',
            kalinlik: f.kalinlik.value||'',
            en: f.en.value||'', boy: f.boy.value||'', kasaIciAdet: f.kasaIciAdet.value||'', kasaIciM2: f.kasaIciM2.value||'', kasaMiktari: f.kasaMiktari.value||'', toplamM2: f.toplamM2.value||'', aciklama: f.aciklama.value||'' } }
    
          function saveKasa(){ const rec = readKasaForm(); if(!rec) return; // default tarih to today if empty
            if(!rec.tarih){ const d = new Date(); rec.tarih = d.toISOString().slice(0,10); }
            // convert quantities: for çıkış make kasaMiktari negative
            const q = parseFloat(rec.kasaMiktari)||0; rec.kasaMiktari = (rec.islem==='cikis') ? (-Math.abs(q)) : Math.abs(q);
            const total = parseFloat(rec.toplamM2)||0; rec.toplamM2 = (rec.islem==='cikis') ? (-Math.abs(total)) : Math.abs(total);
            // normalize kalite to uppercase for consistent display
            try{ rec.kalite = (rec.kalite||'').toString().toUpperCase(); }catch(_){ }
            const arr = getKasa(); arr.unshift(rec); setKasa(arr); renderKasaMovements(); renderKasaSummary();
            // schedule remote sync (non-blocking). On failure enqueue for retry.
            try{ scheduleSync(KASA_KEY, rec); }catch(e){ try{ enqueueSync({ key: KASA_KEY, rec: rec }); }catch(_){ } }
            f.reset(); calcKasaDerived(); }
    
          document.getElementById('kasaSaveBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); saveKasa(); });
          document.getElementById('kasaClearBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); f.reset(); calcKasaDerived(); });
    
          function renderKasaMovements(){ const tbody = document.getElementById('kasaMovementsBody'); if(!tbody) return; const arr = getKasa(); 
            // read individual filters
            const fTas = (document.getElementById('kasaFilter_tasIsmi')?.value||'').trim().toLowerCase();
            const fKalinlik = (document.getElementById('kasaFilter_kalinlik')?.value||'').trim().toLowerCase();
            const fKalite = (document.getElementById('kasaFilter_kalite')?.value||'').trim().toLowerCase();
            const fEn = parseFloat((document.getElementById('kasaFilter_en')?.value||'').replace(',', '.'));
            const fBoy = parseFloat((document.getElementById('kasaFilter_boy')?.value||'').replace(',', '.'));
            // filter records
            const filtered = arr.filter(r=>{
              if(fTas && !( (r.tasIsmi||'').toLowerCase().includes(fTas) )) return false;
              if(fKalinlik && !((r.kalinlik||'').toLowerCase().includes(fKalinlik))) return false;
              if(fKalite && !((r.kalite||'').toLowerCase().includes(fKalite))) return false;
              if(!isNaN(fEn)){
                const reng = parseFloat(String(r.en||'').replace(',', '.'));
                if(isNaN(reng) || Math.abs(reng - fEn) > 0.001) return false;
              }
              if(!isNaN(fBoy)){
                const rboy = parseFloat(String(r.boy||'').replace(',', '.'));
                if(isNaN(rboy) || Math.abs(rboy - fBoy) > 0.001) return false;
              }
              // Son 1 Gün filtresi: kayıt tarihi bugün veya son 24 saat içinde ise dahil
              if(oneDayOnly){
                try{
                  const now = new Date();
                  const ymd = (r.tarih||'').toString();
                  const rt = new Date(ymd);
                  const ms = now - rt;
                  const within24h = Number.isFinite(ms) && ms >= 0 && ms <= (24*60*60*1000);
                  const sameCalendarDay = ymd === now.toISOString().slice(0,10);
                  if(!(within24h || sameCalendarDay)) return false;
                }catch(_){ /* tarih parse edilemezse filtre dışı bırakma */ }
              }
              return true;
            });
    
            // Son 5 görünümü: kayıtlar en yeni başta (unshift ile ekleniyor)
            const toRender = showRecentOnly ? filtered.slice(0,5) : filtered;
            // kaydırma sınıfını güncelle
            try{ const wrap = document.getElementById('kasaMovementsWrap'); if(wrap){ wrap.classList.toggle('scroll', !showRecentOnly); } }catch(_){ }
    
            // render rows
            tbody.innerHTML = '';
            toRender.forEach(rec=>{
              const tr = document.createElement('tr');
              tr.innerHTML = `<td>${rec.tarih||''}</td><td>${titleCaseTR(rec.islem||'')}</td><td>${titleCaseTR(rec.tasIsmi||'')}</td><td>${titleCaseTR(rec.kalite||'')}</td><td>${titleCaseTR(rec.yuzey||'')}</td><td>${rec.kalinlik||''}</td><td>${rec.en||''}</td><td>${rec.boy||''}</td><td>${rec.kasaIciAdet||''}</td><td>${rec.kasaIciM2||''}</td><td>${rec.kasaMiktari||''}</td><td>${rec.toplamM2||''}</td><td>${rec.aciklama||''}</td>`;
              const tdAct = document.createElement('td'); tdAct.style.display='flex'; tdAct.style.gap='6px';
              const btnDel = document.createElement('button');
              btnDel.className='btn danger small';
              btnDel.textContent='Sil';
              btnDel.addEventListener('click', function(){
                if(!confirm('Bu kaydı silmek istiyor musunuz?')) return;
                const a=getKasa();
                const i=a.findIndex(x=>x.id===rec.id);
                if(i>=0){
                  a.splice(i,1);
                  setKasa(a);
                  renderKasaMovements();
                  renderKasaSummary();
                  // try remote delete, enqueue on failure
                  try{ (async ()=>{ try{ const r = await syncDelete(KASA_KEY, rec.id); if(!(r && r.ok)) enqueueSync({ key: KASA_KEY, action:'delete', id: rec.id }); }catch(e){ try{ enqueueSync({ key: KASA_KEY, action:'delete', id: rec.id }); }catch(_){ } } })(); }catch(_){ }
                }
              });
              tdAct.appendChild(btnDel);
              tr.appendChild(tdAct);
              tbody.appendChild(tr);
            });
          }
    
          // wire up individual filter inputs to re-render
          ['kasaFilter_tasIsmi','kasaFilter_kalinlik','kasaFilter_kalite','kasaFilter_en','kasaFilter_boy'].forEach(id=>{
            document.getElementById(id)?.addEventListener('input', function(){ renderKasaMovements(); renderKasaSummary(); });
          });
          // clear filters
          document.getElementById('kasaFilterClear')?.addEventListener('click', function(){ ['kasaFilter_tasIsmi','kasaFilter_kalinlik','kasaFilter_kalite','kasaFilter_en','kasaFilter_boy'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; }); renderKasaMovements(); renderKasaSummary(); });
    
          function renderKasaSummary(){
            const body = document.getElementById('kasaSummaryBody'); if(!body) return; const arr = getKasa();
            const fTas = (document.getElementById('kasaFilter_tasIsmi')?.value||'').trim().toLowerCase();
            const fKalinlik = (document.getElementById('kasaFilter_kalinlik')?.value||'').trim().toLowerCase();
            const fKalite = (document.getElementById('kasaFilter_kalite')?.value||'').trim().toLowerCase();
            const fEn = parseFloat((document.getElementById('kasaFilter_en')?.value||'').replace(',', '.'));
            const fBoy = parseFloat((document.getElementById('kasaFilter_boy')?.value||'').replace(',', '.'));
            const summaryFilter = (document.getElementById('kasaSummaryFilter')?.value||'').trim().toLowerCase();
    
            // helper to parse kalinlik into cm numeric value for grouping
            function parseKalinlikToCm(k){
              try{
                if(k===undefined || k===null) return NaN;
                let s = String(k).trim();
                const sLow = s.toLowerCase();
                // normalize decimal comma
                const normalized = s.replace(/,/g, '.');
                // find first numeric token
                const m = normalized.match(/([0-9]+(?:\.[0-9]+)?)/);
                if(!m) return NaN;
                let v = parseFloat(m[1]);
                if(!Number.isFinite(v)) return NaN;
                // explicit units win
                if(/cm\b/i.test(sLow)) return v; // already cm
                if(/mm\b/i.test(sLow)) return v / 10; // mm -> cm
                // heuristic: plain integers like 12,20,25 most likely mm (10,12,20 mm common)
                // assume values between 10 and 30 are mm (convert to cm); values >30 are likely cm
                if(v >= 10 && v <= 30) return v / 10;
                if(v > 30) return v; // unusually large -> assume cm
                // otherwise small numeric (<=9.9) treat as cm
                return v;
              }catch(e){ return NaN; }
            }
    
      // normalizer for name/keys
      function norm(s){ return String(s||'').trim().toLowerCase().replace(/\s+/g,' '); }
    
      // strict stringify for numeric keys: produce consistent fixed-width strings when numeric,
      // otherwise fall back to a normalized token (so empty vs non-empty are distinct)
      function numKey(v){ if(v===undefined||v===null||v==='') return '__EMPTY__'; const n = parseFloat(String(v).replace(',', '.')); if(!Number.isFinite(n)) return '__RAW__'+norm(String(v)); return (Math.round(n * 1000) / 1000).toFixed(3); }
    
      // dimension key for en/boy: detect mm vs cm and canonicalize to cm fixed 3-dec string.
      // This prevents mismatches like "610" (mm) vs "61" (cm).
      function dimKey(v){ if(v===undefined||v===null||v==='') return '__EMPTY__'; const s = String(v).trim(); const sLow = s.toLowerCase(); // preserve original for raw fallback
        // extract first numeric token
        const m = String(s).replace(/\s+/g,'').replace(',', '.').match(/([0-9]+(?:\.[0-9]+)?)/);
        if(!m) return '__RAW__'+norm(s);
        let n = parseFloat(m[1]); if(!Number.isFinite(n)) return '__RAW__'+norm(s);
        // if explicit mm unit or value that looks like mm (greater than 100) -> convert to cm
        if(/mm\b/i.test(sLow) || n > 100){ n = n / 10; }
        return (Math.round(n * 1000) / 1000).toFixed(3);
      }
    
      // canonical kalinlik key: if parse yields a numeric cm value use that (fixed 3 dec),
      // otherwise use normalized raw string prefixed so it doesn't collide with numeric keys
      function kalinlikKey(k){ const km = parseKalinlikToCm(k); if(Number.isFinite(km) && !isNaN(km)) return (Math.round(km * 1000) / 1000).toFixed(3); const raw = norm(k); return raw ? ('RAW::'+raw) : '__EMPTY__'; }
    
      const map = {};
      arr.filter(r=>{
              if(fTas && !( (r.tasIsmi||'').toLowerCase().includes(fTas) )) return false;
              if(fKalinlik && !((r.kalinlik||'').toLowerCase().includes(fKalinlik))) return false;
              if(fKalite && !((r.kalite||'').toLowerCase().includes(fKalite))) return false;
              if(!isNaN(fEn)){
                const reng = parseFloat(String(r.en||'').replace(',', '.'));
                if(isNaN(reng) || Math.abs(reng - fEn) > 0.001) return false;
              }
              if(!isNaN(fBoy)){
                const rboy = parseFloat(String(r.boy||'').replace(',', '.'));
                if(isNaN(rboy) || Math.abs(rboy - fBoy) > 0.001) return false;
              }
              if(summaryFilter){
                const haystack = ((r.tasIsmi||'') + ' ' + (r.kalite||'') + ' ' + (r.yuzey||'')).toLowerCase();
                if(!haystack.includes(summaryFilter)) return false;
              }
              return true;
            }).forEach(r=>{
              // grouping by normalized tasIsmi, kalite, yuzey, kalinlik (cm normalized or raw), en, boy
              const enKey = dimKey(r.en);
              const boyKey = dimKey(r.boy);
              const kKey = kalinlikKey(r.kalinlik);
              const tasKey = norm(r.tasIsmi) || '__EMPTY__';
              const kaliteKey = norm(r.kalite) || '__EMPTY__';
              const yuzeyKey = norm(r.yuzey) || '__EMPTY__';
              const key = [tasKey, kaliteKey, yuzeyKey, kKey, enKey, boyKey].join('||');
    
              if(!map[key]) map[key] = {
                tas: r.tasIsmi||'',
                kalite: (r.kalite||''),
                yuzey: r.yuzey||'',
                kalCm: (function(){ const v = parseKalinlikToCm(r.kalinlik); return Number.isFinite(v) ? v : NaN; })(),
                kalRaw: r.kalinlik||'',
                en: (r.en||''),
                boy: (r.boy||''),
                kasaAdedi: 0,
                toplamM2: 0
              };
              // use project-wide num() parser to correctly handle comma/dot and localized formats
              try{
                const kasaAmtRaw = r.kasaMiktari || r.kasaAdedi || r.kasaAdet || r.adet || r.miktar || 0;
                const toplamRaw = r.toplamM2 || r.totalM2 || r.toplam_m2 || r.m2 || 0;
                const kAmt = !isNaN(num(kasaAmtRaw)) ? num(kasaAmtRaw) : (Number(String(kasaAmtRaw).replace(/,/g,'.')) || 0);
                const tM2 = !isNaN(num(toplamRaw)) ? num(toplamRaw) : (Number(String(toplamRaw).replace(/,/g,'.')) || 0);
                map[key].kasaAdedi += kAmt;
                map[key].toplamM2 += tM2;
              }catch(_){ map[key].kasaAdedi += (parseFloat(r.kasaMiktari||r.kasaAdedi||r.kasaAdet||r.adet||0)||0); map[key].toplamM2 += (parseFloat(r.toplamM2||r.totalM2||r.m2||0)||0); }
            });
    
            body.innerHTML=''; Object.values(map).forEach(v=>{
              // format kalinlik for display: prefer normalized cm with comma as decimal separator
              let kalDisplay = v.kalRaw || '';
              if(Number.isFinite(v.kalCm) && !isNaN(v.kalCm)){
                // If integer cm, show without decimals, else one decimal with comma
                const rounded1 = Math.round(v.kalCm * 10) / 10;
                if(Math.abs(rounded1 - Math.round(rounded1)) < 1e-9){
                  kalDisplay = String(Math.round(rounded1)).replace('.',',') + ' cm';
                } else {
                  kalDisplay = String(rounded1).replace('.',',') + ' cm';
                }
              }
              const tasDisp = titleCaseTR(v.tas||'');
              const kaliteDisp = titleCaseTR(v.kalite||'');
              const yuzeyDisp = titleCaseTR(v.yuzey||'');
              const tr = document.createElement('tr');
              tr.innerHTML = `<td>${tasDisp}</td><td>${kaliteDisp}</td><td>${yuzeyDisp}</td><td>${kalDisplay}</td><td>${String(v.en||'')}</td><td>${String(v.boy||'')}</td><td>${nf3.format(v.kasaAdedi)}</td><td>${nf3.format(v.toplamM2)}</td>`;
              body.appendChild(tr);
            });
          }
    
          // CSV export of movements currently shown
          document.getElementById('kasaExportCsv')?.addEventListener('click', function(){ const arr = getKasa();
            const fTas = (document.getElementById('kasaFilter_tasIsmi')?.value||'').trim().toLowerCase();
            const fKalinlik = (document.getElementById('kasaFilter_kalinlik')?.value||'').trim().toLowerCase();
            const fKalite = (document.getElementById('kasaFilter_kalite')?.value||'').trim().toLowerCase();
            const fEn = parseFloat((document.getElementById('kasaFilter_en')?.value||'').replace(',', '.'));
            const fBoy = parseFloat((document.getElementById('kasaFilter_boy')?.value||'').replace(',', '.'));
            const filtered = arr.filter(r=>{
              if(fTas && !( (r.tasIsmi||'').toLowerCase().includes(fTas) )) return false;
              if(fKalinlik && !((r.kalinlik||'').toLowerCase().includes(fKalinlik))) return false;
              if(fKalite && !((r.kalite||'').toLowerCase().includes(fKalite))) return false;
              if(!isNaN(fEn)){
                const reng = parseFloat(String(r.en||'').replace(',', '.'));
                if(isNaN(reng) || Math.abs(reng - fEn) > 0.001) return false;
              }
              if(!isNaN(fBoy)){
                const rboy = parseFloat(String(r.boy||'').replace(',', '.'));
                if(isNaN(rboy) || Math.abs(rboy - fBoy) > 0.001) return false;
              }
              return true;
            });
            if(!filtered.length){ alert('Dışa aktarılacak kayıt yok'); return; }
            const headers = ['tarih','islem','tasIsmi','kalite','yuzey','kalinlik','en','boy','kasaIciAdet','kasaIciM2','kasaMiktari','toplamM2','aciklama']; const rows = [headers.join(',')]; filtered.forEach(r=>{ rows.push(headers.map(h=> '"'+String(r[h]||'') .replace(/"/g,'""')+'"').join(',')); }); const blob = new Blob([rows.join('\n')], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'kasa_stok_export_'+(new Date().toISOString().slice(0,10))+'.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });
    
          // XLSX import (basic mapping heuristics) - uses vendor/xlsx.full.min.js if present
          document.getElementById('kasaXlsxInput')?.addEventListener('change', function(e){ const file = e.target.files && e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = function(ev){ const data = ev.target.result; let workbook; try{ if(window.XLSX) workbook = XLSX.read(data, {type:'binary'}); else { alert('XLSX kütüphanesi yüklü değil (vendor/xlsx.full.min.js eksik).'); return; } }catch(err){ alert('Dosya okunamadı: '+err.message); return; } const sheetName = workbook.SheetNames[0]; const sheet = workbook.Sheets[sheetName]; const json = XLSX.utils.sheet_to_json(sheet, {defval:''}); if(!json || !json.length){ alert('Sayfada satır bulunamadı'); return; }
              // map headers heuristically
              const mapKey = (h)=> String(h||'').toLowerCase().replace(/\s|\(|\)|\.|\./g,'');
              const first = json[0]; const keys = Object.keys(first); const headerMap = {};
              keys.forEach(k=>{ const m = mapKey(k); if(/tas|taş|tasismi|tas_ismi/.test(m)) headerMap.tasIsmi = k; else if(/kalite|seleksiyon|kalite/.test(m)) headerMap.kalite = k; else if(/yuzey|yuzeyislem|yuzeyişlem/.test(m)) headerMap.yuzey = k; else if(/kalınlık|kalinlik/.test(m)) headerMap.kalinlik = k; else if(/en/.test(m) && /cm/.test(k.toLowerCase())) headerMap.en = k; else if(/boy/.test(m)) headerMap.boy = k; else if(/kasa ?ic|kasaiçi|kasaiçiadet|kasaiciadet|kasa_ici_adet/.test(m)) headerMap.kasaIciAdet = k; else if(/kasa ?ici ?m2|kasaicim2|kasa_içi_m2|kasaicim²/.test(m)) headerMap.kasaIciM2 = k; else if(/kasa ?miktar|kasamiktar|kasa_miktarı/.test(m)) headerMap.kasaMiktari = k; else if(/toplam|toplamm2/.test(m)) headerMap.toplamM2 = k; else if(/tarih/.test(m)) headerMap.tarih = k; });
              // convert rows
              const toImport = json.map(r=>{
                const en = r[headerMap.en]||r['EN(CM)']||'';
                const boy = r[headerMap.boy]||r['BOY(CM)']||'';
                const kasaIciAdet = r[headerMap.kasaIciAdet]||r['KASA İÇI ADET']||'';
                const perKasa = cm2_to_m2_local(en,boy,kasaIciAdet);
                const kasaMiktari = r[headerMap.kasaMiktari] || r['KASA MIKTARI'] || r['KASA MIKTARI'] || 0;
                const total = (!isNaN(perKasa) && perKasa!==0) ? (perKasa * Number(kasaMiktari)) : (r[headerMap.toplamM2]||0);
                return {
                  id: Date.now().toString(36) + Math.random().toString(36).slice(2,8),
                  tarih: r[headerMap.tarih]||'', islem: 'giris', tasIsmi: r[headerMap.tasIsmi]||r['TAŞ ISMI']||'', kalite: r[headerMap.kalite]||r['KALITE']||'', yuzey: r[headerMap.yuzey]||r['YÜZEY İŞLEM']||'', kalinlik: r[headerMap.kalinlik]||r['KALINLIK']||'', en: en||'', boy: boy||'', kasaIciAdet: kasaIciAdet||'', kasaIciM2: (isNaN(perKasa)?'':Number(perKasa).toFixed(3)), kasaMiktari: Number(kasaMiktari)||0, toplamM2: Number(total)||0, aciklama: '' };
              });
              // ensure imported kalite is uppercase
              toImport.forEach(x=>{ try{ x.kalite = (x.kalite||'').toString().toUpperCase(); }catch(_){ } });
              const arr = getKasa(); toImport.reverse().forEach(x=> arr.unshift(x)); setKasa(arr); renderKasaMovements(); renderKasaSummary(); alert('İçe aktarma tamamlandı: '+toImport.length+' satır eklendi');
          };
          reader.readAsBinaryString(file);
          });
    
      // wire summary filter input
      document.getElementById('kasaSummaryFilter')?.addEventListener('input', function(){ renderKasaSummary(); });
      document.getElementById('kasaSummaryClear')?.addEventListener('click', function(){ const el = document.getElementById('kasaSummaryFilter'); if(el) el.value=''; renderKasaSummary(); });
    
      // initial render
      renderKasaMovements(); renderKasaSummary();
        });
    
    /* ==== BODY inline script #25 ==== */
    document.addEventListener('DOMContentLoaded', function(){
          const PLA_KEY = 'v91_plaka_stok_kayitlar';
    
          function getPlaka(){ try{ return JSON.parse(localStorage.getItem(PLA_KEY)||'[]'); } catch(e){ return []; } }
          function setPlaka(arr){ localStorage.setItem(PLA_KEY, JSON.stringify(arr)); window.dispatchEvent(new Event('storage')); }
    
          function readPlakaForm(){ const f = document.getElementById('frmPlakaStok'); if(!f) return null; const obj = {
            id: Date.now().toString(36)+Math.random().toString(36).slice(2,8),
            tarih: (document.getElementById('frmPlakaStok').tarih?.value)||'',
            bundleNo: (document.getElementById('plaka_bundleNo')?.value||'').trim(),
            blokNo: (document.getElementById('plaka_blokNo')?.value||'').trim(),
            fasoncu: (document.getElementById('plaka_fasoncu')?.value||'').trim(),
            ocakIsmi: (document.getElementById('plaka_ocak')?.value||'').trim(),
            tasIsmi: (document.getElementById('plaka_tasIsmi')?.value||'').trim(),
            firmaIsmi: (document.getElementById('plaka_firma')?.value||'').trim(),
            kalinlik: (document.getElementById('plaka_kalinlik')?.value||'').trim(),
            en: (document.getElementById('plaka_en')?.value||''),
            boy: (document.getElementById('plaka_boy')?.value||''),
            adet: Number(document.getElementById('plaka_adet')?.value||0),
            m2: Number(document.getElementById('plaka_m2')?.value||0),
            agirlik: (document.getElementById('plaka_agirlik')?.value||''),
            islem: (document.getElementById('plaka_islem')?.value||'bohca') };
            return obj; }
    
          function clearPlakaForm(){ const f=document.getElementById('frmPlakaStok'); if(!f) return; f.reset(); }
    
      function titleCaseTR(s){ try{ const lower = String(s||'').toLocaleLowerCase('tr-TR'); return lower.replace(/(^|\s+)([\p{L}])/gu, (m,p1,p2)=> p1 + p2.toLocaleUpperCase('tr-TR')); }catch(_){ return String(s||''); } }
    
      function renderPlakaMovements(){ const body = document.getElementById('plakaMovementsBody'); if(!body) return; const arr = getPlaka();
            const fb = (document.getElementById('plakaFilter_bundle')?.value||'').trim().toLowerCase();
            const fTas = (document.getElementById('plakaFilter_tasIsmi')?.value||'').trim().toLowerCase();
            const fKal = (document.getElementById('plakaFilter_kalinlik')?.value||'').trim().toLowerCase();
            const fFirma = (document.getElementById('plakaFilter_firma')?.value||'').trim().toLowerCase();
            const fEn = parseFloat((document.getElementById('plakaFilter_en')?.value||'').replace(',', '.'));
            const fBoy = parseFloat((document.getElementById('plakaFilter_boy')?.value||'').replace(',', '.'));
            const fIslem = (document.getElementById('plakaFilter_islem')?.value||'');
            const filtered = arr.filter(r=>{
              if(fb && !((r.bundleNo||'').toLowerCase().includes(fb))) return false;
              if(fTas && !((r.tasIsmi||'').toLowerCase().includes(fTas))) return false;
              if(fKal && !((r.kalinlik||'').toLowerCase().includes(fKal))) return false;
              if(fFirma && !((r.firmaIsmi||'').toLowerCase().includes(fFirma))) return false;
              if(fIslem && (r.islem||'') !== fIslem) return false;
              if(!isNaN(fEn)){
                const reng = parseFloat(String(r.en||'').replace(',', '.'));
                if(isNaN(reng) || Math.abs(reng - fEn) > 0.001) return false;
              }
              if(!isNaN(fBoy)){
                const rboy = parseFloat(String(r.boy||'').replace(',', '.'));
                if(isNaN(rboy) || Math.abs(rboy - fBoy) > 0.001) return false;
              }
              return true;
            });
            body.innerHTML = '';
            filtered.forEach(r=>{
              const tr = document.createElement('tr');
              const tas = titleCaseTR(r.tasIsmi||'');
              const firma = titleCaseTR(r.firmaIsmi||'');
              const islem = titleCaseTR(r.islem||'');
              const addCell = (txt, right)=>{ const td = document.createElement('td'); if(right) td.style.textAlign='right'; td.textContent = txt; tr.appendChild(td); };
              addCell(r.tarih||''); addCell(r.bundleNo||''); addCell(r.blokNo||''); addCell(tas); addCell(firma); addCell(r.en||''); addCell(r.boy||''); addCell(nf3.format(r.adet||0), true); addCell(nf3.format(r.m2||0), true);
              addCell(islem);
              const tdBtn = document.createElement('td'); const btn = document.createElement('button'); btn.className='btn danger small'; btn.dataset.id = r.id; btn.textContent = 'Sil'; tdBtn.appendChild(btn); tr.appendChild(tdBtn);
              body.appendChild(tr);
            });
            // wire delete
            Array.from(body.querySelectorAll('button[data-id]')).forEach(b=> b.addEventListener('click', function(){ const id = b.dataset.id; if(!confirm('Silinsin mi?')) return; const arr = getPlaka().filter(x=> x.id !== id); setPlaka(arr); try{ (async ()=>{ try{ const r = await syncDelete(PLA_KEY, id); if(!(r && r.ok)) enqueueSync({ key: PLA_KEY, action:'delete', id: id }); }catch(e){ try{ enqueueSync({ key: PLA_KEY, action:'delete', id: id }); }catch(_){ } } })(); }catch(_){ } renderPlakaMovements(); renderPlakaSummary(); }));
          }
    
          function renderPlakaSummary(){ const body = document.getElementById('plakaSummaryBody'); if(!body) return; const arr = getPlaka(); const map = {};
            arr.forEach(r=>{ const tas = titleCaseTR(r.tasIsmi||''); const key = (r.bundleNo||'') + '||' + tas; if(!map[key]) map[key] = { label: (r.bundleNo||'') + ' / ' + tas, adet:0, m2:0 }; map[key].adet += Number(r.adet||0); map[key].m2 += Number(r.m2||0); });
      body.innerHTML=''; Object.values(map).forEach(v=>{ const tr=document.createElement('tr'); const td1 = document.createElement('td'); td1.textContent = v.label; const td2 = document.createElement('td'); td2.textContent = nf3.format(v.adet); const td3 = document.createElement('td'); td3.textContent = nf3.format(v.m2); tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); body.appendChild(tr); }); }
    
          function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;'); }
    
          // bundle temporary lines
          window.currentPlakaBundle = window.currentPlakaBundle || [];
    
      function renderBundleLines(){ const body = document.getElementById('plakaBundleLinesBody'); if(!body) return; body.innerHTML = ''; (window.currentPlakaBundle||[]).forEach((r, idx)=>{ const tr = document.createElement('tr'); const addCell = (txt, right)=>{ const td = document.createElement('td'); if(right) td.style.textAlign='right'; td.textContent = txt; tr.appendChild(td); };
          addCell(r.en||''); addCell(r.boy||''); addCell(nf3.format(r.adet||0), true); addCell(r.blokNo||''); addCell(nf3.format(r.m2||0), true); addCell(r.agirlik||''); addCell(r.islem||''); const tdBtn = document.createElement('td'); const btn = document.createElement('button'); btn.className='btn danger small'; btn.dataset.idx = String(idx); btn.textContent = 'Sil'; tdBtn.appendChild(btn); tr.appendChild(tdBtn); body.appendChild(tr);
        }); Array.from(body.querySelectorAll('button[data-idx]')).forEach(b=> b.addEventListener('click', function(){ const idx = Number(b.dataset.idx); if(isNaN(idx)) return; window.currentPlakaBundle.splice(idx,1); renderBundleLines(); })); }
    
          // auto-calc m2 helper for plaka inputs — EN/Boy are entered in cm; always compute using cm
          (function(){ const enEl = document.getElementById('plaka_en'); const boyEl = document.getElementById('plaka_boy'); const adetEl = document.getElementById('plaka_adet'); const m2El = document.getElementById('plaka_m2');
            function plakaCmCalc(en, boy, adet){
              try{
                // normalize and parse using shared num() helper (accepts ',' or '.')
                const enClean = String(en||'').replace(/[^0-9,\.\-]/g,'');
                const boyClean = String(boy||'').replace(/[^0-9,\.\-]/g,'');
                const enN = num(enClean);
                const boyN = num(boyClean);
                const a = Number(adet) || 0;
                if(isNaN(enN) || isNaN(boyN)) return NaN;
                return (enN * boyN) / 10000 * a; // cm * cm -> m²
              }catch(e){ return NaN; }
            }
            function calc(){ try{ const enV = enEl?.value||''; const boyV = boyEl?.value||''; const adV = adetEl?.value||''; const v = plakaCmCalc(enV, boyV, adV); m2El.value = (!isNaN(v) && v!==0) ? Number(v).toFixed(3) : ''; }catch(_){ } }
            ['input','change'].forEach(ev=>{ enEl?.addEventListener(ev, calc); boyEl?.addEventListener(ev, calc); adetEl?.addEventListener(ev, calc); });
          })();
    
          document.getElementById('plakaAddLineBtn')?.addEventListener('click', function(){
            const dateVal = (document.getElementById('frmPlakaStok')?.tarih?.value||'').trim();
            if(!dateVal){ alert('Lütfen tarih girin'); try{ document.getElementById('frmPlakaStok').tarih.focus(); }catch(_){ } return; }
            const enV = document.getElementById('plaka_en')?.value||''; const boyV = document.getElementById('plaka_boy')?.value||''; const adetV = Number(document.getElementById('plaka_adet')?.value||0); let m2v = Number(document.getElementById('plaka_m2')?.value||0);
            try{
              // compute assuming en/boy are in cm
              const enNum = num(String(enV||'').replace(/[^0-9,\.\-]/g,''));
              const boyNum = num(String(boyV||'').replace(/[^0-9,\.\-]/g,''));
              const a = Number(adetV) || 0;
              const calc = (!isNaN(enNum) && !isNaN(boyNum)) ? (enNum * boyNum) / 10000 * a : NaN;
              if(!isNaN(calc)) m2v = Number(calc);
            }catch(_){ }
      const line = { en: enV, boy: boyV, adet: adetV, blokNo: (document.getElementById('plaka_blokNo')?.value||''), m2: Number(m2v)||0, agirlik: document.getElementById('plaka_agirlik')?.value||'', islem: document.getElementById('plaka_islem')?.value||'bohca' };
            window.currentPlakaBundle.push(line); renderBundleLines(); });
    
          document.getElementById('plakaClearBundleBtn')?.addEventListener('click', function(){ if(!confirm('Geçici satırları temizlemek istiyor musunuz?')) return; window.currentPlakaBundle = []; renderBundleLines(); });
    
      document.getElementById('plakaSaveBundleBtn')?.addEventListener('click', function(){ const dateVal = (document.getElementById('frmPlakaStok')?.tarih?.value||'').trim(); if(!dateVal){ alert('Lütfen tarih girin'); try{ document.getElementById('frmPlakaStok').tarih.focus(); }catch(_){ } return; } const bundleNo = (document.getElementById('plaka_bundleNo')?.value||'').trim(); if(!bundleNo){ alert('Önce Bundle No girin'); return; } const base = { tarih: dateVal, bundleNo: bundleNo, blokNo: (document.getElementById('plaka_blokNo')?.value||'').trim(), fasoncu: (document.getElementById('plaka_fasoncu')?.value||'').trim(), ocakIsmi: (document.getElementById('plaka_ocak')?.value||'').trim(), tasIsmi: (document.getElementById('plaka_tasIsmi')?.value||'').trim(), firmaIsmi: (document.getElementById('plaka_firma')?.value||'').trim(), kalinlik: (document.getElementById('plaka_kalinlik')?.value||'').trim() };
            const lines = window.currentPlakaBundle || [];
            if(!lines.length){ if(!confirm('Geçici satır yok, mevcut form verisini tek satır olarak kaydetmek isterseniz Tamam deyin.')) return; const obj = readPlakaForm(); if(!obj) return; const arr = getPlaka(); arr.unshift(obj); setPlaka(arr); try{ scheduleSync(PLA_KEY, obj); }catch(e){ try{ enqueueSync({ key: PLA_KEY, rec: obj }); }catch(_){ } } renderPlakaMovements(); renderPlakaSummary(); clearPlakaForm(); return; }
            const arr = getPlaka(); const toAdd = lines.map(l=> Object.assign({ id: Date.now().toString(36)+Math.random().toString(36).slice(2,8), en: l.en, boy: l.boy, adet: l.adet, m2: l.m2, agirlik: l.agirlik, islem: l.islem }, base)); // attach base fields
            // add in reverse so first line appears first
            toAdd.reverse().forEach(x=> arr.unshift(x)); setPlaka(arr);
            // schedule remote sync for each added plaka line
            try{
              toAdd.forEach(function(r){
                try{ scheduleSync(PLA_KEY, r); }
                catch(e){ try{ enqueueSync({ key: PLA_KEY, rec: r }); }catch(_){ } }
              });
            }catch(_){ }
            window.currentPlakaBundle = []; renderBundleLines(); renderPlakaMovements(); renderPlakaSummary(); alert('Bundle kaydedildi: '+toAdd.length+' satır eklendi'); });
    
          document.getElementById('plakaFilterClear')?.addEventListener('click', function(){ ['plakaFilter_bundle','plakaFilter_tasIsmi','plakaFilter_kalinlik','plakaFilter_firma','plakaFilter_en','plakaFilter_boy'].forEach(id=> { const el=document.getElementById(id); if(el) el.value=''; }); document.getElementById('plakaFilter_islem').value=''; renderPlakaMovements(); renderPlakaSummary(); });
    
          document.getElementById('plakaExportCsv')?.addEventListener('click', function(){ const arr = getPlaka(); if(!arr.length){ alert('Dışa aktarılacak kayıt yok'); return; } const headers = ['tarih','bundleNo','blokNo','fasoncu','ocakIsmi','tasIsmi','firmaIsmi','kalinlik','en','boy','adet','m2','agirlik','islem']; const rows = [headers.join(',')]; arr.forEach(r=> rows.push(headers.map(h=> '"'+String(r[h]||'').replace(/"/g,'""')+'"').join(','))); const blob = new Blob([rows.join('\n')], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'plaka_stok_export_'+(new Date().toISOString().slice(0,10))+'.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });
    
          document.getElementById('plakaXlsxInput')?.addEventListener('change', function(e){ const file = e.target.files && e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = function(ev){ const data = ev.target.result; let workbook; try{ if(window.XLSX) workbook = XLSX.read(data, {type:'binary'}); else { alert('XLSX kütüphanesi yüklü değil (vendor/xlsx.full.min.js eksik).'); return; } }catch(err){ alert('Dosya okunamadı: '+err.message); return; } const sheetName = workbook.SheetNames[0]; const sheet = workbook.Sheets[sheetName]; const json = XLSX.utils.sheet_to_json(sheet, {defval:''}); if(!json || !json.length){ alert('Sayfada satır bulunamadı'); return; }
              // Heuristik eşleme
              const mapKey = (h)=> String(h||'').toLowerCase().replace(/\s|\(|\)|\.|\./g,'');
              const first = json[0]; const keys = Object.keys(first); const headerMap = {};
              keys.forEach(k=>{ const m = mapKey(k); if(/tarih/.test(m)) headerMap.tarih = k; else if(/bundle|bandil|bandıl/.test(m)) headerMap.bundleNo = k; else if(/blok/.test(m)) headerMap.blokNo = k; else if(/fason/.test(m)) headerMap.fasoncu = k; else if(/ocak/.test(m)) headerMap.ocakIsmi = k; else if(/tas|ta.s|taş|tasismi/.test(m)) headerMap.tasIsmi = k; else if(/firma|company/.test(m)) headerMap.firmaIsmi = k; else if(/kalınlık|kalinlik/.test(m)) headerMap.kalinlik = k; else if(/en/.test(m)) headerMap.en = k; else if(/boy/.test(m)) headerMap.boy = k; else if(/adet/.test(m)) headerMap.adet = k; else if(/m2|m²|m2/.test(m)) headerMap.m2 = k; else if(/agirlik|ağırlık/.test(m)) headerMap.agirlik = k; else if(/islem|işlem/.test(m)) headerMap.islem = k; });
              const toImport = json.map(r=>({ id: Date.now().toString(36)+Math.random().toString(36).slice(2,8), tarih: r[headerMap.tarih]||'', bundleNo: r[headerMap.bundleNo]||'', blokNo: r[headerMap.blokNo]||'', fasoncu: r[headerMap.fasoncu]||'', ocakIsmi: r[headerMap.ocakIsmi]||'', tasIsmi: r[headerMap.tasIsmi]||'', firmaIsmi: r[headerMap.firmaIsmi]||'', kalinlik: r[headerMap.kalinlik]||'', en: r[headerMap.en]||'', boy: r[headerMap.boy]||'', adet: Number(r[headerMap.adet]||0), m2: Number(r[headerMap.m2]||0), agirlik: r[headerMap.agirlik]||'', islem: r[headerMap.islem]||'bohca' }));
              const arr = getPlaka(); toImport.reverse().forEach(x=> arr.unshift(x)); setPlaka(arr);
              // schedule remote sync for imported plaka lines
              try{ toImport.forEach(function(r){ try{ scheduleSync(PLA_KEY, r); }catch(e){ try{ enqueueSync({ key: PLA_KEY, rec: r }); }catch(_){ } } }); }catch(_){ }
              renderPlakaMovements(); renderPlakaSummary(); alert('İçe aktarma tamamlandı: '+toImport.length+' satır eklendi');
          };
          reader.readAsBinaryString(file);
          });
    
          // wire filters to re-render
          ['plakaFilter_bundle','plakaFilter_tasIsmi','plakaFilter_kalinlik','plakaFilter_firma','plakaFilter_en','plakaFilter_boy','plakaFilter_islem'].forEach(id=>{ const el = document.getElementById(id); if(el) el.addEventListener('input', ()=>{ renderPlakaMovements(); renderPlakaSummary(); }); });
    
          // initial render
          renderPlakaMovements(); renderPlakaSummary();
        });
    
    /* ==== BODY inline script #26 ==== */
    (function(){
        const MOZA_KEY = 'v91_moza_kirik';
        function getMoza(){ try{ return JSON.parse(localStorage.getItem(MOZA_KEY)||'[]'); }catch(e){ return []; } }
        function setMoza(a){ localStorage.setItem(MOZA_KEY, JSON.stringify(a)); }
        // Türkçe Title Case yardımcı (görüntüleme amaçlı)
        function titleCaseTR(s){
          try{
            const lower = String(s||'').toLocaleLowerCase('tr-TR');
            return lower.replace(/(^|\s+)([\p{L}])/gu, (m,p1,p2)=> p1 + p2.toLocaleUpperCase('tr-TR'));
          }catch(_){ return String(s||''); }
        }
        function readForm(){ const f=document.getElementById('frmMozaInline'); if(!f) return null; return { id: f.id.value || (Date.now().toString(36)+Math.random().toString(36).slice(2)), paletNo: f.paletNo.value.trim(), tasIsmi: f.tasIsmi.value.trim(), kalinlik: f.kalinlik.value.trim(), yuzey: f.yuzey.value.trim(), kirikDurumu: f.kirikDurumu.value, m2: f.m2.value.trim() }; }
      function render(){ const body=document.getElementById('mozaikKirikBody'); if(!body) return; const arr=getMoza(); body.innerHTML=''; arr.forEach(rec=>{ const tr=document.createElement('tr'); tr.style.borderBottom='1px solid #f1f5f9'; const tas = titleCaseTR(rec.tasIsmi||''); const yuz = titleCaseTR(rec.yuzey||''); const kal = titleCaseTR(rec.kalinlik||''); const kd = titleCaseTR(rec.kirikDurumu||'');
        const addCell = (txt, opts={})=>{ const td = document.createElement('td'); td.style.padding='6px'; if(opts.right) td.style.textAlign='right'; td.textContent = txt; tr.appendChild(td); };
        addCell(rec.paletNo||''); addCell(tas); addCell(kal); addCell(yuz); addCell(kd); addCell(rec.m2||'');
        const tdAct = document.createElement('td'); tdAct.style.padding='6px';
        const btnEdit = document.createElement('button'); btnEdit.className='btn ghost small btnEdit'; btnEdit.textContent='Düzenle'; btnEdit.addEventListener('click', ()=> load(rec));
  const btnDel = document.createElement('button'); btnDel.className='btn danger small btnDel'; btnDel.textContent='Sil'; btnDel.addEventListener('click', ()=>{ if(!confirm('Silinsin mi?')) return; const a=getMoza(); const i=a.findIndex(x=>x.id===rec.id); if(i>=0){ a.splice(i,1); setMoza(a); try{ (async ()=>{ try{ const r = await syncDelete(MOZA_KEY, rec.id); if(!(r && r.ok)) enqueueSync({ key: MOZA_KEY, action:'delete', id: rec.id }); }catch(e){ try{ enqueueSync({ key: MOZA_KEY, action:'delete', id: rec.id }); }catch(_){ } } })(); }catch(_){ } render(); } });
        tdAct.appendChild(btnEdit); tdAct.appendChild(btnDel); tr.appendChild(tdAct);
        body.appendChild(tr); }); }
      function load(rec){ const f=document.getElementById('frmMozaInline'); if(!f) return; f.id.value=rec.id||''; f.paletNo.value=rec.paletNo||''; f.tasIsmi.value=rec.tasIsmi||''; f.kalinlik.value=sanitizeDimensionVal(rec.kalinlik||''); f.yuzey.value=rec.yuzey||''; f.kirikDurumu.value=rec.kirikDurumu||'Az Kırıklı'; f.m2.value=sanitizeDimensionVal(rec.m2||''); }
        document.addEventListener('DOMContentLoaded', function(){
          document.getElementById('btnSaveMozaInline')?.addEventListener('click', function(){ const rec=readForm(); if(!rec || !rec.paletNo){ alert('Palet No zorunlu'); return; } const a=getMoza(); const i=a.findIndex(x=>x.id===rec.id); if(i>=0) a[i]=rec; else a.unshift(rec); setMoza(a); // schedule remote sync
            try{ scheduleSync(MOZA_KEY, rec); }catch(e){ try{ enqueueSync({ key: MOZA_KEY, rec: rec }); }catch(_){ } }
            render(); document.getElementById('frmMozaInline').reset(); });
          document.getElementById('btnNewMozaInline')?.addEventListener('click', ()=>{ document.getElementById('frmMozaInline').reset(); });
          render();
        });
      })();
    
    /* ==== BODY inline script #27 ==== */
    (function(){
      const KASA_KEY = 'v91_kasa_stok_kayitlar';
      const weekTableBody = document.getElementById('kasali_week_table_body');
      const weekCanvas = document.getElementById('kasaliWeekChart');
      const stokChartCanvas = document.getElementById('stokRaporChart');
      const stokSummary = document.getElementById('stokRaporSummary');
      const stoneBody = document.getElementById('stoneBreakdownBody');
      const stoneSizeBody = document.getElementById('stoneBySizeBody');
      const stoneSurfaceBody = document.getElementById('stoneBySurfaceBody');
      const stoneMini = document.getElementById('stoneMiniSummary');
      const sizeMini = document.getElementById('sizeMiniSummary');
      const surfaceMini = document.getElementById('surfaceMiniSummary');
      const stoneChartCanvas = document.getElementById('stoneBreakdownChart');
      let weekChartInstance = null; let periodChartInstance = null; let stoneChartInstance = null;
    
            // Chart.js yükleme garantisi (Stok Raporu özelinde)
            function ensureChartJs(cb){
              try{
                if(window.Chart) return cb && cb();
                let s = document.getElementById('chartjs_cdn_loader');
                if(s){ s.addEventListener('load', function(){ try{ cb && cb(); }catch(_){ } }, { once:true }); return; }
                s = document.createElement('script'); s.id='chartjs_cdn_loader'; s.src='vendor/chartjs/chart.umd.min.js';
                s.onload = function(){ try{ cb && cb(); }catch(_){ } };
                s.onerror = function(){ try{ cb && cb(); }catch(_){ } };
                document.head.appendChild(s);
              }catch(_){ cb && cb(); }
            }
    
            function getAllKasa(){ try{ return JSON.parse(localStorage.getItem(KASA_KEY)||'[]'); }catch(e){ return []; } }
    
            function isoDate(d){ return (new Date(d)).toISOString().slice(0,10); }
    
            function weekStartIso(date){ const d = new Date(date); // compute Monday
              const day = (d.getDay()+6)%7; d.setDate(d.getDate()-day); return d.toISOString().slice(0,10); }
    
            function buildWeekArray(focusDate){ const fd = focusDate ? new Date(focusDate) : new Date(); const startIso = weekStartIso(fd); const start = new Date(startIso); const days = []; for(let i=0;i<7;i++){ const cur = new Date(start); cur.setDate(start.getDate()+i); days.push(cur.toISOString().slice(0,10)); } return days; }
    
            function sumForDay(records, dayIso){ let kasa=0, m2=0; records.forEach(r=>{ try{ if((r.tarih||'').slice(0,10)===dayIso){ kasa += Number(r.kasaMiktari||0); m2 += Number(num(r.toplamM2)||0); } }catch(_){}}); return { kasa, m2 }; }
    
            function renderWeek(focusDate){ try{ const recs = getAllKasa(); const days = buildWeekArray(focusDate); weekTableBody.innerHTML=''; const labels = []; const data = []; const dataM2 = [];
              days.forEach(d=>{ const s = sumForDay(recs,d); const tr = document.createElement('tr'); const dayLabel = d + ' (' + ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'][(new Date(d)).getDay() === 0 ? 6 : ((new Date(d)).getDay()-1)] + ')';
                const td1 = document.createElement('td'); td1.style.padding='6px'; td1.textContent = dayLabel; tr.appendChild(td1);
                const td2 = document.createElement('td'); td2.style.padding='6px'; td2.style.textAlign='right'; td2.textContent = String(s.kasa); tr.appendChild(td2);
                const td3 = document.createElement('td'); td3.style.padding='6px'; td3.style.textAlign='right'; td3.textContent = isNaN(s.m2) ? '' : Number(s.m2).toFixed(3); tr.appendChild(td3);
                weekTableBody.appendChild(tr);
                labels.push(d); data.push(s.kasa); dataM2.push(Number(isNaN(s.m2)?0:s.m2.toFixed(3))); });
              // draw small bar chart
              if(window.Chart){ try{ if(weekChartInstance) weekChartInstance.destroy(); weekChartInstance = new Chart(weekCanvas.getContext('2d'), { type:'bar', data:{ labels: labels.map(l=>l.slice(5)), datasets:[ { label:'Kasa', data: data, backgroundColor:'#60a5fa' } ] }, options:{ responsive:true, maintainAspectRatio:false, scales:{ x:{ ticks:{ maxRotation:0 } }, y:{ beginAtZero:true } } } }); }catch(e){ console.error(e); } }
            }catch(e){ console.error('renderWeek', e); } }
    
            function renderPeriod(period, focus){ try{ const recs = getAllKasa(); const fd = focus ? new Date(focus) : new Date(); let labels=[], vals=[];
              if(period==='weekly'){ const days = buildWeekArray(fd); labels = days.map(d=>d); days.forEach(d=>{ const s=sumForDay(recs,d); vals.push(Number(s.m2.toFixed(3))); }); }
              else if(period==='monthly'){ const y = fd.getFullYear(), m = fd.getMonth(); const daysInMonth = new Date(y,m+1,0).getDate(); for(let i=1;i<=daysInMonth;i++){ const iso = new Date(y,m,i).toISOString().slice(0,10); labels.push(String(i)); const s=sumForDay(recs,iso); vals.push(Number(s.m2.toFixed(3))); } }
              else if(period==='yearly'){ const y = fd.getFullYear(); for(let i=0;i<12;i++){ const iso = new Date(y,i,1).toISOString().slice(0,10); labels.push((i+1)+'.'); // month label
                // sum month
                let monthSum = 0; const days = new Date(y,i+1,0).getDate(); for(let d=1;d<=days;d++){ const iso2 = new Date(y,i,d).toISOString().slice(0,10); monthSum += Number(num(getAllKasa().filter(r=> (r.tarih||'').slice(0,10)===iso2).reduce((s,rr)=> s + Number(num(rr.toplamM2)||0),0)).toFixed(3) || 0); }
                vals.push(Number(monthSum.toFixed(3))); } }
    
              // render main period chart in stokRaporChart
              if(window.Chart){ try{ if(periodChartInstance) periodChartInstance.destroy(); periodChartInstance = new Chart(stokChartCanvas.getContext('2d'), { type:'line', data:{ labels: labels, datasets:[ { label:'Toplam M²', data: vals, borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.08)', fill:true } ] }, options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true } } } }); }catch(e){ console.error(e); } }
    
              // summary
              try{ const totalKasa = recs.reduce((s,r)=> s + Number(r.kasaMiktari||0),0); const totalM2 = recs.reduce((s,r)=> s + Number(num(r.toplamM2)||0),0); if(stokSummary) stokSummary.innerHTML = `<div style="display:flex;gap:12px;align-items:center;"><div><strong>Toplam Kayıtlı Kasa:</strong> ${totalKasa}</div><div><strong>Toplam M²:</strong> ${totalM2.toFixed(3)}</div></div>`; }catch(_){ }
            }catch(e){ console.error('renderPeriod', e); } }
    
            function renderStoneBreakdown(period, focus){
              try{
                const recs = getAllKasa();
                const map = {};
                // aggregate per stone name and collect metadata for representative values
                recs.forEach(r=>{
                  const key = (r.tasIsmi||'').trim() || '(bilinmiyor)';
                  if(!map[key]) map[key] = { kasa:0, m2:0, kalinliks:{}, kalites:{}, yuzeys:{}, ens:[], boys:[] };
                  map[key].kasa += Number(r.kasaMiktari||0);
                  map[key].m2 += Number(num(r.toplamM2)||0);
                  const k = (r.kalinlik||'').trim(); if(k) map[key].kalinliks[k] = (map[key].kalinliks[k]||0) + 1;
                  const q = (r.kalite||'').trim(); if(q) map[key].kalites[q] = (map[key].kalites[q]||0) + 1;
                  const y = (r.yuzey||r.yuzeyIslem||'').trim(); if(y) map[key].yuzeys[y] = (map[key].yuzeys[y]||0) + 1;
                  const enVal = num(r.en||''); if(!isNaN(enVal)) map[key].ens.push(enVal);
                  const boyVal = num(r.boy||''); if(!isNaN(boyVal)) map[key].boys.push(boyVal);
                });
    
                function modeFromCount(obj){ try{ if(!obj) return ''; const keys = Object.keys(obj); if(!keys.length) return ''; let best = keys[0], bestV = obj[best]; keys.forEach(k=>{ if(obj[k] > bestV){ best = k; bestV = obj[k]; } }); return best; }catch(_){ return ''; } }
                function avg(arr){ if(!arr||!arr.length) return NaN; return arr.reduce((s,v)=>s+v,0)/arr.length; }
    
                let rows = Object.keys(map).sort().map(k=>{
                  const it = map[k];
                  return {
                    kname: k,
                    kasa: it.kasa,
                    m2: it.m2,
                    kalinlik: modeFromCount(it.kalinliks),
                    kalite: modeFromCount(it.kalites),
                    yuzey: modeFromCount(it.yuzeys),
                    avgEn: avg(it.ens),
                    avgBoy: avg(it.boys)
                  };
                });
    
                // Filter & sort controls
                const q = (document.getElementById('stone_search')?.value||'').trim().toLowerCase();
                if(q){ rows = rows.filter(r=> (r.kname||'').toLowerCase().includes(q) || (r.kalite||'').toLowerCase().includes(q) || (r.yuzey||'').toLowerCase().includes(q) || (r.kalinlik||'').toLowerCase().includes(q) ); }
                const sortSel = (document.getElementById('stone_sort')?.value)||'m2_desc';
                if(sortSel==='m2_desc'){ rows.sort((a,b)=> (b.m2||0) - (a.m2||0)); }
                else if(sortSel==='kasa_desc'){ rows.sort((a,b)=> (b.kasa||0) - (a.kasa||0)); }
                else if(sortSel==='name_asc'){ rows.sort((a,b)=> String(a.kname).localeCompare(String(b.kname),'tr')); }
    
                // render table rows (simplified 3 columns)
                const maxM2 = rows.reduce((m,r)=> Math.max(m, Number(r.m2)||0), 0) || 1;
                const maxKasa = rows.reduce((m,r)=> Math.max(m, Number(r.kasa)||0), 0) || 1;
                let totalKasa = 0, totalM2 = 0;
                stoneBody.innerHTML = rows.map(r=>{
                  totalKasa += Number(r.kasa)||0; totalM2 += Number(r.m2)||0;
                  const pctM2 = Math.max(0, Math.min(100, (Number(r.m2)||0) / maxM2 * 100));
                  const pctKasa = Math.max(0, Math.min(100, (Number(r.kasa)||0) / maxKasa * 100));
                  return `<tr>
                    <td>${escapeHtml(r.kname)}</td>
                    <td class="rk-metric"><div class="rk-bar" style="width:${pctKasa}%"></div><span class="rk-val">${(r.kasa||0).toLocaleString('tr-TR')}</span></td>
                    <td class="rk-metric"><div class="rk-bar" style="width:${pctM2}%"></div><span class="rk-val">${(Number(r.m2)||0).toLocaleString('tr-TR',{maximumFractionDigits:3})}</span></td>
                  </tr>`;
                }).join('') + `<tr class="stone-total"><td style="text-align:right;padding:8px 8px;">Toplam</td><td style="text-align:right;padding:8px 8px;">${totalKasa.toLocaleString('tr-TR')}</td><td style="text-align:right;padding:8px 8px;">${totalM2.toLocaleString('tr-TR',{maximumFractionDigits:3})}</td></tr>`;
                if(stoneMini){ stoneMini.textContent = `Toplam Kasa: ${totalKasa.toLocaleString('tr-TR')}  |  Toplam M²: ${totalM2.toLocaleString('tr-TR',{maximumFractionDigits:3})}`; }
    
                // Ölçü bazlı tablo (en x boy veya tek ölçü)
                function round1(v){ return Math.round((Number(v)||0)*10)/10; }
                function fmt1(v){ let s = String(round1(v)); if(s.indexOf('.')>=0) s = s.replace('.',','); else s = s+",0"; return s; }
                const sizeMap = {};
                recs.forEach(r=>{
                  const enVal = num(r.en||'');
                  const boyVal = num(r.boy||'');
                  let label='(ölçü yok)';
                  if(!isNaN(enVal) && !isNaN(boyVal) && boyVal>0){ label = `${fmt1(enVal)}×${fmt1(boyVal)}`; }
                  else if(!isNaN(enVal)){ label = `${fmt1(enVal)}`; }
                  else if(!isNaN(boyVal)){ label = `${fmt1(boyVal)}`; }
                  if(!sizeMap[label]) sizeMap[label] = { kasa:0, m2:0 };
                  sizeMap[label].kasa += Number(r.kasaMiktari||0);
                  sizeMap[label].m2 += Number(num(r.toplamM2)||0);
                });
                const sizeRows = Object.keys(sizeMap).map(k=> ({ label:k, kasa:sizeMap[k].kasa, m2:sizeMap[k].m2 })).sort((a,b)=> (b.m2||0) - (a.m2||0));
                const sizeMaxM2 = sizeRows.reduce((m,r)=> Math.max(m, Number(r.m2)||0), 0) || 1;
                const sizeMaxKasa = sizeRows.reduce((m,r)=> Math.max(m, Number(r.kasa)||0), 0) || 1;
                let sizeTK=0, sizeTM=0;
                if(stoneSizeBody){ stoneSizeBody.innerHTML = sizeRows.map(r=>{ sizeTK+=Number(r.kasa)||0; sizeTM+=Number(r.m2)||0; const pM=Math.max(0,Math.min(100,(Number(r.m2)||0)/sizeMaxM2*100)); const pK=Math.max(0,Math.min(100,(Number(r.kasa)||0)/sizeMaxKasa*100)); return `<tr>
                  <td>${escapeHtml(r.label)}</td>
                  <td class="rk-metric"><div class="rk-bar" style="width:${pK}%"></div><span class="rk-val">${(r.kasa||0).toLocaleString('tr-TR')}</span></td>
                  <td class="rk-metric"><div class="rk-bar" style="width:${pM}%"></div><span class="rk-val">${(Number(r.m2)||0).toLocaleString('tr-TR',{maximumFractionDigits:3})}</span></td>
                </tr>`; }).join('') + `<tr class="stone-total"><td style="text-align:right;padding:8px 8px;">Toplam</td><td style="text-align:right;padding:8px 8px;">${sizeTK.toLocaleString('tr-TR')}</td><td style="text-align:right;padding:8px 8px;">${sizeTM.toLocaleString('tr-TR',{maximumFractionDigits:3})}</td></tr>`; }
                if(sizeMini){ sizeMini.textContent = `Toplam Kasa: ${sizeTK.toLocaleString('tr-TR')}  |  Toplam M²: ${sizeTM.toLocaleString('tr-TR',{maximumFractionDigits:3})}`; }
    
                // Yüzey işlem bazlı tablo
                const surfaceMap = {};
                recs.forEach(r=>{ const y = (r.yuzey||r.yuzeyIslem||'(bilinmiyor)').trim() || '(bilinmiyor)'; if(!surfaceMap[y]) surfaceMap[y] = { kasa:0, m2:0 }; surfaceMap[y].kasa += Number(r.kasaMiktari||0); surfaceMap[y].m2 += Number(num(r.toplamM2)||0); });
                const surfRows = Object.keys(surfaceMap).map(k=> ({ label:k, kasa:surfaceMap[k].kasa, m2:surfaceMap[k].m2 })).sort((a,b)=> (b.m2||0) - (a.m2||0));
                const surfMaxM2 = surfRows.reduce((m,r)=> Math.max(m, Number(r.m2)||0), 0) || 1;
                const surfMaxKasa = surfRows.reduce((m,r)=> Math.max(m, Number(r.kasa)||0), 0) || 1;
                let surfTK=0, surfTM=0;
                if(stoneSurfaceBody){ stoneSurfaceBody.innerHTML = surfRows.map(r=>{ surfTK+=Number(r.kasa)||0; surfTM+=Number(r.m2)||0; const pM=Math.max(0,Math.min(100,(Number(r.m2)||0)/surfMaxM2*100)); const pK=Math.max(0,Math.min(100,(Number(r.kasa)||0)/surfMaxKasa*100)); return `<tr>
                  <td>${escapeHtml(r.label)}</td>
                  <td class="rk-metric"><div class="rk-bar" style="width:${pK}%"></div><span class="rk-val">${(r.kasa||0).toLocaleString('tr-TR')}</span></td>
                  <td class="rk-metric"><div class="rk-bar" style="width:${pM}%"></div><span class="rk-val">${(Number(r.m2)||0).toLocaleString('tr-TR',{maximumFractionDigits:3})}</span></td>
                </tr>`; }).join('') + `<tr class="stone-total"><td style="text-align:right;padding:8px 8px;">Toplam</td><td style="text-align:right;padding:8px 8px;">${surfTK.toLocaleString('tr-TR')}</td><td style="text-align:right;padding:8px 8px;">${surfTM.toLocaleString('tr-TR',{maximumFractionDigits:3})}</td></tr>`; }
                if(surfaceMini){ surfaceMini.textContent = `Toplam Kasa: ${surfTK.toLocaleString('tr-TR')}  |  Toplam M²: ${surfTM.toLocaleString('tr-TR',{maximumFractionDigits:3})}`; }
    
                // render chart: bar for m2, line for kasa count (dual axis)
                try{
                  if(window.Chart && stoneChartCanvas){
                    const ctx = stoneChartCanvas.getContext('2d');
                    const labels = rows.map(r=> r.kname);
                    const dataM2 = rows.map(r=> Number(r.m2.toFixed(3)));
                    const dataKasa = rows.map(r=> Number(r.kasa));
                    if(stoneChartInstance) stoneChartInstance.destroy();
                    stoneChartInstance = new Chart(ctx, {
                      type: 'bar',
                      data: {
                        labels: labels,
                        datasets: [
                          { type: 'bar', label: 'Toplam M²', data: dataM2, backgroundColor: 'rgba(59,130,246,0.7)', yAxisID: 'y' },
                          { type: 'line', label: 'Kasa Adet', data: dataKasa, borderColor: 'rgba(16,185,129,0.9)', backgroundColor: 'rgba(16,185,129,0.06)', yAxisID: 'y1', fill: false, tension: 0.2 }
                        ]
                      },
                      options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        scales: {
                          y: { type: 'linear', position: 'left', beginAtZero: true, title: { display: true, text: 'M²' } },
                          y1: { type: 'linear', position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'Kasa' } }
                        },
                        plugins: { legend: { position: 'top' } }
                      }
                    });
                  }
                }catch(chartErr){ console.error('stone chart render failed', chartErr); }
    
              }catch(e){ console.error('renderStoneBreakdown', e); }
            }
    
            function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    
            // wire controls
            (function wire(){ const weekFocus = document.getElementById('kasali_week_focus'); const periodSelect = document.getElementById('kasali_period_select'); const periodFocus = document.getElementById('kasali_period_focus'); const refresh = document.getElementById('kasali_refresh'); const stoneFocus = document.getElementById('stone_period_focus'); const stonePeriod = document.getElementById('stone_period_select'); const stoneRefresh = document.getElementById('stone_refresh');
              const today = new Date(); const isoToday = today.toISOString().slice(0,10);
              if(weekFocus && !weekFocus.value) weekFocus.value = isoToday;
              if(periodFocus && !periodFocus.value) periodFocus.value = isoToday;
              if(stoneFocus && !stoneFocus.value) stoneFocus.value = isoToday;
    
              function doAll(){
                ensureChartJs(function(){
                  renderWeek(weekFocus?.value||isoToday);
                  renderPeriod(periodSelect?.value||'weekly', periodFocus?.value||isoToday);
                  renderStoneBreakdown(stonePeriod?.value||'monthly', stoneFocus?.value||isoToday);
                });
              }
              // initial
              doAll();
              // expose a global helper so other code (tab switch handlers) can trigger a redraw
              // charts may be created while the section is hidden; calling this when the section
              // becomes visible forces a proper re-render/rescale.
              try{ window.refreshStokRaporGrafik = doAll; }catch(_){ }
    
              [weekFocus, periodSelect, periodFocus].forEach(el=> el && el.addEventListener('change', doAll));
              if(refresh) refresh.addEventListener('click', doAll);
              if(stoneRefresh) stoneRefresh.addEventListener('click', ()=> ensureChartJs(()=> renderStoneBreakdown(stonePeriod?.value||'monthly', stoneFocus?.value||isoToday)) );
              document.getElementById('stone_search')?.addEventListener('input', ()=> ensureChartJs(()=> renderStoneBreakdown(stonePeriod?.value||'monthly', stoneFocus?.value||isoToday)) );
              document.getElementById('stone_sort')?.addEventListener('change', ()=> ensureChartJs(()=> renderStoneBreakdown(stonePeriod?.value||'monthly', stoneFocus?.value||isoToday)) );
              document.getElementById('stone_export')?.addEventListener('click', function(){
                try{
                  const table = document.getElementById('stoneBreakdownBody')?.closest('table'); if(!table) return;
                  const headers = Array.from(table.querySelectorAll('thead th')).map(th=> (th.textContent||'').trim());
                  const rows = [headers];
                  Array.from(document.querySelectorAll('#stoneBreakdownBody tr')).forEach(tr=>{
                    // skip total row if present
                    if(tr.classList.contains('stone-total')) return;
                    const tds = Array.from(tr.querySelectorAll('td'));
                    const cols = tds.map((td,i)=>{
                      if(i===1||i===2||i===3){ return (td.textContent||'').trim(); }
                      const span = td.querySelector('.rk-val'); return span ? span.textContent.trim() : (td.textContent||'').trim();
                    });
                    rows.push(cols);
                  });
                  const csv = rows.map(r=> r.map(c=> '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
                  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob);
                  const a=document.createElement('a'); a.href=url; a.download='tas_bazli_dagilim.csv'; a.click(); URL.revokeObjectURL(url);
                }catch(e){ console.error('stone export', e); }
              });
    
              // Ölçü CSV
              document.getElementById('size_export')?.addEventListener('click', function(){
                try{
                  const body = document.getElementById('stoneBySizeBody'); if(!body) return;
                  const table = body.closest('table');
                  const headers = Array.from(table.querySelectorAll('thead th')).map(th=> (th.textContent||'').trim());
                  const rows = [headers];
                  Array.from(body.querySelectorAll('tr')).forEach(tr=>{
                    if(tr.classList.contains('stone-total')) return;
                    const tds = Array.from(tr.querySelectorAll('td'));
                    const cols = tds.map(td=>{ const span = td.querySelector('.rk-val'); return span? span.textContent.trim() : (td.textContent||'').trim(); });
                    rows.push(cols);
                  });
                  const csv = rows.map(r=> r.map(c=> '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
                  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob);
                  const a=document.createElement('a'); a.href=url; a.download='olcu_bazli_dagilim.csv'; a.click(); URL.revokeObjectURL(url);
                }catch(e){ console.error('size export', e); }
              });
    
              // Yüzey CSV
              document.getElementById('surface_export')?.addEventListener('click', function(){
                try{
                  const body = document.getElementById('stoneBySurfaceBody'); if(!body) return;
                  const table = body.closest('table');
                  const headers = Array.from(table.querySelectorAll('thead th')).map(th=> (th.textContent||'').trim());
                  const rows = [headers];
                  Array.from(body.querySelectorAll('tr')).forEach(tr=>{
                    if(tr.classList.contains('stone-total')) return;
                    const tds = Array.from(tr.querySelectorAll('td'));
                    const cols = tds.map(td=>{ const span = td.querySelector('.rk-val'); return span? span.textContent.trim() : (td.textContent||'').trim(); });
                    rows.push(cols);
                  });
                  const csv = rows.map(r=> r.map(c=> '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
                  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob);
                  const a=document.createElement('a'); a.href=url; a.download='yuzey_bazli_dagilim.csv'; a.click(); URL.revokeObjectURL(url);
                }catch(e){ console.error('surface export', e); }
              });
    
              // Stone içi subtabs (Taş / Ölçü / Yüzey)
              const stoneTabsBar = document.getElementById('stone-subtabs');
              function setStoneTab(tab){
                ['stone_tab_tas','stone_tab_olcu','stone_tab_yuzey'].forEach(id=>{
                  const el = document.getElementById(id); if(el) el.style.display = (id===tab)?'':'none';
                });
                if(stoneTabsBar){ Array.from(stoneTabsBar.querySelectorAll('.subtab')).forEach(b=> b.classList.toggle('active', b.dataset.sub===tab)); }
                const showStoneCtrls = (tab==='stone_tab_tas');
                const showSizeCtrls = (tab==='stone_tab_olcu');
                const showSurfaceCtrls = (tab==='stone_tab_yuzey');
                const lblSearch = document.getElementById('stone_search')?.closest('label'); if(lblSearch) lblSearch.style.display = showStoneCtrls?'':'none';
                const lblSort = document.getElementById('stone_sort')?.closest('label'); if(lblSort) lblSort.style.display = showStoneCtrls?'':'none';
                const btnCsv = document.getElementById('stone_export'); if(btnCsv) btnCsv.style.display = showStoneCtrls?'':'none';
                const sizeCsv = document.getElementById('size_export'); if(sizeCsv) sizeCsv.style.display = showSizeCtrls?'':'none';
                const surfCsv = document.getElementById('surface_export'); if(surfCsv) surfCsv.style.display = showSurfaceCtrls?'':'none';
              }
              if(stoneTabsBar){
                stoneTabsBar.addEventListener('click', function(ev){ const btn = ev.target.closest('.subtab'); if(!btn) return; setStoneTab(btn.dataset.sub); });
                setStoneTab('stone_tab_tas');
              }
    
              // storage listener to auto-refresh when kasa changes
              window.addEventListener('storage', function(e){ if(e.key === KASA_KEY){ try{ doAll(); }catch(_){ } } });
            })();
          })();
    
    /* ==== BODY inline script #28 ==== */
    (function(){
          const wrapper = document.getElementById('rapor_grafik_stok-content'); if(!wrapper) return;
          const tabs = Array.from(wrapper.querySelectorAll('#rapor_grafik_stok-subtabs .subtab'));
          const cards = Array.from(wrapper.querySelectorAll(':scope > .rapor-subcard'));
          function show(sub){
            tabs.forEach(t=> t.classList.toggle('active', t.dataset.sub===sub));
            cards.forEach(c=> c.style.display = (c.id === sub+'-content') ? '' : 'none');
            if(sub==='maliyet_personel'){
              try{ document.dispatchEvent(new CustomEvent('maliyet_personel_activated')); }catch(_){ }
            }
          }
          tabs.forEach(t=> t.addEventListener('click', function(){ show(t.dataset.sub); }));
          const first = tabs.find(t=> t.classList.contains('active')) || tabs[0]; if(first) show(first.dataset.sub);
        })();
    
    /* ==== BODY inline script #29 ==== */
    (function(){
        // Badıllı Ürün raporu: Ensar vs diğerleri + Ensar içi plaka dağılımı (m²)
        const PLA_KEY = 'v91_plaka_stok_kayitlar';
        const mainCanvas = document.getElementById('badilliRaporChart');
        const plateCanvas = document.getElementById('badilliPlateChart');
        const othersCanvas = document.getElementById('badilliOthersChart');
        const topNSelect = document.getElementById('badilli_topn_select');
        const othersBtn = document.getElementById('badilli_show_others');
        const summaryEl = document.getElementById('badilliRaporSummary');
        if(!summaryEl) return;
        let mainChartInstance = null, plateChartInstance = null, othersChartInstance = null;
        let currentFirmMap = {}, currentEnsarKey = 'Ensar';
    
        function parseNum(v){ if(v===null||v===undefined) return 0; return Number(String(v).replace(/,/g,'.')) || 0; }
        function loadData(){ try{ return JSON.parse(localStorage.getItem(PLA_KEY)||'[]'); }catch(_){ return []; } }
    
        function renderOthers(topN=10){ try{
          const keys = Object.keys(currentFirmMap).filter(k=> k !== currentEnsarKey);
          const arr = keys.map(k=> ({k, m2: currentFirmMap[k]||0})).sort((a,b)=> b.m2 - a.m2).slice(0, topN);
          const labels = arr.map(x=> x.k);
          const data = arr.map(x=> x.m2);
          if(window.Chart && othersCanvas){ try{ if(othersChartInstance) othersChartInstance.destroy(); }catch(_){ }
            othersChartInstance = new Chart(othersCanvas.getContext('2d'), { type:'bar', data:{ labels: labels, datasets:[{ label:'m²', data: data, backgroundColor:'rgba(234,88,12,0.85)' }] }, options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true } }, plugins:{ legend:{ display:false } } } }); }
        }catch(e){ console.error('renderOthers', e); } }
    
        function renderBadilli(){ try{
            const recs = loadData();
            // aggregate by firma
            const firmMap = {};
            recs.forEach(r=>{ const f = ((r.firmaIsmi||'').trim()) || '(bilinmiyor)'; firmMap[f] = (firmMap[f]||0) + parseNum(r.m2); });
            const firmKeys = Object.keys(firmMap);
            const ensarKey = firmKeys.find(k=> k.toLowerCase()==='ensar') || firmKeys.find(k=> k.toLowerCase().includes('ensar')) || 'Ensar';
            const ensarM2 = firmMap[ensarKey] || 0;
            const othersM2 = firmKeys.reduce((s,k)=> s + (k===ensarKey?0:firmMap[k]), 0);
    
            // keep current snapshot for others rendering
            currentFirmMap = firmMap; currentEnsarKey = ensarKey;
    
            // main doughnut chart: Ensar vs Diğerleri
            try{
              if(window.Chart && mainCanvas){ try{ if(mainChartInstance) mainChartInstance.destroy(); }catch(_){ }
                mainChartInstance = new Chart(mainCanvas.getContext('2d'), {
                  type: 'doughnut',
                  data: { labels: [ensarKey, 'Diğerleri'], datasets: [{ data: [ensarM2, othersM2], backgroundColor: ['#10b981', '#60a5fa'] }] },
                  options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
                });
    
                // clicking the 'Diğerleri' slice shows top-N firms
                mainCanvas.addEventListener('click', function(evt){ try{
                  if(!mainChartInstance) return; const pts = mainChartInstance.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true); if(!pts || !pts.length) return; const idx = pts[0].index; const label = mainChartInstance.data.labels[idx]; if(label && label !== currentEnsarKey){ const n = Number(topNSelect?.value||10); renderOthers(n); }
                }catch(_){ }
                });
              }
            }catch(e){ console.error('badilli main chart', e); }
    
            // Ensar plate breakdown
            const ensarPlates = {};
            recs.forEach(r=>{ const f = (r.firmaIsmi||'').toLowerCase(); if(f.includes('ensar')){ const t = ((r.tasIsmi||'(bilinmiyor)').trim()); ensarPlates[t] = (ensarPlates[t]||0) + parseNum(r.m2); } });
            const plateLabels = Object.keys(ensarPlates).sort();
            const plateData = plateLabels.map(l=> ensarPlates[l]);
            try{
              if(window.Chart && plateCanvas){ try{ if(plateChartInstance) plateChartInstance.destroy(); }catch(_){ }
                plateChartInstance = new Chart(plateCanvas.getContext('2d'), { type:'bar', data:{ labels: plateLabels, datasets:[{ label:'m²', data: plateData, backgroundColor:'rgba(59,130,246,0.85)' }] }, options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true } }, plugins:{ legend:{ display:false } } } }); }
            }catch(e){ console.error('badilli plate chart', e); }
    
            // summary HTML
            const totalM2 = firmKeys.reduce((s,k)=> s + (firmMap[k]||0), 0);
            const firms = firmKeys.map(k=> ({k, m2: firmMap[k]||0})).sort((a,b)=> b.m2 - a.m2);
            let html = `<div style="display:flex;gap:12px;flex-wrap:wrap;"><div><strong>Toplam M² (Plaka):</strong> ${Number(totalM2).toFixed(3)}</div><div><strong>${escapeHtml(ensarKey)} M²:</strong> ${Number(ensarM2).toFixed(3)}</div><div><strong>Diğerleri M²:</strong> ${Number(othersM2).toFixed(3)}</div></div>`;
            html += '<h5 style="margin:8px 0 4px;">Firma Bazlı Dağılım</h5><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:6px">Firma</th><th style="text-align:right;padding:6px">m²</th></tr></thead><tbody>';
            firms.forEach(f=> html += `<tr><td style="padding:6px">${escapeHtml(f.k)}</td><td style="padding:6px;text-align:right">${Number(f.m2).toFixed(3)}</td></tr>`);
            html += '</tbody></table>';
            if(plateLabels.length){ html += '<h5 style="margin:8px 0 4px;">Ensar Plaka Türleri (m²)</h5><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:6px">Plaka</th><th style="text-align:right;padding:6px">m²</th></tr></thead><tbody>'; plateLabels.forEach((l,i)=> html += `<tr><td style="padding:6px">${escapeHtml(l)}</td><td style="padding:6px;text-align:right">${Number(plateData[i]).toFixed(3)}</td></tr>`); html += '</tbody></table>'; }
            else { html += '<div style="margin-top:8px;color:#6b7280">Ensar için plaka kaydı bulunamadı.</div>'; }
            summaryEl.innerHTML = html;
    
        }catch(e){ console.error('renderBadilli', e); } }
    
        function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    
      // ensure Chart.js then initial render
  function ensureChartJs(cb){ try{ if(window.Chart) return cb && cb(); let s=document.getElementById('chartjs_cdn_loader'); if(s){ s.addEventListener('load', ()=> cb && cb(), { once:true }); return; } s=document.createElement('script'); s.id='chartjs_cdn_loader'; s.src='vendor/chartjs/chart.umd.min.js'; s.onload=()=> cb && cb(); s.onerror=()=> cb && cb(); document.head.appendChild(s); }catch(_){ cb && cb(); } }
      ensureChartJs(function(){ try{ renderBadilli(); }catch(_){ } });
    
        // wire Top N button
      try{ if(othersBtn) othersBtn.addEventListener('click', function(){ const n = Number(topNSelect?.value||10); try{ ensureChartJs(()=> renderOthers(n)); }catch(e){ console.error(e); } }); }catch(_){ }
    
        // refresh on storage changes relevant to plaka
        window.addEventListener('storage', function(e){ if(e.key === PLA_KEY){ try{ renderBadilli(); }catch(_){ } } });
    
        // also hook into the existing refreshStokRaporGrafik global so when the stok tab is shown the report updates
        try{ if(window.refreshStokRaporGrafik){ const orig = window.refreshStokRaporGrafik; window.refreshStokRaporGrafik = function(){ try{ orig(); }catch(_){ } try{ renderBadilli(); }catch(_){ } }; } }catch(_){ }
    
      })();
    
    /* ==== BODY inline script #30 ==== */
    (function(){
            document.addEventListener('DOMContentLoaded', function(){
              const printBtn = document.getElementById('btnPrintEtiket');
              const addKasaChk = document.getElementById('etiket_add_kasa');
              const kasaCountInput = document.getElementById('etiket_kasa_count');
              const adetInput = document.getElementById('etiketAdet');
              const preview = document.getElementById('etiket_preview_area');
              const TOAST_ID = 'etiket_toast_msg';
              function todayISO(){ const d=new Date(); return d.toISOString().slice(0,10); }
    
              function showToast(msg, timeout=2500){
                let t = document.getElementById(TOAST_ID);
                if(!t){ t = document.createElement('div'); t.id = TOAST_ID; t.style.position='fixed'; t.style.right='12px'; t.style.bottom='12px'; t.style.background='#111'; t.style.color='#fff'; t.style.padding='8px 12px'; t.style.borderRadius='6px'; t.style.zIndex = 99999; t.style.boxShadow='0 2px 8px rgba(0,0,0,0.3)'; document.body.appendChild(t); }
                t.textContent = msg; t.style.opacity = '1';
                clearTimeout(t._to); t._to = setTimeout(()=>{ t.style.opacity='0'; }, timeout);
              }
    
              // Backup/restore helper for kasa form to avoid clobbering user input
              function backupFormValues(form){
                if(!form) return null; const data = {}; Array.from(form.elements || []).forEach(el=>{ if(el.name) data[el.name]=el.value; }); return data;
              }
              function restoreFormValues(form, snapshot){ if(!form || !snapshot) return; Array.from(form.elements||[]).forEach(el=>{ if(el.name && (el.name in snapshot)) el.value = snapshot[el.name]; }); }
    
              // Simple debounce/disable to avoid duplicate kasa additions
              function brieflyDisable(btn, ms=1200){ if(!btn) return; btn.disabled = true; setTimeout(()=>{ btn.disabled = false; }, ms); }
    
              if(!printBtn) return;
              // debug sample data inserter
              const sampleBtn = document.getElementById('btnFillSampleKasa');
              if(sampleBtn){ sampleBtn.addEventListener('click', function(){ try{
                const K = 'v91_kasa_stok_kayitlar'; const now = new Date(); const arr = JSON.parse(localStorage.getItem(K)||'[]');
                const sample = [
                  { id: 's1-'+Date.now().toString(36), tarih: now.toISOString().slice(0,10), islem: 'giris', tasIsmi: 'IVORY BEIGE', kalite:'standard', yuzey:'honlu', kalinlik:'1,2 cm', en:'610', boy:'610', kasaIciAdet:'80', kasaIciM2:'29.768', kasaMiktari:1, toplamM2:'29.768', aciklama:'Örnek veri' },
                  { id: 's2-'+(Date.now()+1).toString(36), tarih: now.toISOString().slice(0,10), islem: 'giris', tasIsmi: 'PURE CREAM', kalite:'classic', yuzey:'cilalı', kalinlik:'2 cm', en:'305', boy:'610', kasaIciAdet:'40', kasaIciM2:'15.2', kasaMiktari:2, toplamM2:'30.4', aciklama:'Örnek veri' }
                ];
                sample.reverse().forEach(s=> arr.unshift(s)); localStorage.setItem(K, JSON.stringify(arr));
                try{ if(typeof renderKasaMovements === 'function') renderKasaMovements(); if(typeof renderKasaSummary === 'function') renderKasaSummary(); }catch(_){ }
                alert('Örnek kasa verisi eklendi. Kasa listesi güncellendi.');
              }catch(e){ console.error(e); alert('Eklenemedi: '+e.message); } }); }
              // preview controls
              const zoomInput = document.getElementById('etiket_zoom');
              const zoomLabel = document.getElementById('etiket_zoom_label');
              const marginSelect = document.getElementById('etiket_margin_select');
              const alignSelect = document.getElementById('etiket_align_select');
              // restore saved align selection (persisted)
              try{ const savedAlign = localStorage.getItem('v91_etiket_preview_align'); if(savedAlign && alignSelect) alignSelect.value = savedAlign; }catch(_){ }
    
              // show/enable kasa count input only when checkbox is checked
              try{
                function updateKasaCountUI(){
                  if(!kasaCountInput) return;
                  if(addKasaChk && addKasaChk.checked){ kasaCountInput.disabled = false; kasaCountInput.style.opacity = '1'; }
                  else { kasaCountInput.disabled = true; kasaCountInput.style.opacity = '0.45'; }
                }
                // wire checkbox change
                if(addKasaChk) addKasaChk.addEventListener('change', updateKasaCountUI);
                // initial state
                setTimeout(updateKasaCountUI, 20);
              }catch(_){ }
    
              function applyPreviewSettings(){
                try{
                  const sheet = document.querySelector('#etiket_preview_area .etiket-sheet');
                  if(!sheet) return;
                  // zoom only for preview
                  const z = Math.max(50, Math.min(150, parseInt(zoomInput?.value||'100',10)||100));
                  sheet.style.transform = `scale(${z/100})`;
                  if(zoomLabel) zoomLabel.textContent = z + '%';
                  // alignment classes
                  sheet.classList.remove('align-center','align-top-left','align-top-right');
                  const a = (alignSelect && alignSelect.value) ? alignSelect.value : 'center';
                  if(a==='center') sheet.classList.add('align-center'); else if(a==='top-left') sheet.classList.add('align-top-left'); else sheet.classList.add('align-top-right');
                  // set transform origin based on alignment so zoom centers correctly
                  try{
                    if(a==='center') sheet.style.transformOrigin = 'top center';
                    else if(a==='top-right') sheet.style.transformOrigin = 'top right';
                    else sheet.style.transformOrigin = 'top left';
                  }catch(_){ sheet.style.transformOrigin = 'top left'; }
                  // ensure kasa row alignment when center is selected
                  try{
                    const kasaRow = sheet.querySelector('.kasa-row');
                    if(kasaRow){
                      if(a==='center'){
                        kasaRow.style.display = 'flex'; kasaRow.style.justifyContent = 'space-between'; kasaRow.querySelector('.kasa-metraj').style.textAlign = 'right'; kasaRow.querySelector('.kasa-adet').style.textAlign = 'left';
                      }else{
                        // fallback: grid with two columns (default)
                        kasaRow.style.display = 'grid'; kasaRow.style.gridTemplateColumns = '1fr 1fr'; kasaRow.querySelector('.kasa-metraj').style.textAlign = a==='top-right' ? 'right' : 'center'; kasaRow.querySelector('.kasa-adet').style.textAlign = a==='top-left' ? 'left' : 'center';
                      }
                    }
                  }catch(_){ }
                  // persist align selection so center remains saved
                  try{ if(alignSelect && alignSelect.value) localStorage.setItem('v91_etiket_preview_align', alignSelect.value); }catch(_){ }
                }catch(e){ console.error('applyPreviewSettings', e); }
              }
              // wire preview controls
              if(zoomInput) zoomInput.addEventListener('input', applyPreviewSettings);
              if(alignSelect) alignSelect.addEventListener('change', applyPreviewSettings);
              // expose for React to call after it renders
              try{ window.applyPreviewSettings = applyPreviewSettings; }catch(_){ }
              // run initially
              setTimeout(()=>{ applyPreviewSettings(); }, 120);
    
              printBtn.addEventListener('click', function(e){
                e.preventDefault();
                // prevent accidental double-run
                brieflyDisable(printBtn, 1200);
    
                const copies = Math.max(1, parseInt(adetInput?.value||'1',10) || 1);
                const kasaCount = Math.max(1, parseInt(document.getElementById('etiket_kasa_count')?.value || '1',10) || 1);
                const content = preview ? preview.innerHTML : '';
                // open a new window with repeated labels for printing
                let w;
                try{ w = window.open('','_blank','scrollbars=yes'); }catch(_){ w = null; }
                if(!w){ alert('Yeni pencere açılamadı - popup engelleyici olabilir. Etiketleri kopyalayıp yeni sekmede yazdırmayı deneyin.'); return; }
                const doc = w.document;
                const selectedMargin = (marginSelect && marginSelect.value) ? marginSelect.value : '5mm';
                const style = `<style>
                  @page { size: A6; margin: ${selectedMargin}; }
                  body{font-family:Arial,Helvetica,sans-serif;margin:0;}
                  .page{page-break-after:always; width:105mm; height:148mm; display:flex; align-items:center; justify-content:center;}
                  .page .etiket-sheet{ width:105mm; height:148mm; box-sizing:border-box; padding:${selectedMargin}; }
                  @media print{ html,body{width:105mm;height:148mm;} .page{page-break-after:always;} }
                </style>`;
                let bodyHtml = '';
                for(let i=0;i<copies;i++){ bodyHtml += `<div class="page">${content}</div>`; }
                doc.open(); doc.write('<!doctype html><html><head><meta charset="utf-8"><title>Etiketler</title>' + style + '</head><body>' + bodyHtml + '</body></html>'); doc.close();
                try{
                  // ensure the new window gets focus and print dialog is opened
                  w.focus();
                  // close the print window automatically after printing completes (user may cancel)
                  try{ w.onafterprint = function(){ try{ w.close(); }catch(_){ } }; }catch(_){ }
                  // some browsers may not fire onafterprint on popup windows; also listen for visibility change
                  try{ w.addEventListener && w.addEventListener('focus', function onF(){ /* noop - keep window responsive */ }); }catch(_){ }
                }catch(_){ }
                // call print slightly later to allow rendering; keep inside a timeout
                setTimeout(()=>{ try{ w.focus(); w.print(); }catch(_){ } }, 400);
    
                // ensure preview settings are applied (in case controls changed)
                setTimeout(applyPreviewSettings, 40);
    
                // If user opted in, add one kasa to stock (kasaMiktari = 1)
                try{
                  if(addKasaChk && addKasaChk.checked){
                    const f = document.getElementById('frmKasaStok');
                    const fields = (typeof window.getEtiketFields === 'function') ? window.getEtiketFields() : { urun: (document.getElementById('etiket_field_urun')?.value||''), urunEn: (document.getElementById('etiket_field_urunEn')?.value||''), metraj: (document.getElementById('etiket_field_metraj')?.value||''), adet: (document.getElementById('etiket_field_adet')?.value||'') };
                    const productName = fields.urun || fields.urunEn || '';
                    const perKasaAdet = fields.adet || '';
    
                    if(f){
                      const snap = backupFormValues(f);
                      try{
                        // basic fields
                        if(f.tarih) f.tarih.value = todayISO();
                        if(f.islemType) f.islemType.value = 'giris';
                        if(f.tasIsmi){
                          try{
                            // extract portion before surface processing (e.g. before HONLU / CILALI / POLISHED)
                            const prod = String(productName || '');
                            const surfaceRegex = /\b(HONLU|HONED|CILALI|CİLALI|FIRÇALI|FIRCA|BRUSHED|POLISHED|SATEN|HONING)\b/i;
                            const qualityRegex = /\b(STANDARD|CLASSIC|PREMIUM|NORMAL)\b/i;
                            const si = prod.search(surfaceRegex);
                            let base = (si >= 0) ? prod.slice(0, si).trim() : prod.trim();
                            // remove quality token from base if present
                            base = base.replace(qualityRegex, '').replace(/\s{2,}/g,' ').trim();
                            // also remove trailing separators
                            base = base.replace(/[\-–_,;:\/]$/,'').trim();
                            f.tasIsmi.value = base;
                          }catch(_){ f.tasIsmi.value = String(productName||''); }
                        }
                        // try to extract kalite and yuzey from product name
                        try{
                          const qm = String(productName||'').match(/\b(STANDARD|CLASSIC|PREMIUM|NORMAL)\b/i);
                          const sm = String(productName||'').match(/\b(HONLU|HONED|CILALI|CİLALI|FIRÇALI|FIRCA|BRUSHED|POLISHED)\b/i);
                          if(f.kalite) f.kalite.value = qm ? qm[1].toUpperCase() : (f.kalite.value||'');
                          if(f.yuzeyIslem) f.yuzeyIslem.value = sm ? (sm[1].toUpperCase()) : (f.yuzeyIslem.value||'');
                        }catch(_){ }
    
                        // parse dimensions from product name (formats like 12X610X610 MM or 12x610x610)
                        let thickness_mm = null, en_mm = null, boy_mm = null;
                        try{
                          const m = String(productName||'').match(/(\d{1,3})\s*[x×]\s*(\d{2,4})\s*[x×]\s*(\d{2,4})\s*(mm)?/i) || String(productName||'').match(/(\d{1,3})\s*[x×]\s*(\d{2,4})\s*[x×]\s*(\d{2,4})/i);
                          if(m){ thickness_mm = parseInt(m[1],10); en_mm = parseInt(m[2],10); boy_mm = parseInt(m[3],10); }
                        }catch(_){ }
    
                        if(thickness_mm !== null && f.kalinlik){
                          try{
                            let kalinlikDisplay = '';
                            if(thickness_mm >= 10){
                              // thickness parsed in mm -> convert to cm
                              const cm = thickness_mm / 10;
                              if(thickness_mm % 10 === 0){
                                kalinlikDisplay = String(Math.round(cm)) + ' cm';
                              }else{
                                // use one decimal, comma as decimal separator
                                kalinlikDisplay = (cm.toFixed(1)).replace('.',',') + ' cm';
                              }
                            }else{
                              // treat single-digit as cm already
                              kalinlikDisplay = String(thickness_mm) + ' cm';
                            }
                            f.kalinlik.value = kalinlikDisplay;
                          }catch(_){ f.kalinlik.value = String(thickness_mm); }
                        }
                        if(en_mm !== null && f.en) f.en.value = String(Number(en_mm) / 10);
                        if(boy_mm !== null && f.boy) f.boy.value = String(Number(boy_mm) / 10);
    
                        // kasa içi adet from fields/adet
                        if(f.kasaIciAdet) f.kasaIciAdet.value = perKasaAdet || (f.kasaIciAdet.value||'');
                        if(f.kasaMiktari) f.kasaMiktari.value = String(kasaCount);
    
                        // compute per-box m2 if we have en/boy/kasaIciAdet
                        try{
                          const en_cm = parseFloat(String(f.en?.value||'').replace(',', '.'));
                          const boy_cm = parseFloat(String(f.boy?.value||'').replace(',', '.'));
                          const adetVal = parseInt(String(f.kasaIciAdet?.value||''),10) || 0;
                          if(!isNaN(en_cm) && !isNaN(boy_cm) && adetVal){
                            const perKasa = (en_cm * boy_cm) / 10000 * adetVal; // this matches calcKasaDerived's approach
                            if(f.kasaIciM2) f.kasaIciM2.value = Number(perKasa).toFixed(3);
                            const total = perKasa * Number(f.kasaMiktari?.value||1);
                            if(f.toplamM2) f.toplamM2.value = Number(total).toFixed(3);
                          }
                        }catch(_){ }
    
                        if(f.aciklama) f.aciklama.value = 'Etiket Bas: ' + copies + ' adet (Stoğa ' + kasaCount + ' kasa)';
    
                        // dispatch input events so attached listeners (calcKasaDerived) run and keep consistency
                        ['en','boy','kasaIciAdet','kasaMiktari'].forEach(n=>{
                          try{ const el = f[n]; if(el){ const ev = new Event('input', { bubbles:true }); el.dispatchEvent(ev); } }catch(_){ }
                        });
    
                        // trigger existing save handler by clicking the button (saveKasa is inside another scope)
                        document.getElementById('kasaSaveBtn')?.click();
                        showToast('Stoğa ' + kasaCount + ' kasa eklendi');
                      }catch(err){ console.error('Kasa ekleme (form) sırasında hata', err); showToast('Kasa eklenemedi'); }
                      // restore previous user inputs after a short delay to allow save handler to read them
                      setTimeout(()=>{ try{ restoreFormValues(f, snap); }catch(_){ } }, 900);
                    }else{
                      // fallback: write directly to localStorage using same key
                      try{
                        const KASA_KEY = 'v91_kasa_stok_kayitlar';
                        const arr = JSON.parse(localStorage.getItem(KASA_KEY)||'[]');
                        // try to parse metraj (may include unit like " M²") and normalize to m2 with 3 decimals
                        let rawMetraj = (fields.metraj||'') + '';
                        let perKasaM2 = NaN;
                        try{
                          const cleaned = String(rawMetraj).replace(/\s/g,'').replace(',', '.').replace(/[^0-9.\-]/g,'');
                          const n = parseFloat(cleaned);
                          if(Number.isFinite(n)) perKasaM2 = n;
                        }catch(_){ perKasaM2 = NaN; }
                        const kasaIciM2 = (!isNaN(perKasaM2)) ? Number(perKasaM2).toFixed(3) : '';
                        const kasaMiktariNum = Math.max(1, parseInt(document.getElementById('etiket_kasa_count')?.value || '1',10) || 1);
                        const toplamM2Num = (!isNaN(perKasaM2)) ? Number((perKasaM2 * kasaMiktariNum).toFixed(3)) : 0;
                        // attempt to extract and format thickness similar to form logic
                        let recKalinlik = '';
                        try{
                          const m2 = String(productName||'').match(/(\d{1,3})\s*[x×]\s*(\d{2,4})\s*[x×]\s*(\d{2,4})\s*(mm)?/i) || String(productName||'').match(/(\d{1,3})\s*[x×]\s*(\d{2,4})\s*[x×]\s*(\d{2,4})/i);
                          if(m2){ const t = parseInt(m2[1],10); if(!isNaN(t)){ if(t>=10){ const cm = t/10; recKalinlik = (t%10===0) ? String(Math.round(cm)) + ' cm' : (cm.toFixed(1)).replace('.',',') + ' cm'; } else { recKalinlik = String(t) + ' cm'; } } }
                        }catch(_){ recKalinlik = ''; }
                        const rec = {
                          id: Date.now().toString(36),
                          tarih: todayISO(),
                          islem: 'giris',
                          tasIsmi: productName,
                          kalite: '',
                          yuzey: '',
                          kalinlik: recKalinlik,
                          en: '',
                          boy: '',
                          kasaIciAdet: perKasaAdet||'',
                          kasaIciM2: kasaIciM2,
                          kasaMiktari: kasaMiktariNum,
                          toplamM2: toplamM2Num,
                          aciklama: 'Etiket Bas: ' + copies + ' adet'
                        };
                        arr.unshift(rec);
                        localStorage.setItem(KASA_KEY, JSON.stringify(arr));
                        try{ if(typeof renderKasaMovements === 'function') renderKasaMovements(); if(typeof renderKasaSummary === 'function') renderKasaSummary(); }catch(_){ }
                        showToast('Stoğa 1 kasa eklendi');
                      }catch(err){ console.error('Kasa ekleme (localStorage) sırasında hata', err); showToast('Kasa eklenemedi'); }
                    }
                    // briefly disable the checkbox to avoid duplicate intent
                    brieflyDisable(addKasaChk, 1200);
                  }
                }catch(e){ console.error('Etiket bas / kasa ekleme hatası', e); showToast('Kasa eklenemedi'); }
              });
            });
          })();
    
    /* ==== BODY inline script #31 ==== */
    (function(){
          // If React didn't load from CDN within 1500ms, inject local vendor stubs from /vendor
          setTimeout(function(){
            try{
              if(typeof window.React === 'undefined' || typeof window.ReactDOM === 'undefined'){
                var s1 = document.createElement('script'); s1.src = '/vendor/react.production.min.js'; s1.async = false; document.head.appendChild(s1);
                var s2 = document.createElement('script'); s2.src = '/vendor/react-dom.production.min.js'; s2.async = false; document.head.appendChild(s2);
                console.warn('React CDN failed or blocked; injected local vendor fallbacks.');
              }
            }catch(e){ console.error('React fallback injection failed', e); }
          }, 1500);
        })();
    
    /* ==== BODY inline script #32 ==== */
    (function(){
            // If the current logo image is low-resolution, replace it at runtime with the embedded high-res default
            function swapIfLowRes(){
              try{
                var el = document.getElementById('etiketLogoPreview');
                if(!el) return;
                // naturalWidth exists for <img>
                var nat = el.naturalWidth || 0;
                console.log('Etiket: logo naturalWidth=', nat);
                // if natural width is small (e.g. < 200px), swap to embedded default if available
                if(nat > 0 && nat < 200 && window.ETIKET_EMBEDDED_LOGO){
                  console.log('Etiket: düşük çözünürlüklü logo tespit edildi, embedded default ile değiştiriliyor');
                  el.src = window.ETIKET_EMBEDDED_LOGO;
                  // stil: CSS kontrol etsin (responsive). Sadece görünümü garanti etmek için merkezleme uygula.
                  el.style.setProperty('width','auto','important');
                  el.style.setProperty('max-width','140px','important');
                  el.style.setProperty('max-height','60px','important');
                  el.style.setProperty('margin-left','0','important');
                  el.style.setProperty('margin-right','0','important');
                  el.style.setProperty('display','block','important');
                }
              }catch(e){console.error(e);} 
            }
            document.addEventListener('DOMContentLoaded', function(){ setTimeout(swapIfLowRes,100); });
            window.addEventListener('etiketLogoChanged', function(){ setTimeout(swapIfLowRes,200); });
          })();
    
    /* ==== BODY inline script #33 ==== */
    (function(){
            function enforceLogo(){
              try{
                var el = document.getElementById('etiketLogoPreview');
                if(!el) return;
                // CSS'in belirlediği responsive sınırlarla hizala
                el.style.setProperty('width','auto','important');
                el.style.setProperty('height','auto','important');
                el.style.setProperty('max-width','140px','important');
                el.style.setProperty('max-height','60px','important');
                el.style.setProperty('margin-left','0','important');
                el.style.setProperty('margin-right','0','important');
                el.style.setProperty('display','block','important');
              }catch(e){/* ignore */}
            }
            document.addEventListener('DOMContentLoaded', enforceLogo);
            window.addEventListener('etiketLogoChanged', function(){ setTimeout(enforceLogo, 50); });
            // observe React root in case component re-renders and replaces the node
            try{
              var root = document.getElementById('reactEtiketEditorRoot');
              if(root && window.MutationObserver){
                new MutationObserver(function(){ enforceLogo(); }).observe(root, { childList:true, subtree:true, attributes:true });
              }
            }catch(_){ }
          })();
    
    /* ==== BODY inline script #34 ==== */
    (function(){
            const LOGO_KEY = 'v91_etiket_logo';
            const inp = document.getElementById('etiketLogoFile');
            if(!inp) return;
            inp.addEventListener('change', function(){
              const f = this.files && this.files[0]; if(!f) return;
              const reader = new FileReader();
              reader.onload = function(ev){
                try{
                  localStorage.setItem(LOGO_KEY, ev.target.result);
                  window.dispatchEvent(new CustomEvent('etiketLogoChanged', { detail: ev.target.result }));
                  console.log('Etiket: logo uploaded and saved to localStorage');
                }catch(e){
                  console.error('Etiket: logo save failed', e);
                }
              };
              reader.readAsDataURL(f);
            });
          })();
    
    /* ==== BODY inline script #35 ==== */
    (function(){
            try{
              const LOGO_KEY = 'v91_etiket_logo';
              const val = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWQAAACNCAMAAAC3+fDsAAAAllBMVEX///9WdIJccHyFlqKisburucKTpK+aqrV1iJRYbXn7/Pz3+PlRcH/u7+9dcX3d4eOdqK/T19rn6epSaHVleIOAmqd7ipS/xstxgo1mgIzs7e2UpKydrLaFmaLM0tWTn6fg5umzwMelt8CJoa2yu8COmqLO1ttdeYevur/Ey8/X3+OmsLZIanp+kJ2tvsaSqbRJYW8+Y3THqAckAAAVRElEQVR4nO2diYKiuraGtcABYgTigIWIIDgAZdn3/V/urjAmYdTynNu3mn/v3buLIcBHWFMCNRoNGjRo0KBBgwYNGjRo0P9LqT2XDXpdCCNxkVqzbNDrAp4EI77jqhg0UH6bVIzCQ4ixyi3DRkAGyu8S8Aw+F583i0GKMHbm1z3hyQ96VcAzvo7Hi6tddlxYFlwX4/F8oPwWIezux4kWBw3jbBnaLxbJMm2g/HOB6b0vxhnlq0ORgvkg969s0cK0BsP8M6nYCj9zxhSpByYDY21eLhvHlcBj0DNC2EpMb0l5rGFCsMdCHu+1gfLrgug4XnCM5yZ2TVPDzuGLWXowBsP8oiADifYsYqDpYMM82bKDNXbNYh4OeclLAvfm3Mcc471mhZPJZDadmZjcxoyt/rwNOfYLAsbmJ2+OY4uYkwTydDoRV+8Hyk8LXB7bVWn4FiDNo4wnNkCe2hoT2yWmxBoM83NCYHQZ10bNLpjjyaSEPJ05mOxZkzEf3N8zoi7vwDOWIKKYcJCnU5NYNzaInodDXtJb1OVxgTBYXELCnHFikxN5Gg7nnPsbynI9BdGxx7u8zxhr5qQKeSobyDmwm+pD9tdLNAO58ubYxJE3qYM8tUOs6ey2h6Es10PU5fGZ9N3Bl8mkHjKYDIsErGG+D+6vU7T4w1lj6JuWM2mGPJ24mKshfZpDxNwq6vL46HixR8SctEGe2gbWJPa+TIYcu0WQgXhfXFhxveUZSDPk6RRCN50x4wt7CDIaBeY4FjKQEEci4hrIEDGjmLk5X/vBMNcLMhDjwEfHB8MyqoxrIE9NbLC3Z3EPB8o1AsZC0W2815gMpNSpBvINO/wz8Gn+I4YZGY7Wtzup2DL5sOIaE010eb0hjxfXf8P9OXocxLrWa1twefEn7/JMq+ry+kMe/xvZX6hrSEXGMeqxLcL4IBQ2NVxnjp+BPD78+ukCRNeC8/GMDb3zoaUz3fhuPJ5jMQMpJVcZT2OrBvLi0/nllJ3bKLZGRoBuRseWYI4dwVTscSUDmXi5JrItalbbk+HZ+N2TMtTQHMV6fCdq4LRvWSm6jT9vFqmYY88lubQa8SFcifl3Fz+dYBRr+GihoL0n0wyEKwiN56EVVV2eZxEndJp1W9RBHn/Fv3lShqYjE4+M0I1J22a06Ma7vLthXWrCCs/SDtdPUfNM8Ndaxr98UgYKbi78z4jDlo3oJOPKsD8Jv2vcHYW8GC8W7GSXBaMGxsmT8XsjZhwcA/N2NFuuj07u5s3xV0yqLo+B/JJ+c/aH3NALScuTCoxvwrNtYrc+A/kJ5MX49kSQ4Zrx+b7dSvub0WMfFOrSdnvWTdywATF12tz9rAct7cFBj9DO9nzWb6HVeVTowHCGcfpDqy2EsIKfhTX+NLBxqmecQm63C836oqNSnacO56vtlT+rlZJotVrNK8+hvkr1R6ebG9ti4z+7ahSlknj5J9sgaW8X1JwFcqTyoHSzP8u9UI4wlOywEnVwrpQ0ulp3Xw+4PKFrssP+dZD3Fb/HqKMzz3tkf6p2VlYfrOBCBMx6tmYFkN2jorDbHoUuSHShOdhmKWJGznqlfHyI2505zEa+HCAjM9te2XUyhgzkzifSDUW3ArKlGaAiZgs5CelMlTLN/toffxysV+LVAk2Jq77kkBV95OxEhBIXSFXWZ+1xG5F9FXHS1tJkKBvLbOnZQnHeaidkYMzPMR5fb8Std3mZDJpzGDWKYLmF7l125Gq25yVYZ/ol20M5O1BAjsNltQPqTDc1mPVsj19tmQ5PzuyR+AfDrIOs3ZgTa2dMi278kPRn2FR0yyVT2bPZrJJUg7RuyOMrzUuab/txVV7ferf+KHoYR7mAvF3X9MBlGa+SncI0t1srZXt60UdR3hxslGy1LPu1siwfoRJyXB62AzK4PKHoNjew0854UlMWKtUH8vh6bDHM5VP4sXfoQ2NuiyXb8nJLKgUc5nlXzkVXPuZLVzo052pakONR1kUO7OTLVuvYSLZy9iXEcwXyx3pd3tFWyFWX93XQcIs5fhdkyEsaKTv5ZQCCtLur1q3sewU7/YMR+LFzHMQS85jnt0PLO7KSB24qkfJFerYRzokqR7d4eS4s7u26uLcF5GxNGmy0RBd02J/3UouY4I5u/CbI46tR7/7UbQG0tJhqUCws+h4LuQg9osI0rHJ3FWRYVl55EJL126K/a8UCNi655ZSXQS1kMD+6F5qBvm1kjDD2xjyQG3jBTsaXmlL985DH/1OfY+dMPlYX9lz1vKcd8q7MQF7ui4ac/ClWjtmy3FqsGFcIgUEaCs+zLuqssi7Llx7KxmogKx/brtrxSA1DK+QH82hxocPpTTxNpT6vSb0hU+NPogpllDt5xg4mF1c89PmTW0Je3srtcM5U2WZtFw0yfVR1zqmyMTnVBBsLWvJR3UivnEwJWVnHXYhBnmQS48Bf+aeH28M3k8Dd4UubIRcuk16QF3RESvOq5ZQC5opP21DRIWNVgKzc2A3jnMsO85BXLfUxFU4lkcP7iWAl3LESsrL2qu3UQL5LsabFApLYaktEQjhz1cV1xXotreVrZF7PlWN8jem8OrsKObcWyho3rJgjAfK6druPvIGia+/Cp2tTZgE5fwwKyMtbr6otQL7vDUusDO0169LE+EJPU9U0+X5o1rUeLPfABISYEGyb4omWtvcsELnsBNtaxMl8/GTmdnSZbReXz/exrTJUp7CAnJuRAvKuz7B0Alm6T01k8sMhtLZu1BvmKGGiulmBqEHdjBPTTzOaUIRc5F2rQFiD86hjlXmbAjLfkyuQnTKgVZY7STd7TI1AFgTKkRbdGiEr/SCrE4AMuiHxjYUm9+dmO7qa/2KpM2NsYC1NGyuQtW3ht468zjmrPMntC7mMCT+SfHm92+pOY4dGRqBL212mIrr4KWTJrhThrgGuGT/NT+yHkOkbaIacquKLCr+X8GBVcFrFz0EeOULWTRtbn50ak6qa9yVzYGaX1yGnjMFkaMQWQEBSIri/0nz+ELKNSCg3QWae7SblWVpvyKObolRbWS1j3rWqlr6qr8P9BLIsFZQdfBMGn/Ya5gZRL+WN/xFkiBGJJ/8I8v5ZyKNgV4P5Y7VkrQaqLa++D7IkHUzh1d3k/ZByOoAXMQ8XdXxfbZ6v5Q7cw9wcd0JWGrQ6Pg15pOl1mBUlLihbXHk1K0mU5bp3QJakAPOVe1ryLN4mM11uR414ez3VvqLDYd88AkgDF4ax3QJ5N2/Q7lmbnJyzEZzXqwroZZB1niJ0TAoS22N8C6jK9PFVyDYL+R4TTRjnu96y9yKFoUlIRqxcpCLISsLaKUQgXYMMRG6DXCZ8QW3CQ0VegAyyDHO/U3irq+zSeBDS6tIyBIabF1WcH4dwHGTpbmsk5pAsrroLUE4XId5Rb16WhHLKRp/MsGGeFp2oVbq8VJURzyKEY0cj6vUsZBAmRiAtWc5ZSo6LoGYZs6P6zcnIa5Al6QjuT6jKHTRsVBpDraXOaVwPebEIWZeX6iK2XSYjcVdu9gLkUfoawXFVDr2kpU2zWBBzkd3PIU8lUaY4w2XxaVQH8JH/AmSagbgTuQuy2phWV/Qa5PQKylQ7GWpRzxXbm+o/Afke4Ehwf+PQEkcwXoC8oJ+AikTENZBHQX75a3FiCcqV/dwTsrhbKqdgRY2yWoxH6dxW/xHI4P40whc/x1+Vz3B2QLZrICdFtyrjGsil5xOMMo6z/PomlDo7IJvZbjp306yzwkIuLfJ/AbJ01w3ubUfaC8Wh5echf97SolsPyGXRfsffWnOZDmas9Ocg52MgClcXymv76dAIKk0yfzY/LxDVQQb3F4rZH41u2YnFnZA14fWnoujWA3IJacVdMD4LRbjePXmdPxms1bOyoVRFckdMT1bOnGkshrDfDRncnxXyZbnkO2Tl0TttMg/5C+5RA+M6yKgsmjEGA8X5xW3FMb4OyLn9UeasI8xt8ip5j0YtxrbYiR2quft5xtfAWJJuxBCGkOiU13IeSCvkica/NJJUQSphRTPksmimrIsSDtGLaRFFh+zr+M418UoRjqfD0GqZ720LysaRmb3yfsiSDO5PHJUqh5ZbIXsEhewb7F+0nteAWJZrR3v1slCz001DM7yilvyxKues9A3hzDJTD1JUri6aAeNPcci1FBhaFMbcvKT/BGRpaiB7LIyXFBOL2yBDwOex/fgKj0CDqaCqP9HSYIil3boZRJ1xcjHJjTa0Xq+Z5taZRULMRLhqNfknkO8tlCUHecKo1Gf+Xk0zZNvBRGf3msOCJlPRDBmdqzMIs2tlun5vyGXOnGzO/LWM2LRd3RGVn4+MtEK+m+J3tBafTpqX4CbIMng4Lso+GFxhs6JTw4miuLYy+XFmw7D+GR/Z1pWTYUdmLoFTpawsj+aPQ7hWyJD9Ea0yKSPJS5oge5pQLt3TqeQtjOVJ04mq1OvwV60oW37Wtp4/1yLkbDGTVlvVm6as1meuBmicP7gOr3xsA9XIg+wScm5O3gKZZn8u/87Z+GrTvKQBskmwyX4abjwhVrPLa4cMd9KJt0rxZsEKkATCKHOcj3beucVhPgrKhmxpOZl5T0GZ66FQ2yDmeckc70iL6MY6a+ycQ9aKo/b6HkAXZOr+xE+W0bIcsuogz8DlxdxXnjxcn+WxkNtOFBEjf0dGD0Kt8o6MVUyq4RaXE2+4vEK1NCfQz7Q56RhDzFJTf4ID6md6vP3N0ZJbgIpjFKFVZUk75C7GknQOLVPIsekMtpoJh7ZBvy7AbHd32s1xCrn17c1RMicy+UUx73nFEmXNNbenoncej4pMO/uyZGJNKDFfHaRVvg4ga5iwbpJOc+5mLHcx/g1Ck07Id8glhLltXzEmnuDyiDDRWYcFnYgnv/W1SV7I7KY81fBeMBln8GiMyZiZ2OKC6s+bZXWZ45p5cL9VqtNUJWKkEaEst5AM7ORf9aUZiMv6R/plJ7eT8enylzPG5H0PWjTrNswOMatlOUPOMxAk/OoAp7HoxpiK6C9mTMs0yPTf2A2I3U3ZE8tyi88bODbK+KYhR+K+tW50ZCBUnvu283+/VG/ijtClKR19STjophwTYU7iIvluTuLy+KlHutZSdCvMcfvb1clzWoRRTDyV/RUVf1AkSNiR34kZ21Pbnn82anv4Ed1arawQ21T7x3o93J+014guDCrd6QdcCJ+BXG8AvQux3TLj3T150ck+RchL53BBh5rZ3xDqud8ynpzcSHYuJ1hAvu2kuoRMeWbT+aYR3fGU3jzVkx/2N81e6N4yrEYX+QL7nVzmUORbtpI/8UiFVmQvu/P42/cfphrS9lXYqViR0YI2Zyd6CSjZq/tDAtkNcbopSxq+8V9I/brTyD3iv+VbnVpR0ayuUp8r8uEK4V/4z9/AQ2tuHuZkY7sj97F5bPzosvE3+XpfHaHTRjZtX0ajC+y28VMcE98OT5sHLNw8PO/hf4+QB/vBPyf29sobuI3RxkYjGaie/Ee6kkDbmxPsAefp0bPZPNgzdOCMTN/3Ruq3L8NhJn2+eZBI6w4ywNc5XCg3B6AzyP9Kaz0HH9idgbhtJxL5cG1o40Pvowxc/wHX4G2+ATIlpAJkd6Rt/HCE7U0EFGmw/fBNgAz7qOmbAJsHtanfaPRNu+7lsaGQYRmmf5SC+zJKWCag4Sj5mzbUXCQr3M0jGqmnDWOdkWdjemtOmNgbeETCDtPHisidlO+eZZR5CdhkbTKT7qFVhNEHFxunLsQdj1dE+xPy4dpGJ7joy+YUuW64kTH0ZNrREqqYdm0kbyL1e/MN6783J7pjYR+h04dpaQHhKPL8jap6GzqpnzJjeD18gm2fjKBLuq7r+Y9i+SWFHG5OauU376pWFJkb2YKnKD9MX6Gg22LIRMt/6SFEFxF9a28+D1KzDJ7Qqp1awavrvieQ1QJyuAHL8AADW0I+UcizFDI6JavBKqtR/rSPqGF/bACACn/xHzI874hCRrSLcxHDtx+6G+jwJz89ii1Cpo+QIDVrUyajaEIPI84UbJXaw/3NtPSjZhAnE2eaQt7ZGjbnX0C9s+gmy51nJEBOe7IbuWotZOjJnpusHzGQVRW7l+/HxlUfvudiMBcNkN3NKaSW99s/EdpKVEDOzIWZ9mSLOWsib0wXRxuArOLoAk6y3ydQc106C0b3KeQl48XibhAzef/0QOcL7yEy3ps9MpBTdwYiQIYfIbKIvMuoFnJmky9eRA1sjgJ7ZuISLziBeuF7Mr6USQb0YDA80Aq1yfQo6U0qenJikyHQAb97cdO9XJ961wuYC+KBDcf0LNxLmy8XpHXnJWcT3N9B07xZAXk+P4SYcJO76zVxu6PKzCb7GWS41FMY0osGyLiE/Mgg45P/7YCvd1nIqr/xLrATUX3/dPEyc2FmkKP0biXyNhtPpfNb/VNoPgr/JvuzEFPI4PNsD4xJsn968hB7fEObABk8rxeFPpxKYc17icQ98hKkEU2esZDndECwi7HdK9aJHhCOqY8ZXO/3w6SfQ6B2L0rMa9KT/W86NANRA9hj2MgCt7ahMUSyY34ZJ4jWaJgLQP2TZz8QCn0w0SpdGMl++Q6Dn8aTmLZSjurCDT1ZSVoNyTU0D5bB87O34dSkzctjYiUWn57JKHzIT0AeoVu3YZ6iaDrjIc/n+65uXPOGb62SKKz8g/4vC8zUXuuLZWqxMt16JOw34nbKdyh+yr8/VrTENT7Kg8X0vTu1+xHl1MP93QvGJWSpC/LfXnR7SSq2n7DGjLrdn1R+eEHKIR86zPHfXHR7Xab3/eLgjtZZ/JxVe/K0lbHnvvPS/h6h12vOpGtUqqYnt0I2+xZR/iVh752Q24pu/7JQ+EbIT+Wd/5SM87sg9/79Jv+gSEvx8wnIndNX/m0h8V3KVyA/UWz9R9VY/OwNeXB5nVLDBpPRE/JfP7Xir5BqzH4AuXXK5qBSbu2oVB/Itje4vL7CddlfD8j24PKekOpVKxk9IDd/E2xQnS4i5UM35NcKgP+yxEkZnZDzr/QNekLEfgay3Xvm0iBWmM9L2iH3HGcaJAqZhzrI03vG+F5CHopuL0u9nGvMhSztBMi/dJzpvyV3WoFs4ui84yAPLu+HwvkIawZ5SuM0Mk0o32epyxsykJ8q/xawn0J204VyCXlweW+QGpaQJ0Wc5uWQhwzkLVIv0yy6YA2DI+0AcsvL6IOekwZ5yXQmDEBr+8OvnVrxfyIyucuyIcRpxBumVrxV2KuZAosGl/deoSFOGzRo0KBBgwYNGjRo0KC/U/8LESeIqglXGg8AAAAASUVORK5CYII=`;
              try{
                // Only write the embedded default if user hasn't set a custom logo already.
                if(!localStorage.getItem(LOGO_KEY)){
                  localStorage.setItem(LOGO_KEY, val);
                  window.dispatchEvent(new CustomEvent('etiketLogoChanged', { detail: val }));
                  console.log('Etiket: embedded logo set (indir.png)');
                }else{
                  // existing logo found — suppress info log in normal runs
                  if(window && window.DEBUG_ETIKET_LOGS){ console.debug('Etiket: existing logo present, embedded default skipped'); }
                }
              // expose embedded default for runtime fixes
              try{ window.ETIKET_EMBEDDED_LOGO = val; }catch(_){ }
              }catch(e){ console.error('Etiket: set failed', e); }
            }catch(e){ console.error('Etiket logo embed failed', e); }
          })();
    
    /* ==== BODY inline script #36 ==== */
    // GS_WEBAPP_URL is stored in localStorage so user can paste the WebApp URL at runtime.
      // We provide a sensible default (the webapp you deployed) so you don't have to paste it each time.
      // localStorage still overrides this if present.
      const DEFAULT_GS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbx4BT8382m_3xk3H-4ihKe6D7bWOnRG4WrO-AGbJrIWTv95ht7-t_3DlFhh3kcX3AIEGA/exec';
      let GS_WEBAPP_URL = localStorage.getItem('v92_gs_webapp_url') || DEFAULT_GS_WEBAPP_URL;
  // Local proxy settings (developer convenience)
  const DEFAULT_LOCAL_PROXY = 'http://localhost:3000';
  const LOCAL_PROXY_URL = localStorage.getItem('v92_local_proxy_url') || DEFAULT_LOCAL_PROXY;
  // Allow explicit API_BASE (config.js) to override and disable local proxy usage when set.
  const LOCAL_PROXY_ENABLED = (!window.API_BASE && (localStorage.getItem('v92_use_local_proxy') === '1'));
  // JSONP allow flag (dev can enable via localStorage 'v92_allow_jsonp' === '1')
  const GS_ALLOW_JSONP = (localStorage.getItem('v92_allow_jsonp') === '1');
  // Probe helper: quick reachability check for local proxy with timeout
  // Treat any valid HTTP response (including 404) as "reachable" so we can auto-enable proxy
  async function probeLocalProxy(timeoutMs){
    try{
      if(!LOCAL_PROXY_URL) return false;
      console.debug('[local_proxy] probeLocalProxy ->', LOCAL_PROXY_URL, 'timeout=', timeoutMs || 400);
      const ctl = new AbortController();
      const t = setTimeout(()=> ctl.abort(), timeoutMs || 400);
  // probe the proxy root (many simple proxies respond on / or will return 404) —
  // we consider the proxy reachable if it returns any HTTP response.
  const pingUrl = LOCAL_PROXY_URL.replace(/\/$/, '') + '/';
  const res = await fetch(pingUrl, { method: 'GET', signal: ctl.signal });
      clearTimeout(t);
    const ok = !!(res && typeof res.status === 'number');
      console.debug('[local_proxy] probeLocalProxy result ->', ok, 'status=', res && res.status);
      return ok;
    }catch(e){
      console.debug('[local_proxy] probeLocalProxy error ->', e && e.message ? e.message : e);
      return false;
    }
  }
      // Try a quick reachability probe: if proxy responds, enable it automatically (helpful for dev)
      // Auto-probe for local proxy removed: do not perform background /ping requests.
      // Local proxy will only be used when the user explicitly enables it via the UI
      // (localStorage 'v92_use_local_proxy' = '1') or via `window.API_BASE` configuration.
      // Eğer kullanıcının WebApp URL'si henüz localStorage'a kaydedilmemişse, ekran görüntünüzde paylaştığınız URL'yi kullanarak kaydedelim.
      try{
        if(!localStorage.getItem('v92_gs_webapp_url')){
          localStorage.setItem('v92_gs_webapp_url', 'https://script.google.com/macros/s/AKfycbyswQY4spmwSNzMWPNWWPkHXO-yM-CilKbh0aNry917XOVeqGjq7mcXC8pZq8d-awfFrQ/exec');
          GS_WEBAPP_URL = localStorage.getItem('v92_gs_webapp_url') || GS_WEBAPP_URL;
        }
  // Default to NOT using remote (user can enable later). Previously this default was '1' which
  // caused the app to attempt remote writes automatically; change to '0' to avoid unexpected
  // network writes. The UI still allows the user to enable remote when ready.
  try{ if(!localStorage.getItem('v92_gs_use_remote')){ localStorage.setItem('v92_gs_use_remote','0'); } }catch(_){ }
        // If page is opened from file:// or origin is null, prefer JSONP to avoid CORS noise
        try{ if(location && (location.protocol === 'file:' || String(location.origin) === 'null')){ window.GS_FORCE_JSONP = true; } }catch(_){ }
      }catch(_){ }
          const GS_POLL_INTERVAL = 3000; // ms
          const GS_SHEET_KEY = (typeof window.BL_KEY !== 'undefined' && window.BL_KEY) ? window.BL_KEY : 'bloklar_yeni_demo';
    
          function setGsWebappUrl(url){ GS_WEBAPP_URL = url; if(url) localStorage.setItem('v92_gs_webapp_url', url); else localStorage.removeItem('v92_gs_webapp_url'); updateGsUi(); }
          function getGsWebappUrl(){ return GS_WEBAPP_URL; }
    
          // Robust fetch helper with JSONP fallback for GET and form-encoded POST helper to avoid preflight.
          // JSONP removed: helper kept for compatibility but will reject immediately.
          function _jsonpFetch(url){
            return Promise.reject(new Error('JSONP has been removed. Enable via localStorage v92_allow_jsonp=1 if necessary.'));
          }
    
          async function _gsFetch(query, opts){
            if(!GS_WEBAPP_URL || GS_WEBAPP_URL.indexOf('REPLACE')!==-1) throw new Error('GS_WEBAPP_URL not configured');
            // Determine whether to route requests through the local proxy to avoid browser CORS issues.
            // We prefer an explicit user setting (localStorage 'v92_use_local_proxy' === '1'),
            // otherwise, if the app is opened from file:// or origin is null we'll probe the local proxy
            // and enable it automatically if it responds.
            let useProxy = LOCAL_PROXY_ENABLED;
            try{
              // If user hasn't explicitly enabled proxy, and we're running from file:// (or origin null),
              // try a quick probe and enable proxy automatically when reachable.
              if(!useProxy && (typeof location !== 'undefined') && (location.protocol === 'file:' || String(location.origin) === 'null')){
                const reachable = await probeLocalProxy(500);
                if(reachable){
                  useProxy = true;
                  try{ localStorage.setItem('v92_use_local_proxy','1'); }catch(_){ }
                  console.debug('[local_proxy] auto-enabled local proxy (probe succeeded)');
                }
              }
            }catch(_){ /* ignore probe errors */ }

            // If running from file:// or origin null, prefer JSONP only when explicitly allowed by dev flag
            const forceJsonp = GS_ALLOW_JSONP && ((typeof window.GS_FORCE_JSONP !== 'undefined' && window.GS_FORCE_JSONP));
            const urlBase = (window.API_BASE) ? window.API_BASE : (useProxy ? LOCAL_PROXY_URL : GS_WEBAPP_URL);
            const url = urlBase + (query? ('?'+query):'');
            // If opts is not provided or method is GET, try normal fetch first, then fallback to JSONP when CORS blocks reading the response.
            try{
              if(!opts || (opts && (!opts.method || opts.method.toUpperCase()==='GET'))){
                const res = await fetch(url, opts || {});
                if(!res.ok) throw new Error('Network response not ok: '+res.status);
                return await res.json();
              }
              // For non-GET, perform fetch as-is
              // When using proxy we still POST to the proxy which will forward to GS_WEBAPP_URL
              const res = await fetch(url, opts);
              if(!res.ok) throw new Error('Network response not ok: '+res.status);
              return await res.json();
            }catch(err){
                // If proxy was used but failed, try a direct fetch to GS_WEBAPP_URL as a fallback.
                try{
                  if(useProxy && GS_WEBAPP_URL && (urlBase !== GS_WEBAPP_URL)){
                    const directUrl = GS_WEBAPP_URL + (query? ('?'+query):'');
                    const res2 = await fetch(directUrl, opts || {});
                    if(res2 && res2.ok) return await res2.json();
                    // if direct fetch not ok, fall through to rethrow below
                  }
                  // If API_BASE was explicitly set (e.g. window.API_BASE = 'http://localhost:3001')
                  // but the host is unreachable, attempt a direct Apps Script fetch as fallback.
                  if(window && window.API_BASE && GS_WEBAPP_URL && (String(urlBase).indexOf(String(window.API_BASE))!==-1) && (urlBase !== GS_WEBAPP_URL)){
                    try{
                      const directUrl2 = GS_WEBAPP_URL + (query? ('?'+query):'');
                      const res3 = await fetch(directUrl2, opts || {});
                      if(res3 && res3.ok) return await res3.json();
                    }catch(_){ /* ignore */ }
                  }
                }catch(_){ /* ignore fallback error and rethrow original */ }
                // No JSONP fallback here: rethrow the original fetch error so callers can handle it.
                throw err;
              }
          }
    
          // Helper to send form-encoded POST (avoids preflight in many cases)
          async function _gsPostForm(payloadObj){
            const params = new URLSearchParams();
            if(typeof payloadObj === 'object'){
              for(const k in payloadObj){ if(!payloadObj.hasOwnProperty(k)) continue; const v = payloadObj[k]; if(typeof v === 'object') params.set(k, JSON.stringify(v)); else params.set(k, String(v)); }
            }
            // If local proxy is enabled, POST to proxy which will forward to the GS_WEBAPP_URL
            const useProxyPost = LOCAL_PROXY_ENABLED;
            if(useProxyPost){
              // Use fetch POST to proxy so body is forwarded; proxy must be started with TARGET env pointing to GS_WEBAPP_URL
              try{
                const res = await fetch(LOCAL_PROXY_URL, { method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: params.toString() });
                if(res && res.ok) return await res.json();
                // if proxy returns non-ok, fallthrough to try direct POST below
              }catch(proxyErr){
                // proxy failed (not running or connection refused) - try direct POST to GS_WEBAPP_URL as fallback
                try{
                  const res2 = await fetch(GS_WEBAPP_URL, { method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: params.toString() });
                  if(res2 && res2.ok) return await res2.json();
                }catch(_){ /* ignore and rethrow below */ }
              }
            }
            // No JSONP fallback: prefer proxy POST or normal POST. If both fail, throw.
            const res = await fetch(GS_WEBAPP_URL, { method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: params.toString() });
            if(!res.ok) throw new Error('Network response not ok: '+res.status);
            return await res.json();
          }
    
          // Fetch list from server and replace local storage
          async function remoteListAndReplaceLocal(){
            try{
              // Prefer GET via fetch (through proxy if enabled)
              const r = await _gsFetch('action=list');
    
              if(r && r.ok && Array.isArray(r.data)){
                const arr = r.data.map(x=> x || {});
                localStorage.setItem(GS_SHEET_KEY, JSON.stringify(arr));
                try{ window.renderBloklar && window.renderBloklar(); }catch(e){ console.error(e); }
                updateGsUi({lastSync: Date.now(), lastCount: arr.length});
                return {ok:true, count: arr.length};
              }
              updateGsUi({lastError: JSON.stringify(r)});
              return {ok:false, reason: r};
            }catch(e){ console.error('remoteListAndReplaceLocal error', e); updateGsUi({lastError: String(e)}); return {ok:false, error:String(e)}; }
          }
    
          // Upsert a record to remote (record should be plain object). If record.id omitted, server creates one.
          async function remoteUpsert(record){
            try{
              // If remote usage is not enabled explicitly, or running from file/origin null, short-circuit to avoid network writes.
              try{
                const lsFlag = (localStorage.getItem && localStorage.getItem('v92_gs_use_remote') === '1');
                const originNull = (typeof location !== 'undefined' && (location.protocol === 'file:' || String(location.origin) === 'null'));
                const forceJsonp = !!(window.GS_FORCE_JSONP);
                const allowFileOriginRemote = !!window.ALLOW_FILE_ORIGIN_REMOTE || !!window.FORCE_REMOTE_ONLY;
                const allowRemote = lsFlag && (!originNull || allowFileOriginRemote) && !forceJsonp;
                if(!allowRemote){
                  try{ enqueueRemoteUpsert(record); }catch(_){ }
                  console.info('[remoteUpsert] queued due to allowRemote=false (lsFlag=' + !!lsFlag + ', originNull=' + !!originNull + ', GS_FORCE_JSONP=' + !!forceJsonp + ')');
                  return { ok:false, queued:true, error:'remote-disabled' };
                }
              }catch(_){ }
              if(!GS_WEBAPP_URL || GS_WEBAPP_URL.indexOf('REPLACE')!==-1) return {ok:false, error:'no_webapp'};
              // No JSONP fallback for upsert: prefer proxy POST or form-encoded POST, then JSON body POST.
              // Development convenience: if a local proxy is present at LOCAL_PROXY_URL, try posting to it
              // even if the "use proxy" toggle is not set in localStorage. This makes the dev flow
              // resilient when the auto-probe didn't run or the flag wasn't set yet.
              try{
                // Only attempt a proxy upsert if the user explicitly enabled the local proxy
                // (LOCAL_PROXY_ENABLED is set when no API_BASE is configured and user toggle is on).
                if(LOCAL_PROXY_ENABLED){
                  // probe the proxy quickly; if reachable, prefer it and try a small retry loop
                  console.debug('[local_proxy] remoteUpsert: probing proxy before POST');
                  const reachable = await probeLocalProxy(500);
                  console.debug('[local_proxy] remoteUpsert: probe result ->', reachable);
                  if(reachable){
                    const params = new URLSearchParams();
                    params.set('action','upsert');
                    params.set('record', JSON.stringify(record));
                    let lastErr = null;
                    for(let attempt=0; attempt<2; attempt++){
                      console.debug('[local_proxy] remoteUpsert: POST attempt', attempt+1);
                      try{
                        const pRes = await fetch(LOCAL_PROXY_URL, { method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: params.toString(), signal: (new AbortController()).signal });
                        if(pRes && pRes.ok){
                          try{ return await pRes.json(); }catch(parseErr){ console.debug('[local_proxy] remoteUpsert: proxy response parse failed ->', parseErr && parseErr.message ? parseErr.message : parseErr); return { ok: false, error: 'proxy-json-parse-failed' }; }
                        } else {
                          lastErr = new Error('proxy-post-failed:'+ (pRes && pRes.status));
                          console.debug('[local_proxy] remoteUpsert: proxy returned non-ok ->', pRes && pRes.status);
                        }
                      }catch(err){ lastErr = err; console.debug('[local_proxy] remoteUpsert: fetch error ->', err && err.message ? err.message : err); }
                      // small backoff
                      await new Promise(r=>setTimeout(r, 140));
                    }
                    // If proxy attempts failed, log and continue to other fallbacks
                    try{ console.warn('remoteUpsert: proxy attempts failed', lastErr); }catch(_){ }
                  }
                }
              }catch(_){ }
              // Try form-encoded POST first to avoid CORS preflight. Server supports record as JSON string.
              try{
                const j = await _gsPostForm({ action: 'upsert', record: record });
                return j;
              }catch(e2){
                // fallback: try JSON body
                try{
                  const res = await fetch(GS_WEBAPP_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'upsert', record: record})});
                  if(!res.ok) throw new Error('Network response not ok: '+res.status);
                  return await res.json();
                }catch(e3){
                  // final fallback: try JSONP GET (works for small records)
                  try{
                    const baseStr = String(GS_WEBAPP_URL||'');
                    if(baseStr.indexOf('script.google.com') !== -1 || baseStr.indexOf('googleusercontent.com') !== -1){
                      const recStr = encodeURIComponent(JSON.stringify(record || {}));
                      const sep = (baseStr.indexOf('?') === -1) ? '?' : '&';
                      const url = (baseStr.endsWith('/') ? baseStr.slice(0,-1) : baseStr) + sep + 'action=upsert&record=' + recStr;
                      try{
                        if(window._ALLOW_JSONP){
                          const jp = await window._jsonpRequest(url, 20000).catch(e => { throw e; });
                          // If JSONP returned an object, return it; otherwise propagate the original POST error
                          if(jp && (jp.ok || jp.id || jp.action)) return jp;
                        } else {
                          try{ window._logSkippedJsonp && window._logSkippedJsonp(url, '[remoteUpsert] JSONP fallback skipped'); }catch(_){ }
                        }
                      }catch(jsonpErr){
                        // fall through to throw original error below
                        console.debug('[remoteUpsert] JSONP fallback failed', jsonpErr && (jsonpErr.message||jsonpErr));
                      }
                    }
                  }catch(_){ }
                  // No JSONP final fallback succeeded — propagate the earlier error
                  throw e3;
                }
              }
            }catch(e){
              try{ if(!window._remoteUpsert_error_logged){ console.error('remoteUpsert error', e); window._remoteUpsert_error_logged = true; } }catch(_){ }
              updateGsUi({lastError: String(e)}); return {ok:false, error:String(e)};
            }
          }
    
          async function remoteDelete(id){
            try{
              // If remote usage is not enabled explicitly, or running from file/origin null, skip remote delete to avoid accidental removals/requests
              try{
                const lsFlag = (localStorage.getItem && localStorage.getItem('v92_gs_use_remote') === '1');
                const originNull = (typeof location !== 'undefined' && (location.protocol === 'file:' || String(location.origin) === 'null'));
                const forceJsonp = !!(window.GS_FORCE_JSONP);
                const allowFileOriginRemote = !!window.ALLOW_FILE_ORIGIN_REMOTE || !!window.FORCE_REMOTE_ONLY;
                const allowRemote = lsFlag && (!originNull || allowFileOriginRemote) && !forceJsonp;
                if(!allowRemote){ console.info('[remoteDelete] skipped; allowRemote=' + !!allowRemote + ' (lsFlag=' + !!lsFlag + ', originNull=' + !!originNull + ', GS_FORCE_JSONP=' + !!forceJsonp + ')'); return { ok:false, error:'remote-disabled' }; }
              }catch(_){ }
              if(!GS_WEBAPP_URL || GS_WEBAPP_URL.indexOf('REPLACE')!==-1) return {ok:false, error:'no_webapp'};
              try{
                return await _gsPostForm({ action: 'delete', id: id });
              }catch(e2){
                try{
                  const res = await fetch(GS_WEBAPP_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'delete', id: id})});
                  if(!res.ok) throw new Error('Network response not ok: '+res.status);
                  return await res.json();
                }catch(e3){
                  // final fallback: try JSONP GET delete when POST fails (Apps Script often accepts GET)
                  try{
                    const baseStr = String(GS_WEBAPP_URL||'');
                    if(baseStr.indexOf('script.google.com') !== -1 || baseStr.indexOf('googleusercontent.com') !== -1){
                      const sep = (baseStr.indexOf('?') === -1) ? '?' : '&';
                      const url = (baseStr.endsWith('/') ? baseStr.slice(0,-1) : baseStr) + sep + 'action=delete&id=' + encodeURIComponent(id);
                      try{
                        if(window._ALLOW_JSONP){
                          const jp = await window._jsonpRequest(url, 20000).catch(e=>{ throw e; });
                          if(jp && (jp.ok || jp.removed || jp.action)) return jp;
                        } else {
                          try{ window._logSkippedJsonp && window._logSkippedJsonp(url, '[remoteDelete] JSONP delete skipped'); }catch(_){ }
                        }
                      }catch(jsonpErr){
                        console.debug('[remoteDelete] JSONP fallback failed', jsonpErr && (jsonpErr.message||jsonpErr));
                      }
                    }
                  }catch(_){ }
                  // No JSONP fallback for delete succeeded; rethrow
                  throw e3;
                }
              }
            }catch(e){ console.error('remoteDelete error', e); updateGsUi({lastError: String(e)}); return {ok:false, error:String(e)}; }
          }

          // Queue helpers: persist failed/skipped upserts for later retry
          function _readUpsertQueue(){
            try{ const raw = localStorage.getItem('v92_remote_upsert_queue') || '[]'; return JSON.parse(raw||'[]'); }catch(_){ return []; }
          }
          function _writeUpsertQueue(q){ try{ localStorage.setItem('v92_remote_upsert_queue', JSON.stringify(q||[])); }catch(_){ } }
          function enqueueRemoteUpsert(rec){
            try{
              const q = _readUpsertQueue();
              q.push({ ts: Date.now(), rec: rec });
              _writeUpsertQueue(q);
              console.info('[upsertQueue] enqueued record, queueSize=', q.length);
              return true;
            }catch(e){ console.warn('[upsertQueue] enqueue failed', e); return false; }
          }

          async function processRemoteUpsertQueue(opts){
            opts = opts || {};
            try{
              let q = _readUpsertQueue();
              if(!Array.isArray(q) || q.length === 0) return { ok:true, processed:0 };
              // Ensure remote flags enabled while processing
              const prevLsFlag = localStorage.getItem && localStorage.getItem('v92_gs_use_remote');
              try{ localStorage.setItem('v92_gs_use_remote','1'); window.REMOTE_ENABLED = true; window.ALLOW_FILE_ORIGIN_REMOTE = true; window.GS_FORCE_JSONP = false; }catch(_){ }
              let processed = 0;
              const remaining = [];
              for(const item of q){
                try{
                  const rec = item && item.rec ? item.rec : item;
                  const res = await remoteUpsert(rec).catch(e=>({ ok:false, error:String(e) }));
                  if(res && (res.ok || res.id || res.result || res.data)){
                    processed++;
                    // small delay to avoid quotas
                    await new Promise(r=>setTimeout(r, 120));
                  } else {
                    // keep for next attempt
                    remaining.push(item);
                  }
                }catch(e){ remaining.push(item); }
              }
              // restore previous flag
              try{ if(prevLsFlag === null || prevLsFlag === undefined) { localStorage.removeItem('v92_gs_use_remote'); } else { localStorage.setItem('v92_gs_use_remote', prevLsFlag); } }catch(_){ }
              _writeUpsertQueue(remaining);
              console.info('[upsertQueue] processing complete processed=', processed, 'remaining=', remaining.length);
              return { ok:true, processed: processed, remaining: remaining.length };
            }catch(e){ console.error('[upsertQueue] process failed', e); return { ok:false, error: String(e) }; }
          }

          // Developer helper: enable remote usage temporarily and run full migration + queue processing
          if(typeof window.autoEnableRemoteAndMigrate !== 'function'){
            window.autoEnableRemoteAndMigrate = async function(opts){
              opts = opts || {};
              try{
                console.info('[auto] enabling remote flags for migration');
                // set permissive flags for migration
                try{ window.ALLOW_FILE_ORIGIN_REMOTE = true; window.GS_FORCE_JSONP = false; localStorage.setItem('v92_gs_use_remote','1'); window.REMOTE_ENABLED = true; window.FORCE_REMOTE_ONLY = true; }catch(_){ }
                // run full migration (uses performFullRemoteMigration if available)
                let migRes = null;
                if(typeof window.performFullRemoteMigration === 'function'){
                  migRes = await window.performFullRemoteMigration({ clearLocalAfter: !!opts.clearLocalAfter });
                } else if(typeof window.remoteMigrateLocal === 'function'){
                  migRes = await window.remoteMigrateLocal({ force: true });
                }
                console.info('[auto] migration result', migRes);
                // process any queued upserts
                const qres = await processRemoteUpsertQueue();
                console.info('[auto] queue process result', qres);
                return { migration: migRes, queue: qres };
              }catch(e){ console.error('[auto] autoEnableRemoteAndMigrate failed', e); return { ok:false, error: String(e) }; }
            };
          }

          // Migrate local records (GS_SHEET_KEY or BL_KEY) to remote server
          async function remoteMigrateLocal(opts){
            try{
              if(!GS_WEBAPP_URL || GS_WEBAPP_URL.indexOf('REPLACE')!==-1) return {ok:false, error:'no_webapp'};
              const key = GS_SHEET_KEY || 'bloklar_yeni_demo';
              const raw = localStorage.getItem(key) || localStorage.getItem('bloklar_yeni_demo') || '[]';
              let arr = [];
              try{ arr = JSON.parse(raw) || []; }catch(_){ arr = []; }
              if(!Array.isArray(arr) || arr.length===0) return {ok:false, error:'no_local_data'};
              // ask for confirmation if not forced
              if(!opts || !opts.force){
                const ok = confirm('Yerelde ' + arr.length + ' kayıt bulundu. Bunları uzak Sheet\'e taşımak istiyor musunuz? (Varolan id ler güncellenecek)');
                if(!ok) return {ok:false, error:'cancelled'};
              }
              let migrated = 0;
              // sequential upload to avoid quota bursts; small delay between items
              for(let i=0;i<arr.length;i++){
                const rec = arr[i]||{};
                try{
                  // ensure id exists
                  if(!rec.id) rec.id = 'm_'+Date.now().toString(36) + Math.random().toString(36).slice(2,6);
                  const res = await remoteUpsert(rec);
                  if(res && res.ok) migrated++;
                }catch(e){ console.error('migrate item error', e); }
                // tiny delay
                await new Promise(r=> setTimeout(r, 120));
              }
              updateGsUi({lastSync: Date.now(), lastCount: migrated});
              // Offer to optionally clear local storage (user decides)
              try{ if(confirm('Taşıma tamamlandı. ' + migrated + ' kayıt aktarıldı. Yereldeki veriyi temizlemek ister misiniz?')){ localStorage.removeItem(key); localStorage.removeItem('bloklar_yeni_demo'); try{ window.renderBloklar && window.renderBloklar(); }catch(_){ } } }catch(_){ }
              return {ok:true, migrated:migrated};
            }catch(e){ console.error('remoteMigrateLocal error', e); updateGsUi({lastError:String(e)}); return {ok:false, error:String(e)}; }
          }

          window.remoteMigrateLocal = remoteMigrateLocal;
    
          // Simple polling loop to pull remote data and refresh UI.
          let __gs_poll_timer = null;
          function startRemoteSync(intervalMs){
            if(!GS_WEBAPP_URL || GS_WEBAPP_URL.indexOf('REPLACE')!==-1){
              console.warn('GS_WEBAPP_URL not set - remote sync disabled');
              updateGsUi({autoSync:false, lastError:'GS_WEBAPP_URL not configured'});
              return;
            }
            stopRemoteSync();
    
            let inflight = false;
            let failCount = 0;
            const maxFails = 3;
    
            __gs_poll_timer = setInterval(async function(){
              if(inflight) return;
              inflight = true;
              try{
                const r = await remoteListAndReplaceLocal();
                if(r && r.ok){
                  failCount = 0;
                }else{
                  failCount++;
                }
              }catch(_e){
                failCount++;
              }finally{
                inflight = false;
              }
    
              if(failCount >= maxFails){
                stopRemoteSync();
                updateGsUi({autoSync:false, lastError:'Remote sync stopped after repeated failures (blocked/unreachable).'});
                console.warn('Remote sync stopped after', failCount, 'failures');
              }
            }, intervalMs || GS_POLL_INTERVAL);
    
            // kick-start once
            remoteListAndReplaceLocal().catch(()=>{});
            updateGsUi({autoSync:true});
          }
          function stopRemoteSync(){ if(__gs_poll_timer){ clearInterval(__gs_poll_timer); __gs_poll_timer=null; } updateGsUi({autoSync:false}); }
    
          // Small UI helpers for manual sync (exposed globally so you can call from console)
          window.remoteListAndReplaceLocal = remoteListAndReplaceLocal;
          window.remoteUpsert = remoteUpsert;
          window.remoteDelete = remoteDelete;
          window.startRemoteSync = startRemoteSync;
          window.stopRemoteSync = stopRemoteSync;
    
          // --- Minimal floating UI so user can set WebApp URL and control sync ---
          function createGsUi(){
            if(document.getElementById('gsSyncWidget')) return;
            const wrap = document.createElement('div'); wrap.id = 'gsSyncWidget';
            // If Server Ayarları container exists, render inline there, otherwise keep floating
            const serverContainer = document.getElementById('server_office_panel_container') || document.getElementById('server_ayar-content');
            const useInline = !!serverContainer;
            // When rendered inline inside Server Ayarları prefer a constrained, wrapping layout
            wrap.style.cssText = useInline ? 'position:static; display:block; width:100%; max-width:520px; padding:6px; box-sizing:border-box;' : 'position:fixed; right:14px; bottom:14px; z-index:9999; background:rgba(255,255,255,0.98); border:1px solid #e5e7eb; padding:8px; border-radius:10px; box-shadow:0 6px 20px rgba(0,0,0,0.08); font-family:inherit; font-size:13px;';
            wrap.innerHTML = `
              <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <button id="gsSyncNow" class="btn ghost small" style="flex:0 0 auto;">Sync Now</button>
                  <button id="gsMigrate" class="btn ghost small" style="flex:0 0 auto;">Migrate → Sheet</button>
                  <button id="gsDiagnostics" class="btn ghost small" style="flex:0 0 auto;">Diagnostics</button>
                </div>
                <div style="display:flex; gap:8px; align-items:center; margin-left:auto;">
                  <label style="display:flex;align-items:center;gap:6px;margin-right:6px"><input type="checkbox" id="gsUseRemote"> <span style="font-size:12px;">Use Remote</span></label>
                  <label style="display:flex;align-items:center;gap:6px;margin-right:6px"><input type="checkbox" id="gsAutoSync"> <span style="font-size:12px;">Otomatik</span></label>
                  <button id="gsSettings" class="btn small" style="flex:0 0 auto;">Ayarlar</button>
                </div>
              </div>
              <div id="gsStatus" style="margin-top:8px; color:#374151; font-size:12px;">Durum: hazır</div>
            `;
      if(useInline){ serverContainer.appendChild(wrap); } else { document.body.appendChild(wrap); }
            document.getElementById('gsSyncNow').addEventListener('click', function(){ remoteListAndReplaceLocal().then(r=>{ if(r && r.ok) alert('Sync tamamlandı. Kayıt sayısı: '+r.count); else alert('Sync başarısız'); }).catch(e=>{ alert('Sync hata: '+e); }); });
            document.getElementById('gsSettings').addEventListener('click', function(){ try{ const cur = localStorage.getItem('v92_gs_webapp_url') || ''; const v = prompt('Apps Script Web App URL (https://script.google.com/macros/s/.../exec):', cur||''); if(v!==null){ setGsWebappUrl((v||'').trim()); } }catch(e){ console.error(e); } });
            // initialize Use Remote checkbox from localStorage
            try{
              const useCb = document.getElementById('gsUseRemote');
              const cur = localStorage.getItem('v92_gs_use_remote') === '1'; if(useCb) useCb.checked = !!cur;
              useCb?.addEventListener('change', function(){ try{ localStorage.setItem('v92_gs_use_remote', this.checked ? '1' : '0'); updateGsUi(); }catch(e){ console.error(e); } });
            }catch(_){ }
            document.getElementById('gsMigrate')?.addEventListener('click', function(){ try{
              // run migration (confirm inside)
              remoteMigrateLocal().then(res=>{
                if(res && res.ok) alert('Migrate tamamlandı. Aktarılan: '+res.migrated);
                else alert('Migrate başarısız: '+(res && res.error));
              }).catch(e=>{ alert('Migrate hata: '+e); });
            }catch(e){ console.error(e); } });
            document.getElementById('gsDiagnostics')?.addEventListener('click', function(){ try{ showDiagnosticsOverlay(); }catch(e){ console.error(e); } });
            const auto = document.getElementById('gsAutoSync'); auto.addEventListener('change', function(){ try{ if(this.checked){ const intv = Number(localStorage.getItem('v92_gs_auto_interval')) || GS_POLL_INTERVAL; startRemoteSync(intv); localStorage.setItem('v92_gs_auto_sync','1'); }else{ stopRemoteSync(); localStorage.removeItem('v92_gs_auto_sync'); } }catch(e){ console.error(e); } });
          }

          // Expose bulk push/pull helpers and diagnostics UI
          window.bulkPullRemoteToLocal = async function(){
            try{
              const r = await remoteListAndReplaceLocal();
              return r;
            }catch(e){ console.error('bulkPullRemoteToLocal error', e); return {ok:false, error:String(e)}; }
          };

          window.bulkPushLocalToRemote = async function(){
            try{
              const r = await remoteMigrateLocal({force:true});
              return r;
            }catch(e){ console.error('bulkPushLocalToRemote error', e); return {ok:false, error:String(e)}; }
          };

          function showDiagnosticsOverlay(){
            try{
              if(document.getElementById('diagOverlay')) return;
              const o = document.createElement('div'); o.id = 'diagOverlay';
              o.style.cssText = 'position:fixed; left:8px; top:8px; right:8px; bottom:8px; z-index:10050; background:rgba(255,255,255,0.98); border:1px solid #ccc; padding:12px; overflow:auto; font-family:inherit; font-size:13px;';
              const html = [];
              html.push('<div style="display:flex;justify-content:space-between;align-items:center;">');
              html.push('<strong>Diagnostics</strong>');
              html.push('<div><button id="diagClose" class="btn small">Kapat</button></div>');
              html.push('</div>');
              html.push('<div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap">');
              html.push('<button id="diagBackup" class="btn small">Yedekle (__ls_backup_full__)</button>');
              html.push('<button id="diagShowFlags" class="btn small">Show v92_flag_*</button>');
              html.push('<button id="diagPull" class="btn small">Pull Now</button>');
              html.push('<button id="diagPush" class="btn small">Push Local → Remote</button>');
              html.push('</div>');
              html.push('<div id="diagOutput" style="margin-top:10px; white-space:pre-wrap; font-family:monospace; background:#f9fafb; padding:8px; border-radius:6px; max-height:60%; overflow:auto;"></div>');
              o.innerHTML = html.join('\n');
              document.body.appendChild(o);

              document.getElementById('diagClose').addEventListener('click', function(){ try{ o.remove(); }catch(_){ } });
              document.getElementById('diagBackup').addEventListener('click', function(){ try{ localStorage.setItem('__ls_backup_full__', JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k=>[k, localStorage.getItem(k)])))); document.getElementById('diagOutput').textContent = 'Backup written to __ls_backup_full__'; }catch(e){ document.getElementById('diagOutput').textContent = 'Backup failed: '+(e&&e.message); } });
              document.getElementById('diagShowFlags').addEventListener('click', function(){ try{ const keys = Object.keys(localStorage).filter(k=>k.indexOf('v92_flag_')===0); document.getElementById('diagOutput').textContent = JSON.stringify(keys, null, 2); }catch(e){ document.getElementById('diagOutput').textContent = 'Error: '+(e&&e.message); } });
              document.getElementById('diagPull').addEventListener('click', function(){ try{ document.getElementById('diagOutput').textContent = 'Pulling...'; bulkPullRemoteToLocal().then(r=>{ document.getElementById('diagOutput').textContent = 'Pull result: '+JSON.stringify(r, null, 2); }).catch(e=>{ document.getElementById('diagOutput').textContent = 'Pull error: '+(e&&e.message); }); }catch(e){ document.getElementById('diagOutput').textContent = 'Error: '+(e&&e.message); } });
              document.getElementById('diagPush').addEventListener('click', function(){ try{ if(!confirm('Yereldeki blokları uzak sunucuya göndermek istiyor musunuz? (Onay gereki)')) return; document.getElementById('diagOutput').textContent = 'Pushing...'; bulkPushLocalToRemote().then(r=>{ document.getElementById('diagOutput').textContent = 'Push result: '+JSON.stringify(r, null, 2); }).catch(e=>{ document.getElementById('diagOutput').textContent = 'Push error: '+(e&&e.message); }); }catch(e){ document.getElementById('diagOutput').textContent = 'Error: '+(e&&e.message); } });
            }catch(e){ console.error('showDiagnosticsOverlay error', e); }
          }

          // performFullMigration: backup localStorage -> call bulkPushLocalToRemote -> optional clear localStorage
          // usage: window.performFullMigration({ clearLocalStorage: true })
          window.performFullMigration = async function(opts){
            opts = opts || {};
            if(typeof window.bulkPushLocalToRemote !== 'function'){
              return { ok:false, error: 'bulkPushLocalToRemote() not available. Open the app and wait for it to load.' };
            }
            try{
              // Build a full localStorage backup object
              let backupObj = {};
              try{
                backupObj = Object.fromEntries(Object.keys(localStorage).map(k=>[k, localStorage.getItem(k)]));
              }catch(e){ console.warn('[migration] building backup object failed', e); }

              // Try writing backup into localStorage; if quota exceeded, offer a file download.
              try{
                localStorage.setItem('__ls_backup_full__', JSON.stringify(backupObj));
                console.info('[migration] __ls_backup_full__ written');
              }catch(e){
                console.warn('[migration] backup to localStorage failed', e);
                try{
                  const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'localStorage_backup_' + Date.now() + '.json';
                  // a must be added to DOM for Firefox
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  console.info('[migration] backup downloaded as file');
                }catch(e2){ console.error('[migration] backup download failed', e2); }
              }

              // Attempt bulk push of localStorage-derived data
              const res = await window.bulkPushLocalToRemote().catch(e=>({ ok:false, error:String(e) }));
              if(!res || res.ok === false){
                console.error('[migration] bulkPushLocalToRemote failed', res);
                return { ok:false, error: 'bulkPushLocalToRemote failed', detail: res };
              }

              // If requested, clear localStorage after successful migration
              if(opts.clearLocalStorage){
                try{
                  const allow = confirm('Yerel localStorage kalıcı olarak temizlenecek. Devam edilsin mi?');
                  if(allow){ localStorage.clear(); console.info('[migration] localStorage cleared'); return { ok:true, migrated:true, cleared:true, detail:res }; }
                  return { ok:true, migrated:true, cleared:false, detail:res };
                }catch(e){ console.error('[migration] clearing failed', e); return { ok:false, error:String(e) }; }
              }

              return { ok:true, migrated:true, cleared:false, detail:res };
            }catch(e){ console.error('[migration] unexpected', e); return { ok:false, error:String(e) }; }
          };

            // EXCEL_BLOKLARI helpers removed: rely on remote (Apps Script) as source of truth
            try{ window.EXCEL_BLOKLARI = []; }catch(_){ }

          function updateGsUi(state){
            try{
              const el = document.getElementById('gsStatus'); if(el){
                let txt = 'Durum: hazır';
                if(state && state.lastSync) txt = 'Son eşleme: ' + new Date(state.lastSync).toLocaleTimeString();
                if(state && state.lastCount!==undefined) txt += ' • Kayıt: ' + state.lastCount;
                if(state && state.lastError) txt = 'Hata: ' + state.lastError;
                if(state && state.autoSync!==undefined){ const cb = document.getElementById('gsAutoSync'); if(cb) cb.checked = !!state.autoSync; }
                el.textContent = txt;
              }
            }catch(e){}
          }
    
          // If user wants auto-sync by default, they can set localStorage.v92_gs_auto_sync = '1' and provide URL
    
    /* ==== BODY inline script #37 ==== */
    (function(){
            const TEMPL_KEY = 'v91_etiket_templates';
            function getTemplates(){ try{ return JSON.parse(localStorage.getItem(TEMPL_KEY)||'[]'); }catch(e){ return []; } }
            function setTemplates(a){ localStorage.setItem(TEMPL_KEY, JSON.stringify(a)); }
            function backupTemplates(){ try{ const v = localStorage.getItem(TEMPL_KEY); if(v) localStorage.setItem(TEMPL_KEY+'_backup_'+Date.now(), v); }catch(e){} }
    
            document.addEventListener('DOMContentLoaded', function(){
              const ta = document.getElementById('etiketEditor');
              const preview = document.getElementById('etiket_preview_area');
              const btnSave = document.getElementById('btnSaveEtiketTemplate');
              const btnReset = document.getElementById('btnResetEtiketTemplate');
              const fileInput = document.getElementById('etiketTemplateFile');
    
              if(btnSave){ btnSave.addEventListener('click', function(){
                if(!ta){ alert('Etiket editörü bulunamadı'); return; }
                const html = ta.value || '';
                if(!html.trim()){ if(!confirm('Boş şablon kaydedilsin mi?')) return; }
                backupTemplates();
                const arr = getTemplates();
                // capture metadata (current product name) from exposed API or input
                let meta = { urun: '' };
                try{ if(typeof window.getEtiketFields === 'function'){ const f = window.getEtiketFields(); if(f && f.urun) meta.urun = String(f.urun); } else { const inp = document.getElementById('etiket_field_urun'); if(inp) meta.urun = inp.value || ''; } }catch(_){ }
                const rec = { id: Date.now().toString(36), html: html, created: new Date().toISOString(), meta: meta };
                arr.unshift(rec);
                setTemplates(arr);
                // refresh UI and preview
                renderTemplateList();
                if(window && typeof window.renderEtiketPreview === 'function') window.renderEtiketPreview(html);
                window.dispatchEvent(new CustomEvent('etiketTemplateSaved',{ detail: rec }));
                alert('Şablon kaydedildi.');
              }); }
    
              if(btnReset){ btnReset.addEventListener('click', function(){ if(!ta) return; ta.value = '<!-- Etiket şablonunuzu buraya yazın veya yükleyin -->'; if(window && typeof window.renderEtiketPreview === 'function') window.renderEtiketPreview('Ön izleme burada görünecek.'); }); }
    
              if(fileInput){ fileInput.addEventListener('change', function(){ const f = this.files && this.files[0]; if(!f) return; const reader = new FileReader(); reader.onload = function(e){ try{ if(ta) ta.value = String(e.target.result || ''); if(window && typeof window.renderEtiketPreview === 'function') window.renderEtiketPreview(ta.value); }catch(err){ console.error(err); alert('Şablon dosyası okunamadı'); } }; reader.readAsText(f); }); }
    
          // Render template list and load last saved template into editor/preview if exists
          function renderTemplateList(){
            try{
              const sel = document.getElementById('etiketTemplateSelect'); if(!sel) return;
              const arr = getTemplates(); sel.innerHTML = '';
              if(!arr || !arr.length){ const opt = document.createElement('option'); opt.value=''; opt.textContent='(Kayıtlı şablon yok)'; sel.appendChild(opt); return; }
              arr.forEach(r=>{
                const label = ((r.meta && r.meta.urun) ? r.meta.urun : (r.html||'')).slice(0,60);
                const opt = document.createElement('option'); opt.value = r.id;
                opt.textContent = label + ' — ' + (r.created ? r.created.split('T')[0] : '');
                sel.appendChild(opt);
              });
              // wire change to preview/apply immediately
              sel.addEventListener('change', function(){ try{ const id = sel.value; const rec = getTemplates().find(x=>x.id===id); if(rec){ if(ta) ta.value = rec.html || ta.value; if(window && typeof window.renderEtiketPreview === 'function') window.renderEtiketPreview(ta.value); } }catch(_){ } });
            }catch(e){ console.error('renderTemplateList error', e); }
          }
    
                  /* stray normalization code removed (variable 'b' not defined here) */
          function loadLastTemplate(){
            try{
              const arr = getTemplates();
              if(arr && arr.length && ta){
                ta.value = arr[0].html || ta.value;
                if(window && typeof window.renderEtiketPreview === 'function') window.renderEtiketPreview(ta.value);
                // select first
                const sel = document.getElementById('etiketTemplateSelect'); if(sel && sel.options && sel.options.length){ sel.value = arr[0].id; }
              }
            }catch(e){ console.error('loadLastTemplate error', e); }
          }
    
          // apply / delete buttons
          (function wireTemplateButtons(){
            try{
              const applyBtn = document.getElementById('btnApplyEtiketTemplate');
              const deleteBtn = document.getElementById('btnDeleteEtiketTemplate');
              const refreshBtn = document.getElementById('btnRefreshTemplateList');
              const sel = document.getElementById('etiketTemplateSelect');
              if(applyBtn){ applyBtn.addEventListener('click', function(){ try{ if(!sel) return; const id = sel.value; const rec = getTemplates().find(x=>x.id===id); if(!rec) return; if(ta) ta.value = rec.html || ta.value; if(window && typeof window.renderEtiketPreview === 'function') window.renderEtiketPreview(ta.value); alert('Şablon uygulandı.'); }catch(e){ console.error(e); } }); }
              if(deleteBtn){ deleteBtn.addEventListener('click', function(){ try{ if(!sel) return; const id = sel.value; if(!id) return alert('Silinecek şablon seçin'); if(!confirm('Seçili şablonu silmek istediğinize emin misiniz?')) return; const arr = getTemplates(); const idx = arr.findIndex(x=>x.id===id); if(idx>=0){ arr.splice(idx,1); setTemplates(arr); renderTemplateList(); alert('Şablon silindi.'); } }catch(e){ console.error(e); } }); }
              if(refreshBtn){ refreshBtn.addEventListener('click', function(){ try{ renderTemplateList(); loadLastTemplate(); alert('Şablon listesi yenilendi.'); }catch(e){ console.error(e); } }); }
            }catch(e){ console.error('wireTemplateButtons error', e); }
          })();
    
          renderTemplateList(); loadLastTemplate();
    
              // Expose a small API to render preview from other code
              window.renderEtiketPreview = function(html){ try{ const preview = document.getElementById('etiket_preview_area'); if(preview){ const safeHtml = String(html || ''); preview.innerHTML = '<div class="etiket-sheet">' + safeHtml + '</div>'; } }catch(e){ console.error(e); } };
              window.addEventListener('etiketRenderRequest', function(e){ if(e && e.detail) window.renderEtiketPreview(e.detail); });
              // expose a small helper to force-fit product texts in the published preview
              (function(){
                function debounce(fn, ms){ let t; return function(){ clearTimeout(t); t = setTimeout(()=>fn.apply(this, arguments), ms); }; }
                function fitSingleLineWithin(el, minPx){ if(!el) return; try{
                  el.style.whiteSpace = 'nowrap'; el.style.overflow = 'hidden'; el.style.textOverflow = 'ellipsis';
                  const cs = window.getComputedStyle(el); let fs = parseFloat(cs.fontSize) || 14; minPx = Number(minPx||9);
                  // shrink until fits or reaches minPx
                  while(el.scrollWidth > el.clientWidth && fs > minPx){ fs = Math.max(minPx, fs - 1); el.style.fontSize = fs + 'px'; if(fs <= minPx) break; }
                }catch(e){ /* ignore */ } }
    
                window.forceEtiketPreviewUpdate = function(){ try{
                  const container = document.getElementById('etiket_label_render') || document.querySelector('#etiket_preview_area .etiket-sheet');
                  if(!container) return;
                  const main = container.querySelector('.etiket-prod-main');
                  const en = container.querySelector('.etiket-prod-en');
                  if(main) fitSingleLineWithin(main, 9);
                  if(en) fitSingleLineWithin(en, 9);
                  // re-publish the potentially adjusted HTML so legacy preview picks up sizes
                  if(window && typeof window.renderEtiketPreview === 'function') window.renderEtiketPreview(container.innerHTML);
                  try{ if(typeof window.applyPreviewSettings === 'function') window.applyPreviewSettings(); }catch(_){ }
                }catch(e){ console.error('forceEtiketPreviewUpdate failed', e); } };
    
                // allow other code to request a force-fit
                window.addEventListener('etiketForceFit', function(){ try{ window.forceEtiketPreviewUpdate(); }catch(_){ } });
                // re-run on window resize (debounced)
                window.addEventListener('resize', debounce(function(){ try{ window.forceEtiketPreviewUpdate(); }catch(_){ } }, 220));
              })();
            });
          })();
    
    /* ==== BODY inline script #38 ==== */
    (function(){
            const wrapper = document.getElementById('yukleme_yap-content'); if(!wrapper) return;
            const tabs = Array.from(wrapper.querySelectorAll('#yukleme-type-subtabs .subtab'));
            const cards = Array.from(wrapper.querySelectorAll(':scope > .upload-subcard'));
            function show(sub){ tabs.forEach(t=> t.classList.toggle('active', t.dataset.sub===sub)); cards.forEach(c=> c.style.display = (c.id === sub+'-content') ? '' : 'none'); }
            tabs.forEach(t=> t.addEventListener('click', function(){ show(t.dataset.sub); }));
            const first = tabs.find(t=> t.classList.contains('active')) || tabs[0]; if(first) show(first.dataset.sub);
          })();
    
    /* ==== BODY inline script #39 ==== */
    (function(){
          const wrapper = document.getElementById('islemler_stok-content'); if(!wrapper) return;
          const tabs = Array.from(wrapper.querySelectorAll('#islemler-subtabs .subtab'));
          const cards = Array.from(wrapper.querySelectorAll(':scope > .card'));
          function show(sub){ tabs.forEach(t=> t.classList.toggle('active', t.dataset.sub===sub)); cards.forEach(c=> c.style.display = (c.id === sub+'-content') ? '' : 'none'); }
          tabs.forEach(t=> t.addEventListener('click', function(){ show(t.dataset.sub); }));
          // default
          const first = tabs.find(t=> t.classList.contains('active')) || tabs[0]; if(first) show(first.dataset.sub);
        })();
    
    /* ==== BODY inline script #40 ==== */
    document.addEventListener('DOMContentLoaded', function(){
          const SETTINGS_KEYS = {
            tasIsmi: 'v91_settings_tasIsmi',
            seleksiyon: 'v91_settings_seleksiyon',
            yuzeyIslem: 'v91_settings_yuzeyIslem',
            kalinlik: 'v91_settings_kalinlik',
            firma: 'v91_settings_firmaIsimleri'
          };
    
          const DEFAULTS = {
            tasIsmi: ['ıvorry beıge','pure cream','olıve ash','lilac','savana grey'],
            seleksiyon: ['standard','classic'],
            yuzeyIslem: ['cilalı','honlu','kumlu','fırçalı'],
            kalinlik: ['1,2 cm','2 cm','3 cm','3,4 cm'],
            firma: ['içerik','ensar','bayermar','levant group','stone mark','batu mermer','adk','talde','solo marble','kartal','seçkin satılar','hüseyin güzel']
          };
    
          const Settings = {};
    
          function loadSettings(){
            Object.keys(SETTINGS_KEYS).forEach(k=>{
              try{ const v = JSON.parse(localStorage.getItem(SETTINGS_KEYS[k])); if(Array.isArray(v) && v.length) Settings[k]=v.slice(); else Settings[k] = DEFAULTS[k].slice(); }
              catch(e){ Settings[k] = DEFAULTS[k].slice(); }
            });
          }
    
          function saveSetting(key){ localStorage.setItem(SETTINGS_KEYS[key], JSON.stringify(Settings[key]||[])); updateDatalists(); }
    
          function renderList(key, containerId){ const el = document.getElementById(containerId); if(!el) return; el.innerHTML = ''; (Settings[key]||[]).forEach(item=>{
              const wrap = document.createElement('div'); wrap.style.display='flex'; wrap.style.gap='8px'; wrap.style.alignItems='center';
              const pill = document.createElement('span'); pill.className='pill'; pill.textContent = item;
              const btn = document.createElement('button'); btn.className='btn danger small'; btn.textContent='Sil'; btn.style.height='28px'; btn.addEventListener('click', ()=>{ if(confirm(item+' silinsin mi?')){ const idx = Settings[key].indexOf(item); if(idx>=0){ Settings[key].splice(idx,1); saveSetting(key); renderAll(); } } });
              wrap.appendChild(pill); wrap.appendChild(btn); el.appendChild(wrap);
          });
        }
    
      function renderAll(){ renderList('tasIsmi','tasIsmiList'); renderList('seleksiyon','seleksiyonList'); renderList('yuzeyIslem','yuzeyIslemList'); renderList('kalinlik','kalinlikList'); renderList('firma','firmaList'); updateDatalists(); }
    
          function updateDatalists(){
            const toDatalist=(arr)=> (arr||[]).map(v=>`<option value="${escapeHtml(v)}"></option>`).join('');
      document.getElementById('tasIsmi_dlist').innerHTML = toDatalist(Settings.tasIsmi);
      document.getElementById('seleksiyon_dlist').innerHTML = toDatalist(Settings.seleksiyon);
      document.getElementById('yuzeyIslem_dlist').innerHTML = toDatalist(Settings.yuzeyIslem);
      document.getElementById('kalinlik_dlist').innerHTML = toDatalist(Settings.kalinlik);
      document.getElementById('firma_dlist').innerHTML = toDatalist(Settings.firma);
    
      // attach datalist to inputs/selects across the page
      Array.from(document.querySelectorAll('input[name="tasIsmi"]')).forEach(i=> i.setAttribute('list','tasIsmi_dlist'));
      Array.from(document.querySelectorAll('input[name="kalinlik"]')).forEach(i=> i.setAttribute('list','kalinlik_dlist'));
      Array.from(document.querySelectorAll('input[name="firmaIsmi"]')).forEach(i=> i.setAttribute('list','firma_dlist'));
      // also attach datalist to product row inputs so they show stok ayarlarından gelen seçenekleri
      Array.from(document.querySelectorAll('input[name="product_stoneName"]')).forEach(i=> i.setAttribute('list','tasIsmi_dlist'));
      Array.from(document.querySelectorAll('input[name="product_surface"]')).forEach(i=> i.setAttribute('list','yuzeyIslem_dlist'));
      Array.from(document.querySelectorAll('input[name="product_quality"]')).forEach(i=> i.setAttribute('list','seleksiyon_dlist'));
      Array.from(document.querySelectorAll('input[name="product_thickness"]')).forEach(i=> i.setAttribute('list','kalinlik_dlist'));
      Array.from(document.querySelectorAll('input[name="product_surface"]')).forEach(i=> i.setAttribute('list','yuzeyIslem_dlist'));
      Array.from(document.querySelectorAll('input[name="product_quality"]')).forEach(i=> i.setAttribute('list','seleksiyon_dlist'));
            // replace options of any select[name="yuzeyIslem"] to match settings
            Array.from(document.querySelectorAll('select[name="yuzeyIslem"]')).forEach(s=>{
              s.innerHTML = (Settings.yuzeyIslem||[]).map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
            });
          }
    
          function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    
          // add handlers for add buttons
          function wireAdd(key, inputId){ const btn = document.getElementById(key+'Add')||document.getElementById(inputId+'Add'); const input = document.getElementById(inputId);
            if(!input) return; const b = btn; if(b) b.addEventListener('click', ()=>{ const val = (input.value||'').trim(); if(!val){ alert('Lütfen bir değer girin'); input.focus(); return; } if(!Settings[key]) Settings[key]=[]; if(Settings[key].includes(val)){ alert('Bu değer zaten listede'); input.value=''; input.focus(); return; } Settings[key].push(val); saveSetting(key); renderAll(); input.value=''; });
          }
    
          // reset all to defaults
          document.getElementById('resetAllDefaults')?.addEventListener('click', function(){ if(!confirm('Tüm ayarları varsayılan değerlere geri yüklemek istiyor musunuz?')) return; Object.keys(DEFAULTS).forEach(k=> Settings[k]=DEFAULTS[k].slice()); Object.keys(SETTINGS_KEYS).forEach(k=> saveSetting(k)); renderAll(); alert('Varsayılanlar yüklendi'); });
    
          // Export / Import via prompt / clipboard
          document.getElementById('stokSettingsExport')?.addEventListener('click', function(){ try{ const txt = JSON.stringify(Settings, null, 2); if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(()=> alert('Ayarlar panoya kopyalandı (JSON)')); } else { prompt('Aşağıdaki JSON metnini kopyalayın:', txt); } }catch(e){ alert('Dışa aktarma hatası'); } });
    
      document.getElementById('stokSettingsImport')?.addEventListener('click', function(){ const txt = prompt('JSON verisini buraya yapıştırın ve Tamam deyin:'); if(!txt) return; try{ const obj = JSON.parse(txt); ['tasIsmi','seleksiyon','yuzeyIslem','kalinlik','firma'].forEach(k=>{ if(Array.isArray(obj[k])) Settings[k] = obj[k].slice(); }); Object.keys(SETTINGS_KEYS).forEach(k=> saveSetting(k)); renderAll(); alert('Ayarlar içe aktarıldı'); }catch(e){ alert('Geçersiz JSON: ' + (e && e.message)); } });
    
      // wire adds
      wireAdd('tasIsmi','tasIsmiInput'); wireAdd('seleksiyon','seleksiyonInput'); wireAdd('yuzeyIslem','yuzeyIslemInput'); wireAdd('kalinlik','kalinlikInput'); wireAdd('firma','firmaInput');
    
          // initial load
          loadSettings(); renderAll();
    
          // expose for debugging
          window.FX_STOK_SETTINGS = { Settings, loadSettings, renderAll };
        });
    
    /* ==== BODY inline script #41 ==== */
    document.addEventListener('DOMContentLoaded', function(){
      const bar = document.getElementById('stok-subtabs'); if(!bar) return;
      const wrapper = document.getElementById('stok');
      const cards = Array.from(wrapper.querySelectorAll(':scope > .card'));
      const buttons = Array.from(bar.querySelectorAll('.subtab'));
      function showSub(sub){ buttons.forEach(b=> b.classList.toggle('active', b.dataset.sub===sub)); cards.forEach(c=> c.style.display = (c.id === sub+'-content') ? '' : 'none'); }
      buttons.forEach(btn=> btn.addEventListener('click', function(){ showSub(btn.dataset.sub); }));
      // default
      const first = buttons.find(b=>b.classList.contains('active')) || buttons[0]; if(first) showSub(first.dataset.sub);
    });
    
    /* ==== BODY inline script #42 ==== */
    document.addEventListener('DOMContentLoaded', function(){
      const bar = document.getElementById('ayarlar-subtabs'); if(!bar) return;
      const wrapper = document.getElementById('ayarlar');
      const cards = Array.from(wrapper.querySelectorAll(':scope > .card'));
      const buttons = Array.from(bar.querySelectorAll('.subtab'));
      function showSub(sub){
        buttons.forEach(b=> b.classList.toggle('active', b.dataset.sub===sub));
        cards.forEach(c=> c.style.display = (c.id === sub+'-content') ? '' : 'none');
        // manage GS UI and Office Panel visibility when entering/leaving Server Ayarları
        try{
          if(sub === 'server_ayar'){
            try{ createGsUi(); }catch(_){ }
            try{ const saved = localStorage.getItem('v92_gs_webapp_url'); if(saved) setGsWebappUrl(saved); }catch(_){ }
            try{ updateGsUi(); }catch(_){ }
            try{
              // NOTE: do not start remote sync automatically on page load to avoid unexpected
              // background upserts/pulls. The checkbox state is restored for the UI but the
              // user must toggle it manually to actually start syncing.
              if(localStorage.getItem('v92_gs_auto_sync')){
                // reflect state in UI but do NOT auto-start the sync loop
                console.info('[GS] auto-sync flag present in localStorage but auto-start is disabled by client. Toggle the Otomatik checkbox to start syncing.');
                // leave the value so user sees checkbox checked inside GS widget
              }
            }catch(_){ }
            // ensure Office panel is moved into container if already present
            try{ const panel = document.getElementById('ensarOfficePanel'); const container = document.getElementById('server_office_panel_container'); if(panel && container && panel.parentElement !== container) container.appendChild(panel); }catch(_){ }
          } else {
            // hide/remove GS widget and stop auto-sync when leaving
            try{
              const g = document.getElementById('gsSyncWidget');
              if(g){
                const pid = g.parentElement && g.parentElement.id;
                if(pid === 'server_office_panel_container' || pid === 'server_ayar-content') g.remove(); else g.style.display = 'none';
              }
            }catch(_){ }
            try{ stopRemoteSync(); }catch(_){ }
          }
        }catch(_){ }
      }
      buttons.forEach(btn=> btn.addEventListener('click', function(){ showSub(btn.dataset.sub); }));
      const first = buttons.find(b=> b.classList.contains('active') && b.style.display!=='none') || buttons.find(b=> b.style.display!=='none') || buttons[0];
      if(first) showSub(first.dataset.sub);
    });
    
    /* ==== BODY inline script #43 ==== */
    (function(){
        const PERSONEL_KEY = 'v91_personel_list';
        // Local state for current station selections
        let CURRENT_STATIONS = [];
        function getTree(){ return (typeof window.getStationTree==='function') ? window.getStationTree() : {}; }
        function getLabels(){ return (typeof window.getStationLabels==='function') ? window.getStationLabels() : []; }
          function getPersonnel(){ try{ return JSON.parse(localStorage.getItem(PERSONEL_KEY)||'[]'); }catch(_){ return []; } }
          function setPersonnel(a){ localStorage.setItem(PERSONEL_KEY, JSON.stringify(a||[])); }
        function fillGroupSelect(){ const sel=document.getElementById('prsGroupSelect'); if(!sel) return; const tree=getTree(); const groups=Object.keys(tree); sel.innerHTML = ['<option value="">(Seçiniz)</option>'].concat(groups.map(g=>`<option value="${g}">${g}</option>`)).join(''); }
        function fillSubSelect(group){ const sel=document.getElementById('prsSubSelect'); if(!sel) return; const tree=getTree(); const subs = (tree[group]||[]); sel.innerHTML = ['<option value="">(Seçiniz)</option>'].concat(subs.map(s=>`<option value="${s}">${s}</option>`)).join(''); sel.disabled = !group; }
        function addCurrentStation(){ const g=(document.getElementById('prsGroupSelect')||{}).value||''; const s=(document.getElementById('prsSubSelect')||{}).value||''; if(!g||!s){ alert('Lütfen ana istasyon ve alt istasyon seçiniz'); return; } const label = `${g} / ${s}`; if(!CURRENT_STATIONS.includes(label)) CURRENT_STATIONS.push(label); renderSelectedChips(); }
        function renderSelectedChips(){ const box=document.getElementById('prsStationChips'); if(!box) return; box.innerHTML=''; CURRENT_STATIONS.forEach(l=>{ const chip=document.createElement('span'); chip.className='chip'; chip.textContent=l; const btn=document.createElement('button'); btn.className='btn danger small'; btn.textContent='×'; btn.style.height='24px'; btn.style.marginLeft='6px'; btn.addEventListener('click', ()=>{ CURRENT_STATIONS = CURRENT_STATIONS.filter(x=> x!==l); renderSelectedChips(); }); const wrap=document.createElement('div'); wrap.style.display='inline-flex'; wrap.style.alignItems='center'; wrap.style.gap='4px'; wrap.appendChild(chip); wrap.appendChild(btn); box.appendChild(wrap); }); }
      function readForm(){ const f=document.getElementById('frmPersonel'); if(!f) return null; return { id: f.dataset.editing||('prs_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)), adsoyad: f.adsoyad.value||'', tur: f.tur.value||'mavi', netMaas: f.netMaas.value||'', brutMaas: f.brutMaas.value||'', stations: (CURRENT_STATIONS||[])}; }
      function clearForm(){ const f=document.getElementById('frmPersonel'); if(!f) return; f.adsoyad.value=''; f.tur.value='mavi'; if(f.netMaas) f.netMaas.value=''; if(f.brutMaas) f.brutMaas.value=''; f.dataset.editing=''; CURRENT_STATIONS=[]; renderSelectedChips(); const g=document.getElementById('prsGroupSelect'); const s=document.getElementById('prsSubSelect'); if(g) g.value=''; if(s){ s.innerHTML='<option value="">(Seçiniz)</option>'; s.disabled=true; } }
      function loadToForm(rec){ const f=document.getElementById('frmPersonel'); if(!f) return; f.dataset.editing=rec.id; f.adsoyad.value=rec.adsoyad||''; f.tur.value=rec.tur||'mavi'; if(f.netMaas) f.netMaas.value=(rec.netMaas ?? rec.maas ?? '')||''; if(f.brutMaas) f.brutMaas.value=(rec.brutMaas ?? '')||''; const sel = (typeof window.normalizeStations==='function') ? window.normalizeStations(rec.stations||[]) : (rec.stations||[]); CURRENT_STATIONS = Array.from(new Set(sel)); renderSelectedChips(); }
      function renderList(){ const body=document.getElementById('prsBody'); if(!body) return; const q=(document.getElementById('prsSearch')?.value||'').toLowerCase(); const ft=(document.getElementById('prsFilterType')?.value||''); const arr=getPersonnel().filter(r=> (!ft||r.tur===ft) && (((r.adsoyad||'').toLowerCase().includes(q)) || ((r.stations||[]).join(',').toLowerCase().includes(q)))); body.innerHTML=''; if(arr.length===0){ const tr=document.createElement('tr'); tr.innerHTML = `<td colspan=\"6\" style=\"padding:10px 6px;color:#64748b;\">Kayıt yok. Soldaki formdan personel ekleyin.</td>`; body.appendChild(tr); } else { arr.forEach(r=>{ const tr=document.createElement('tr'); const yaka = (r.tur==='beyaz'?'Beyaz Yaka':'Mavi Yaka'); const stArr = (typeof window.normalizeStations==='function') ? window.normalizeStations(r.stations||[]) : (r.stations||[]); const st = stArr.join(', '); const net = r.netMaas ?? r.maas ?? ''; const brut = r.brutMaas ?? ''; tr.innerHTML = `<td style=\"padding:6px 4px;\">${yaka}</td><td style=\"padding:6px 4px;\">${st}</td><td style=\"padding:6px 4px;\">${r.adsoyad||''}</td><td style=\"padding:6px 4px;\">${net}</td><td style=\"padding:6px 4px;\">${brut}</td><td style=\"padding:6px 4px;\"><button class=\"btn small\" data-edit=\"${r.id}\">Düzenle</button> <button class=\"btn danger small\" data-del=\"${r.id}\">Sil</button></td>`; body.appendChild(tr); }); body.querySelectorAll('button[data-edit]').forEach(b=> b.addEventListener('click', function(){ const id=this.getAttribute('data-edit'); const rec=getPersonnel().find(x=>x.id===id); if(rec) loadToForm(rec); })); body.querySelectorAll('button[data-del]').forEach(b=> b.addEventListener('click', function(){ const id=this.getAttribute('data-del'); if(!confirm('Silinsin mi?')) return; const a=getPersonnel().filter(x=> x.id!==id); setPersonnel(a); renderList(); })); }
      }
      // Override renderList with a safe DOM-based implementation (avoids innerHTML)
      renderList = function(){
        const body=document.getElementById('prsBody'); if(!body) return;
        const q=(document.getElementById('prsSearch')?.value||'').toLowerCase();
        const ft=(document.getElementById('prsFilterType')?.value||'');
        const arr=getPersonnel().filter(r=> (!ft||r.tur===ft) && (((r.adsoyad||'').toLowerCase().includes(q)) || ((r.stations||[]).join(',').toLowerCase().includes(q))));
        while(body.firstChild) body.removeChild(body.firstChild);
        if(arr.length===0){ const tr=document.createElement('tr'); const td=document.createElement('td'); td.setAttribute('colspan','6'); td.style.padding='10px 6px'; td.style.color='#64748b'; td.textContent='Kayıt yok. Soldaki formdan personel ekleyin.'; tr.appendChild(td); body.appendChild(tr); return; }
        arr.forEach(r=>{
          const tr=document.createElement('tr');
          const yaka = (r.tur==='beyaz'?'Beyaz Yaka':'Mavi Yaka');
          const stArr = (typeof window.normalizeStations==='function') ? window.normalizeStations(r.stations||[]) : (r.stations||[]);
          const st = stArr.join(', ');
          const net = r.netMaas ?? r.maas ?? '';
          const brut = r.brutMaas ?? '';
          const tdYaka = document.createElement('td'); tdYaka.style.padding='6px 4px'; tdYaka.textContent = yaka;
          const tdSt = document.createElement('td'); tdSt.style.padding='6px 4px'; tdSt.textContent = st;
          const tdName = document.createElement('td'); tdName.style.padding='6px 4px'; tdName.textContent = r.adsoyad||'';
          const tdNet = document.createElement('td'); tdNet.style.padding='6px 4px'; tdNet.textContent = net;
          const tdBrut = document.createElement('td'); tdBrut.style.padding='6px 4px'; tdBrut.textContent = brut;
          const tdAct = document.createElement('td'); tdAct.style.padding='6px 4px';
          const btnEdit = document.createElement('button'); btnEdit.className='btn small'; btnEdit.type='button'; btnEdit.textContent='Düzenle'; btnEdit.addEventListener('click', function(){ loadToForm(r); });
          const btnDel = document.createElement('button'); btnDel.className='btn danger small'; btnDel.type='button'; btnDel.textContent='Sil'; btnDel.addEventListener('click', function(){ if(!confirm('Silinsin mi?')) return; const a=getPersonnel().filter(x=> x.id!==r.id); setPersonnel(a); renderList(); });
          tdAct.appendChild(btnEdit); tdAct.appendChild(document.createTextNode(' ')); tdAct.appendChild(btnDel);
          tr.appendChild(tdYaka); tr.appendChild(tdSt); tr.appendChild(tdName); tr.appendChild(tdNet); tr.appendChild(tdBrut); tr.appendChild(tdAct);
          body.appendChild(tr);
        });
      };
      function exportCsv(){ const arr=getPersonnel(); const head=['Yaka Durumu','Çalıştığı İstasyonlar','İsim Soyisim','Net Maaş (TL)','Brüt Maaş (TL)']; const rows=arr.map(r=> [ (r.tur==='beyaz'?'Beyaz Yaka':'Mavi Yaka'), (r.stations||[]).join('|'), r.adsoyad||'', (r.netMaas ?? r.maas ?? ''), (r.brutMaas ?? '') ]); function esc(v){ const s=String(v??''); return (s.includes(',')||s.includes('"')||s.includes('\n')) ? '"'+s.replace(/"/g,'""')+'"' : s; } const csv=[head.map(esc).join(','), ...rows.map(r=> r.map(esc).join(','))].join('\n'); const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='personel_listesi.csv'; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },100); }
          document.addEventListener('DOMContentLoaded', function(){ try{
            fillGroupSelect(); fillSubSelect(''); renderSelectedChips(); renderList();
            document.getElementById('prsGroupSelect')?.addEventListener('change', function(){ fillSubSelect(this.value||''); });
            document.getElementById('prsAddStation')?.addEventListener('click', addCurrentStation);
            document.getElementById('prsSave')?.addEventListener('click', function(){ const rec=readForm(); if(!rec) return; if(!(rec.adsoyad||'').trim()) return alert('Ad Soyad gerekli'); let arr=getPersonnel(); const idx=arr.findIndex(x=> x.id===rec.id); if(idx>=0) arr[idx]=rec; else arr.unshift(rec); setPersonnel(arr); clearForm(); renderList(); });
            document.getElementById('prsCancel')?.addEventListener('click', function(){ clearForm(); });
            document.getElementById('prsSearch')?.addEventListener('input', renderList); document.getElementById('prsFilterType')?.addEventListener('change', renderList);
            document.getElementById('prsExportCsv')?.addEventListener('click', exportCsv);
          }catch(_){ }});
          // Alt sekme aktifleştikçe görünümü tazele (koruyucu)
          document.addEventListener('maliyet_personel_activated', function(){ try{ fillGroupSelect(); fillSubSelect(''); renderSelectedChips(); renderList(); }catch(_){ } });
        })();
    
    /* ==== BODY inline script #44 ==== */
    (function(){
          const MACHINE_MATS_KEY = 'v91_machine_materials';
          function getAll(){ try{ return JSON.parse(localStorage.getItem(MACHINE_MATS_KEY)||'[]'); }catch(_){ return []; } }
          function setAll(a){ localStorage.setItem(MACHINE_MATS_KEY, JSON.stringify(a||[])); }
          function getMachines(){ try{ return JSON.parse(localStorage.getItem('v91_machines')||'[]'); }catch(_){ return []; } }
          function machineLabel(m){ return `${m.grup||''} / ${m.alt||''} / ${m.ad||''}`.replace(/^\s*\/\s*/,'').replace(/\s*\/\s*$/,''); }
          function fillMachineSelects(){
            const machines = getMachines();
            const sel1=document.querySelector('#frmMachineMat select[name="makine"]');
            const sel2=document.getElementById('mmFilterMachine');
            const opts = machines.map(m=> `<option value="${m.id}">${machineLabel(m)}</option>`).join('');
            if(sel1){ sel1.innerHTML = opts; sel1.disabled = machines.length===0; if(machines.length){ sel1.value = machines[0].id; } }
            if(sel2){ sel2.innerHTML = ['<option value="">(Tümü)</option>'].concat(machines.map(m=> `<option value="${m.id}">${machineLabel(m)}</option>`)).join(''); sel2.disabled = machines.length===0; }
          }
          function readForm(){ const f=document.getElementById('frmMachineMat'); if(!f) return null; const mid=f.makine.value||''; const m = getMachines().find(x=> x.id===mid); const mlabel = m? machineLabel(m) : ''; return { id: f.dataset.editing||('mm_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)), machineId: mid, machineLabel: mlabel, makine: (mlabel||''), ad: f.ad.value||'', birim: f.birim.value||'adet', fiyat: f.fiyat.value||'', omurDeger: f.omurDeger.value||'', omurBirim: f.omurBirim.value||'saat' };
          }
          function clearForm(){ const f=document.getElementById('frmMachineMat'); if(!f) return; f.dataset.editing=''; const machines=getMachines(); if(f.makine){ f.makine.innerHTML = machines.map(m=> `<option value="${m.id}">${machineLabel(m)}</option>`).join(''); f.makine.disabled = machines.length===0; f.makine.value = machines[0]?.id || ''; } f.ad.value=''; f.birim.value='adet'; f.fiyat.value=''; f.omurDeger.value=''; f.omurBirim.value='saat'; }
          function loadToForm(rec){ const f=document.getElementById('frmMachineMat'); if(!f) return; f.dataset.editing=rec.id; const machines=getMachines(); f.makine.innerHTML = machines.map(m=> `<option value="${m.id}">${machineLabel(m)}</option>`).join(''); const mid = rec.machineId || ''; if(mid){ f.makine.value=mid; } else { const found = machines.find(m=> machineLabel(m) === (rec.makine||'')); if(found) f.makine.value=found.id; } f.ad.value=rec.ad||''; f.birim.value=rec.birim||'adet'; f.fiyat.value=rec.fiyat||''; f.omurDeger.value=rec.omurDeger||''; f.omurBirim.value=rec.omurBirim||'saat'; }
          function renderList(){ const body=document.getElementById('mmBody'); if(!body) return; const q=(document.getElementById('mmSearch')?.value||'').toLowerCase(); const fm=(document.getElementById('mmFilterMachine')?.value||''); const arr=getAll().filter(r=> (!fm||((r.machineId||'')===fm)) && (((r.machineLabel||r.makine||'').toLowerCase().includes(q)) || ((r.ad||'').toLowerCase().includes(q)))); body.innerHTML=''; arr.forEach(r=>{ const tr=document.createElement('tr'); const om = (r.omurDeger? r.omurDeger+' ':'') + (r.omurBirim||''); const label = r.machineLabel || r.makine || ''; tr.innerHTML = `<td style=\"padding:6px 4px;\">${label}</td><td style=\"padding:6px 4px;\">${r.ad||''}</td><td style=\"padding:6px 4px;\">${r.birim||''}</td><td style=\"padding:6px 4px;\">${r.fiyat||''}</td><td style=\"padding:6px 4px;\">${om}</td><td style=\"padding:6px 4px;\"><button class=\"btn small\" data-edit=\"${r.id}\">Düzenle</button> <button class=\"btn danger small\" data-del=\"${r.id}\">Sil</button></td>`; body.appendChild(tr); }); body.querySelectorAll('button[data-edit]').forEach(b=> b.addEventListener('click', function(){ const id=this.getAttribute('data-edit'); const rec=getAll().find(x=> x.id===id); if(rec) loadToForm(rec); })); body.querySelectorAll('button[data-del]').forEach(b=> b.addEventListener('click', function(){ const id=this.getAttribute('data-del'); if(!confirm('Silinsin mi?')) return; const a=getAll().filter(x=> x.id!==id); setAll(a); renderList(); })); }
      // Safe override for mmBody renderList (DOM-based)
      renderList = function(){ const body=document.getElementById('mmBody'); if(!body) return; const q=(document.getElementById('mmSearch')?.value||'').toLowerCase(); const fm=(document.getElementById('mmFilterMachine')?.value||''); const arr=getAll().filter(r=> (!fm||((r.machineId||'')===fm)) && (((r.machineLabel||r.makine||'').toLowerCase().includes(q)) || ((r.ad||'').toLowerCase().includes(q)))); while(body.firstChild) body.removeChild(body.firstChild); if(arr.length===0){ const tr=document.createElement('tr'); const td=document.createElement('td'); td.setAttribute('colspan','6'); td.style.padding='10px 6px'; td.style.color='#64748b'; td.textContent='Kayıt yok. Soldaki formdan malzeme ekleyin.'; tr.appendChild(td); body.appendChild(tr); return; } arr.forEach(r=>{ const tr=document.createElement('tr'); const om = (r.omurDeger? r.omurDeger+' ':'') + (r.omurBirim||''); const label = r.machineLabel || r.makine || ''; const tdLabel=document.createElement('td'); tdLabel.style.padding='6px 4px'; tdLabel.textContent = label; const tdAd=document.createElement('td'); tdAd.style.padding='6px 4px'; tdAd.textContent = r.ad||''; const tdBirim=document.createElement('td'); tdBirim.style.padding='6px 4px'; tdBirim.textContent = r.birim||''; const tdFiyat=document.createElement('td'); tdFiyat.style.padding='6px 4px'; tdFiyat.textContent = r.fiyat||''; const tdOm=document.createElement('td'); tdOm.style.padding='6px 4px'; tdOm.textContent = om; const tdAct=document.createElement('td'); tdAct.style.padding='6px 4px'; const btnEdit=document.createElement('button'); btnEdit.className='btn small'; btnEdit.type='button'; btnEdit.textContent='Düzenle'; btnEdit.addEventListener('click', function(){ const rec=r; loadToForm(rec); }); const btnDel=document.createElement('button'); btnDel.className='btn danger small'; btnDel.type='button'; btnDel.textContent='Sil'; btnDel.addEventListener('click', function(){ if(!confirm('Silinsin mi?')) return; const a=getAll().filter(x=> x.id!==r.id); setAll(a); renderList(); }); tdAct.appendChild(btnEdit); tdAct.appendChild(document.createTextNode(' ')); tdAct.appendChild(btnDel); tr.appendChild(tdLabel); tr.appendChild(tdAd); tr.appendChild(tdBirim); tr.appendChild(tdFiyat); tr.appendChild(tdOm); tr.appendChild(tdAct); body.appendChild(tr); }); };
      function exportCsv(){ const arr=getAll(); const head=['Makine','Malzeme','Birim','Fiyat (TL/Birim)','Ömür Değer','Ömür Birim']; const rows=arr.map(r=> [(r.machineLabel||r.makine||''), r.ad||'', r.birim||'', r.fiyat||'', r.omurDeger||'', r.omurBirim||'']); function esc(v){ const s=String(v??''); return (s.includes(',')||s.includes('"')||s.includes('\n')) ? '"'+s.replace(/"/g,'""')+'"' : s; } const csv=[head.map(esc).join(','), ...rows.map(r=> r.map(esc).join(','))].join('\n'); const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='makine_malzemeleri.csv'; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },100); }
          document.addEventListener('DOMContentLoaded', function(){ try{
      fillMachineSelects(); renderList();
      document.getElementById('mmSave')?.addEventListener('click', function(){ const rec=readForm(); if(!rec) return; if(!((rec.machineId||'') && (rec.ad||''))) return alert('Makine ve Malzeme adı gerekli'); let a=getAll(); const idx=a.findIndex(x=> x.id===rec.id); if(idx>=0) a[idx]=rec; else a.unshift(rec); setAll(a); clearForm(); renderList(); });
            document.getElementById('mmCancel')?.addEventListener('click', function(){ clearForm(); });
            document.getElementById('mmSearch')?.addEventListener('input', renderList); document.getElementById('mmFilterMachine')?.addEventListener('change', renderList);
            document.getElementById('mmExportCsv')?.addEventListener('click', exportCsv);
          }catch(_){ }});
      document.addEventListener('maliyet_malzeme_activated', function(){ try{ fillMachineSelects(); renderList(); }catch(_){ } });
      document.addEventListener('machines_changed', function(){ try{ fillMachineSelects(); clearForm(); renderList(); }catch(_){ } });
        })();
    
    /* ==== BODY inline script #45 ==== */
    (function(){
          const MACHINES_KEY = 'v91_machines';
          function getAll(){ try{ return JSON.parse(localStorage.getItem(MACHINES_KEY)||'[]'); }catch(_){ return []; } }
          function setAll(a){ localStorage.setItem(MACHINES_KEY, JSON.stringify(a||[])); }
          function getTree(){ return (typeof window.getStationTree==='function') ? window.getStationTree() : {}; }
          function fillGroup(){ const sel=document.getElementById('mkGroup'); const tree=getTree(); const groups=Object.keys(tree); if(sel){ sel.innerHTML=['<option value="">(Seçiniz)</option>'].concat(groups.map(g=>`<option value="${g}">${g}</option>`)).join(''); } const fsel=document.getElementById('mkFilterGroup'); if(fsel){ fsel.innerHTML=['<option value="">(Tümü)</option>'].concat(groups.map(g=>`<option value="${g}">${g}</option>`)).join(''); } }
          function fillSub(group){ const sel=document.getElementById('mkSub'); if(!sel) return; const tree=getTree(); const subs=(tree[group]||[]); sel.innerHTML=['<option value="">(Seçiniz)</option>'].concat(subs.map(s=>`<option value="${s}">${s}</option>`)).join(''); sel.disabled=!group; }
          function readForm(){ const g=(document.getElementById('mkGroup')||{}).value||''; const s=(document.getElementById('mkSub')||{}).value||''; const ad=(document.getElementById('mkAd')||{}).value||''; const ac=(document.getElementById('mkAciklama')||{}).value||''; return { id:'mk_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), grup:g, alt:s, ad:ad, aciklama:ac } }
          function clearForm(){ const g=document.getElementById('mkGroup'); const s=document.getElementById('mkSub'); const ad=document.getElementById('mkAd'); const ac=document.getElementById('mkAciklama'); if(g) g.value=''; if(s){ s.innerHTML='<option value="">(Seçiniz)</option>'; s.disabled=true; } if(ad) ad.value=''; if(ac) ac.value=''; const frm=document.getElementById('frmMachines'); if(frm) frm.dataset.editing=''; }
          function loadToForm(rec){ const frm=document.getElementById('frmMachines'); if(!frm) return; frm.dataset.editing=rec.id; const g=document.getElementById('mkGroup'); const s=document.getElementById('mkSub'); const ad=document.getElementById('mkAd'); const ac=document.getElementById('mkAciklama'); if(g){ g.value=rec.grup||''; } fillSub(rec.grup||''); if(s){ s.value=rec.alt||''; } if(ad) ad.value=rec.ad||''; if(ac) ac.value=rec.aciklama||''; }
      function renderList(){ const body=document.getElementById('mkBody'); if(!body) return; const q=(document.getElementById('mkSearch')?.value||'').toLowerCase(); const fg=(document.getElementById('mkFilterGroup')?.value||''); const arr=getAll().filter(r=> (!fg||r.grup===fg) && ( (r.ad||'').toLowerCase().includes(q) || (r.grup||'').toLowerCase().includes(q) || (r.alt||'').toLowerCase().includes(q) )); body.innerHTML=''; if(arr.length===0){ const tr=document.createElement('tr'); tr.innerHTML=`<td colspan="5" style="padding:10px 6px;color:#64748b;">Kayıt yok. Soldaki formdan makine ekleyin.</td>`; body.appendChild(tr); } else { arr.forEach(r=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td style="padding:6px 4px;">${r.grup||''}</td><td style="padding:6px 4px;">${r.alt||''}</td><td style="padding:6px 4px;">${r.ad||''}</td><td style="padding:6px 4px;">${r.aciklama||''}</td><td style="padding:6px 4px;"><button class="btn small" data-edit="${r.id}">Düzenle</button> <button class="btn danger small" data-del="${r.id}">Sil</button></td>`; body.appendChild(tr); }); body.querySelectorAll('button[data-edit]').forEach(b=> b.addEventListener('click', function(){ const id=this.getAttribute('data-edit'); const rec=getAll().find(x=> x.id===id); if(rec) loadToForm(rec); })); body.querySelectorAll('button[data-del]').forEach(b=> b.addEventListener('click', function(){ const id=this.getAttribute('data-del'); if(!confirm('Silinsin mi?')) return; const a=getAll().filter(x=> x.id!==id); setAll(a); renderList(); try{ document.dispatchEvent(new CustomEvent('machines_changed')); }catch(_){ } })); }
          }
      // Safe override for mkBody renderList (DOM-based)
      renderList = function(){ const body=document.getElementById('mkBody'); if(!body) return; const q=(document.getElementById('mkSearch')?.value||'').toLowerCase(); const fg=(document.getElementById('mkFilterGroup')?.value||''); const arr=getAll().filter(r=> (!fg||r.grup===fg) && ( (r.ad||'').toLowerCase().includes(q) || (r.grup||'').toLowerCase().includes(q) || (r.alt||'').toLowerCase().includes(q) )); while(body.firstChild) body.removeChild(body.firstChild); if(arr.length===0){ const tr=document.createElement('tr'); const td=document.createElement('td'); td.setAttribute('colspan','5'); td.style.padding='10px 6px'; td.style.color='#64748b'; td.textContent='Kayıt yok. Soldaki formdan makine ekleyin.'; tr.appendChild(td); body.appendChild(tr); return; } arr.forEach(r=>{ const tr=document.createElement('tr'); const tdGrup=document.createElement('td'); tdGrup.style.padding='6px 4px'; tdGrup.textContent = r.grup||''; const tdAlt=document.createElement('td'); tdAlt.style.padding='6px 4px'; tdAlt.textContent = r.alt||''; const tdAd=document.createElement('td'); tdAd.style.padding='6px 4px'; tdAd.textContent = r.ad||''; const tdAc=document.createElement('td'); tdAc.style.padding='6px 4px'; tdAc.textContent = r.aciklama||''; const tdAct=document.createElement('td'); tdAct.style.padding='6px 4px'; const btnEdit=document.createElement('button'); btnEdit.className='btn small'; btnEdit.type='button'; btnEdit.textContent='Düzenle'; btnEdit.addEventListener('click', function(){ const rec=r; loadToForm(rec); }); const btnDel=document.createElement('button'); btnDel.className='btn danger small'; btnDel.type='button'; btnDel.textContent='Sil'; btnDel.addEventListener('click', function(){ if(!confirm('Silinsin mi?')) return; const a=getAll().filter(x=> x.id!==r.id); setAll(a); renderList(); try{ document.dispatchEvent(new CustomEvent('machines_changed')); }catch(_){ } }); tdAct.appendChild(btnEdit); tdAct.appendChild(document.createTextNode(' ')); tdAct.appendChild(btnDel); tr.appendChild(tdGrup); tr.appendChild(tdAlt); tr.appendChild(tdAd); tr.appendChild(tdAc); tr.appendChild(tdAct); body.appendChild(tr); }); };
      function save(){ const frm=document.getElementById('frmMachines'); if(!frm) return; const rec=readForm(); if(!(rec.grup&&rec.alt&&rec.ad)) return alert('Ana istasyon, alt istasyon ve makine adı gerekli'); let a=getAll(); const idx=a.findIndex(x=> x.id===frm.dataset.editing); if(idx>=0){ rec.id = frm.dataset.editing; a[idx]=rec; } else { a.unshift(rec); } setAll(a); clearForm(); renderList(); try{ document.dispatchEvent(new CustomEvent('machines_changed')); }catch(_){ } }
          function exportCsv(){ const arr=getAll(); const head=['Ana İstasyon','Alt İstasyon','Makine','Açıklama']; const rows=arr.map(r=> [r.grup||'', r.alt||'', r.ad||'', r.aciklama||'']); function esc(v){ const s=String(v??''); return (s.includes(',')||s.includes('"')||s.includes('\n')) ? '"'+s.replace(/"/g,'""')+'"' : s; } const csv=[head.map(esc).join(','), ...rows.map(r=> r.map(esc).join(','))].join('\n'); const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='makineler.csv'; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },100); }
          document.addEventListener('DOMContentLoaded', function(){ try{ fillGroup(); fillSub(''); renderList(); document.getElementById('mkGroup')?.addEventListener('change', function(){ fillSub(this.value||''); }); document.getElementById('mkSave')?.addEventListener('click', save); document.getElementById('mkCancel')?.addEventListener('click', clearForm); document.getElementById('mkSearch')?.addEventListener('input', renderList); document.getElementById('mkFilterGroup')?.addEventListener('change', renderList); document.getElementById('mkExportCsv')?.addEventListener('click', exportCsv); }catch(_){ } });
          document.addEventListener('maliyet_makineler_activated', function(){ try{ fillGroup(); renderList(); }catch(_){ } });
          document.addEventListener('maliyet_istasyonlar_activated', function(){ try{ fillGroup(); }catch(_){ } });
        })();
    
    /* ==== BODY inline script #46 ==== */
    (function(){
          function renderTree(){ const wrap=document.getElementById('stTreeWrap'); if(!wrap) return; wrap.innerHTML=''; const tree = (typeof window.getStationTree==='function') ? window.getStationTree() : {}; Object.keys(tree).forEach(group=>{ const card=document.createElement('div'); card.style.cssText='border:1px solid #e5e7eb;border-radius:8px;padding:10px;'; const head=document.createElement('div'); head.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;'; const title=document.createElement('div'); title.style.cssText='font-weight:600;'; title.textContent=group; const del=document.createElement('button'); del.className='btn danger small'; del.textContent='Grubu Sil'; del.addEventListener('click', ()=>{ if(!confirm(group+' grubu silinsin mi?')) return; const t=window.getStationTree(); delete t[group]; window.setStationTree(t); renderTree(); try{ document.dispatchEvent(new CustomEvent('maliyet_personel_activated')); }catch(_){ } }); head.appendChild(title); head.appendChild(del); card.appendChild(head); const list=document.createElement('div'); list.style.cssText='display:flex;flex-wrap:wrap;gap:8px;'; (tree[group]||[]).forEach(sub=>{ const chip=document.createElement('span'); chip.className='chip'; chip.textContent=sub; const btn=document.createElement('button'); btn.className='btn danger small'; btn.textContent='×'; btn.style.height='24px'; btn.style.marginLeft='6px'; btn.addEventListener('click', ()=>{ if(!confirm(sub+' silinsin mi?')) return; const t=window.getStationTree(); t[group] = (t[group]||[]).filter(x=> x!==sub); window.setStationTree(t); renderTree(); try{ document.dispatchEvent(new CustomEvent('maliyet_personel_activated')); }catch(_){ } }); const item=document.createElement('div'); item.style.cssText='display:inline-flex;align-items:center;gap:4px;'; item.appendChild(chip); item.appendChild(btn); list.appendChild(item); }); card.appendChild(list); const addRow=document.createElement('div'); addRow.style.cssText='display:flex;gap:8px;align-items:center;margin-top:8px;'; const inp=document.createElement('input'); inp.className='field'; inp.placeholder='Yeni alt istasyon'; inp.style.flex='1'; const addBtn=document.createElement('button'); addBtn.className='btn'; addBtn.textContent='Ekle'; addBtn.addEventListener('click', ()=>{ const v=(inp.value||'').trim(); if(!v) return; const t=window.getStationTree(); const arr = Array.from(new Set([...(t[group]||[]), v])); t[group]=arr; window.setStationTree(t); inp.value=''; renderTree(); try{ document.dispatchEvent(new CustomEvent('maliyet_personel_activated')); }catch(_){ } }); addRow.appendChild(inp); addRow.appendChild(addBtn); card.appendChild(addRow); wrap.appendChild(card); }); }
          document.addEventListener('DOMContentLoaded', function(){ try{ renderTree(); document.getElementById('stAddGroup')?.addEventListener('click', function(){ const name=(document.getElementById('stNewGroup')?.value||'').trim(); if(!name) return; const t=(typeof window.getStationTree==='function')?window.getStationTree():{}; if(!t[name]) t[name]=[]; window.setStationTree(t); document.getElementById('stNewGroup').value=''; renderTree(); try{ document.dispatchEvent(new CustomEvent('maliyet_personel_activated')); }catch(_){ } }); }catch(_){ } });
          document.addEventListener('maliyet_istasyonlar_activated', function(){ try{ renderTree(); }catch(_){ } });
        })();
    
    /* ==== BODY inline script #47 ==== */
    document.addEventListener('DOMContentLoaded', function(){
      const bar = document.getElementById('maliyet-subtabs'); if(!bar) return;
      const wrapper = document.getElementById('maliyet');
      const cards = Array.from(wrapper.querySelectorAll(':scope > .card'));
      const buttons = Array.from(bar.querySelectorAll('.subtab'));
      function showSub(sub){
        buttons.forEach(b=> b.classList.toggle('active', b.dataset.sub===sub));
        cards.forEach(c=> c.style.display = (c.id === sub+'-content') ? '' : 'none');
        if(sub==='maliyet_personel'){
          try{ document.dispatchEvent(new CustomEvent('maliyet_personel_activated')); }catch(_){ }
        }
        if(sub==='maliyet_malzeme'){
          try{ document.dispatchEvent(new CustomEvent('maliyet_malzeme_activated')); }catch(_){ }
        }
        if(sub==='maliyet_makineler'){
          try{ document.dispatchEvent(new CustomEvent('maliyet_makineler_activated')); }catch(_){ }
        }
        if(sub==='maliyet_istasyonlar'){
          try{ document.dispatchEvent(new CustomEvent('maliyet_istasyonlar_activated')); }catch(_){ }
        }
      }
      buttons.forEach(btn=> btn.addEventListener('click', function(){ showSub(btn.dataset.sub); }));
      const first = buttons.find(b=> b.classList.contains('active')) || buttons[0]; if(first) showSub(first.dataset.sub);
    });
    
    /* ==== BODY inline script #48 ==== */
    (function(){
      // Blok Analiz alt sekme yönetimi
      const BL_KEY = 'bloklar_yeni_demo';
      const buttons = document.querySelectorAll('#blok-analiz .subtab');
      
      function showSub(sub){
        document.querySelectorAll('#blok-analiz .subsection').forEach(s=> s.style.display='none');
        document.querySelectorAll('#blok-analiz .subtab').forEach(b=> b.classList.remove('active'));
        const content = document.getElementById(sub+'-content');
        if(content){ content.style.display='block'; }
        const btn = Array.from(buttons).find(b=> b.dataset.sub===sub);
        if(btn){ btn.classList.add('active'); }
        
        // Alt sekme değiştiğinde ilgili verileri yükle
        if(sub === 'blok-genel') loadBlokGenel();
        if(sub === 'blok-uretim') loadBlokUretim();
        if(sub === 'blok-verimlilik') loadBlokVerimlilik();
        if(sub === 'blok-maliyet') loadBlokMaliyet();
        if(sub === 'blok-manuel') loadBlokManuel();
      }
      
      buttons.forEach(btn=> btn.addEventListener('click', function(){ showSub(btn.dataset.sub); }));
      
      // Manuel Blok Analiz iframe yükleme (lazy-load)
      let manuelIframeLoaded = false;
      function loadBlokManuel(){
        if(manuelIframeLoaded) return;
        manuelIframeLoaded = true;
        
        const iframe = document.getElementById('blok-manuel-iframe');
        const placeholder = document.getElementById('blok-manuel-iframe-placeholder');
        
        if(!iframe) return;
        
        try {
          const path = 'Blok Analiz.html';
          iframe.src = path;
          iframe.style.display = 'block';
          if(placeholder) placeholder.style.display = 'none';
        } catch(e) {
          console.error('Manuel Blok Analiz iframe yüklenemedi:', e);
          if(placeholder) placeholder.textContent = 'Manuel Blok Analiz modülü yüklenemedi.';
        }
      }
      
      // Mevcut getBloklar fonksiyonunu kullan
      function getBloklar(){
        try{
          const key = BL_KEY || 'bloklar_yeni_demo';
          // Remote-first: prefer remote Apps Script when a valid GS_WEBAPP_URL is configured
          // remote preference: honor explicit user preference, runtime detection or developer flag
          const lsFlag = (localStorage.getItem && localStorage.getItem('v92_gs_use_remote') === '1');
          const useRemote = !!window.REMOTE_ENABLED || !!lsFlag || (!!GS_WEBAPP_URL && GS_WEBAPP_URL.indexOf('REPLACE')===-1);
          if(useRemote){
            // if we have an in-memory cache, return it
            if(Array.isArray(window._blokCache) && window._blokCache.length) return window._blokCache;
            // try cache key fallback
            try{
              const cachedRaw = localStorage.getItem(key + '_cache') || '[]';
              try{ const cached = JSON.parse(cachedRaw||'[]'); if(Array.isArray(cached) && cached.length) { window._blokCache = cached; return cached; } }catch(_){ /* ignore cached parse errors */ }
            }catch(_){ }
            // trigger async refresh from remote but don't block
            try{ remoteListAndReplaceLocal().then(()=>{ /* refreshed */ }).catch(()=>{}); }catch(_){ }
            // finally return localStorage value as fallback (safe-parse)
            try{
              const raw = localStorage.getItem(key) || '[]';
              try{ return JSON.parse(raw||'[]'); }catch(e){ if(typeof raw === 'string' && raw.trim() === 'done'){ try{ localStorage.removeItem(key); }catch(_){ } return []; } return []; }
            }catch(_){ return []; }
          }
          // non-remote path: safe-parse
          try{
            const raw2 = localStorage.getItem(BL_KEY) || '[]';
            try{ return JSON.parse(raw2||'[]'); }catch(e){ if(typeof raw2 === 'string' && raw2.trim() === 'done'){ try{ localStorage.removeItem(BL_KEY); }catch(_){ } return []; } return []; }
          }catch(_){ return []; }
        }catch(_){ return []; }
      }
      
      // Diğer veri kaynaklarını çek
      function getKatrakData(){
        try{ return JSON.parse(localStorage.getItem('v91_katrak_kayitlar')||'[]'); }catch(_){ return []; }
      }
      
      function getSayalamaData(){
        try{ return JSON.parse(localStorage.getItem('v91_sayalama_kayitlar')||'[]'); }catch(_){ return []; }
      }
      
      function getSaglamData(){
        const bohca = (function(){ try{ return JSON.parse(localStorage.getItem('v91_bohca_kayitlar')||'[]'); }catch(_){ return []; } })();
        const vakum = (function(){ try{ return JSON.parse(localStorage.getItem('v91_vakum_kayitlar')||'[]'); }catch(_){ return []; } })();
        return [...bohca, ...vakum];
      }
      
      function getPlakaFirinData(){
        try{ return JSON.parse(localStorage.getItem('v91_plaka_firin_kayitlar')||'[]'); }catch(_){ return []; }
      }
      
      function getPlakaSilimData(){
        try{ return JSON.parse(localStorage.getItem('v91_plaka_silim_kayitlar')||'[]'); }catch(_){ return []; }
      }
      
      // GENEL BAKIŞ - Tüm blokları listele
      function loadBlokGenel(){
        const bloklar = getBloklar();
        const katrak = getKatrakData();
        const sayalama = getSayalamaData();
        const saglam = getSaglamData();
        const plakaFirin = getPlakaFirinData();
        const plakaSilim = getPlakaSilimData();
        
        // İstatistikleri güncelle
        document.getElementById('blok-toplam').textContent = bloklar.length;
        
        // Her bloğun hangi aşamada olduğunu bul
        const blokDurumMap = {};
        bloklar.forEach(b => {
          const no = (b.blokNo||'').trim().toLowerCase();
          blokDurumMap[no] = { blok: b, asama: 'Ham', kayitSayisi: 0 };
        });
        
        // Aşamaları kontrol et
        let uretimdeCount = 0;
        let tamamlandiCount = 0;
        
        sayalama.forEach(k => {
          const no = (k.blokNo||'').trim().toLowerCase();
          if(blokDurumMap[no]){ 
            blokDurumMap[no].asama = 'Sayalama';
            blokDurumMap[no].kayitSayisi++;
          }
        });
        
        saglam.forEach(k => {
          const no = (k.blokNo||'').trim().toLowerCase();
          if(blokDurumMap[no]){ 
            blokDurumMap[no].asama = 'Sağlamlaştırma';
            blokDurumMap[no].kayitSayisi++;
          }
        });
        
        katrak.forEach(k => {
          const no = (k.blokNo||'').trim().toLowerCase();
          if(blokDurumMap[no]){ 
            blokDurumMap[no].asama = 'Katrak Kesim';
            blokDurumMap[no].kayitSayisi++;
          }
        });
        
        plakaFirin.forEach(k => {
          const no = (k.blokNo||'').trim().toLowerCase();
          if(blokDurumMap[no]){ 
            blokDurumMap[no].asama = 'Plaka Fırın';
            blokDurumMap[no].kayitSayisi++;
          }
        });
        
        plakaSilim.forEach(k => {
          const no = (k.blokNo||'').trim().toLowerCase();
          if(blokDurumMap[no]){ 
            blokDurumMap[no].asama = 'Tamamlandı';
            blokDurumMap[no].kayitSayisi++;
            tamamlandiCount++;
          }
        });
        
        // Üretimdeki blokları say (Ham dışında olanlar)
        Object.values(blokDurumMap).forEach(item => {
          if(item.asama !== 'Ham' && item.asama !== 'Tamamlandı') uretimdeCount++;
        });
        
        const bekleyenCount = bloklar.length - uretimdeCount - tamamlandiCount;
        
        document.getElementById('blok-uretimde').textContent = uretimdeCount;
        document.getElementById('blok-beklemede').textContent = bekleyenCount;
        document.getElementById('blok-tamamlanan').textContent = tamamlandiCount;
        
        // Tabloyu güncelle
        const tbody = document.getElementById('blok-genel-tbody');
        if(bloklar.length === 0){
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">Henüz blok kaydı yok. "Üretim Kayıt > Blok Listesi" sekmesinden blok ekleyebilirsiniz.</td></tr>';
          return;
        }
        
        tbody.innerHTML = bloklar.map(blok => {
          const no = (blok.blokNo||'').trim().toLowerCase();
          const durumInfo = blokDurumMap[no] || { asama: 'Ham', kayitSayisi: 0 };
          const durum = durumInfo.asama === 'Ham' ? 'Beklemede' : (durumInfo.asama === 'Tamamlandı' ? 'Tamamlandı' : 'Üretimde');
          const durumClass = durum === 'Beklemede' ? 'future' : (durum === 'Tamamlandı' ? 'past' : 'current');
          
          return `
            <tr>
              <td><strong>${blok.blokNo || '-'}</strong></td>
              <td>${blok.ocak || '-'}</td>
              <td>${blok.tarih ? new Date(blok.tarih).toLocaleDateString('tr-TR') : '-'}</td>
              <td><span class="asama-chip ${durumClass}">${durum}</span></td>
              <td><span class="chip">${durumInfo.asama}</span></td>
              <td class="right">${blok.agirlik ? Number(blok.agirlik).toLocaleString('tr-TR') : '-'}</td>
              <td class="right">${blok.hacim ? Number(blok.hacim).toFixed(2) : '-'}</td>
              <td style="text-align:center;">${durumInfo.kayitSayisi} kayıt</td>
            </tr>
          `;
        }).join('');
      }
      
      // ÜRETİM ANALİZİ - Filtreleme ve detaylı görünüm
      function loadBlokUretim(){
        // Ocak listesini doldur
        const bloklar = getBloklar();
        const ocaklar = [...new Set(bloklar.map(b => b.ocak).filter(Boolean))];
        const ocakSelect = document.getElementById('blok-uretim-ocak');
        ocakSelect.innerHTML = '<option value="">Tüm Ocaklar</option>' + 
          ocaklar.map(o => `<option value="${o}">${o}</option>`).join('');
      }
      
      // VERİMLİLİK - İstatistikler ve performans
      function loadBlokVerimlilik(){
        const katrak = getKatrakData();
        const sayalama = getSayalamaData();
        const saglam = getSaglamData();
        const plakaFirin = getPlakaFirinData();
        
        const toplamIslem = katrak.length + sayalama.length + saglam.length + plakaFirin.length;
        const bloklar = getBloklar();
        const ortSure = bloklar.length > 0 ? Math.round(toplamIslem / bloklar.length) : 0;
        
        document.getElementById('blok-ort-sure').textContent = ortSure;
        document.getElementById('blok-verimlilik').textContent = '75%'; // Örnek
        document.getElementById('blok-fire').textContent = '12%'; // Örnek
        document.getElementById('blok-kapasite').textContent = '68%'; // Örnek
        
        // Aşama bazlı tablo
        const tbody = document.getElementById('blok-verimlilik-tbody');
        tbody.innerHTML = `
          <tr><td>Sayalama</td><td>${sayalama.length}</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
          <tr><td>Sağlamlaştırma</td><td>${saglam.length}</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
          <tr><td>Katrak Kesim</td><td>${katrak.length}</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
          <tr><td>Plaka Fırın</td><td>${plakaFirin.length}</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
        `;
      }
      
      // MALİYET - Maliyet analizi
      function loadBlokMaliyet(){
        document.getElementById('blok-toplam-maliyet').textContent = '₺0';
        document.getElementById('blok-birim-maliyet').textContent = '₺0';
        document.getElementById('blok-max-maliyet').textContent = '₺0';
        document.getElementById('blok-butce').textContent = '0%';
        
        const tbody = document.getElementById('blok-maliyet-tbody');
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">Maliyet verileri "Üretim Maliyet" sekmesinden hesaplanmaktadır.</td></tr>';
      }
      
      // Global fonksiyonlar
      window.blokAnalizFiltrele = function(){
        const baslangic = document.getElementById('blok-uretim-baslangic').value;
        const bitis = document.getElementById('blok-uretim-bitis').value;
        const ocak = document.getElementById('blok-uretim-ocak').value;
        const asama = document.getElementById('blok-uretim-asama').value;
        
        let bloklar = getBloklar();
        
        // Filtreleme
        if(ocak) bloklar = bloklar.filter(b => b.ocak === ocak);
        if(baslangic) bloklar = bloklar.filter(b => !b.tarih || new Date(b.tarih) >= new Date(baslangic));
        if(bitis) bloklar = bloklar.filter(b => !b.tarih || new Date(b.tarih) <= new Date(bitis));
        
        // Sonuçları göster
        const tbody = document.getElementById('blok-uretim-tbody');
        if(bloklar.length === 0){
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">Filtreye uygun blok bulunamadı</td></tr>';
          return;
        }
        
        tbody.innerHTML = bloklar.map(b => `
          <tr>
            <td><strong>${b.blokNo}</strong></td>
            <td>${b.ocak || '-'}</td>
            <td>${b.tarih ? new Date(b.tarih).toLocaleDateString('tr-TR') : '-'}</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
          </tr>
        `).join('');
      };
      
      window.blokAnalizSifirla = function(){
        document.getElementById('blok-uretim-baslangic').value = '';
        document.getElementById('blok-uretim-bitis').value = '';
        document.getElementById('blok-uretim-ocak').value = '';
        document.getElementById('blok-uretim-asama').value = '';
        document.getElementById('blok-uretim-tbody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">Filtreleme yapın veya veri yükleyin</td></tr>';
      };
      
      // İlk yükleme
      setTimeout(function(){
        if(buttons[0]) showSub(buttons[0].dataset.sub);
      }, 100);
    })();
    
    /* ==== BODY inline script #49 ==== */
    (function(){
        // Lazy-load satın alma iframe benzeri diğer iframe patternlerine uygun şekilde
        let loaded = false;
        const frame = function(){ return document.getElementById('satinalma-iframe'); };
        function getFrameOrigin(frm){
          try{
            if(!frm) return null;
            const src = frm.getAttribute && frm.getAttribute('src') ? frm.getAttribute('src') : frm.src || '';
            if(!src) return null;
            return new URL(src, location.href).origin;
          }catch(_){ return null; }
        }
        function postToChild(type, payload){
          try{
            const f = frame(); if(!f || !f.contentWindow) return;
            // file:// altında child origin 'null' olur — güvenli iletişim için '*' kullan
            const origin = (location && location.protocol === 'file:') ? '*' : (getFrameOrigin(f) || '*');
            f.contentWindow.postMessage(Object.assign({ type: type }, payload||{}), origin);
          }catch(_){ }
        }
        const placeholder = function(){ return document.getElementById('satinalma-iframe-placeholder'); };
        function ensureIframe(){
          if(loaded) return;
          const f = frame(); if(!f) return;
          // göreli yol: depo-sifirdan/index.html — eğer farklı bir yere taşınmışsa güncelleyin
          const url = encodeURI('depo-sifirdan/index.html');
    
          // Note: when opened via file:// some absolute /api requests from the child
          // will be blocked by the browser. We still load the iframe and let the
          // child module fall back to a localStorage-backed API when necessary.
          // A friendly hint can be shown inside the child module instead of blocking here.
    
          f.addEventListener('load', function(){ try{ placeholder()?.remove(); f.style.display = ''; }catch(_){ } });
          f.src = url;
          loaded = true;
          // After load handshake will be sent from load handler; also try best-effort now (some browsers fire load quickly)
          try{ postToChild('host.init', { origin: window.location.origin || location.origin }); }catch(_){ }
        }
        // Sekme tıklanmasıyla lazy yükle
        document.addEventListener('DOMContentLoaded', function(){
          try{
            const tabBtn = document.querySelector('.tabs .tab[data-target="satinalma"]');
            if(tabBtn){ tabBtn.addEventListener('click', function(){ setTimeout(ensureIframe, 10); }, { once:false }); }
            // Eğer sayfa açılışında zaten aktifse hemen yükle
            const sec = document.getElementById('satinalma');
            if(sec && sec.classList.contains('active')){ setTimeout(ensureIframe, 10); }
          }catch(_){ setTimeout(ensureIframe, 200); }
        });
      })();
    
    /* ==== BODY inline script #50 ==== */
    // Üretim Maliyet Hesaplama: parametre kaydı + tarih aralığına göre hesaplama ve CSV dışa aktarım
    (function(){
      const COST_KEY = 'v91_cost_params';
      function toNum(v){ try{ if(typeof window.num==='function') return window.num(v); const n=parseFloat(String(v).replace(/\./g,'').replace(',','.')); return isNaN(n)?0:n; }catch(_){ return 0; } }
      function fmt(v){ try{ return (typeof window.nf3==='object'&&window.nf3.format)? window.nf3.format(v) : (Number(v)||0).toLocaleString('tr-TR'); }catch(_){ return String(v); } }
      function getCostParams(){
        try{ return Object.assign({
          cost_katrak_per_m3: '', cost_pf_per_m2: '', cost_ff_per_m2: '', cost_epoxy_per_kg: '',
          energy_katrak_per_m3: '', energy_pf_per_m2: '', energy_ff_per_m2: '',
          labor_katrak_per_m3: '', labor_pf_per_m2: '', labor_ff_per_m2: '',
          amort_katrak_per_m3: '', amort_pf_per_m2: '', amort_ff_per_m2: '',
          other_total: '', labor_include_white: false, labor_distribute_other: false, labor_salary_basis: 'brut'
        }, JSON.parse(localStorage.getItem(COST_KEY)||'{}')); }catch(_){ return {}; }
      }
      function setCostParams(obj){ try{ localStorage.setItem(COST_KEY, JSON.stringify(obj||{})); }catch(_){ }
      }
      function fillParamsForm(){ const f=document.getElementById('frmCostParams'); if(!f) return; const p=getCostParams();
        ['cost_katrak_per_m3','cost_pf_per_m2','cost_ff_per_m2','cost_epoxy_per_kg','energy_katrak_per_m3','energy_pf_per_m2','energy_ff_per_m2','labor_katrak_per_m3','labor_pf_per_m2','labor_ff_per_m2','amort_katrak_per_m3','amort_pf_per_m2','amort_ff_per_m2','other_total'].forEach(n=>{ if(f[n]) f[n].value = p[n]??''; });
        if(f.labor_include_white) f.labor_include_white.checked = !!p.labor_include_white;
        if(f.labor_distribute_other) f.labor_distribute_other.checked = !!p.labor_distribute_other;
        if(f.labor_salary_basis) f.labor_salary_basis.value = p.labor_salary_basis||'brut';
      }
      function readParamsForm(){ const f=document.getElementById('frmCostParams'); if(!f) return getCostParams();
        const o={}; ['cost_katrak_per_m3','cost_pf_per_m2','cost_ff_per_m2','cost_epoxy_per_kg','energy_katrak_per_m3','energy_pf_per_m2','energy_ff_per_m2','labor_katrak_per_m3','labor_pf_per_m2','labor_ff_per_m2','amort_katrak_per_m3','amort_pf_per_m2','amort_ff_per_m2','other_total'].forEach(n=>{ o[n]=f[n]?.value||''; });
        o.labor_include_white = !!f.labor_include_white?.checked; o.labor_distribute_other = !!f.labor_distribute_other?.checked; o.labor_salary_basis = f.labor_salary_basis?.value||'brut'; return o;
      }
    
      function parseDate(s){ if(!s) return null; const d=new Date(s); return isNaN(d.getTime())?null:d; }
      function inRange(dateStr, fromStr, toStr){ const d=parseDate(dateStr); if(!d) return false; const f=parseDate(fromStr); const t=parseDate(toStr); if(f && d < new Date(f.getFullYear(), f.getMonth(), f.getDate())) return false; if(t){ const tend = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23,59,59,999); if(d>tend) return false; } return true; }
    
      // Data kaynakları (diğer script bloklarında tanımlı fonksiyonlar mevcut)
      function safe(fn, fallback){ try{ return fn(); }catch(_){ return fallback; } }
      function getKatrak(){ return safe(()=> (typeof getKatrakList==='function'? getKatrakList():[]), []); }
      function getPF(){ return safe(()=> (typeof window.getPF==='function'? window.getPF():[]), []); }
      function getFF(){ return safe(()=> (typeof window.getFF==='function'? window.getFF():[]), []); }
      function getPfOverrides(){ return safe(()=> (typeof window.getPfOverrides==='function'? window.getPfOverrides():{}), {}); }
      function getFfOverrides(){ return safe(()=> (typeof window.getFfOverrides==='function'? window.getFfOverrides():{}), {}); }
    
      function epoxyKgInRange(from, to){
        // Öncelik: günlük override haritaları; yoksa kayıt satırlarındaki epoxyKg alanı
        const oPF = getPfOverrides(); const oFF = getFfOverrides();
        let sum=0; const add=(v)=>{ const n=toNum(v); if(!isNaN(n)) sum+=n; };
        const addMap=(m)=>{ Object.keys(m||{}).forEach(d=>{ if(inRange(d,from,to)) add(m[d]); }); };
        if(oPF && Object.keys(oPF).length) addMap(oPF); else getPF().forEach(r=>{ if(inRange(r.tarih||'',from,to)) add(r.epoxyKg||0); });
        if(oFF && Object.keys(oFF).length) addMap(oFF); else getFF().forEach(r=>{ if(inRange(r.tarih||'',from,to)) add(r.epoxyKg||0); });
        return sum;
      }
    
      function collectUnits(from, to){
        // Katrak m3: cikTarih varsa onu, yoksa girTarih'e göre filtrele
        let kat_m3 = 0; getKatrak().forEach(r=>{ const d = (r.cikTarih||r.girTarih||''); if(!inRange(d,from,to)) return; kat_m3 += toNum(r.m3||0); });
        let pf_m2 = 0; getPF().forEach(r=>{ if(!inRange(r.tarih||'',from,to)) return; pf_m2 += toNum(r.m2||0); });
        let ff_m2 = 0; getFF().forEach(r=>{ if(!inRange(r.tarih||'',from,to)) return; ff_m2 += toNum(r.m2||0); });
        let epoxy_kg = epoxyKgInRange(from,to);
        return { kat_m3, pf_m2, ff_m2, epoxy_kg };
      }
    
      function calcRows(){
        const from = document.getElementById('cost_from')?.value||'';
        const to   = document.getElementById('cost_to')?.value||'';
        const u = collectUnits(from,to);
        const p = getCostParams();
        const rows = [];
        function add(kalem, miktar, birim, birimMaliyet){ const q=Number(miktar)||0; const unit=toNum(birimMaliyet||0); const tutar = q*unit; rows.push({ kalem, miktar:q, birim, birimMaliyet:unit, tutar }); }
        // Üretim
        add('Katrak - Üretim', u.kat_m3, 'm³', p.cost_katrak_per_m3);
        add('Plaka Fırın - Üretim', u.pf_m2, 'm²', p.cost_pf_per_m2);
        add('Fayans Fırın - Üretim', u.ff_m2, 'm²', p.cost_ff_per_m2);
        // Enerji
        add('Katrak - Enerji', u.kat_m3, 'm³', p.energy_katrak_per_m3);
        add('Plaka Fırın - Enerji', u.pf_m2, 'm²', p.energy_pf_per_m2);
        add('Fayans Fırın - Enerji', u.ff_m2, 'm²', p.energy_ff_per_m2);
        // İşçilik (şimdilik birim oran üzerinden)
        add('Katrak - İşçilik', u.kat_m3, 'm³', p.labor_katrak_per_m3);
        add('Plaka Fırın - İşçilik', u.pf_m2, 'm²', p.labor_pf_per_m2);
        add('Fayans Fırın - İşçilik', u.ff_m2, 'm²', p.labor_ff_per_m2);
        // Amortisman
        add('Katrak - Amortisman', u.kat_m3, 'm³', p.amort_katrak_per_m3);
        add('Plaka Fırın - Amortisman', u.pf_m2, 'm²', p.amort_pf_per_m2);
        add('Fayans Fırın - Amortisman', u.ff_m2, 'm²', p.amort_ff_per_m2);
        // Epoxy
        add('Epoxy', u.epoxy_kg, 'kg', p.cost_epoxy_per_kg);
        // Diğer (toplam)
        const other = toNum(p.other_total||0); if(other){ rows.push({ kalem:'Diğer', miktar:1, birim:'adet', birimMaliyet:other, tutar:other }); }
        return rows;
      }
    
      function render(){ const body=document.getElementById('costResultBody'); const totalCell=document.getElementById('costTotalCell'); if(!body||!totalCell) return; const rows=calcRows(); // clear previous
        while(body.firstChild) body.removeChild(body.firstChild);
        let total=0;
        if(rows.length===0){
          const tr=document.createElement('tr');
          const td=document.createElement('td');
          td.setAttribute('colspan','5');
          td.style.padding = '8px 4px';
          td.style.color = '#64748b';
          td.textContent = 'Hesaplanacak kalem bulunamadı. Tarih aralığı ve parametreleri kontrol edin.';
          tr.appendChild(td);
          body.appendChild(tr);
        } else {
          rows.forEach(r=>{
            total += (Number(r.tutar)||0);
            const tr = document.createElement('tr');
            const td1 = document.createElement('td'); td1.style.padding='6px 4px'; td1.textContent = r.kalem;
            const td2 = document.createElement('td'); td2.style.padding='6px 4px'; td2.textContent = fmt(r.miktar);
            const td3 = document.createElement('td'); td3.style.padding='6px 4px'; td3.textContent = r.birim;
            const td4 = document.createElement('td'); td4.style.padding='6px 4px'; td4.textContent = fmt(r.birimMaliyet);
            const td5 = document.createElement('td'); td5.style.padding='6px 4px'; td5.textContent = fmt(r.tutar);
            tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tr.appendChild(td4); tr.appendChild(td5);
            body.appendChild(tr);
          });
        }
        totalCell.textContent = fmt(total);
        // Son hesabı butonlar için cachele
        body.dataset.rowsJson = JSON.stringify(rows);
      }
    
      function exportCsv(){ const body=document.getElementById('costResultBody'); if(!body) return; let rows=[]; try{ rows = JSON.parse(body.dataset.rowsJson||'[]'); }catch(_){ rows=[]; } if(!(rows&&rows.length)) return alert('Önce Hesapla butonuna basın.'); const head=['Kalem','Miktar','Birim','Birim Maliyet','Tutar']; function esc(v){ const s=String(v??''); return (s.includes(',')||s.includes('"')||s.includes('\n'))? '"'+s.replace(/"/g,'""')+'"' : s; } const csv=[head.map(esc).join(','), ...rows.map(r=> [r.kalem, r.miktar, r.birim, r.birimMaliyet, r.tutar].map(esc).join(','))].join('\n'); const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='uretim_maliyet_ozet.csv'; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },100); }
    
      document.addEventListener('DOMContentLoaded', function(){ try{
        // Parametre formu
        fillParamsForm();
        document.getElementById('costParamsSaveBtn')?.addEventListener('click', function(){ setCostParams(readParamsForm()); alert('Parametreler kaydedildi.'); });
        document.getElementById('costParamsResetBtn')?.addEventListener('click', function(){ localStorage.removeItem(COST_KEY); fillParamsForm(); alert('Parametreler sıfırlandı.'); });
        // Hesaplama + CSV
        document.getElementById('calcCostBtn')?.addEventListener('click', render);
        document.getElementById('exportCostCsvBtn')?.addEventListener('click', exportCsv);
      }catch(_){ }
      });
    })();
    
    /* ==== BODY inline script #51 ==== */
    // Ayarlar > Server Ayarları: subtab wiring
      document.addEventListener('DOMContentLoaded', function(){
        try{
          const ayarlar = document.getElementById('ayarlar'); if(!ayarlar) return;
          const tabs = Array.from(ayarlar.querySelectorAll('#ayarlar-subtabs .subtab'));
          const cards = tabs.map(btn => ayarlar.querySelector(`#${btn.dataset.sub}-content`)).filter(Boolean);
          function activate(sub){
            tabs.forEach(b=> b.classList.toggle('active', (b.dataset.sub===sub)));
            cards.forEach(c=>{ c.style.display = (c.id === `${sub}-content`) ? '' : 'none'; });
            // If server settings activated, move any existing Office Panel inside the server container
            try{
              if(sub === 'server_ayar'){
                const panel = document.getElementById('ensarOfficePanel');
                const container = document.getElementById('server_office_panel_container');
                if(panel && container && panel.parentElement !== container){ container.appendChild(panel); }
              }
            }catch(_){ }
          }
          tabs.forEach(btn=> btn.addEventListener('click', ()=> activate(btn.dataset.sub)));
          const active = tabs.find(b=> b.classList.contains('active')) || tabs[0];
          if(active) activate(active.dataset.sub);
          // Wire fix-delete-perm buttons if present
          try{
            const fixBtn = document.getElementById('fix-delete-perm-btn');
            if(fixBtn){
              fixBtn.addEventListener('click', function(){
                try{
                  const aid = localStorage.getItem('v91_active_user_id') || '';
                  let users = JSON.parse(localStorage.getItem('v91_users')||'[]'); if(!Array.isArray(users)) users=[];
                  let me = users.find(u=> (u.id||u.name||'') === aid);
                  if(me){ me.role='admin'; }
                  else {
                    const id = aid || ('admin_'+Date.now().toString(36));
                    me = { id: id, name: id, role: 'admin', passHash: '' };
                    users.push(me);
                    localStorage.setItem('v91_active_user_id', id);
                  }
                  localStorage.setItem('v91_users', JSON.stringify(users));
                  try{ alert('Aktif kullanıcı admin yapıldı. Sayfa yenileniyor.'); }catch(_){ }
                  location.reload();
                }catch(e){ console.error('fix-delete failed', e); alert('Yetki düzeltilemedi: ' + (e && e.message)); }
              });
            }
            const createBtn = document.getElementById('create-admin-btn');
            if(createBtn){
              createBtn.addEventListener('click', function(){
                try{
                  let users = JSON.parse(localStorage.getItem('v91_users')||'[]'); if(!Array.isArray(users)) users=[];
                  const id = 'admin_'+Date.now().toString(36);
                  users.push({ id: id, name: 'Admin', role: 'admin', passHash: '' });
                  localStorage.setItem('v91_users', JSON.stringify(users));
                  localStorage.setItem('v91_active_user_id', id);
                  try{ alert('Yeni admin oluşturuldu ve oturum açıldı. Sayfa yenileniyor.'); }catch(_){ }
                  location.reload();
                }catch(e){ console.error('create-admin failed', e); alert('Oluşturma başarısız: ' + (e && e.message)); }
              });
            }
          }catch(_){ }
          // Wire force-delete debug controls
          try{
            const statusEl = document.getElementById('perm-status');
            function refreshPermStatus(){
              try{
                const u = (typeof getActiveUser==='function') ? getActiveUser() : (function(){ try{ const id=localStorage.getItem('v91_active_user_id')||''; const users=JSON.parse(localStorage.getItem('v91_users')||'[]'); const uu=(users||[]).find(x=> (x.id||x.name||'')===id); return uu||{id:id||'guest',name:uu?.name||id||'guest',role:uu?.role||'user'};}catch(_){return {id:'guest',name:'guest',role:'user'};} })();
                const canDel = (typeof can==='function') ? !!can('delete') : false;
                if(statusEl) statusEl.textContent = 'Kullanıcı: ' + (u.name||u.id) + '  Rol: ' + (u.role||'') + '  (Silme: ' + (canDel ? 'Evet' : 'Hayır') + ')';
              }catch(_){ }
            }
            refreshPermStatus();
            // Refresh when storage changes (role changes)
            window.addEventListener('storage', refreshPermStatus);
    
            const forceBtn = document.getElementById('force-delete-btn');
            if(forceBtn){
              forceBtn.addEventListener('click', async function(){
                try{
                  const bn = (document.getElementById('force-delete-blokno')?.value||'').trim();
                  if(!bn){ alert('Lütfen bir Blok No girin'); return; }
                  if(!confirm('Bu bloğu zorla silmek istediğinize emin misiniz? Blok No: ' + bn)) return;
                  const key = window.BL_KEY || 'bloklar_yeni_demo';
                  let arr = [];
                  try{ arr = JSON.parse(localStorage.getItem(key)||'[]'); }catch(_){ arr = []; }
                  // pre-backup
                  const ts = new Date().toISOString().replace(/[:.]/g,'-');
                  localStorage.setItem(key + '_preForceDelete_' + ts, JSON.stringify(arr));
                  const next = (arr||[]).filter(x=> String((x && x.blokNo)||'').trim().toLowerCase() !== bn.trim().toLowerCase());
                  localStorage.setItem(key, JSON.stringify(next));
                  try{ if(typeof renderBloklar==='function') renderBloklar(); }catch(_){ }
                  alert('Silme (zorla) tamamlandı. Önceki versiyon yedeklendi: ' + key + '_preForceDelete_' + ts);
                  refreshPermStatus();
                }catch(e){ console.error('force delete failed', e); alert('Zorla silme başarısız: ' + (e && e.message)); }
              });
            }
          }catch(_){ }
        }catch(_){ }
      });
    
    /* ==== BODY inline script #52 ==== */
    // GS Sync Test handlers (moved inside Server Ayarları)
      (function(){
        var KEY = 'v92_gs_webapp_url';
        var panel = document.getElementById('gs-sync-test');
        var inp = document.getElementById('gs-sync-url');
        var out = document.getElementById('gs-sync-result');
        function now(){ return (new Date()).toISOString(); }
        function log(v){ try{ out.textContent = now() + ' — ' + JSON.stringify(v,null,2); }catch(e){ out.textContent = String(v); } }
        try{ document.getElementById('gs-sync-close').addEventListener('click', function(){ panel.style.display='none'; }); }catch(_){ }
        try{ document.getElementById('gs-sync-save').addEventListener('click', function(){
          var url = inp.value.trim(); if(!url) return alert('Lütfen URL girin');
          localStorage.setItem(KEY, url); alert('Kaydedildi');
        }); }catch(_){ }
        function getExec(){ return (inp && inp.value && inp.value.trim()) ? inp.value.trim() : (localStorage.getItem(KEY)||''); }
    
        // JSONP helper
        function jsonpCall(url, cbName, cb){
          // JSONP removed: call callback with explicit error
          try{ cb(new Error('JSONP disabled in this build.')); }catch(_){ }
        };
    
          try{
          document.getElementById('gs-test-list').addEventListener('click', async function(){
            var exec = getExec(); if(!exec) return alert('WebApp URL yok');
            log('Uzak listesi isteniyor (remoteListAndReplaceLocal) ...');
            try{
              var prev = GS_WEBAPP_URL;
              try{ GS_WEBAPP_URL = exec; const res = await remoteListAndReplaceLocal(); log(res); }
              finally{ GS_WEBAPP_URL = prev; }
            }catch(e){ log({err:String(e)}); }
          });
          document.getElementById('gs-test-upsert').addEventListener('click', async function(){
            var exec = getExec(); if(!exec) return alert('WebApp URL yok');
            var rec = { id: 'test-jsonp-' + (Math.floor(Math.random()*9000)+1000), name: 'TarayıcıDeneme', adet:1 };
            log('Uzak upsert (remoteUpsert): ' + rec.id);
            try{
              var prev = GS_WEBAPP_URL;
              try{ GS_WEBAPP_URL = exec; const res = await remoteUpsert(rec); log(res); }
              finally{ GS_WEBAPP_URL = prev; }
            }catch(e){ log({err:String(e)}); }
          });
          document.getElementById('gs-test-post-json').addEventListener('click', async function(){
            var exec = getExec(); if(!exec) return alert('WebApp URL yok');
            var rec = { id:'test-json-' + (Math.floor(Math.random()*9000)+1000), name:'PostJSON', adet:2 };
            log('POST (upsert) gönderiliyor via remoteUpsert...');
            try{
              var prev = GS_WEBAPP_URL;
              try{ GS_WEBAPP_URL = exec; const res = await remoteUpsert(rec); log(res); }
              finally{ GS_WEBAPP_URL = prev; }
            }catch(e){ log({err:String(e)}); }
          });
          document.getElementById('gs-test-post-form').addEventListener('click', async function(){
            var exec = getExec(); if(!exec) return alert('WebApp URL yok');
            var rec = { id:'test-form-' + (Math.floor(Math.random()*9000)+1000), name:'PostForm', adet:3 };
            log('POST form (upsert) gönderiliyor via _gsPostForm...');
            try{
              var prev = GS_WEBAPP_URL;
              try{ GS_WEBAPP_URL = exec; const res = await remoteUpsert(rec); log(res); }
              finally{ GS_WEBAPP_URL = prev; }
            }catch(e){ log({err:String(e)}); }
          });
        }catch(_){ }
    
        try{ if(inp) inp.value = localStorage.getItem(KEY) || ''; }catch(e){}
      })();
    
    /* ==== BODY inline script #53 ==== */
    /* ------------------ Sabitler & Yardımcılar ------------------ */
        const ASAMALAR = ['Ham','Sayalama','Sağlamlaştırma','Katrak','Plaka Fırın'];
        // Aşama geçiş yardımcıları
        function nextStage(cur){
          try{
            const list = ASAMALAR;
            const i = Math.max(0, list.indexOf(cur));
            const j = Math.min(list.length-1, i+1);
            return list[j] || 'Ham';
          }catch(_){ return 'Ham'; }
        }
        function prevStage(cur){
          try{
            const list = ASAMALAR;
            const i = Math.max(0, list.indexOf(cur));
            const j = Math.max(0, i-1);
            return list[j] || 'Ham';
          }catch(_){ return 'Ham'; }
        }
        window.nextStage = nextStage; window.prevStage = prevStage;
        // returns HTML fragment of stage badges for display in tables
        // Non-linear flow support: a blok may enter Sağlamlaştırma without Sayalama.
        // We therefore mark stages as 'past' only if there is an actual record for that blok in that stage.
        function getSayalama(){ try { return JSON.parse(localStorage.getItem(SY_KEY)||'[]'); } catch(e){ return []; } }
        function getCompletedStagesForBlok(blokNo){
          const completed = new Set();
          const key = (blokNo||'').trim().toLowerCase(); if(!key) return completed;
          // Eğer Plaka Silim kaydı varsa: iş kuralı gereği TÜM aşamalar tamam sayılır
          let hasPS = false;
          try{ hasPS = (getPS?.()||[]).some(r=> (r.blokNo||'').trim().toLowerCase() === key); }catch(_){ hasPS = false; }
          if(hasPS){ ASAMALAR.forEach(a=> completed.add(a)); return completed; }
          // Ham: blok kayıtlıysa kabul (başlangıç durumu)
          try{
            const all = JSON.parse(localStorage.getItem(BL_KEY)||'[]') || [];
            if(all.some(b=> (b.blokNo||'').trim().toLowerCase() === key)) completed.add('Ham');
          }catch(_){ }
          try{ if(getSayalama().some(r=> (r.blokNo||'').trim().toLowerCase() === key)) completed.add('Sayalama'); }catch(_){ }
          try{ if((getBohca()||[]).some(r=> (r.blokNo||'').trim().toLowerCase() === key)) completed.add('Sağlamlaştırma'); }catch(_){ }
          try{ if((getVakum()||[]).some(r=> (r.blokNo||'').trim().toLowerCase() === key)) completed.add('Sağlamlaştırma'); }catch(_){ }
          try{ if((getKatrakList()||[]).some(r=> (r.blokNo||'').trim().toLowerCase() === key)) completed.add('Katrak'); }catch(_){ }
          // Plaka Fırın tamam kabul için Plaka Silim kaydı şart (PF verisi tek başına yeterli değil)
          // Bu nedenle burada PF kaydına bakmıyoruz; sadece PS mevcutsa en başta tüm aşamaları tamamladık.
          return completed;
        }
        function asamaBadgeList(current, blokNo){
          try{
            const completed = getCompletedStagesForBlok(blokNo);
            const allDone = completed.size === ASAMALAR.length;
            return ASAMALAR.map(a=>{
              let cls = 'asama-chip';
              if(!allDone && a === current){ cls += ' current'; }
              else if(completed.has(a)){ cls += ' past'; }
              else { cls += ' future'; }
              return `<span class=\"${cls}\" title=\"${a}\">${a}</span>`;
            }).join('');
          }catch(e){ return '';} 
        }
        window.asamaBadgeList = asamaBadgeList;
        const BL_KEY = 'bloklar_yeni_demo';
        const SY_KEY = 'v91_sayalama_kayitlar';
        // Remote sync helper for Sayalama records. Attempts POST to API_BASE/GS_WEBAPP_URL
        // with action=upsert and key=SY_KEY, falls back to JSONP if necessary. Non-blocking.
        async function syncSayalamaRecord(rec){
          try{
            const base = window.API_BASE || window.GS_WEBAPP_URL || (localStorage.getItem && localStorage.getItem('v92_gs_webapp_url'));
            if(!base) return { ok:false, reason: 'no api base configured' };
            const baseStr = String(base);
            // If base looks like our local_proxy, use its /db API for persistence
            const isLocalDb = baseStr.indexOf('localhost:3001') !== -1 || baseStr.indexOf('127.0.0.1:3001') !== -1 || baseStr.indexOf('/db/blocks') !== -1;
            if(isLocalDb){
              try{
                const upUrl = (baseStr.endsWith('/') ? baseStr.slice(0,-1) : baseStr);
                const target = upUrl.endsWith('/db') ? upUrl + '/blocks' : (upUrl + '/db/blocks');
                const r = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec) });
                if(r && r.ok){
                  const body = await r.json().catch(()=>null);
                  return body || { ok:true, localDb:true };
                }
              }catch(err){ console.warn('[syncSayalamaRecord] local /db upsert failed', err); }
            }

            // prefer POST to remote endpoint
            try{
              const url = (baseStr.endsWith('/')?baseStr.slice(0,-1):baseStr);
              const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'upsert', key: SY_KEY, record: rec })
              });
              if(res && res.ok){
                const body = await res.json().catch(()=>null);
                return body || { ok:true };
              }
            }catch(postErr){ console.warn('[syncSayalamaRecord] POST failed', postErr); }

            // JSONP fallback (Apps Script compatible)
            try{
              if(typeof window._jsonpRequest === 'function' && window._ALLOW_JSONP){
                const recStr = encodeURIComponent(JSON.stringify(rec||{}));
                const sep = (baseStr.indexOf('?') === -1) ? '?' : '&';
                const url = (baseStr.endsWith('/') ? baseStr.slice(0,-1) : baseStr) + sep + 'action=upsert&key=' + encodeURIComponent(SY_KEY) + '&record=' + recStr;
                const jp = await window._jsonpRequest(url, 20000);
                if(jp && jp.ok) return jp;
              } else {
                try{ window._logSkippedJsonp && window._logSkippedJsonp(baseStr, '[syncSayalamaRecord] JSONP fallback skipped'); }catch(_){ }
              }
            }catch(jsonpErr){ console.warn('[syncSayalamaRecord] JSONP fallback failed', jsonpErr); }
              return { ok:false };
            }catch(e){ console.error('[syncSayalamaRecord] error', e); return { ok:false, error: String(e) }; }
          }

          // Queue failed syncs for retry and a background worker to flush them
          function enqueueSync(item){
            try{
              const qk = 'v91_sync_queue';
              const arr = JSON.parse(localStorage.getItem(qk)||'[]');
                        // add metadata for retry tracking
                        const meta = { ts: Date.now(), retryCount: 0, lastError: null, lastAttempt: null };
                        arr.push(Object.assign(meta, item));
              localStorage.setItem(qk, JSON.stringify(arr));
              // debug logging removed
            }catch(e){ console.warn('enqueueSync failed', e); }
          }

          // Helper to update local record ids & alt-block sourceIds when server returns canonical id
          function applyServerIdToLocal(oldId, serverId){
            try{
              if(!oldId || !serverId) return;
              // Update sayalama records
              const arr = JSON.parse(localStorage.getItem(SY_KEY)||'[]');
              let changed=false;
              for(let i=0;i<arr.length;i++){
                if(arr[i] && arr[i].id === oldId){ arr[i].id = serverId; changed=true; }
              }
              if(changed) try{ localStorage.setItem(SY_KEY, JSON.stringify(arr)); }catch(_){ }
              // Update alt-bloklar sourceId
              const sarr = JSON.parse(localStorage.getItem(SBL_KEY)||'[]');
              let sChanged=false;
              for(let i=0;i<sarr.length;i++){
                if(sarr[i] && sarr[i].sourceId === oldId){ sarr[i].sourceId = serverId; sChanged=true; }
              }
              if(sChanged) try{ localStorage.setItem(SBL_KEY, JSON.stringify(sarr)); }catch(_){ }
              try{ if(changed && typeof renderSayalamaList === 'function') renderSayalamaList(); }catch(_){ }
              try{ if(sChanged && typeof renderSBloklar === 'function') renderSBloklar(); }catch(_){ }
            }catch(e){ console.warn('applyServerIdToLocal failed', e); }
          }

          // debug helpers removed

          // Generic syncRecord function (global) — used by processSyncQueue and scheduleSync
          // Moved to top-level to avoid ReferenceError when called from other scopes.
          async function syncRecord(storeKey, rec){
            try{
              if(!rec || !storeKey) return { ok:false };
              // try local proxy path first (dev friendly)
              try{
                const base = (typeof API_BASE === 'string' && API_BASE) ? API_BASE : null;
                if(base && base.indexOf('localhost')>=0){
                  try{
                    const urlBase = (base.replace(/\/+$/,''));
                    const target = urlBase.endsWith('/db') ? urlBase + '/blocks' : (urlBase + '/db/blocks');
                    const res = await fetch(target, { method: 'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ key: storeKey, record: rec }) });
                    if(res && res.ok){ const b = await res.json().catch(()=>null); return b || { ok:true }; }
                  }catch(_){ }
                }
              }catch(_){ }

              // try configured remote API (Apps Script style)
              try{
                const baseStr = (typeof API_BASE === 'string' && API_BASE) ? API_BASE : (typeof GS_WEBAPP_URL === 'string' ? GS_WEBAPP_URL : null);
                if(baseStr){
                  const res = await fetch(baseStr, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ action:'upsert', key: storeKey, record: rec }) });
                  if(res && res.ok){ const body = await res.json().catch(()=>null); return body || { ok:true }; }
                }
              }catch(_){ }

              // JSONP fallback
              try{
                const baseStr = (typeof API_BASE === 'string' && API_BASE) ? API_BASE : (typeof GS_WEBAPP_URL === 'string' ? GS_WEBAPP_URL : null);
                if(baseStr && typeof window._jsonpRequest === 'function' && window._ALLOW_JSONP){
                  const recStr = encodeURIComponent(JSON.stringify(rec||{}));
                  const sep = (baseStr.indexOf('?') === -1) ? '?' : '&';
                  const url = (baseStr.endsWith('/') ? baseStr.slice(0,-1) : baseStr) + sep + 'action=upsert&key=' + encodeURIComponent(storeKey) + '&record=' + recStr;
                  const jp = await window._jsonpRequest(url, 20000);
                  if(jp && jp.ok) return jp;
                } else {
                  try{ window._logSkippedJsonp && window._logSkippedJsonp(baseStr, '[syncRecord] JSONP upsert skipped'); }catch(_){ }
                }
              }catch(_){ }

              return { ok:false };
            }catch(e){ console.warn('[syncRecord] error', e); return { ok:false, error: String(e) }; }
          }

          async function processSyncQueue(){
            try{
              const qk = 'v91_sync_queue';
              const queue = JSON.parse(localStorage.getItem(qk)||'[]');
              if(!Array.isArray(queue) || queue.length===0) return;
              const remaining = [];
              const MAX_RETRY = 5; // after this, move to dead-letter for manual inspection
              for(const item of queue){
                try{
                  if(!item || !item.key){ remaining.push(item); continue; }
                  // if too many retries, move to dead-letter queue for manual inspection
                  if((item.retryCount||0) >= MAX_RETRY){
                    try{
                      const dk = 'v91_sync_dead';
                      const darr = JSON.parse(localStorage.getItem(dk)||'[]');
                      darr.push(Object.assign({ removedAt: Date.now(), note: 'max retries reached' }, item));
                      localStorage.setItem(dk, JSON.stringify(darr));
                    }catch(_){ }
                    continue; // drop from active queue
                  }
                  // touch lastAttempt
                  item.lastAttempt = Date.now();
                  // delete action support
                  if(item.action === 'delete'){
                    if(!item.id){ remaining.push(item); continue; }
                    const dr = await syncDelete(item.key, item.id);
                    if(dr && dr.ok) { continue; }
                    // failed -> increment retry metadata
                    item.retryCount = (item.retryCount||0) + 1;
                    item.lastError = (dr && dr.error) ? String(dr.error) : 'delete failed';
                    remaining.push(item);
                    continue;
                  }
                  if(!item.rec){ remaining.push(item); continue; }
                  // try generic record sync by key (upsert)
                  const oldId = item.rec.id;
                  const r = await syncRecord(item.key, item.rec);
                  if(r && r.ok){
                    const sid = (r.id || (r.result && r.result.id) || (r.record && r.record.id) || null);
                    if(sid) applyServerIdGeneric(oldId, sid, item.key);
                    continue; // succeeded
                  }
                  // failed -> increment retry metadata and keep for retry
                  item.retryCount = (item.retryCount||0) + 1;
                  item.lastError = (r && r.error) ? String(r.error) : 'sync failed';
                  remaining.push(item);
                }catch(e){
                  try{ item.retryCount = (item.retryCount||0) + 1; item.lastError = String(e); }catch(_){ }
                  remaining.push(item);
                }
              }
              localStorage.setItem(qk, JSON.stringify(remaining));
              if(remaining.length===0){ try{ showToast && showToast('Bekleyen kayıtlar eşitlendi',2000); }catch(_){ } }
              else { try{ showToast && showToast(remaining.length + ' kayıt eşitlenemedi, daha sonra tekrar denenecek',3000); }catch(_){ } }
            }catch(e){ console.warn('processSyncQueue failed', e); }
          }

          // Start periodic processing (every 30s) when page loads
          try{
            if(typeof window !== 'undefined'){
              // expose for manual triggering from console
              try{ window.processSyncQueue = processSyncQueue; }catch(_){ }
              window.addEventListener('DOMContentLoaded', function(){
                try{ processSyncQueue(); }catch(_){ }
                try{ window._syncQueueInterval = setInterval(processSyncQueue, 30000); }catch(_){ }
              });
            }
          }catch(_){ }
          const BOH_KEY = 'v91_bohca_kayitlar';
        const VAK_KEY = 'v91_vakum_kayitlar';
      const KATRK_KEY = 'v91_katrak_kayitlar';
      const PF_KEY = 'v91_plaka_firin_kayitlar';
      const PS_KEY = 'v91_plaka_silim_kayitlar';
      const SBL_KEY = 'v91_sayalanmis_bloklar'; // sayalamadan çıkan alt bloklar
        const FF_KEY = 'v91_fayans_firin_kayitlar';
    
        const PF_OVR_KEY = 'v91_pf_epoxy_daily_overrides';
        /* ---- Admin - Gizli JSON dışa aktarma (seçim modlu) ---- */
        window._exportSelectMode = window._exportSelectMode || false;
        window._selBloklar = window._selBloklar || new Set();
        window._lastRenderedBlokKeys = window._lastRenderedBlokKeys || [];
        function _keyOfBlokNo(no){ return String(no||'').trim().toLowerCase(); }
        function isCurrentUserAdmin(){
          try{
            const uid = (typeof getActiveUserId==='function') ? getActiveUserId() : '';
            // Ayarlar sekmesini görebilen kullanıcıyı admin sayıyoruz
            return (typeof isAllowed==='function') ? !!isAllowed(uid, 'sec_ayarlar') : true;
          }catch(_){ return true; }
        }
        function ensureAdminExportBar(){
          let bar = document.getElementById('adminExportBar');
          if(bar) return bar;
          bar = document.createElement('div');
          bar.id = 'adminExportBar';
          bar.style.cssText = 'position:fixed; right:12px; bottom:12px; z-index:9999; display:none; background:#111827; color:#fff; padding:10px 12px; border-radius:10px; box-shadow:0 6px 20px rgba(0,0,0,0.25); gap:8px; align-items:center;';
          bar.innerHTML = '<span id="adminSelCount" style="font-weight:700; font-size:12px; margin-right:8px;">0 seçili</span>'+
            '<button id="btnAdminSelAll" class="btn small" style="background:#374151;color:#fff;">Görünümü Seç</button>'+
            '<button id="btnAdminClrSel" class="btn small" style="background:#374151;color:#fff;">Seçimi Temizle</button>'+
            '<button id="btnAdminExportSel" class="btn small" style="background:#10b981;color:#063;">Seçilileri JSON</button>'+
            '<button id="btnAdminExportAll" class="btn small" style="background:#3b82f6;color:#fff;">Görünümü JSON</button>'+
            '<button id="btnAdminSyncQueue" class="btn small" style="background:#8b5cf6;color:#fff;margin-left:6px;">Sync Kuyruğu</button>'+
            '<button id="btnAdminDeadQueue" class="btn small" style="background:#ef4444;color:#fff;margin-left:6px;">Dead Kuyruğu</button>'+
            '<button id="btnAdminExitSel" class="btn small danger" style="margin-left:4px;">Kapat</button>';
          document.body.appendChild(bar);
          // Eventler
          bar.querySelector('#btnAdminSelAll').addEventListener('click', function(){ try{
            (window._lastRenderedBlokKeys||[]).forEach(k=> window._selBloklar.add(k));
            updateAdminSelCount(); renderBloklar?.();
          }catch(_){ } });
          bar.querySelector('#btnAdminClrSel').addEventListener('click', function(){ try{ window._selBloklar.clear(); updateAdminSelCount(); renderBloklar?.(); }catch(_){ } });
          bar.querySelector('#btnAdminExportSel').addEventListener('click', async function(){ try{
            const arr = await (typeof getBloklar==='function' ? getBloklar() : []);
            const keys = Array.from(window._selBloklar||[]);
            const out = arr.filter(b=> keys.includes(_keyOfBlokNo(b?.blokNo)));
            doDownloadJSON(out, 'bloklar_secili');
          }catch(e){ alert('Dışa aktarım hatası: '+(e&&e.message)); } });
          bar.querySelector('#btnAdminExportAll').addEventListener('click', async function(){ try{
            const arr = await (typeof getBloklar==='function' ? getBloklar() : []);
            const keys = new Set(window._lastRenderedBlokKeys||[]);
            const out = arr.filter(b=> keys.has(_keyOfBlokNo(b?.blokNo)));
            doDownloadJSON(out, 'bloklar_gorunum');
          }catch(e){ alert('Dışa aktarım hatası: '+(e&&e.message)); } });
          bar.querySelector('#btnAdminExitSel').addEventListener('click', function(){ toggleExportSelectMode(false); });
          // Sync queue viewer
          const _bSync = bar.querySelector('#btnAdminSyncQueue'); if(_bSync) _bSync.addEventListener('click', function(){ try{ openSyncQueueModal(); }catch(_){ } });
          // Dead queue viewer
          const _bDead = bar.querySelector('#btnAdminDeadQueue'); if(_bDead) _bDead.addEventListener('click', function(){ try{ openDeadQueueModal(); }catch(_){ } });
          return bar;
        }
        // --- Sync queue modal ---
        function createSyncQueueModal(){
          if(document.getElementById('syncQueueModal')) return;
          const modal = document.createElement('div'); modal.id = 'syncQueueModal';
          modal.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:none;align-items:center;justify-content:center;z-index:10000;padding:20px;';
          modal.innerHTML = '<div style="width:800px;max-width:95%;background:#fff;border-radius:8px;padding:12px;box-shadow:0 10px 30px rgba(0,0,0,0.3);">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
            + '<strong>Sync Kuyruğu</strong>'
            + '<div><button id="syncQueueRetry" class="btn small" style="margin-right:8px;background:#10b981;color:#fff;">Tekrar Dene</button>'
            + '<button id="syncQueueClear" class="btn small danger">Temizle</button>'
            + '<button id="syncQueueClose" class="btn small" style="margin-left:8px;">Kapat</button></div></div>'
            + '<div id="syncQueueList" style="max-height:400px;overflow:auto;border:1px solid #eee;padding:8px;border-radius:6px;background:#fafafa;font-size:13px;"></div>'
            + '</div>';
          document.body.appendChild(modal);
          modal.querySelector('#syncQueueClose').addEventListener('click', function(){ modal.style.display='none'; });
          modal.querySelector('#syncQueueClear').addEventListener('click', function(){ try{ localStorage.setItem('v91_sync_queue','[]'); renderSyncQueue(); showToast && showToast('Kuyruk temizlendi'); }catch(e){ console.error(e); } });
          modal.querySelector('#syncQueueRetry').addEventListener('click', function(){ try{ processSyncQueue(); setTimeout(renderSyncQueue, 1200); showToast && showToast('Kuyruk işleniyor...'); }catch(e){ console.error(e); } });
        }
        function renderSyncQueue(){
          try{
            createSyncQueueModal();
            const modal = document.getElementById('syncQueueModal'); if(!modal) return;
            const list = modal.querySelector('#syncQueueList'); if(!list) return;
            const q = JSON.parse(localStorage.getItem('v91_sync_queue')||'[]');
            if(!Array.isArray(q) || q.length===0){ list.innerHTML = '<div style="padding:12px;color:#555;">Kuyrukta bekleyen öğe yok.</div>'; return; }
            list.innerHTML = '';
            q.forEach((it, idx)=>{
              const wrap = document.createElement('div');
              wrap.style.cssText = 'padding:8px;border-bottom:1px solid #eee;display:flex;gap:8px;align-items:flex-start;';
              const meta = document.createElement('div'); meta.style.cssText='flex:1;';
              const lines = [];
              lines.push('<div><strong>#'+(idx+1)+'</strong> — key: '+(it.key||'')+' action: '+(it.action||'upsert')+'</div>');
              try{
                lines.push('<div style="color:#666;font-size:12px;">oluşturulma: '+(it.ts||'')+'</div>');
                lines.push('<div style="color:#666;font-size:12px;">retry: '+(it.retryCount||0)+'</div>');
                if(it.lastAttempt) try{ lines.push('<div style="color:#666;font-size:12px;">son deneme: '+(new Date(it.lastAttempt).toLocaleString())+'</div>'); }catch(_){ }
                if(it.lastError) try{ lines.push('<div style="color:#a00;font-size:12px;margin-top:4px;">Hata: '+escapeHtml(String(it.lastError||'')).slice(0,300)+'</div>'); }catch(_){ }
                lines.push('<pre style="white-space:pre-wrap;margin:6px 0 0 0;padding:6px;background:#fff;border:1px solid #f3f3f3;border-radius:4px;font-size:12px;">'+escapeHtml(JSON.stringify(it.rec||{id:it.id||''}, null, 2))+'</pre>');
              }catch(_){ }
              meta.innerHTML = lines.join('');
              const btns = document.createElement('div'); btns.style.cssText='display:flex;flex-direction:column;gap:6px;';
              const btnRetry = document.createElement('button'); btnRetry.className='btn small'; btnRetry.textContent='Tekrar Dene';
              btnRetry.addEventListener('click', function(){ try{
                const arr = JSON.parse(localStorage.getItem('v91_sync_queue')||'[]');
                const cur = arr[idx];
                if(!cur){ showToast && showToast('Kuyruk öğesi bulunamadı'); renderSyncQueue(); return; }
                if(cur.action==='delete'){
                  syncDelete(cur.key, cur.id).then(r=>{
                    if(r && r.ok){ arr.splice(idx,1); localStorage.setItem('v91_sync_queue', JSON.stringify(arr)); renderSyncQueue(); showToast && showToast('Silme başarılı'); }
                    else { cur.retryCount = (cur.retryCount||0)+1; cur.lastAttempt = Date.now(); cur.lastError = (r && r.error) ? String(r.error) : 'Silme başarısız'; localStorage.setItem('v91_sync_queue', JSON.stringify(arr)); renderSyncQueue(); showToast && showToast('Silme başarısız'); }
                  }).catch(e=>{ cur.retryCount = (cur.retryCount||0)+1; cur.lastAttempt = Date.now(); cur.lastError = String(e); localStorage.setItem('v91_sync_queue', JSON.stringify(arr)); renderSyncQueue(); showToast && showToast('Hata: ' + (e && e.message)); });
                } else {
                  syncRecord(cur.key, cur.rec).then(r=>{
                    if(r && r.ok){ const sid = (r.id || (r.result && r.result.id) || (r.record && r.record.id) || null); if(sid) applyServerIdGeneric(cur.rec && cur.rec.id, sid, cur.key); arr.splice(idx,1); localStorage.setItem('v91_sync_queue', JSON.stringify(arr)); renderSyncQueue(); showToast && showToast('Eşitleme başarılı'); }
                    else { cur.retryCount = (cur.retryCount||0)+1; cur.lastAttempt = Date.now(); cur.lastError = (r && r.error) ? String(r.error) : 'Eşitleme başarısız'; localStorage.setItem('v91_sync_queue', JSON.stringify(arr)); renderSyncQueue(); showToast && showToast('Eşitleme başarısız'); }
                  }).catch(e=>{ cur.retryCount = (cur.retryCount||0)+1; cur.lastAttempt = Date.now(); cur.lastError = String(e); localStorage.setItem('v91_sync_queue', JSON.stringify(arr)); renderSyncQueue(); showToast && showToast('Hata: ' + (e && e.message)); });
                }
              }catch(e){ console.error(e); } });
              const btnRemove = document.createElement('button'); btnRemove.className='btn small danger'; btnRemove.textContent='Kaldır'; btnRemove.addEventListener('click', function(){ try{ const arr = JSON.parse(localStorage.getItem('v91_sync_queue')||'[]'); arr.splice(idx,1); localStorage.setItem('v91_sync_queue', JSON.stringify(arr)); renderSyncQueue(); showToast && showToast('Öğe kaldırıldı'); }catch(e){ console.error(e); } });
              btns.appendChild(btnRetry); btns.appendChild(btnRemove); wrap.appendChild(meta); wrap.appendChild(btns); list.appendChild(wrap);
            });
          }catch(e){ console.error('renderSyncQueue failed', e); }
        }
        // --- Dead queue modal ---
        function createDeadQueueModal(){
          if(document.getElementById('deadQueueModal')) return;
          const modal = document.createElement('div'); modal.id = 'deadQueueModal';
          modal.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:none;align-items:center;justify-content:center;z-index:10000;padding:20px;';
          modal.innerHTML = '<div style="width:800px;max-width:95%;background:#fff;border-radius:8px;padding:12px;box-shadow:0 10px 30px rgba(0,0,0,0.3);">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
            + '<strong>Dead Kuyruğu</strong>'
            + '<div><button id="deadQueueRequeue" class="btn small" style="margin-right:8px;background:#10b981;color:#fff;">Kuyruğa Al</button>'
            + '<button id="deadQueueExport" class="btn small" style="margin-right:8px;background:#3b82f6;color:#fff;">Dışa Aktar</button>'
            + '<button id="deadQueueClose" class="btn small" style="margin-left:8px;">Kapat</button></div></div>'
            + '<div id="deadQueueList" style="max-height:400px;overflow:auto;border:1px solid #eee;padding:8px;border-radius:6px;background:#fff8f8;font-size:13px;color:#111;"></div>'
            + '</div>';
          document.body.appendChild(modal);
          modal.querySelector('#deadQueueClose').addEventListener('click', function(){ modal.style.display='none'; });
          modal.querySelector('#deadQueueExport').addEventListener('click', function(){ try{ const arr = JSON.parse(localStorage.getItem('v91_sync_dead')||'[]'); doDownloadJSON(arr, 'sync_dead'); }catch(e){ console.error(e); } });
          modal.querySelector('#deadQueueRequeue').addEventListener('click', function(){ try{ const dq = JSON.parse(localStorage.getItem('v91_sync_dead')||'[]'); if(!Array.isArray(dq) || dq.length===0){ showToast && showToast('Dead kuyruk boş'); return; } const q = JSON.parse(localStorage.getItem('v91_sync_queue')||'[]'); // move all back with reset
            dq.forEach(it=>{ const item = Object.assign({}, it); item.ts = Date.now(); item.retryCount = 0; item.lastError = null; item.lastAttempt = null; // remove dead-only fields
              // remove dead metadata if present
              delete item.removedAt; delete item.note; q.push(item); });
            localStorage.setItem('v91_sync_queue', JSON.stringify(q)); localStorage.setItem('v91_sync_dead','[]'); renderDeadQueue(); showToast && showToast('Tüm öğeler kuyruga alındı'); }catch(e){ console.error(e); } });
        }

        function renderDeadQueue(){ try{ createDeadQueueModal(); const modal = document.getElementById('deadQueueModal'); if(!modal) return; const list = modal.querySelector('#deadQueueList'); if(!list) return; const q = JSON.parse(localStorage.getItem('v91_sync_dead')||'[]'); if(!Array.isArray(q) || q.length===0){ list.innerHTML = '<div style="padding:12px;color:#555;">Dead kuyrukta öğe yok.</div>'; return; } list.innerHTML = ''; q.forEach((it, idx)=>{ const wrap = document.createElement('div'); wrap.style.cssText='padding:8px;border-bottom:1px solid #f3e5e5;display:flex;gap:8px;align-items:flex-start;background:#fff7f7;'; const meta = document.createElement('div'); meta.style.cssText='flex:1;'; const lines = []; lines.push('<div><strong>#'+(idx+1)+'</strong> — key: '+(it.key||'')+' action: '+(it.action||'upsert')+'</div>'); try{ lines.push('<div style="color:#666;font-size:12px;">oluşturulma: '+(it.ts||'')+'</div>'); if(it.removedAt) try{ lines.push('<div style="color:#666;font-size:12px;">removed: '+(new Date(it.removedAt).toLocaleString())+'</div>'); }catch(_){ } if(it.lastError) try{ lines.push('<div style="color:#a00;font-size:12px;margin-top:4px;">Hata: '+escapeHtml(String(it.lastError||'')).slice(0,300)+'</div>'); }catch(_){ } lines.push('<pre style="white-space:pre-wrap;margin:6px 0 0 0;padding:6px;background:#fff;border:1px solid #f3f3f3;border-radius:4px;font-size:12px;color:#111;">'+escapeHtml(JSON.stringify(it.rec||{id:it.id||''}, null, 2))+'</pre>'); }catch(_){ } meta.innerHTML = lines.join(''); const btns = document.createElement('div'); btns.style.cssText='display:flex;flex-direction:column;gap:6px;'; const btnReq = document.createElement('button'); btnReq.className='btn small'; btnReq.textContent='Kuyruğa Al'; btnReq.addEventListener('click', function(){ try{ const dead = JSON.parse(localStorage.getItem('v91_sync_dead')||'[]'); const item = dead[idx]; if(!item) return; const qarr = JSON.parse(localStorage.getItem('v91_sync_queue')||'[]'); const it2 = Object.assign({}, item); it2.ts = Date.now(); it2.retryCount = 0; it2.lastError = null; it2.lastAttempt = null; delete it2.removedAt; delete it2.note; qarr.push(it2); dead.splice(idx,1); localStorage.setItem('v91_sync_queue', JSON.stringify(qarr)); localStorage.setItem('v91_sync_dead', JSON.stringify(dead)); renderDeadQueue(); showToast && showToast('Öğe kuyruğa alındı'); }catch(e){ console.error(e); } }); const btnRemove = document.createElement('button'); btnRemove.className='btn small danger'; btnRemove.textContent='Kaldır'; btnRemove.addEventListener('click', function(){ try{ const dead = JSON.parse(localStorage.getItem('v91_sync_dead')||'[]'); dead.splice(idx,1); localStorage.setItem('v91_sync_dead', JSON.stringify(dead)); renderDeadQueue(); showToast && showToast('Öğe kaldırıldı'); }catch(e){ console.error(e); } }); btns.appendChild(btnReq); btns.appendChild(btnRemove); wrap.appendChild(meta); wrap.appendChild(btns); list.appendChild(wrap); }); }catch(e){ console.error('renderDeadQueue failed', e); } }

        function openDeadQueueModal(){ try{ createDeadQueueModal(); renderDeadQueue(); const modal = document.getElementById('deadQueueModal'); if(modal) modal.style.display='flex'; }catch(e){ console.error(e); } }
        function openSyncQueueModal(){ try{ createSyncQueueModal(); renderSyncQueue(); const modal = document.getElementById('syncQueueModal'); if(modal) modal.style.display='flex'; }catch(e){ console.error(e); } }
        function updateAdminSelCount(){ try{ const el=document.getElementById('adminSelCount'); if(el) el.textContent = (window._selBloklar?.size||0) + ' seçili'; }catch(_){ } }
        function doDownloadJSON(data, name){ try{ const blob = new Blob([JSON.stringify(data||[], null, 2)], {type:'application/json;charset=utf-8'}); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; const ts = new Date().toISOString().replace(/[:T]/g,'-').slice(0,16); a.download = name+'_'+ts+'.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }catch(_){ } }
        function toggleExportSelectMode(on){
          try{
            if(!isCurrentUserAdmin()) return;
            window._exportSelectMode = (on===undefined) ? !window._exportSelectMode : !!on;
            ensureAdminExportBar();
            const bar = document.getElementById('adminExportBar'); if(bar) bar.style.display = window._exportSelectMode ? 'flex' : 'none';
            updateAdminSelCount();
            renderBloklar?.();
            showToast?.(window._exportSelectMode ? 'Seçim modu: açık (satırların sağında kutular görünür)' : 'Seçim modu kapalı');
          }catch(_){ }
        }
        // Kısayol: Cmd/Ctrl + Shift + E -> seçim modunu aç/kapat (sadece admin)
        document.addEventListener('keydown', function(ev){ try{
          const meta = ev.metaKey || ev.ctrlKey; if(!meta || !ev.shiftKey) return; const k = (ev.key||'').toLowerCase(); if(k!=='e') return; if(!isCurrentUserAdmin()) return; ev.preventDefault(); toggleExportSelectMode(); }catch(_){ } });
        const FF_OVR_KEY = 'v91_ff_epoxy_daily_overrides';
        function getPfOverrides(){ try { return JSON.parse(localStorage.getItem(PF_OVR_KEY)||'{}'); } catch(e){ return {}; } }
        function setPfOverrides(obj){ localStorage.setItem(PF_OVR_KEY, JSON.stringify(obj)); }
        function getFfOverrides(){ try { return JSON.parse(localStorage.getItem(FF_OVR_KEY)||'{}'); } catch(e){ return {}; } }
        function setFfOverrides(obj){ localStorage.setItem(FF_OVR_KEY, JSON.stringify(obj)); }
    
        // ------------------ Kullanıcı ve İzin Yönetimi ------------------
        const USERS_KEY = 'v91_users';
      const PERMS_KEY = 'v91_perms'; // { [userId]: { [moduleId]: { view?: boolean, edit?: boolean } } }
        const ACTIVE_USER_KEY = 'v91_active_user_id';
        const ROLES_KEY = 'v91_roles';
    
      function getUsers(){ try{ return JSON.parse(localStorage.getItem(USERS_KEY)||'[]'); }catch(_){ return []; } }
      function setUsers(a){
        try{ localStorage.setItem(USERS_KEY, JSON.stringify(a)); }catch(_){ }
        try{ if(typeof scheduleSync === 'function'){ const rec = { snapshot: a||[], ts: Date.now() }; try{ scheduleSync(USERS_KEY, rec); }catch(_){ try{ enqueueSync({ key: USERS_KEY, rec: rec }); }catch(_){ } } } }catch(_){ }
      }
      function getPerms(){ try{ return JSON.parse(localStorage.getItem(PERMS_KEY)||'{}'); }catch(_){ return {}; } }
      function setPerms(p){
        try{ localStorage.setItem(PERMS_KEY, JSON.stringify(p)); }catch(_){ }
        try{ if(typeof scheduleSync === 'function'){ const rec = { snapshot: p||{}, ts: Date.now() }; try{ scheduleSync(PERMS_KEY, rec); }catch(_){ try{ enqueueSync({ key: PERMS_KEY, rec: rec }); }catch(_){ } } } }catch(_){ }
      }
      const ROLE_PERMS_KEY = 'v91_role_perms';
      function getRolePerms(){ try{ return JSON.parse(localStorage.getItem(ROLE_PERMS_KEY)||'{}'); }catch(_){ return {}; } }
      function setRolePerms(p){
        try{ localStorage.setItem(ROLE_PERMS_KEY, JSON.stringify(p||{})); }catch(_){ }
        try{ if(typeof scheduleSync === 'function'){ const rec = { snapshot: p||{}, ts: Date.now() }; try{ scheduleSync(ROLE_PERMS_KEY, rec); }catch(_){ try{ enqueueSync({ key: ROLE_PERMS_KEY, rec: rec }); }catch(_){ } } } }catch(_){ }
      }
        function getActiveUserId(){ return localStorage.getItem(ACTIVE_USER_KEY)||''; }
        function setActiveUserId(id){ localStorage.setItem(ACTIVE_USER_KEY, id||''); }
        function getRoles(){ try{ return JSON.parse(localStorage.getItem(ROLES_KEY)||'[]'); }catch(_){ return []; } }
        function setRoles(a){
          try{ localStorage.setItem(ROLES_KEY, JSON.stringify(a||[])); }catch(_){ }
          try{ if(typeof scheduleSync === 'function'){ const rec = { snapshot: a||[], ts: Date.now() }; try{ scheduleSync(ROLES_KEY, rec); }catch(_){ try{ enqueueSync({ key: ROLES_KEY, rec: rec }); }catch(_){ } } } }catch(_){ }
        }
    
        async function sha256Hex(str){
          try{
            const enc = new TextEncoder();
            const buf = await crypto.subtle.digest('SHA-256', enc.encode(str||''));
            return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
          }catch(_){ return ''; }
        }
    
        function ensureDefaultAdminUser(){ let users = getUsers(); if(!users.length){ const admin = { id: 'u_'+Date.now().toString(36), name: 'Yönetici' }; users.push(admin); setUsers(users); setActiveUserId(admin.id); } else { if(!getActiveUserId()){ setActiveUserId(users[0].id); } } }
    
        const MODULES = [
          // Üst sekmeler
          { id:'sec_planlama', kind:'section', label:'Üretim Planlama', tabTarget:'planlama' },
          { id:'sec_kayit', kind:'section', label:'Üretim Kayıt', tabTarget:'kayit' },
          { id:'sec_siparis', kind:'section', label:'Sipariş & Operasyon', tabTarget:'siparis' },
          { id:'sec_rapor', kind:'section', label:'Rapor & Grafik', tabTarget:'rapor' },
          { id:'sec_stok', kind:'section', label:'Stok', tabTarget:'stok' },
      { id:'sec_maliyet', kind:'section', label:'Üretim Maliyet', tabTarget:'maliyet' },
          { id:'sec_yoteneci', kind:'section', label:'Aylık Kar&Zarar', tabTarget:'yoteneci' },
          { id:'sec_blok_analiz', kind:'section', label:'Blok Analiz', tabTarget:'blok-analiz' },
          { id:'sec_satinalma', kind:'section', label:'Satın Alma', tabTarget:'satinalma' },
          { id:'sec_ayarlar', kind:'section', label:'Ayarlar', tabTarget:'ayarlar' },
          // Özet modal özel modülleri (rol bazlı görünürlük)
          { id:'summary_ensar_fiyat', kind:'summary', label:'Özet: Ensar Fiyat/Stock' },
      // Maliyet alt sekmeleri
      { id:'maliyet_hesaplama', kind:'maliyet-sub', label:'Maliyet Hesaplama', sub:'maliyet_hesaplama' },
      { id:'maliyet_parametreler', kind:'maliyet-sub', label:'Maliyet Parametreler', sub:'maliyet_parametreler' },
      { id:'maliyet_personel', kind:'maliyet-sub', label:'Maliyet Personel', sub:'maliyet_personel' },
      { id:'maliyet_malzeme', kind:'maliyet-sub', label:'Maliyet Makine Malzemeleri', sub:'maliyet_malzeme' },
      { id:'maliyet_makineler', kind:'maliyet-sub', label:'Maliyet Makineler', sub:'maliyet_makineler' },
      { id:'maliyet_istasyonlar', kind:'maliyet-sub', label:'Maliyet İstasyonlar', sub:'maliyet_istasyonlar' },
      // Ayarlar alt sekmeleri (yalnızca Roller & Güvenlik aktif)
          // Kayit alt sekmeleri
          { id:'kayit_blok_listesi', kind:'kayit-sub', label:'Blok Listesi', sub:'blok_listesi' },
          { id:'kayit_sayalama', kind:'kayit-sub', label:'Sayalama', sub:'sayalama' },
          { id:'kayit_saglamlastirma', kind:'kayit-sub', label:'Sağlamlaştırma', sub:'saglamlastirma' },
          { id:'kayit_katrak_kesim', kind:'kayit-sub', label:'Katrak Kesim', sub:'katrak_kesim' },
          { id:'kayit_plaka_firin', kind:'kayit-sub', label:'Plaka Fırın', sub:'plaka_firin' },
          { id:'kayit_fayans_firin', kind:'kayit-sub', label:'Fayans Fırın', sub:'fayans_firin' },
          { id:'kayit_plaka_silim', kind:'kayit-sub', label:'Plaka Silim', sub:'plaka_silim' },
          { id:'kayit_fayans_firin_seleksiyon', kind:'kayit-sub', label:'Fayans Fırın Seleksiyon', sub:'fayans_firin_seleksiyon' },
          { id:'kayit_kopru_kesme', kind:'kayit-sub', label:'Köprü Kesme', sub:'kopru_kesme' },
          { id:'kayit_ara_makinalar', kind:'kayit-sub', label:'Ara Makinalar', sub:'ara_makinalar' },
          // Stok alt sekmeleri
          { id:'stok_kasa_stok', kind:'stok-sub', label:'Kasa Stok', sub:'kasa_stok' },
          { id:'stok_plaka_stok', kind:'stok-sub', label:'Plaka Stok', sub:'plaka_stok' },
          { id:'stok_mozaik_kirik_stok', kind:'stok-sub', label:'Mozaiklik / Kırık Stok', sub:'mozaik_kirik_stok' },
          { id:'stok_rapor_grafik_stok', kind:'stok-sub', label:'Rapor & Grafik', sub:'rapor_grafik_stok' },
          { id:'stok_islemler_stok', kind:'stok-sub', label:'İşlemler', sub:'islemler_stok' },
          { id:'stok_ayarlar', kind:'stok-sub', label:'Ayarlar', sub:'stok_ayarlar' }
        ];
        // Etiket alt sekmeleri (Stok > İşlemler) için rol bazlı modüller
        MODULES.push(
          { id:'stok_islemler_etiket_bas', kind:'islemler-sub', label:'Stok > İşlemler: Etiket Bas', sub:'etiket_bas' },
          { id:'stok_islemler_etiket_duzenle', kind:'islemler-sub', label:'Stok > İşlemler: Etiket Düzenle', sub:'etiket_duzenle' }
        );
    
        // ---- İzin & Rol Yönetimi (rol şablonları + kullanıcı override) ----
        function setAllowed(userId, moduleId, allowed){ const perms = getPerms(); if(!perms[userId]) perms[userId]={}; perms[userId][moduleId] = { ...(perms[userId][moduleId]||{}), view: !!allowed }; setPerms(perms); }
        function setEditable(userId, moduleId, editable){ const perms = getPerms(); if(!perms[userId]) perms[userId]={}; perms[userId][moduleId] = { ...(perms[userId][moduleId]||{}), edit: !!editable }; setPerms(perms); }
        function setRoleAllowed(roleId, moduleId, allowed){ const rperms = getRolePerms(); if(!rperms[roleId]) rperms[roleId]={}; rperms[roleId][moduleId] = { ...(rperms[roleId][moduleId]||{}), view: !!allowed }; setRolePerms(rperms); }
        function setRoleEditable(roleId, moduleId, editable){ const rperms = getRolePerms(); if(!rperms[roleId]) rperms[roleId]={}; rperms[roleId][moduleId] = { ...(rperms[roleId][moduleId]||{}), edit: !!editable }; setRolePerms(rperms); }
    
        // ---- Min Rol görünürlük/etkileşim enforcement (data-minrole="admin" vb.) ----
        function getActiveRoleName(){
          try{
            const uid = getActiveUserId(); const u = (getUsers()||[]).find(x=> x.id===uid);
            const rid = u?.roleId; const r = rid ? (getRoles()||[]).find(rr=> rr.id===rid) : null;
            return (r?.name||'').trim().toLowerCase() || 'user';
          }catch(_){ return 'user'; }
        }
        function roleRank(name){ const n=(name||'').trim().toLowerCase(); if(n==='admin') return 2; if(n==='superadmin'||n==='root') return 3; return 1; }
        function enforceMinRoleVisibility(){
          try{
            const curRoleName = getActiveRoleName(); const curRank = roleRank(curRoleName);
            const nodes = Array.from(document.querySelectorAll('[data-minrole]'));
            nodes.forEach(el=>{
              const req = (el.getAttribute('data-minrole')||'').trim().toLowerCase(); if(!req) return;
              const need = roleRank(req);
              const insufficient = curRank < need;
              // Sekmeler ve kartlar için gizleme (layout bozulmasın diye display:none)
              if(el.classList.contains('tab') || el.classList.contains('subtab') || el.classList.contains('card') || el.matches('section, [id$="-content"]')){
                el.style.display = insufficient ? 'none' : '';
              }
              // Etkileşimli denetimler için disabled + görsel sınıf
              if(el.matches('button, input, select, textarea')){
                el.disabled = !!insufficient;
                el.classList.toggle('disabled', !!insufficient);
                // Title ile ipucu
                if(insufficient){ const t=el.getAttribute('title')||''; el.setAttribute('title', t? t : 'Yetki gerektirir'); }
              }
            });
          }catch(_){ }
        }
    
        function getEffectivePerm(userId, moduleId){
          let view = true, edit = true;
          try{
            const u = (getUsers()||[]).find(x=> x.id===userId);
            const roleId = u?.roleId;
            if(roleId){
              const rp = getRolePerms()[roleId]?.[moduleId];
              if(rp){ if(rp.view===false) view=false; if(rp.edit===false) edit=false; }
            }
            const up = getPerms()[userId]?.[moduleId];
            if(up){ if(up.view===false) view=false; if(up.edit===false) edit=false; }
          }catch(_){ }
          if(!view) edit=false;
          return { view, edit };
        }
        function isAllowed(userId, moduleId){ return getEffectivePerm(userId, moduleId).view; }
        function isEditable(userId, moduleId){ return getEffectivePerm(userId, moduleId).edit; }
    
        function setContainerReadOnly(container, ro){ try{
          if(!container) return;
          // Banner
          let banner = container.querySelector(':scope > .ro-banner');
          if(ro){
            if(!banner){
              banner = document.createElement('div');
              banner.className = 'ro-banner';
              banner.style.cssText = 'margin:0 0 8px 0;padding:6px 8px;border:1px solid #fdba74;background:#fff7ed;color:#9a3412;border-radius:6px;display:flex;align-items:center;gap:8px;font-size:13px;';
              banner.innerHTML = '<span aria-hidden="true">🔒</span><span>Salt Okunur Mod • Bu bölümde düzenleme yetkiniz yok.</span>';
              container.prepend(banner);
            }
          }else{
            banner?.remove();
          }

          // Generic sync helper that works for any localStorage key.
          // Returns { ok:true, id:... } on success (tries local proxy -> remote POST -> JSONP)
          async function syncRecord(storeKey, rec){
            try{
              if(!rec || !storeKey) return { ok:false };
              // try local proxy path first (dev friendly)
              try{
                const base = (typeof API_BASE === 'string' && API_BASE) ? API_BASE : null;
                // if base points to localhost:3001 or local_proxy available, attempt /db/blocks
                if(base && base.indexOf('localhost')>=0){
                  try{
                    const res = await fetch((base.replace(/\/+$/,'')) + '/db/blocks', {
                      method: 'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ key: storeKey, record: rec })
                    });
                    if(res && res.ok){ const b = await res.json().catch(()=>null); return b || { ok:true }; }
                  }catch(_){ }
                }
              }catch(_){ }

              // try configured remote API (Apps Script style)
              try{
                const baseStr = (typeof API_BASE === 'string' && API_BASE) ? API_BASE : (typeof GS_WEBAPP_URL === 'string' ? GS_WEBAPP_URL : null);
                if(baseStr){
                  const res = await fetch(baseStr, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ action:'upsert', key: storeKey, record: rec }) });
                  if(res && res.ok){ const body = await res.json().catch(()=>null); return body || { ok:true }; }
                }
              }catch(_){ }

              // JSONP fallback
              try{
                const baseStr = (typeof API_BASE === 'string' && API_BASE) ? API_BASE : (typeof GS_WEBAPP_URL === 'string' ? GS_WEBAPP_URL : null);
                if(baseStr && typeof window._jsonpRequest === 'function' && window._ALLOW_JSONP){
                  const recStr = encodeURIComponent(JSON.stringify(rec||{}));
                  const sep = (baseStr.indexOf('?') === -1) ? '?' : '&';
                  const url = (baseStr.endsWith('/') ? baseStr.slice(0,-1) : baseStr) + sep + 'action=upsert&key=' + encodeURIComponent(storeKey) + '&record=' + recStr;
                  const jp = await window._jsonpRequest(url, 20000);
                  if(jp && jp.ok) return jp;
                } else {
                  try{ window._logSkippedJsonp && window._logSkippedJsonp(baseStr, '[syncRecord] JSONP upsert skipped'); }catch(_){ }
                }
              }catch(_){ }

              return { ok:false };
            }catch(e){ console.warn('[syncRecord] error', e); return { ok:false, error: String(e) }; }
          }

          // Generic apply server id: update records stored under given key and trigger renders if available
          function applyServerIdGeneric(oldId, serverId, storeKey){
            try{
              if(!oldId || !serverId || !storeKey) return;
              const arr = JSON.parse(localStorage.getItem(storeKey)||'[]'); let changed=false;
              for(let i=0;i<arr.length;i++){ if(arr[i] && arr[i].id === oldId){ arr[i].id = serverId; changed=true; } }
              if(changed) try{ localStorage.setItem(storeKey, JSON.stringify(arr)); }catch(_){ }
              // special-case: if sayalama key, also update alt-bloklar
              if(storeKey === SY_KEY){
                const sarr = JSON.parse(localStorage.getItem(SBL_KEY)||'[]'); let sChanged=false;
                for(let i=0;i<sarr.length;i++){ if(sarr[i] && sarr[i].sourceId === oldId){ sarr[i].sourceId = serverId; sChanged=true; } }
                if(sChanged) try{ localStorage.setItem(SBL_KEY, JSON.stringify(sarr)); }catch(_){ }
                try{ if((changed) && typeof renderSayalamaList === 'function') renderSayalamaList(); }catch(_){ }
                try{ if((sChanged) && typeof renderSBloklar === 'function') renderSBloklar(); }catch(_){ }
              }
            }catch(e){ console.warn('applyServerIdGeneric failed', e); }
          }

          // Convenience: try to sync now, enqueue for retry on failure
          function scheduleSync(storeKey, rec){
            try{
              if(!storeKey || !rec) return;
              // fire-and-forget
              (async ()=>{
                try{
                  const r = await syncRecord(storeKey, rec);
                  if(r && r.ok){ const sid = (r.id || (r.result && r.result.id) || (r.record && r.record.id) || null); if(sid) applyServerIdGeneric(rec.id, sid, storeKey); try{ showToast && showToast('Kayıt uzak sunucuya eşitlendi',1500); }catch(_){ } }
                  else { enqueueSync({ key: storeKey, rec: rec }); try{ showToast && showToast('Kayıt eşitlenemedi; kuyruklandı',2000); }catch(_){ } }
                }catch(e){ enqueueSync({ key: storeKey, rec: rec }); }
              })();
            }catch(e){ console.warn('scheduleSync failed', e); }
          }
          // Generic delete helper: request remote delete for given id under storeKey
          async function syncDelete(storeKey, id){
            try{
              if(!storeKey || !id) return { ok:false };
              // try local proxy delete
              try{
                const base = (typeof API_BASE === 'string' && API_BASE) ? API_BASE : null;
                if(base && base.indexOf('localhost')>=0){
                  try{
                    const delUrl = (base.replace(/\/+$/,'')) + '/db/blocks?id=' + encodeURIComponent(id);
                    const r = await fetch(delUrl, { method: 'DELETE', mode: 'cors' });
                    if(r && r.ok){ const b = await r.json().catch(()=>null); return b || { ok:true }; }
                  }catch(_){ }
                }
              }catch(_){ }

              // try remote POST delete
              try{
                const baseStr = (typeof API_BASE === 'string' && API_BASE) ? API_BASE : (typeof GS_WEBAPP_URL === 'string' ? GS_WEBAPP_URL : null);
                if(baseStr){
                  const res = await fetch(baseStr, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ action:'delete', key: storeKey, id: id }) });
                  if(res && res.ok){ const body = await res.json().catch(()=>null); return body || { ok:true }; }
                }
              }catch(_){ }

              // JSONP fallback for Apps Script
              try{
                const baseStr = (typeof API_BASE === 'string' && API_BASE) ? API_BASE : (typeof GS_WEBAPP_URL === 'string' ? GS_WEBAPP_URL : null);
                if(baseStr && typeof window._jsonpRequest === 'function' && window._ALLOW_JSONP){
                  const sep = (baseStr.indexOf('?') === -1) ? '?' : '&';
                  const url = (baseStr.endsWith('/') ? baseStr.slice(0,-1) : baseStr) + sep + 'action=delete&key=' + encodeURIComponent(storeKey) + '&id=' + encodeURIComponent(id);
                  const jp = await window._jsonpRequest(url, 20000);
                  if(jp && jp.ok) return jp;
                } else {
                  try{ window._logSkippedJsonp && window._logSkippedJsonp(baseStr, '[syncDelete] JSONP delete skipped'); }catch(_){ }
                }
              }catch(_){ }

              return { ok:false };
            }catch(e){ console.warn('[syncDelete] error', e); return { ok:false, error: String(e) }; }
          }
          // Listen for depo child messages and schedule syncs accordingly
          try{
            if(typeof window !== 'undefined'){
              // origin whitelist and file:// fallback flag (configurable globally)
              // By default we do NOT allow messages from file:// (origin === 'null').
              window._SYNC_ORIGIN_WHITELIST = window._SYNC_ORIGIN_WHITELIST || [ (location && location.origin) ? location.origin : '' , 'http://localhost:3001' ];
              window._ALLOW_FILE_ORIGIN = (typeof window._ALLOW_FILE_ORIGIN === 'undefined') ? false : !!window._ALLOW_FILE_ORIGIN;
              window.addEventListener('message', function(ev){
                try{
                  const origin = (ev && ev.origin) ? ev.origin : 'null';
                  // allow if origin is in whitelist or file:// (null) is allowed
                  const allowed = (origin === 'null' && window._ALLOW_FILE_ORIGIN) || (Array.isArray(window._SYNC_ORIGIN_WHITELIST) && window._SYNC_ORIGIN_WHITELIST.indexOf(origin) !== -1);
                  if(!allowed){
                    try{ window._logSyncRejection && window._logSyncRejection(origin, ev && ev.data); }catch(_){ }
                    return; // ignore messages from unexpected origins
                  }
                  const msg = ev && ev.data;
                  if(!msg || !msg.type || String(msg.type).indexOf('.sync') === -1) return;
                  const action = msg.action;
                  const key = msg.key;
                  if(action === 'upsert' && key && msg.record){
                    try{ scheduleSync(key, msg.record); }catch(e){ try{ enqueueSync({ key: key, rec: msg.record }); }catch(_){ } }
                  } else if(action === 'delete' && key && (msg.id || msg.record && msg.record.id)){
                    const id = msg.id || (msg.record && msg.record.id);
                    (async ()=>{
                      try{
                        const r = await syncDelete(key, id);
                        if(!(r && r.ok)) enqueueSync({ key: key, action: 'delete', id: id });
                      }catch(e){ try{ enqueueSync({ key: key, action: 'delete', id: id }); }catch(_){ } }
                    })();
                  }
                }catch(_){ }
              });
            }
          }catch(_){ }
          // Admin UI: view skipped JSONP and postMessage rejection logs
          try{
            function createAdminLogsModal(){
              try{
                if(document.getElementById('adminLogsModal')) return;
                const modal = document.createElement('div');
                modal.id = 'adminLogsModal';
                modal.style.position = 'fixed';
                modal.style.left = '50%';
                modal.style.top = '50%';
                modal.style.transform = 'translate(-50%,-50%)';
                modal.style.zIndex = 99999;
                modal.style.background = '#fff';
                modal.style.border = '1px solid #666';
                modal.style.padding = '12px';
                modal.style.boxShadow = '0 6px 24px rgba(0,0,0,0.3)';
                modal.style.maxHeight = '70vh';
                modal.style.overflow = 'auto';
                modal.style.minWidth = '480px';

                const title = document.createElement('div');
                title.style.fontWeight = '600';
                title.style.marginBottom = '8px';
                title.textContent = 'Admin Logs — JSONP skips & postMessage rejections';
                modal.appendChild(title);

                const btnRow = document.createElement('div');
                btnRow.style.marginBottom = '8px';
                btnRow.style.display = 'flex';
                btnRow.style.gap = '8px';

                const refreshBtn = document.createElement('button'); refreshBtn.textContent = 'Yenile';
                const exportBtn = document.createElement('button'); exportBtn.textContent = 'Dışa Aktar';
                const clearBtn = document.createElement('button'); clearBtn.textContent = 'Temizle';
                const closeBtn = document.createElement('button'); closeBtn.textContent = 'Kapat';

                btnRow.appendChild(refreshBtn); btnRow.appendChild(exportBtn); btnRow.appendChild(clearBtn); btnRow.appendChild(closeBtn);
                modal.appendChild(btnRow);

                const tabs = document.createElement('div'); tabs.style.marginBottom = '8px';
                const tabSkipped = document.createElement('button'); tabSkipped.textContent = 'JSONP Atlananlar';
                const tabRejected = document.createElement('button'); tabRejected.textContent = 'Reddedilen postMessage';
                tabSkipped.style.marginRight = '8px';
                tabs.appendChild(tabSkipped); tabs.appendChild(tabRejected);
                modal.appendChild(tabs);

                const searchWrap = document.createElement('div');
                searchWrap.style.marginBottom = '8px';
                const searchInput = document.createElement('input');
                searchInput.type = 'search';
                searchInput.placeholder = 'Ara (url, origin, msg)...';
                searchInput.style.width = '100%';
                searchInput.style.padding = '6px';
                searchInput.style.boxSizing = 'border-box';
                searchWrap.appendChild(searchInput);
                modal.appendChild(searchWrap);

                const content = document.createElement('div'); content.id = 'adminLogsContent';
                modal.appendChild(content);

                document.body.appendChild(modal);

                function renderSkipped(){
                  const arr = JSON.parse(localStorage.getItem('v91_skipped_jsonp') || '[]');
                  const q = (searchInput.value || '').toLowerCase().trim();
                  content.innerHTML = '';
                  if(!arr || arr.length===0){ content.textContent = 'Kayıt yok'; return; }
                  const ul = document.createElement('ol');
                  arr.slice().reverse().filter(function(it){
                    if(!q) return true;
                    return (String(it.url||'')+ ' ' + String(it.context||'')).toLowerCase().indexOf(q) !== -1;
                  }).forEach(function(it, idx){
                    const li = document.createElement('li');
                    li.style.marginBottom = '6px';
                    const txt = new Date(it.ts).toLocaleString() + ' — ' + (it.context||'') + ' — ' + (it.url||'');
                    const span = document.createElement('span'); span.textContent = txt;
                    li.appendChild(span);
                    // actions: open, copy
                    const aWrap = document.createElement('span'); aWrap.style.marginLeft = '8px';
                    const openBtn = document.createElement('button'); openBtn.textContent = 'Aç'; openBtn.style.marginLeft='6px';
                    openBtn.addEventListener('click', function(){ try{ if(it.url) window.open(it.url, '_blank'); }catch(_){ } });
                    const copyBtn = document.createElement('button'); copyBtn.textContent = 'Kopyala'; copyBtn.style.marginLeft='6px';
                    copyBtn.addEventListener('click', function(){ try{ navigator.clipboard && navigator.clipboard.writeText(it.url || (it.context||'')); }catch(_){ try{ prompt('Kopyala:', it.url||it.context||''); }catch(__){} } });
                    aWrap.appendChild(openBtn); aWrap.appendChild(copyBtn);
                    li.appendChild(aWrap);
                    ul.appendChild(li);
                  });
                  content.appendChild(ul);
                }

                function renderRejected(){
                  const arr = JSON.parse(localStorage.getItem('v91_sync_rejections') || '[]');
                  const q = (searchInput.value || '').toLowerCase().trim();
                  content.innerHTML = '';
                  if(!arr || arr.length===0){ content.textContent = 'Kayıt yok'; return; }
                  const ul = document.createElement('ol');
                  arr.slice().reverse().filter(function(it){ if(!q) return true; return (String(it.origin||'')+' '+String(it.msg||'')).toLowerCase().indexOf(q)!==-1; }).forEach(function(it, idx){
                    const li = document.createElement('li'); li.style.marginBottom='6px';
                    const head = document.createElement('div'); head.textContent = new Date(it.ts).toLocaleString() + ' — ' + (it.origin||''); head.style.fontWeight='600';
                    const body = document.createElement('div'); body.textContent = String(it.msg||''); body.style.marginBottom='6px';
                    li.appendChild(head); li.appendChild(body);
                    const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px';
                    // Try to parse msg JSON
                    let parsed = null; try{ parsed = JSON.parse(it.msg); }catch(_){ parsed = null; }
                    if(parsed && (parsed.action === 'upsert' || parsed.action === 'update' || parsed.type && String(parsed.type).indexOf('.sync')!==-1)){
                      const requeueBtn = document.createElement('button'); requeueBtn.textContent = 'Tekrar Dene';
                      requeueBtn.addEventListener('click', function(){
                        try{
                          // determine key and record
                          const key = parsed.key || parsed.storeKey || parsed.k || null;
                          const rec = parsed.record || parsed.rec || null;
                          if(key && rec){
                            try{
                              const ok = confirm('Bu kaydı tekrar eşitlemek istediğinize emin misiniz?');
                              if(!ok) return;
                              if(typeof scheduleSync === 'function'){
                                scheduleSync(key, rec);
                              } else {
                                enqueueSync({ key: key, rec: rec });
                              }
                              try{ showToast && showToast('Tekrar deneme kuyruğa alındı', 1800); }catch(_){ }
                              // remove this rejection entry
                              try{ let arr2 = JSON.parse(localStorage.getItem('v91_sync_rejections')||'[]'); arr2 = arr2.filter(function(x){ return !(x.ts === it.ts && x.origin === it.origin && x.msg === it.msg); }); localStorage.setItem('v91_sync_rejections', JSON.stringify(arr2)); renderRejected(); }catch(_){ }
                            }catch(err){ console.error(err); try{ showToast && showToast('Tekrar deneme başarısız',1800); }catch(_){ } }
                          } else {
                            try{ showToast && showToast('Tekrar deneme için kayıt eksik: key veya record bulunamadı.',2500); }catch(_){ }
                          }
                        }catch(e){ console.error(e); }
                      });
                      actions.appendChild(requeueBtn);
                    } else if(parsed && parsed.action === 'delete'){
                      const requeueDel = document.createElement('button'); requeueDel.textContent = 'Tekrar Dene (sil)';
                      requeueDel.addEventListener('click', function(){
                        try{
                          const key = parsed.key || parsed.storeKey || null; const id = parsed.id || parsed.record && parsed.record.id || null;
                          if(key && id){
                            try{
                              const ok = confirm('Bu silme işlemini tekrar denemek istediğinize emin misiniz?');
                              if(!ok) return;
                              (async ()=>{
                                try{
                                  const r = await syncDelete(key, id);
                                  if(!(r && r.ok)) enqueueSync({ key: key, action: 'delete', id: id });
                                  try{ showToast && showToast('Silme tekrar işlendi', 1500); }catch(_){ }
                                }catch(e){ enqueueSync({ key: key, action: 'delete', id: id }); try{ showToast && showToast('Silme tekrar kuyruğa alındı', 1500); }catch(_){ } }
                              })();
                              try{ let arr2 = JSON.parse(localStorage.getItem('v91_sync_rejections')||'[]'); arr2 = arr2.filter(function(x){ return !(x.ts === it.ts && x.origin === it.origin && x.msg === it.msg); }); localStorage.setItem('v91_sync_rejections', JSON.stringify(arr2)); renderRejected(); }catch(_){ }
                            }catch(err){ console.error(err); try{ showToast && showToast('Silme tekrar başarısız',1800); }catch(_){ } }
                          } else { try{ showToast && showToast('Silme tekrar denemesi için key veya id eksik.',2500); }catch(_){ } }
                        }catch(e){ console.error(e); }
                      });
                      actions.appendChild(requeueDel);
                    }
                    const copyBtn = document.createElement('button'); copyBtn.textContent = 'Kopyala';
                    copyBtn.addEventListener('click', function(){ try{ navigator.clipboard && navigator.clipboard.writeText(it.msg || it.origin || ''); }catch(_){ try{ prompt('Kopyala:', it.msg||it.origin||''); }catch(__){} } });
                    actions.appendChild(copyBtn);
                    // allow manual removal
                    const removeBtn = document.createElement('button'); removeBtn.textContent = 'Sil'; removeBtn.style.marginLeft='8px';
                    removeBtn.addEventListener('click', function(){ try{ if(confirm('Bu reddedilen girişi silmek istiyor musunuz?')){ let arr2 = JSON.parse(localStorage.getItem('v91_sync_rejections')||'[]'); arr2 = arr2.filter(function(x){ return !(x.ts === it.ts && x.origin === it.origin && x.msg === it.msg); }); localStorage.setItem('v91_sync_rejections', JSON.stringify(arr2)); renderRejected(); } }catch(_){ } });
                    actions.appendChild(removeBtn);
                    li.appendChild(actions);
                    ul.appendChild(li);
                  });
                  content.appendChild(ul);
                }

                // default tab
                renderSkipped();

                tabSkipped.addEventListener('click', function(){ renderSkipped(); });
                tabRejected.addEventListener('click', function(){ renderRejected(); });
                refreshBtn.addEventListener('click', function(){
                  try{ if(content && content.innerHTML.indexOf('postMessage')!==-1) renderRejected(); else renderSkipped(); }catch(_){ renderSkipped(); }
                });
                exportBtn.addEventListener('click', function(){
                  try{
                    const all = { skipped: JSON.parse(localStorage.getItem('v91_skipped_jsonp')||'[]'), rejected: JSON.parse(localStorage.getItem('v91_sync_rejections')||'[]') };
                    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = 'ensar_admin_logs_' + Date.now() + '.json';
                    document.body.appendChild(a); a.click(); a.remove();
                    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
                  }catch(e){ console.error(e); }
                });
                clearBtn.addEventListener('click', function(){
                  try{ if(confirm('Tüm admin loglarını silmek istediğinizden emin misiniz?')){ localStorage.removeItem('v91_skipped_jsonp'); localStorage.removeItem('v91_sync_rejections'); renderSkipped(); } }catch(_){ }
                });
                closeBtn.addEventListener('click', function(){ try{ modal.remove(); }catch(_){ } });
              }catch(e){ console.error('createAdminLogsModal failed', e); }
            }

            // Add a small admin button if admin area exists or to document body
            try{
              if(!document.getElementById('btnAdminLogs')){
                const b = document.createElement('button');
                b.id = 'btnAdminLogs'; b.textContent = 'Admin: Logs';
                b.style.position = 'fixed'; b.style.right = '12px'; b.style.bottom = '12px'; b.style.zIndex = 99998; b.style.padding = '6px 10px';
                b.style.background = '#222'; b.style.color = '#fff'; b.style.border = '1px solid #444'; b.style.borderRadius = '4px';
                b.addEventListener('click', function(){ createAdminLogsModal(); });
                document.body.appendChild(b);
              }
            }catch(_){ }
          }catch(_){ }
          // Form denetimleri
          const controls = container.querySelectorAll('input, select, textarea, button');
          controls.forEach(el=>{
            if(el.closest('.tabs') || el.closest('.subtabs')) return;
            if(el.id==='btnGoSettings' || el.id==='activeUserSelect') return;
            el.disabled = !!ro;
            el.classList.toggle('disabled', !!ro);
          });
        }catch(_){} }
    
        function applyPermissions(){ try{
          const activeId = getActiveUserId();
          // Üst sekmeler
          MODULES.filter(m=>m.kind==='section').forEach(m=>{
            const tabBtn = document.querySelector(`.tabs .tab[data-target="${m.tabTarget}"]`);
            const section = document.getElementById(m.tabTarget);
            const allow = isAllowed(activeId, m.id);
            if(tabBtn) tabBtn.style.display = allow ? '' : 'none';
            if(section) section.style.display = allow ? '' : 'none';
            const editable = isEditable(activeId, m.id);
            if(section && allow) setContainerReadOnly(section, !editable);
          });
          // Aktif üst sekme gizlendiyse ilk görüneni seç
          const allTabs = Array.from(document.querySelectorAll('.tabs .tab'));
          const activeTabBtn = allTabs.find(b=> b.classList.contains('active'));
          if(activeTabBtn && activeTabBtn.style.display==='none'){
            const firstVisible = allTabs.find(b=> b.style.display!== 'none');
            if(firstVisible) firstVisible.click();
          }
    
          // Kayit alt sekmeleri
          const kayit = document.getElementById('kayit');
          if(kayit){
            const buttons = Array.from(kayit.querySelectorAll('#kayit-subtabs .subtab'));
            MODULES.filter(m=>m.kind==='kayit-sub').forEach(m=>{
              const btn = kayit.querySelector(`#kayit-subtabs .subtab[data-sub="${m.sub}"]`);
              const allow = isAllowed(activeId, m.id);
              if(btn) btn.style.display = allow ? '' : 'none';
              const card = kayit.querySelector(`#${m.sub}-content`);
              if(card) card.style.display = allow ? card.style.display : 'none';
              if(card && allow){ const editable = isEditable(activeId, m.id); setContainerReadOnly(card, !editable); }
            });
            const activeSub = buttons.find(b=> b.classList.contains('active'));
            if(activeSub && activeSub.style.display==='none'){
              const firstVisible = buttons.find(b=> b.style.display!== 'none');
              if(firstVisible) firstVisible.click();
            }

            }

            // Stok alt sekmeleri
          const stok = document.getElementById('stok');
          if(stok){
            const buttons = Array.from(stok.querySelectorAll('#stok-subtabs .subtab'));
            MODULES.filter(m=>m.kind==='stok-sub').forEach(m=>{
              const btn = stok.querySelector(`#stok-subtabs .subtab[data-sub="${m.sub}"]`);
              const allow = isAllowed(activeId, m.id);
              if(btn) btn.style.display = allow ? '' : 'none';
              const card = stok.querySelector(`#${m.sub}-content`);
              if(card) card.style.display = allow ? card.style.display : 'none';
              if(card && allow){ const editable = isEditable(activeId, m.id); setContainerReadOnly(card, !editable); }
            });
            const activeSub = buttons.find(b=> b.classList.contains('active'));
            if(activeSub && activeSub.style.display==='none'){
              const firstVisible = buttons.find(b=> b.style.display!== 'none');
              if(firstVisible) firstVisible.click();
            }
    
            // Stok > İşlemler içindeki alt sekmeler (Etiket Bas / Etiket Düzenle)
            const islBar = document.getElementById('islemler-subtabs');
            if(islBar){
              const islButtons = Array.from(stok.querySelectorAll('#islemler-subtabs .subtab'));
              MODULES.filter(m=>m.kind==='islemler-sub').forEach(m=>{
                const btn = stok.querySelector(`#islemler-subtabs .subtab[data-sub="${m.sub}"]`);
                const allow = isAllowed(activeId, m.id);
                if(btn) btn.style.display = allow ? 'inline-flex' : 'none';
              });
              const activeIsl = islButtons.find(b=> b.classList.contains('active'));
              if(activeIsl && activeIsl.style.display==='none'){
                const firstVisibleIsl = islButtons.find(b=> b.style.display!== 'none');
                if(firstVisibleIsl) firstVisibleIsl.click();
              }
            }
            const grantTempBtn = document.getElementById('grant-temp-delete-btn');
            if(grantTempBtn){
              grantTempBtn.addEventListener('click', function(){
                try{
                  // Set a short-lived session flag that temporarily allows delete operations
                  sessionStorage.setItem('v91_temp_delete_ok','1');
                  // Auto-revoke after 60 seconds
                  setTimeout(function(){ try{ sessionStorage.removeItem('v91_temp_delete_ok'); refreshPermStatus(); }catch(_){ } }, 60 * 1000);
                  try{ alert('Geçici silme yetkisi verildi (60 saniye). Normal silme işlemini şimdi deneyin.'); }catch(_){ }
                  refreshPermStatus();
                }catch(e){ console.error('grant-temp failed', e); alert('Geçici yetki verilemedi: ' + (e && e.message)); }
              });
            }
          }
    
          // Ayarlar alt sekmeleri
          const ayarlar = document.getElementById('ayarlar');
          if(ayarlar){
            const buttons = Array.from(ayarlar.querySelectorAll('#ayarlar-subtabs .subtab'));
            MODULES.filter(m=>m.kind==='settings-sub').forEach(m=>{
              const btn = ayarlar.querySelector(`#ayarlar-subtabs .subtab[data-sub="${m.sub}"]`);
              const allow = isAllowed(activeId, m.id);
              if(btn) btn.style.display = allow ? '' : 'none';
              const card = ayarlar.querySelector(`#${m.sub}-content`);
              if(card) card.style.display = allow ? card.style.display : 'none';
              if(card && allow){ const editable = isEditable(activeId, m.id); setContainerReadOnly(card, !editable); }
            });
            const activeSub = buttons.find(b=> b.classList.contains('active'));
            if(activeSub && activeSub.style.display==='none'){
              const firstVisible = buttons.find(b=> b.style.display!== 'none');
              if(firstVisible) firstVisible.click();
            }
          }
    
          // Maliyet alt sekmeleri
          const maliyet = document.getElementById('maliyet');
          if(maliyet){
            const buttons = Array.from(maliyet.querySelectorAll('#maliyet-subtabs .subtab'));
            MODULES.filter(m=>m.kind==='maliyet-sub').forEach(m=>{
              const btn = maliyet.querySelector(`#maliyet-subtabs .subtab[data-sub="${m.sub}"]`);
              const allow = isAllowed(activeId, m.id);
              if(btn) btn.style.display = allow ? '' : 'none';
              const card = maliyet.querySelector(`#${m.sub}-content`);
              if(card) card.style.display = allow ? card.style.display : 'none';
              if(card && allow){ const editable = isEditable(activeId, m.id); setContainerReadOnly(card, !editable); }
            });
            const activeSub = buttons.find(b=> b.classList.contains('active'));
            if(activeSub && activeSub.style.display==='none'){
              const firstVisible = buttons.find(b=> b.style.display!== 'none');
              if(firstVisible) firstVisible.click();
            }
          }
          // Min rol kısıtlarını da uygulayın (buton/sekme bazlı)
          enforceMinRoleVisibility();
        }catch(_){ }
        }
    
      function renderActiveUserSelect(){ const sel = document.getElementById('activeUserSelect'); if(!sel) return; const users = getUsers(); sel.innerHTML=''; users.forEach(u=>{ const opt=document.createElement('option'); opt.value=u.id; opt.textContent=u.name; sel.appendChild(opt); }); const aid = getActiveUserId(); if(aid) sel.value=aid; window._prevActiveUserId = aid; sel.addEventListener('change', async function(){ const targetId = sel.value; const users=getUsers(); const u = users.find(x=>x.id===targetId); let ok = true; const pwd = prompt('Kullanıcı şifresi:'); if(pwd===null){ ok=false; } else { const h = await sha256Hex(pwd); const saved = u?.passHash||''; ok = saved ? (saved===h) : (pwd===''); if(!ok){ alert('Şifre hatalı.'); } } if(!ok){ sel.value = window._prevActiveUserId || aid; return; } setActiveUserId(sel.value); window._prevActiveUserId = sel.value; applyPermissions(); renderUserControls(); }); }
    
      function renderSettingsUsers(){ const body = document.getElementById('settings_users_body'); if(!body) return; const users = getUsers(); const roles = getRoles(); const activeForPerms = (window._settings_selected_user || getActiveUserId()); body.innerHTML=''; users.forEach(u=>{ const tr=document.createElement('tr'); const roleOptions = ['<option value="">(Rol yok)</option>'].concat(roles.map(r=> `<option value="${r.id}">${r.name}</option>`)).join(''); tr.innerHTML = `<td style=\"padding:6px 4px;\"><label style=\"display:flex;align-items:center;gap:8px;\"><input type=\"radio\" name=\"perm_user\" value=\"${u.id}\" ${u.id===activeForPerms?'checked':''}/> <span>${u.name}</span></label></td><td style=\"padding:6px 4px;\"><select class=\"field roleSel\" data-uid=\"${u.id}\" style=\"min-width:160px;\">${roleOptions}</select></td><td style=\"padding:6px 4px;\"><button class=\"btn small\" data-pw=\"${u.id}\">Şifreyi Değiştir</button> <button class=\"btn danger small\" data-del=\"${u.id}\">Sil</button></td>`; body.appendChild(tr); const sel = tr.querySelector('select.roleSel'); if(sel){ sel.value = u.roleId||''; sel.addEventListener('change', async function(){ const newRoleId = this.value; const uid = this.getAttribute('data-uid'); let users=getUsers(); const idx = users.findIndex(x=>x.id===uid); if(idx<0) return; if(newRoleId){ const r = roles.find(rr=> rr.id===newRoleId); if(r && r.passHash){ const pwd = prompt('Rol şifresi (atanacak rol için):'); if(pwd===null){ this.value = users[idx].roleId||''; return; } const h = await sha256Hex(pwd); if(h!==r.passHash){ alert('Şifre hatalı.'); this.value = users[idx].roleId||''; return; } } } users[idx].roleId = newRoleId||undefined; setUsers(users); renderActiveUserSelect(); renderSettingsUsers(); renderSettingsPerms(); applyPermissions(); }); } }); body.querySelectorAll('input[name=\"perm_user\"]').forEach(inp=> inp.addEventListener('change', function(){ window._settings_selected_user = this.value; renderSettingsPerms(); })); body.querySelectorAll('button[data-pw]').forEach(btn=> btn.addEventListener('click', async function(){ const id=this.getAttribute('data-pw'); let users=getUsers(); const idx = users.findIndex(x=> x.id===id); if(idx<0) return; const np = prompt('Yeni şifre (boş bırakırsanız şifre kaldırılır):'); if(np===null) return; users[idx].passHash = np ? (await sha256Hex(np)) : ''; setUsers(users); alert('Şifre güncellendi.'); })); body.querySelectorAll('button[data-del]').forEach(btn=> btn.addEventListener('click', function(){ const id=this.getAttribute('data-del'); let users=getUsers(); if(users.length<=1){ alert('En az bir kullanıcı bulunmalı.'); return; } if(!confirm('Kullanıcıyı silmek istiyor musunuz?')) return; users = users.filter(u=> u.id!==id); setUsers(users); const aid=getActiveUserId(); if(aid===id) setActiveUserId(users[0]?.id||''); const perms = getPerms(); delete perms[id]; setPerms(perms); renderActiveUserSelect(); renderSettingsUsers(); renderSettingsPerms(); applyPermissions(); })); }
    
        function renderSettingsPerms(){ const body=document.getElementById('settings_perms_body'); if(!body) return; const uid = window._settings_selected_user || getActiveUserId(); const perms = getPerms(); body.innerHTML=''; MODULES.forEach(m=>{ const p = perms[uid]?.[m.id] || {view:true, edit:true}; const tr=document.createElement('tr'); tr.innerHTML = `<td style=\"padding:6px 4px;\">${m.label}</td><td style=\"padding:6px 4px;\">${m.kind}</td><td style=\"padding:6px 4px;\"><label style=\"display:inline-flex;align-items:center;gap:6px;\"><input type=\"checkbox\" data-mid-view=\"${m.id}\" ${p.view!==false?'checked':''}/> Görsün</label></td><td style=\"padding:6px 4px;\"><label style=\"display:inline-flex;align-items:center;gap:6px;\"><input type=\"checkbox\" data-mid-edit=\"${m.id}\" ${p.edit!==false?'checked':''}/> Düzenleyebilsin</label></td>`; body.appendChild(tr); }); body.querySelectorAll('input[data-mid-view]').forEach(ch=> ch.addEventListener('change', function(){ const mid=this.getAttribute('data-mid-view'); setAllowed(uid, mid, this.checked); applyPermissions(); })); body.querySelectorAll('input[data-mid-edit]').forEach(ch=> ch.addEventListener('change', function(){ const mid=this.getAttribute('data-mid-edit'); setEditable(uid, mid, this.checked); applyPermissions(); })); }
    
      function renderRolePermRoleSelect(){ const sel=document.getElementById('role_perm_role_select'); if(!sel) return; const roles=getRoles(); sel.innerHTML=''; roles.forEach(r=>{ const o=document.createElement('option'); o.value=r.id; o.textContent=r.name; sel.appendChild(o); }); if(!sel.value && roles[0]) sel.value = roles[0].id; sel.onchange = ()=> renderRolePerms(); }
      function renderRolePerms(){ const body=document.getElementById('role_perms_body'); const sel=document.getElementById('role_perm_role_select'); if(!body||!sel) return; const rid = sel.value; const rperms = getRolePerms(); body.innerHTML=''; MODULES.forEach(m=>{ const p = rperms[rid]?.[m.id] || {view:true, edit:true}; const tr=document.createElement('tr'); tr.innerHTML = `<td style=\"padding:6px 4px;\">${m.label}</td><td style=\"padding:6px 4px;\">${m.kind}</td><td style=\"padding:6px 4px;\"><label style=\"display:inline-flex;align-items:center;gap:6px;\"><input type=\"checkbox\" data-rmid-view=\"${m.id}\" ${p.view!==false?'checked':''}/> Görsün</label></td><td style=\"padding:6px 4px;\"><label style=\"display:inline-flex;align-items:center;gap:6px;\"><input type=\"checkbox\" data-rmid-edit=\"${m.id}\" ${p.edit!==false?'checked':''}/> Düzenleyebilsin</label></td>`; body.appendChild(tr); }); body.querySelectorAll('input[data-rmid-view]').forEach(ch=> ch.addEventListener('change', function(){ const rid=document.getElementById('role_perm_role_select')?.value; const mid=this.getAttribute('data-rmid-view'); setRoleAllowed(rid, mid, this.checked); applyPermissions(); })); body.querySelectorAll('input[data-rmid-edit]').forEach(ch=> ch.addEventListener('change', function(){ const rid=document.getElementById('role_perm_role_select')?.value; const mid=this.getAttribute('data-rmid-edit'); setRoleEditable(rid, mid, this.checked); applyPermissions(); })); }
    
      function renderRoles(){ const body = document.getElementById('roles_body'); if(!body) return; const roles = getRoles(); const users = getUsers(); body.innerHTML=''; roles.forEach(r=>{ const count = users.filter(u=> u.roleId===r.id).length; const tr=document.createElement('tr'); tr.innerHTML = `<td style=\"padding:6px 4px;\">${r.name}</td><td style=\"padding:6px 4px;\">${count}</td><td style=\"padding:6px 4px;\">${r.passHash? 'Ayarlandı':'Yok'}</td><td style=\"padding:6px 4px;\"><button class=\"btn small\" data-chg=\"${r.id}\">Şifreyi Değiştir</button> <button class=\"btn danger small\" data-del=\"${r.id}\">Sil</button></td>`; body.appendChild(tr); }); body.querySelectorAll('button[data-chg]').forEach(btn=> btn.addEventListener('click', async function(){ const rid=this.getAttribute('data-chg'); const roles=getRoles(); const idx = roles.findIndex(x=>x.id===rid); if(idx<0) return; const pwd = prompt('Yeni rol şifresi (boş bırakırsanız şifre kaldırılır):'); if(pwd===null) return; roles[idx].passHash = pwd? (await sha256Hex(pwd)) : ''; setRoles(roles); renderRoles(); })); body.querySelectorAll('button[data-del]').forEach(btn=> btn.addEventListener('click', function(){ const rid=this.getAttribute('data-del'); if(!confirm('Rolü silmek istiyor musunuz? Bu roldeki kullanıcıların rolü kaldırılacak.')) return; let roles=getRoles().filter(r=> r.id!==rid); setRoles(roles); let users=getUsers(); users.forEach(u=>{ if(u.roleId===rid) delete u.roleId; }); setUsers(users); const rperms = getRolePerms(); if(rperms && rperms[rid]){ delete rperms[rid]; setRolePerms(rperms); } renderRoles(); renderSettingsUsers(); renderRolePermRoleSelect(); renderRolePerms(); })); }
    
        // Login akışı
        function isRoleAuthed(roleId){ if(!roleId) return true; const sk='v91_auth_role_'+roleId; return sessionStorage.getItem(sk)==='ok'; }
        function renderLoginUserSelect(){ const sel = document.getElementById('loginUserSelect'); if(!sel) return; const users = getUsers(); sel.innerHTML=''; users.forEach(u=>{ const opt=document.createElement('option'); opt.value=u.id; opt.textContent=u.name; sel.appendChild(opt); }); const aid=getActiveUserId(); if(aid) sel.value=aid; }
        function showLoginOverlay(){
          const ov = document.getElementById('loginOverlay');
          if(ov){
            // ensure visible and interactive
            ov.style.display = 'flex';
            try{ ov.style.pointerEvents = 'auto'; }catch(_){ }
            try{ ov.style.zIndex = '99999'; }catch(_){ }
          }
          renderLoginUserSelect();
          const pw = document.getElementById('loginPassword');
          if(pw) pw.value='';
          // focus password shortly after showing to ensure focus works across browsers
          try{ setTimeout(()=>{ try{ pw && pw.focus && pw.focus(); }catch(_){ } }, 80); }catch(_){ }
          const err=document.getElementById('loginError'); if(err) err.style.display='none';
        }
        function hideLoginOverlay(){ const ov = document.getElementById('loginOverlay'); ov && (ov.style.display='none'); }
    
        document.addEventListener('DOMContentLoaded', function(){ try{
          ensureDefaultAdminUser();
          renderActiveUserSelect();
          // Ayarlara git
          document.getElementById('btnGoSettings')?.addEventListener('click', function(){ document.querySelector('.tabs .tab[data-target="ayarlar"]').click(); });
          // Çıkış
          document.getElementById('btnLogout')?.addEventListener('click', function(){ try{
            const keys=[]; for(let i=0;i<sessionStorage.length;i++){ const k=sessionStorage.key(i); if(k && k.startsWith('v91_auth_role_')) keys.push(k); }
            keys.forEach(k=> sessionStorage.removeItem(k));
            setActiveUserId(''); renderActiveUserSelect(); applyPermissions(); showLoginOverlay();
          }catch(_){ showLoginOverlay(); }
          });
    
      // Kullanıcı ekle (şifreli)
      document.getElementById('settings_add_user')?.addEventListener('click', async function(){ const inp = document.getElementById('settings_user_name'); const pinp = document.getElementById('settings_user_pass'); const name = (inp?.value||'').trim(); const pass = (pinp?.value||''); if(!name){ alert('Kullanıcı adı giriniz.'); return; } const users=getUsers(); if(users.some(u=> (u.name||'').trim().toLowerCase()===name.toLowerCase())){ alert('Bu adla bir kullanıcı zaten var.'); return; } const u = { id: 'u_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), name, passHash: pass? (await sha256Hex(pass)) : '' }; users.push(u); setUsers(users); if(inp) inp.value=''; if(pinp) pinp.value=''; renderUserControls(); renderSettingsUsers(); renderSettingsPerms(); });
      // Rol ekle
      document.getElementById('role_add_btn')?.addEventListener('click', async function(){ const nameEl = document.getElementById('role_name'); const passEl = document.getElementById('role_pass'); const rname = (nameEl?.value||'').trim(); const rpass = passEl?.value||''; if(!rname){ alert('Rol adı giriniz.'); return; } const roles = getRoles(); if(roles.some(r=> r.name.toLowerCase()===rname.toLowerCase())){ alert('Bu adla bir rol zaten var.'); return; } const rid = 'r_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); const role = { id: rid, name: rname, passHash: rpass ? (await sha256Hex(rpass)) : '' }; roles.push(role); setRoles(roles); nameEl.value=''; passEl.value=''; renderRoles(); renderSettingsUsers(); renderRolePermRoleSelect(); renderRolePerms(); });
      renderRoles();
      renderRolePermRoleSelect();
      renderRolePerms();
      renderSettingsUsers();
      renderSettingsPerms();
      applyPermissions();
      // İlk yüklemede min rol enforcement
      enforceMinRoleVisibility();
      renderUserControls();
          // If all top tabs are hidden due to an accidental permission state, reset active user's perms
          setTimeout(function(){ try{
            const visibleTabs = Array.from(document.querySelectorAll('.tabs .tab')).filter(b=> b.style.display !== 'none');
            if(visibleTabs.length === 0){
              const uid = getActiveUserId(); const perms = getPerms(); if(uid && perms && perms[uid]){ delete perms[uid]; setPerms(perms); applyPermissions(); console.warn('Permissions for active user reset because no tabs were visible.'); }
            }
          }catch(_){ } }, 50);
        }catch(_){ }});
    
        // Giriş akışı (kullanıcı şifresi ile)
        document.addEventListener('DOMContentLoaded', function(){ try{
          const btn = document.getElementById('btnLogin'); const form=document.getElementById('frmLogin');
          async function doLogin(){ const sel=document.getElementById('loginUserSelect'); const pw=document.getElementById('loginPassword'); const err=document.getElementById('loginError'); const users=getUsers(); const u = users.find(x=> x.id===sel.value); if(!u){ err.textContent='Kullanıcı bulunamadı.'; err.style.display='block'; return; } const h = await sha256Hex(pw.value||''); const saved = u.passHash||''; const ok = saved ? (h===saved) : ((pw.value||'')===''); if(!ok){ err.textContent='Şifre hatalı.'; err.style.display='block'; return; } setActiveUserId(u.id); applyPermissions(); hideLoginOverlay(); }
          btn?.addEventListener('click', function(){ doLogin(); });
          form?.addEventListener('submit', function(e){ e.preventDefault(); });
          form?.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); doLogin(); } });
          const aid = getActiveUserId(); const users=getUsers(); const u = users.find(x=> x.id===aid); const need = (!aid || !u); if(need){ showLoginOverlay(); }
        }catch(_){ }});
      async function renderBloklar(){
          const tbody=document.getElementById('tbodyBlok'); if(!tbody) return;
          const q=(document.getElementById('blokAraInput')?.value||'').trim().toLowerCase();
          const activeStageChip = document.querySelector('.filterStage.active');
          const stageFilter = activeStageChip? activeStageChip.getAttribute('data-stage') : 'all';
      let arrRaw = await (typeof getBloklar==='function' ? getBloklar() : []);
      // Remote-first: do not fall back to in-page EXCEL_BLOKLARI; rely on getBloklar() (Apps Script) as source of truth
      // Normalize incoming records: remote sync or older imports may use different key names
      function normalizeBlokRecord(r){
        if(!r || typeof r !== 'object') return {};
        // If record wrapped (e.g. {record: {...}}) unwrap
        const src = (r.record && typeof r.record === 'object') ? r.record : r;
        // Try several possible key names for each canonical field
        const pick = (o, candidates)=>{ for(const k of candidates) if(o[k]!==undefined && o[k]!==null) return o[k]; return undefined; };
        const out = {};
      out.blokNo = pick(src, ['blokNo','blok_no','blok','no','blokNoLabel']) || '';
        out.fasoncuKodu = pick(src, ['fasoncuKodu','fason_kodu','fason']) || '';
        out.ocakIsmi = pick(src, ['ocakIsmi','ocak','ocak_isim','ocakIsm']) || '';
        out.blokAdi = pick(src, ['blokAdi','blok_adi','ad','blokAd']) || '';
        out.durum = pick(src, ['durum','status','owner']) || '';
        out.en = pick(src, ['en','en_cm','width']) || '';
        out.boy = pick(src, ['boy','boy_cm','length']) || '';
        out.yukseklik = pick(src, ['yukseklik','yuk','height']) || '';
        out.gelisTarihi = pick(src, ['gelisTarihi','gelis_tarihi','tarih','date']) || '';
        out.m3 = pick(src, ['m3','m_3','m³']) || '';
        out.asama = pick(src, ['asama','stage']) || '';
        // Heuristic: if blokNo still missing, prefer explicit detail.blokNo or id, then top-level key, then fall back to any candidate key
        if(!String(out.blokNo||'').trim()){
          try{
            if(src && src.detail && (src.detail.blokNo || src.detail.blok_no)){
              out.blokNo = String(src.detail.blokNo || src.detail.blok_no);
            } else if(src && (src.id || src.ID || src._id)){
              out.blokNo = String(src.id || src.ID || src._id);
            } else if(r && r.key){
              // some imports wrap with { key: 'id', record: {...} }
              out.blokNo = String(r.key);
            } else {
              const keys = Object.keys(src||{});
              for(const k of keys){
                if(/blok|no|id|kod|code|label|name/i.test(k) && src[k]){
                  out.blokNo = String(src[k]);
                  try{ console.debug('normalizeBlokRecord: filled blokNo from', k); }catch(_){ }
                  break;
                }
              }
            }
          }catch(_){ }
        }
        // Heuristic for ocakIsmi/blokAdi: try common alternative keys
        if(!String(out.ocakIsmi||'').trim()){
          const k = Object.keys(src||{}).find(k=> /ocak|quarry|pit/i.test(k)); if(k) out.ocakIsmi = String(src[k]||'');
        }
        if(!String(out.blokAdi||'').trim()){
          const k2 = Object.keys(src||{}).find(k=> /ad|name|title|stone|product/i.test(k)); if(k2) out.blokAdi = String(src[k2]||'');
        }
        // Treat common placeholder values as empty and try fallbacks (record.name, key)
        try{
          const cleanPlaceholder = (v)=>{ if(v===undefined||v===null) return ''; const s=String(v).trim(); if(!s) return ''; if(/^[-–—]+$/.test(s)) return ''; if(s==='—' || s==='–' || s==='-') return ''; if(s==='—' || s==='—') return ''; return s; };
          out.blokAdi = cleanPlaceholder(out.blokAdi);
          if(!out.blokAdi){
            if(src && src.name) out.blokAdi = String(src.name);
            else if(r && r.record && r.record.name) out.blokAdi = String(r.record.name);
            else if(r && r.key) out.blokAdi = String(r.key);
          }
          out.ocakIsmi = cleanPlaceholder(out.ocakIsmi) || '';
        }catch(_){ }
        // Normalize numeric dimension fields by stripping non-digit characters and converting to Number when possible
        function normNumField(val){ if(val===undefined || val===null) return ''; const s = String(val).replace(/[^0-9.,-]/g,'').replace(',','.'); const n = Number(s); return (isNaN(n) ? '' : n); }
        if(!out.en) out.en = normNumField(out.en) || normNumField(pick(src,['en_cm','en_mm','width','width_cm','width_mm']));
        if(!out.boy) out.boy = normNumField(out.boy) || normNumField(pick(src,['boy_cm','boy_mm','length','length_cm','length_mm']));
        if(!out.yukseklik) out.yukseklik = normNumField(out.yukseklik) || normNumField(pick(src,['yuk','yuk_cm','height','height_cm','height_mm']));
        // Compute m3 if missing and numeric dims available
        try{
          if((out.m3===undefined || out.m3==='' ) && out.en && out.boy && out.yukseklik){
            const enN = Number(out.en), boyN = Number(out.boy), yukN = Number(out.yukseklik);
            if(!isNaN(enN) && !isNaN(boyN) && !isNaN(yukN) && enN>0 && boyN>0 && yukN>0){ out.m3 = ((enN*boyN*yukN)/1000000).toFixed(3); }
          }
        }catch(_){ }
        // Preserve other fields for later use
        Object.keys(src).forEach(k=>{ if(!(k in out)) out[k]=src[k]; });
        return out;
      }
      const arr = Array.isArray(arrRaw) ? arrRaw.map(normalizeBlokRecord) : [];
      // Diagnostic: count how many records lack a blokNo or most fields
      try{
        (function(){
          const missingBlokNo = arr.filter(x=>!String(x.blokNo||'').trim()).length;
          const missingMain = arr.filter(x=> !(x.ocakIsmi||x.blokAdi||x.en||x.boy) ).length;
          console.info('renderBloklar: total=',arr.length,' missingBlokNo=',missingBlokNo,' missingMainFields=',missingMain);
          if(arr.length && missingBlokNo>0){ 
            console.debug('renderBloklar: first 5 records ->', arr.slice(0,5));
            try{
              // Provide a compact diagnostics table: index, keys present, sample
              const diag = arr.map((r,i)=>({ i, keys: Object.keys(r||{}).join(', '), sample: JSON.stringify(r||{}).slice(0,200) }));
              const problemRows = diag.filter((d,idx)=> !String(arr[d.i].blokNo||'').trim());
              console.groupCollapsed('renderBloklar diagnostics: problematic records ('+problemRows.length+')');
              console.table(problemRows.slice(0,30));
              console.log('Tip: run in console: JSON.parse(localStorage.getItem((window.BL_KEY||"bloklar_yeni_demo"))) to inspect full records.');
              console.groupEnd();
            }catch(_){ }
          }
        })();
      }catch(_){ }
      // Filter out obvious non-block records (audit logs, test submissions) so UI shows only real blocks
      try{
        function isLikelyBlock(x){
          // Less aggressive heuristics: treat records with a blokNo as blocks (unless clearly noise),
          // but also accept records that lack blokNo if they contain other main fields (ocakIsmi/blokAdi or numeric dims).
          if(!x || typeof x !== 'object') return false;
          const bn = String(x.blokNo||'').trim();
          // If blokNo present, still filter known noise tokens
          if(bn){
            // Filter out explicit audit logs and clearly temporary/debug tokens, but allow other values
            if(/^audit::/i.test(bn)) return false;
            if(/^(?:tmp|debug)/i.test(bn)) return false;
            return true;
          }
          // No blokNo: accept if other main identifying fields exist
          try{
            const ocak = String(x.ocakIsmi||x.ocak||'').trim();
            const adi = String(x.blokAdi||x.ad||x.tasIsmi||'').trim();
            const enN = Number(x.en||x.en_cm||x.width||0);
            const boyN = Number(x.boy||x.boy_cm||x.length||0);
            const yukN = Number(x.yukseklik||x.yuk||x.height||0);
            if(ocak) return true;
            if(adi) return true;
            if(!isNaN(enN) && enN>0) return true;
            if(!isNaN(boyN) && boyN>0) return true;
            if(!isNaN(yukN) && yukN>0) return true;
          }catch(_){ }
          return false;
        }
        const arrAll = arr.slice();
        const arrBlocks = arrAll.filter(isLikelyBlock);
        const junk = arrAll.filter(x=>!isLikelyBlock(x));
        if(junk.length>0){
          try{
            // Save last filtered junk to window so devs can inspect from console
            try{ window._lastFilteredJunk = junk.slice(0,200); }catch(_){ }
            console.warn('renderBloklar: filtered out', junk.length, 'non-block records. (window._lastFilteredJunk available)');
            try{ console.table(junk.slice(0,50)); }catch(_){ console.log('renderBloklar: (unable to console.table samples)'); }
          }catch(_){ }
        }
        // Replace arr with the filtered blocks for rendering and stats
        arr.length = 0; Array.prototype.push.apply(arr, arrBlocks);
      }catch(_){ }
      // kolon filtreleri (ikinci başlık satırı)
      const f_gelis_from=(document.getElementById('f_gelis_from')?.value||'').trim();
      const f_gelis_to=(document.getElementById('f_gelis_to')?.value||'').trim();
      const f_blokNo=(document.getElementById('f_blokNo')?.value||'').trim().toLowerCase();
      const f_fason=(document.getElementById('f_fason')?.value||'').trim().toLowerCase();
      const f_ocak=(document.getElementById('f_ocak')?.value||'').trim().toLowerCase();
      const f_blokAdi=(document.getElementById('f_blokAdi')?.value||'').trim().toLowerCase();
      const f_durum=(document.getElementById('f_durum')?.value||'').trim();
          const cHam=arr.filter(x=>x.asama==='Ham').length;
          const cSay=arr.filter(x=>x.asama==='Sayalama').length;
          const cSag=arr.filter(x=>x.asama==='Sağlamlaştırma').length;
          const cKat=arr.filter(x=>x.asama==='Katrak').length;
          const cPF=arr.filter(x=>x.asama==='Plaka Fırın').length;
          document.getElementById('cnt_all').textContent=arr.length;
          document.getElementById('cnt_ham').textContent=cHam;
          document.getElementById('cnt_say').textContent=cSay;
          document.getElementById('cnt_sag').textContent=cSag;
          document.getElementById('cnt_kat').textContent=cKat;
          const cnt_pf = document.getElementById('cnt_pf'); if(cnt_pf) cnt_pf.textContent = cPF;
    
      tbody.innerHTML='';
      try{ window._lastRenderedBlokKeys = []; }catch(_){ }
          let changed = false;
          function blokNoKey(v){
            const s = String(v||'').trim();
            // Sayısal öncelik: baştaki rakamları al, yoksa tüm rakamları birleştir
            const m = s.match(/\d+/g);
            if(m && m.length){ const num = Number(m.join('')); if(!Number.isNaN(num)) return {num, str:s}; }
            return {num: Number.NaN, str:s};
          }
          arr
            .filter(b=> !q || (b.blokNo||'').toLowerCase().includes(q))
            .filter(b=> { const d=String(b.gelisTarihi||''); if(f_gelis_from && d < f_gelis_from) return false; if(f_gelis_to && d > f_gelis_to) return false; return true; })
            .filter(b=> !f_blokNo || (b.blokNo||'').toLowerCase().includes(f_blokNo))
            .filter(b=> !f_fason || (b.fasoncuKodu||'').toLowerCase().includes(f_fason))
            .filter(b=> !f_ocak || (b.ocakIsmi||'').toLowerCase().includes(f_ocak))
            .filter(b=> !f_blokAdi || (b.blokAdi||'').toLowerCase().includes(f_blokAdi))
            .filter(b=> !f_durum || (String(b.durum||'')===f_durum))
            .filter(b=> stageFilter==='all' ? true : (stageFilter==='Saglamlastirma' ? b.asama==='Sağlamlaştırma' : b.asama===stageFilter))
            .sort((a,b)=>{
              const ak = blokNoKey(a.blokNo), bk = blokNoKey(b.blokNo);
              const an = ak.num, bn = bk.num;
              // Büyükten küçüğe sıralama
              if(!Number.isNaN(an) && !Number.isNaN(bn)) return bn - an;
              // Sayısal değilse alfabetik büyükten küçüğe
              return (bk.str||'').localeCompare(ak.str||'', 'tr', {numeric:true, sensitivity:'base'});
            })
            .forEach(b=>{
              // m3 eksikse en×boy×yük üzerinden türet
              if((!b.m3 || String(b.m3).trim()==='') && (b.en && b.boy && b.yukseklik)){
                const enN = num(b.en), boyN = num(b.boy), yukN = num(b.yukseklik);
                if(!isNaN(enN) && !isNaN(boyN) && !isNaN(yukN) && enN>0 && boyN>0 && yukN>0){ b.m3 = ((enN*boyN*yukN)/1_000_000).toFixed(3); changed = true; }
              }
              if(!b.asama) { b.asama = 'Ham'; changed = true; }
              // Metin alanlarını Title Case (TR) standardına çek
              try{
                if(b.blokAdi){ const t = toTitleCaseTR(b.blokAdi); if(t!==b.blokAdi){ b.blokAdi = t; changed = true; } }
                if(b.ocakIsmi){ const t2 = toTitleCaseTR(b.ocakIsmi); if(t2!==b.ocakIsmi){ b.ocakIsmi = t2; changed = true; } }
                if(b.durum){ const nd = normalizeDurum(b.durum); if(nd!==b.durum){ b.durum = nd; changed = true; } } else { b.durum = 'Ensar'; changed = true; }
              }catch(_){ }
              const m3v = num(b.m3); const ton = isNaN(m3v) ? '' : nf3.format(m3v * 2.7);
              const tr=document.createElement('tr');
              tr.innerHTML = `
                <td>${b.gelisTarihi||''}</td>
                <td><b>${b.blokNo||''}</b></td>
                <td>${b.fasoncuKodu||''}</td>
                <td>${b.ocakIsmi||''}</td>
                <td>${b.blokAdi||''}</td>
                <td>${b.durum||''}</td>
                <td>${b.en||''}</td>
                <td>${b.boy||''}</td>
                <td>${b.yukseklik||''}</td>
                <td class="col-m3">${b.m3||''}</td>
                <td>${ton}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:nowrap;overflow-x:auto;">${asamaBadgeList(b.asama, b.blokNo)}</div>
                  <div style="margin-top:6px;display:flex;gap:6px;">
                    <button class="btn ghost small btnPrev">‹ Geri</button>
                    <button class="btn ghost small btnNext">İleri ›</button>
                    <select class="field small selStage" style="height:26px;padding:2px 6px;">
                      ${ASAMALAR.map(a=>`<option value="${a}" ${a===b.asama?'selected':''}>${a}</option>`).join('')}
                    </select>
                  </div>
                </td>
                <td>
                  <button class="btn ghost small btnEdit">Düzenle</button>
                  <button class="btn danger small btnDel">Sil</button>
                </td>`;
    
              // Admin seçim modu: satır seçimi için checkbox (işlem hücresinin en üstüne)
              try{
                if(window._exportSelectMode){
                  const ops = tr.querySelector('td:last-child');
                  const key = _keyOfBlokNo(b?.blokNo);
                  const wrap = document.createElement('label');
                  wrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
                  const cb = document.createElement('input'); cb.type='checkbox'; cb.className='rowSel'; cb.checked = window._selBloklar?.has(key);
                  const sp = document.createElement('span'); sp.textContent = 'Seç'; sp.style.fontSize='11px'; sp.style.opacity='0.7';
                  cb.addEventListener('change', function(){ try{ if(this.checked) window._selBloklar.add(key); else window._selBloklar.delete(key); updateAdminSelCount(); }catch(_){ } });
                  wrap.appendChild(cb); wrap.appendChild(sp);
                  ops?.insertBefore(wrap, ops.firstChild);
                }
              }catch(_){ }
    
              async function persistStage(newStage){
                const key = String(b.blokNo||'').trim().toLowerCase(); if(!key) return;
                try{
                  // Son değişen satırı vurgulamak için anahtarı sakla
                  try{ window._lastStageChangedKey = key; }catch(_){ }
                  let cur = await (typeof getBloklar==='function' ? getBloklar() : []);
                  if(!Array.isArray(cur)) cur = [];
                  const idx = cur.findIndex(x=> String(x?.blokNo||'').trim().toLowerCase() === key);
                  if(idx>=0){ cur[idx].asama = newStage; }
                  b.asama = newStage; // local row copy
                  if(typeof setBloklar==='function') await setBloklar(cur);
                  if(typeof renderBloklar==='function') await renderBloklar();
                  try{ if(typeof updateBlokListDatalist==='function') updateBlokListDatalist(); }catch(_){ }
                  try{ if(typeof showSuccessChip==='function') showSuccessChip(`${b.blokNo} → ${newStage}`); }catch(_){ }
                }catch(_){ }
              }
              tr.querySelector('.btnNext').onclick= async ()=>{ await persistStage(nextStage(b.asama||'Ham')); };
              tr.querySelector('.btnPrev').onclick= async ()=>{ await persistStage(prevStage(b.asama||'Ham')); };
              tr.querySelector('.selStage').onchange= async (e)=>{ await persistStage(e.target.value); };
    
              tr.querySelector('.btnEdit').onclick=()=>{
                const f=document.getElementById('frmBlok'); if(!f) return;
                Object.entries({blokNo:'blokNo', fasoncuKodu:'fasoncuKodu', ocakIsmi:'ocakIsmi', blokAdi:'blokAdi', durum:'durum', en:'en', boy:'boy', yukseklik:'yukseklik', gelisTarihi:'gelisTarihi', m3:'m3'}).forEach(([k,n])=>{ if(f[n]) f[n].value = b[k]||''; });
                document.querySelector('[data-sub="blok_listesi"]').click();
                calcBlokM3FromForm();
                // Edit modu: gizli anahtar ve buton etiketi
                try{
                  const ek = f.querySelector('[name="__editKey"]'); if(ek) ek.value = String(b.blokNo||'');
                  const sb = f.querySelector('button[type="submit"]'); if(sb) sb.textContent = 'Güncelle';
                  // blokNo alanını kilitle ve rozet göster
                  const blokNoInput = f.querySelector('[name="blokNo"]'); if(blokNoInput){ blokNoInput.setAttribute('disabled','disabled'); blokNoInput.title = 'Düzenleme modunda Blok No değiştirilemez'; }
                  const badge = document.getElementById('editModeBadge'); const badgeNo = document.getElementById('editModeBadgeNo');
                  if(badge && badgeNo){ badgeNo.textContent = String(b.blokNo||''); badge.style.display = 'inline-flex'; }
                }catch(_){ }
              };
    
              tr.querySelector('.btnDel').onclick= async ()=>{
                if(confirm("Bu bloğu silmek istediğinize emin misiniz?")){
                  const keyDel = (b.blokNo||'').trim().toLowerCase();
                  let cur = await (typeof getBloklar==='function' ? getBloklar() : []);
                  if(!Array.isArray(cur)) cur = [];
                  const next = cur.filter(x=> String((x && x.blokNo)||'').trim().toLowerCase() !== keyDel);
                  if(typeof setBloklar==='function') await setBloklar(next); else { try{ localStorage.setItem((window.BL_KEY||'bloklar_yeni_demo'), JSON.stringify(next)); }catch(_){ } }
                  try{ if(typeof renderBloklar==='function') renderBloklar(); }catch(_){ }
                  try{ if(typeof updateBlokListDatalist==='function') updateBlokListDatalist(); }catch(_){ }
                }
              };
    
              // Aşama değişimi sonrası gerekirse kısa vurgulama uygula
              try{
                const keyNow = _keyOfBlokNo(b?.blokNo);
                if(window._lastStageChangedKey && window._lastStageChangedKey === keyNow){
                  tr.classList.add('rowPulse');
                  setTimeout(function(){ try{ tr.classList.remove('rowPulse'); if(window._lastStageChangedKey===keyNow) window._lastStageChangedKey=null; }catch(_){ } }, 1000);
                }
              }catch(_){ }
              tbody.appendChild(tr);
              window._lastRenderedBlokKeys.push(_keyOfBlokNo(b?.blokNo));
            });
          // render başında sıfırla ve doldur
          // (üstte push yaptığımız için başlangıçta temizleyelim)
          
        
          if(changed){ try{ await setBloklar(arr); }catch(_){ } }
        }
        window.renderBloklar = renderBloklar;
    
        document.addEventListener('DOMContentLoaded', function(){
          const f=document.getElementById('frmBlok');
          if(f){
            // m3 otomatik hesap: en/boy/yükseklik değiştikçe hesapla
            try{
              ['en','boy','yukseklik'].forEach(function(nm){
                const el = f.querySelector(`[name=${nm}]`);
                if(el){ el.addEventListener('input', function(){ try{ calcBlokM3FromForm(); }catch(_){ } }); }
              });
            }catch(_){ }
    
            const epoxyInput = f.querySelector('[name=epoxyKg]');
            const tarihInput = f.querySelector('[name=tarih]');
            function applyEpoxyOverride(){
              const d = (tarihInput?.value||'').trim(); if(!d) return;
              const val = epoxyInput?.value||'';
              const obj = getPfOverrides(); obj[d] = val; setPfOverrides(obj);
              renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.();
    
        window.addEventListener('storage', function(e){
          if(e.key===PF_KEY || e.key===PF_OVR_KEY || e.key===FF_KEY || e.key===FF_OVR_KEY){
            try{ renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.(); }catch(_){}
          }
        });
    
            }
            if(epoxyInput){
              epoxyInput.addEventListener('input', applyEpoxyOverride);
              epoxyInput.addEventListener('change', applyEpoxyOverride);
            }
            if(tarihInput){
              tarihInput.addEventListener('change', ()=>{
                // tarih değişince mevcut override gösterilsin
                const obj = getPfOverrides(); const d=(tarihInput.value||'').trim();
                if(obj[d]!==undefined && f.epoxyKg) f.epoxyKg.value = obj[d];
                renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.();
    
        window.addEventListener('storage', function(e){
          if(e.key===PF_KEY || e.key===PF_OVR_KEY || e.key===FF_KEY || e.key===FF_OVR_KEY){
            try{ renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.(); }catch(_){}
          }
        });
    
              });
            }
    
            // Not: frmBlok için ana submit handler üstte tanımlı. Buradaki ikinci handler kaldırıldı.
          }
          const q=document.getElementById('blokAraInput'); if(q) q.addEventListener('input', renderBloklar);
          ['f_gelis_from','f_gelis_to','f_blokNo','f_fason','f_ocak','f_blokAdi','f_durum'].forEach(function(id){
            const el=document.getElementById(id);
            if(el){ el.addEventListener('input', renderBloklar); el.addEventListener('change', renderBloklar); }
          });
          const clearBtn = document.getElementById('btnClearColumnFilters');
          if(clearBtn){ clearBtn.addEventListener('click', function(){
            ['f_gelis_from','f_gelis_to','f_blokNo','f_fason','f_ocak','f_blokAdi','f_durum'].forEach(function(id){ const el=document.getElementById(id); if(el){ el.value=''; } });
            renderBloklar();
            // Kalıcı filtre değerlerini sıfırla
            try{
              const vals = { f_gelis_from:'', f_gelis_to:'', f_blokNo:'', f_fason:'', f_ocak:'', f_blokAdi:'', f_durum:'' };
              window.saveBlokFilterState?.({ values: vals });
            }catch(_){ }
          }); }
          // Sütun filtrelerini aç/kapat
          const toggleBtn = document.getElementById('btnToggleColumnFilters');
          const filterRow = document.getElementById('blokFilterRow');
          const clearBtnTop = document.getElementById('btnClearColumnFilters');
          if(toggleBtn && filterRow){
            toggleBtn.addEventListener('click', function(){
              const showing = filterRow.style.display !== 'none';
              filterRow.style.display = showing ? 'none' : 'table-row';
              // Sütun filtreleri açıkken temizle butonunu göster, kapalıyken gizle
              if(clearBtnTop){ clearBtnTop.style.display = showing ? 'none' : ''; }
              // Açık/kapalı durumunu kalıcı kaydet
              try{ window.saveBlokFilterState?.({ open: !showing }); }catch(_){ }
              if(!showing){
                const first = document.getElementById('f_gelis') || document.getElementById('f_blokNo');
                first?.focus();
              }
            });
          }
          document.querySelectorAll('.filterStage').forEach(ch=>{
            ch.addEventListener('click', ()=>{
              document.querySelectorAll('.filterStage').forEach(x=>x.classList.remove('active'));
              ch.classList.add('active');
              renderBloklar();
            });
          });
          // Depo değişince datalist'i güncelle
          try{
            window.addEventListener('storage', function(ev){
              try{
                const k = ev && ev.key ? ev.key.toLowerCase() : '';
                if(k.includes('blok') || k.includes('bloklar') || k === (window.BL_KEY||'').toLowerCase()){
                  updateBlokListDatalist?.();
                }
              }catch(_){ }
            });
          }catch(_){ }
        });
    
        /* ------------------ Ortak Datalist ------------------ */
        async function updateBlokListDatalist(){
          try{
            // If a richer implementation is already exposed globally, prefer that to avoid duplication
            if(typeof window.updateBlokListDatalist === 'function' && window.updateBlokListDatalist !== updateBlokListDatalist){
              try{ await window.updateBlokListDatalist(); return; }catch(_){ /* fallback below */ }
            }
            const bloklar = await (typeof getBloklar==='function' ? getBloklar() : []);
            const datalist = document.getElementById('blokList'); if(!datalist) return;
            // Create options securely using DOM nodes
            const frag = document.createDocumentFragment();
            (bloklar||[]).forEach(b=>{
              const no = (b && (b.blokNo||b.id||b.blok||b.blok_no||'')) ? String(b.blokNo||b.id||b.blok||b.blok_no).trim() : '';
              if(!no) return;
              const possibleName = (b && (b.blokAdi || b.tasIsmi || b.blok_adi || b.name || b.ad || b.tas || b.tas_adi || b.stone || '')) ? String(b.blokAdi || b.tasIsmi || b.blok_adi || b.name || b.ad || b.tas || b.tas_adi || b.stone) : '';
              const display = possibleName ? `${no} — ${possibleName}` : no;
              try{
                const opt = document.createElement('option'); opt.value = no; try{ opt.label = display; }catch(_){ } opt.textContent = display; frag.appendChild(opt);
              }catch(_){ }
            });
            datalist.innerHTML = ''; datalist.appendChild(frag);
          }catch(_){ }
        }
      document.addEventListener('DOMContentLoaded', function(){ updateBlokListDatalist(); setTimeout(updateBlokListDatalist, 2000); try{ if(typeof renderFFSList==='function') renderFFSList(); }catch(_){ } });
    
        /* ------------------ BLOK LİSTESİ: XLSX İÇE AKTAR ------------------ */
        document.addEventListener('DOMContentLoaded', function(){
          const inp = document.getElementById('blokXlsxInput');
          if(!inp) return;
          inp.addEventListener('change', function(e){
            const file = e.target.files && e.target.files[0]; if(!file) return;
            const reader = new FileReader();
            reader.onload = function(ev){
              try{
                if(!window.XLSX){ alert('XLSX kütüphanesi yüklü değil (vendor/xlsx.full.min.js).'); return; }
                const wb = XLSX.read(ev.target.result, { type:'binary' });
                const sheet = wb.Sheets[wb.SheetNames[0]]; if(!sheet){ alert('Çalışma sayfası bulunamadı'); return; }
                const rows = XLSX.utils.sheet_to_json(sheet, { defval:'' });
                if(!rows || !rows.length){ alert('İçe aktarılacak satır bulunamadı'); return; }
                const mapKey = (h)=> String(h||'').toLowerCase().replace(/[^a-z0-9çğıöşü]+/g,'');
                const first = rows[0]; const keys = Object.keys(first||{});
                const headerMap = {};
                keys.forEach(k=>{
                  const m = mapKey(k);
                  if(!headerMap.blokNo && (/blok/.test(m) || m==='blokno')) headerMap.blokNo = k;
                  else if(!headerMap.gelisTarihi && (/gel|geliş|gelistarih|gelistarihi/.test(m) || /tarih/.test(m))) headerMap.gelisTarihi = k;
                  else if(!headerMap.fasoncuKodu && (/fason/.test(m) || /fasoncukodu/.test(m))) headerMap.fasoncuKodu = k;
                  else if(!headerMap.ocakIsmi && (/ocak/.test(m))) headerMap.ocakIsmi = k;
                  else if(!headerMap.blokAdi && (/(blokadi|blokadı|tas|taş|tascinsi|tasismi)/.test(m))) headerMap.blokAdi = k;
                  else if(!headerMap.durum && (/durum|sahip|tip/.test(m))) headerMap.durum = k;
                  else if(!headerMap.en && /^en/.test(m)) headerMap.en = k;
                  else if(!headerMap.boy && /^boy/.test(m)) headerMap.boy = k;
                  else if(!headerMap.yukseklik && /(yukseklik|yükseklik|genislik|genişlik)/.test(m)) headerMap.yukseklik = k;
                  else if(!headerMap.m3 && /(m3|m³)/.test(m)) headerMap.m3 = k;
                });
                const existing = (typeof getBloklar==='function') ? getBloklar() : [];
                const existsSet = new Set(existing.map(b=> String(b.blokNo||'').trim().toLowerCase()).filter(Boolean));
                let added = 0, skipped = 0;
                const toImport = rows.map(r=>{
                  const en = r[headerMap.en]||''; const boy = r[headerMap.boy]||''; const yuk = r[headerMap.yukseklik]||'';
                  let m3 = r[headerMap.m3]||'';
                  try{
                    if((m3==='' || m3===null) && en && boy && yuk){
                      const enN = num(String(en)); const boyN = num(String(boy)); const yukN = num(String(yuk));
                      if(!isNaN(enN)&&!isNaN(boyN)&&!isNaN(yukN) && enN>0&&boyN>0&&yukN>0){ m3 = ((enN*boyN*yukN)/1_000_000).toFixed(3); }
                    }
                  }catch(_){ }
                  // normalize tarih (dd.mm.yyyy | dd/mm/yyyy) -> yyyy-mm-dd
                  function normDate(v){ const s = String(v||'').trim(); if(!s) return ''; const m = s.match(/^(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{2,4})$/); if(m){ const dd=m[1].padStart(2,'0'); const MM=m[2].padStart(2,'0'); let yyyy=m[3]; if(yyyy.length===2) yyyy='20'+yyyy; return `${yyyy}-${MM}-${dd}`; } return s; }
                  const rec = {
                    blokNo: String(r[headerMap.blokNo]||'').trim(),
                    fasoncuKodu: String(r[headerMap.fasoncuKodu]||'').trim(),
                    ocakIsmi: toTitleCaseTR(String(r[headerMap.ocakIsmi]||'').trim()),
                    blokAdi: toTitleCaseTR(String(r[headerMap.blokAdi]||'').trim()),
                    durum: normalizeDurum(String(r[headerMap.durum]||'Ensar').trim()||'Ensar'),
                    en: String(en||''),
                    boy: String(boy||''),
                    yukseklik: String(yuk||''),
                    gelisTarihi: normDate(r[headerMap.gelisTarihi]||''),
                    m3: (m3!==undefined && m3!==null) ? String(m3) : '',
                    asama: 'Ham'
                  };
                  return rec;
                }).filter(x=> x && x.blokNo);
    
                // Insert like manual: skip existing blokNo to avoid overwriting user's entries
                const onlyNew = toImport.filter(r=>{ const k = r.blokNo.trim().toLowerCase(); if(!k) return false; if(existsSet.has(k)){ skipped++; return false; } return true; });
                // Add in reverse so original order preserved at top
                onlyNew.reverse().forEach(rec=>{ try{ upsertBlok && upsertBlok(rec); added++; }catch(_){ } });
                alert(`İçe aktarma tamamlandı. Yeni eklenen: ${added}, zaten var: ${skipped}.`);
                // reset input
                try{ e.target.value = ''; }catch(_){ }
              }catch(err){ alert('İçe aktarma hatası: '+(err?.message||err)); }
            };
            reader.readAsBinaryString(file);
          });
        });
    
        /* ------------------ SAYALANMIŞ ALT BLOKLAR ------------------ */
        const SBL_STAGES = ['Sağlamlaştırma','Katrak Kesim','Fayans Fırın'];
        async function getSBloklar(){
          // Adapter: Firestore varsa shared collection 'alt_bloklar', yoksa localStorage
          try{
            if(window.__fs){
              const snap = await window.__fs.collection('alt_bloklar').orderBy('createdAt','desc').get();
              const out = snap.docs.map(d=>{ const x=d.data(); x.id=d.id; return x; });
              return Array.isArray(out)?out:[];
            }
          }catch(e){ console.warn('getSBloklar (fs) failed; fallback to localStorage:', e && e.message); }
          try{ return JSON.parse(localStorage.getItem(SBL_KEY)||'[]'); } catch(e){ return []; }
        }
        async function setSBloklar(arr){
          try{
            if(window.__fs && Array.isArray(arr)){
              const batch = window.__fs.batch();
              arr.forEach(function(rec){
                try{
                  const id = (rec && (rec.id||rec.altNo||'')) || Date.now().toString(36);
                  const ref = window.__fs.collection('alt_bloklar').doc(String(id));
                  const payload = Object.assign({}, rec, { createdAt: rec.createdAt || firebase.firestore.FieldValue.serverTimestamp() });
                  batch.set(ref, payload, { merge:true });
                }catch(_){ }
              });
              await batch.commit();
            }
          }catch(e){ console.warn('setSBloklar (fs) failed; will store locally:', e && e.message); }
          try{ localStorage.setItem(SBL_KEY, JSON.stringify(arr||[])); }catch(_){ }
        }
        function sblPrev(s){ const i=SBL_STAGES.indexOf(s||SBL_STAGES[0]); return SBL_STAGES[Math.max(0,i-1)]||SBL_STAGES[0]; }
        function sblNext(s){ const i=SBL_STAGES.indexOf(s||SBL_STAGES[0]); return SBL_STAGES[Math.min(SBL_STAGES.length-1, i+1)]||SBL_STAGES[SBL_STAGES.length-1]; }
        function sAsamaBadgeList(current){
          return SBL_STAGES.map(a=>{
            let cls='asama-chip';
            if(a===current) cls+=' current';
            else if(SBL_STAGES.indexOf(a) < SBL_STAGES.indexOf(current)) cls+=' past';
            else cls+=' future';
            return `<span class="${cls}" title="${a}">${a}</span>`;
          }).join('');
        }
        async function renderSBloklar(){
          const tbody=document.getElementById('tbodySBloklar'); if(!tbody) return;
          const q=(document.getElementById('sblAraInput')?.value||'').trim().toLowerCase();
          const arr=await getSBloklar(); tbody.innerHTML='';
          arr
            .filter(x=> !q || (x.altNo||'').toLowerCase().includes(q) || (x.parentNo||'').toLowerCase().includes(q))
            .forEach(b=>{
              const tr=document.createElement('tr');
              tr.innerHTML = `
                <td><b>${b.altNo||''}</b></td>
                <td>${b.parentNo||''}</td>
                <td>${b.tasIsmi||''}</td>
                <td>${b.en||''}</td>
                <td>${b.boy||''}</td>
                <td>${b.gen||''}</td>
                <td>${b.m3||''}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:nowrap;overflow-x:auto;">${sAsamaBadgeList(b.asama||SBL_STAGES[0])}</div>
                  <div style="margin-top:6px;display:flex;gap:6px;">
                    <button class="btn ghost small btnPrev">‹ Geri</button>
                    <button class="btn ghost small btnNext">İleri ›</button>
                    <select class="field small selStage" style="height:26px;padding:2px 6px;">
                      ${SBL_STAGES.map(a=>`<option value="${a}" ${a===(b.asama||SBL_STAGES[0])?'selected':''}>${a}</option>`).join('')}
                    </select>
                  </div>
                </td>
                <td><button class="btn ghost small btnDel">Sil</button></td>`;
              tr.querySelector('.btnPrev').onclick=()=>{ b.asama = sblPrev(b.asama||SBL_STAGES[0]); saveChange(); };
              tr.querySelector('.btnNext').onclick=()=>{ b.asama = sblNext(b.asama||SBL_STAGES[0]); saveChange(); };
              tr.querySelector('.selStage').onchange=(e)=>{ b.asama = e.target.value; saveChange(); };
              tr.querySelector('.btnDel').onclick=()=>{
                if(confirm('Bu alt bloğu listeden silmek istiyor musunuz?')){
                  getSBloklar().then(async (a)=>{ const i = a.findIndex(x=> (x.id||x.altNo) === (b.id||b.altNo)); if(i>=0){ a.splice(i,1); await setSBloklar(a); renderSBloklar(); } });
                }
              };
              async function saveChange(){ const a=await getSBloklar(); const i=a.findIndex(x=> (x.id||x.altNo) === (b.id||b.altNo)); if(i>=0){ a[i]=b; await setSBloklar(a); renderSBloklar(); } }
              tbody.appendChild(tr);
            });
        }
        window.renderSBloklar = renderSBloklar;
    
        // Dropdown sürümü (hızlı bakış)
        async function renderSBloklarDropdown(){
          const wrap = document.getElementById('sblDropdown'); if(!wrap) return;
          const body = document.getElementById('sblDropBody'); const empty = document.getElementById('sblDropEmpty');
          if(!body) return;
          const q=(document.getElementById('sblDropSearch')?.value||'').trim().toLowerCase();
          const arr=await getSBloklar();
          const filtered = arr.filter(x=> !q || (x.altNo||'').toLowerCase().includes(q) || (x.parentNo||'').toLowerCase().includes(q) || (x.tasIsmi||'').toLowerCase().includes(q));
          body.innerHTML='';
          filtered.forEach(b=>{
            const tr=document.createElement('tr');
            tr.innerHTML = `
              <td><b>${b.altNo||''}</b></td>
              <td>${b.parentNo||''}</td>
              <td>${b.tasIsmi||''}</td>
              <td>${b.en||''} × ${b.boy||''} × ${b.gen||''}</td>
              <td>${b.m3||''}</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:nowrap;overflow-x:auto;">${sAsamaBadgeList(b.asama||SBL_STAGES[0])}</div>
                <div style="margin-top:4px;display:flex;gap:6px;align-items:center;">
                  <button class="btn ghost small btnPrev" title="Geri">‹</button>
                  <button class="btn ghost small btnNext" title="İleri">›</button>
                  <select class="field small selStage" style="height:26px;padding:2px 6px;">
                    ${SBL_STAGES.map(a=>`<option value="${a}" ${a===(b.asama||SBL_STAGES[0])?'selected':''}>${a}</option>`).join('')}
                  </select>
                  <button class="btn danger small btnDel" title="Alt bloğu listeden sil" style="margin-left:8px;">Sil</button>
                </div>
              </td>`;
            // Etkileşimler: aşama güncelle
            const idKey = (b.id||b.altNo);
            async function commit(newStage){
              const a=await getSBloklar();
              const i=a.findIndex(x=> (x.id||x.altNo) === idKey);
              if(i>=0){ a[i].asama = newStage; await setSBloklar(a); }
              // Yerel objeyi de güncelle
              b.asama = newStage;
              renderSBloklarDropdown();
              // Büyük liste açıksa onu da yenile
              try{ renderSBloklar?.(); }catch(_){ }
            }
            tr.querySelector('.btnPrev')?.addEventListener('click', (e)=>{ e.preventDefault(); commit(sblPrev(b.asama||SBL_STAGES[0])); });
            tr.querySelector('.btnNext')?.addEventListener('click', (e)=>{ e.preventDefault(); commit(sblNext(b.asama||SBL_STAGES[0])); });
            tr.querySelector('.selStage')?.addEventListener('change', (e)=>{ commit(e.target.value); });
            tr.querySelector('.btnDel')?.addEventListener('click', (e)=>{
              e.preventDefault();
              if(!confirm('Bu alt bloğu silmek istiyor musunuz?')) return;
              getSBloklar().then(async (a)=>{ const i=a.findIndex(x=> (x.id||x.altNo) === idKey); if(i>=0){ a.splice(i,1); await setSBloklar(a); renderSBloklarDropdown(); try{ renderSBloklar?.(); }catch(_){ } } });
            });
            body.appendChild(tr);
          });
          if(empty) empty.style.display = filtered.length? 'none':'block';
        }
        window.renderSBloklarDropdown = renderSBloklarDropdown;
    
        function toggleSBloklarDropdown(force){
          const drop = document.getElementById('sblDropdown'); if(!drop) return;
          const btn = document.getElementById('btnShowSBloklar');
          const show = (typeof force==='boolean') ? force : (drop.style.display==='none' || drop.style.display==='');
          drop.style.display = show? 'block':'none';
          if(show){ renderSBloklarDropdown(); }
          // buton aktifliği için küçük bir görünüm
          if(btn){ btn.classList.toggle('primary', show); }
        }
        window.toggleSBloklarDropdown = toggleSBloklarDropdown;
    
        function upsertSBloklarFromSayalama(rec){
          const a = getSBloklar();
          const presentAltNos = new Set();
          (rec.out||[]).forEach(o=>{
            const altNo = (o.no||'').trim(); if(!altNo) return;
            presentAltNos.add(altNo.toLowerCase());
            const idx = a.findIndex(x=> (x.altNo||'').trim().toLowerCase() === altNo.toLowerCase());
            const base = {
              id: rec.id + '::' + altNo,
              sourceId: rec.id,
              altNo: altNo,
              parentNo: rec.blokNo||'',
              tasIsmi: rec.tasin||'',
              en: o.en||'', boy: o.boy||'', gen: o.gen||'', m3: o.m3||'',
              asama: SBL_STAGES[0]
            };
            if(idx>=0){
              // preserve stage
              const old = a[idx];
              a[idx] = Object.assign({}, old, base, { asama: old.asama||SBL_STAGES[0] });
            }else{
              a.unshift(base);
            }
          });
          // Remove alt blocks that belonged to this source but no longer present
          const filtered = a.filter(x=> x.sourceId !== rec.id || presentAltNos.has((x.altNo||'').trim().toLowerCase()));
          setSBloklar(filtered);
          renderSBloklar?.();
        }
        function removeSBloklarBySource(sourceId){
          const a=getSBloklar(); const b=a.filter(x=> x.sourceId !== sourceId); setSBloklar(b);
        }
        document.addEventListener('DOMContentLoaded', function(){
          const btn = document.getElementById('btnShowSBloklar');
          const card = document.getElementById('sayalanmis_bloklar-content');
          const closeBtn = document.getElementById('btnHideSBloklar');
          const drop = document.getElementById('sblDropdown');
    
          // Buton: dropdown toggle
          if(btn){ btn.addEventListener('click', (e)=>{ e.stopPropagation(); toggleSBloklarDropdown(); }); }
          // Dropdown içindeki butonlar
          document.getElementById('sblDropClose')?.addEventListener('click', ()=> toggleSBloklarDropdown(false));
          document.getElementById('sblDropSearch')?.addEventListener('input', renderSBloklarDropdown);
          document.getElementById('sblDropAllBtn')?.addEventListener('click', ()=>{ if(card){ card.style.display=''; renderSBloklar(); } toggleSBloklarDropdown(false); });
    
          // Dışarı tıklayınca kapat
          document.addEventListener('click', function(ev){
            const t = ev.target;
            if(drop && drop.style.display!=='none'){
              if(!drop.contains(t) && !btn.contains(t)) toggleSBloklarDropdown(false);
            }
          });
          // ESC ile kapat
          document.addEventListener('keydown', function(ev){ if(ev.key==='Escape') toggleSBloklarDropdown(false); });
    
          // Eski geniş kart için (isteğe bağlı): arama ve kapatma bağları
          if(closeBtn && card){ closeBtn.addEventListener('click', ()=>{ card.style.display='none'; }); }
          document.getElementById('sblAraInput')?.addEventListener('input', renderSBloklar);
          // İlk kez yüklemede, alt blok listesi boşsa sayalama kayıtlarından türet
          try{
            const current = getSBloklar();
            if(!current || current.length===0){
              const sayArr = JSON.parse(localStorage.getItem(SY_KEY)||'[]')||[];
              let acc=[]; sayArr.forEach(rec=>{ (rec.out||[]).forEach(o=>{
                const altNo=(o.no||'').trim(); if(!altNo) return;
                acc.push({ id: rec.id+'::'+altNo, sourceId: rec.id, altNo, parentNo: rec.blokNo||'', tasIsmi: rec.tasin||'', en:o.en||'', boy:o.boy||'', gen:o.gen||'', m3:o.m3||'', asama: SBL_STAGES[0] });
              }); });
              setSBloklar(acc);
            }
          }catch(_){ }
        });
    
        /* ------------------ SAYALAMA ------------------ */
        function calcInM3(){
          const en = num(document.querySelector('#frmIn [name=en]')?.value);
          const boy = num(document.querySelector('#frmIn [name=boy]')?.value);
          const gen = num(document.querySelector('#frmIn [name=genislik]')?.value);
          const m3 = (!isNaN(en)&&!isNaN(boy)&&!isNaN(gen)) ? (en*boy*gen)/1000000 : NaN;
          const m3El = document.querySelector('#frmIn [name=m3]');
          if(m3El) m3El.value = isNaN(m3)?'':nf3.format(m3);
          const sumIn = document.getElementById('sumIn');
          if(sumIn) sumIn.textContent = isNaN(m3)?'0':nf3.format(m3);
          calcSayalamaTotals();
        }
        ;['en','boy','genislik'].forEach(n=>{
          document.addEventListener('input', function(e){ if(e.target && e.target.name===n && e.target.closest('#frmIn')) calcInM3(); });
        });
        function sumOutM3(){ let s=0; Array.from(document.querySelectorAll('#outBody [name=o_m3]')).forEach(i=>{ const v=num(i.value); if(!isNaN(v)) s+=v; }); return s; }
        function calcSayalamaTotals(){
          const inM3 = num(document.querySelector('#frmIn [name=m3]')?.value);
          const outM3 = sumOutM3();
          const fire = (isNaN(inM3)?0:inM3) - (isNaN(outM3)?0:outM3);
          const pct = (!isNaN(inM3)&&inM3>0) ? (fire/inM3*100) : 0;
          const sumOut = document.getElementById('sumOut'); if(sumOut) sumOut.textContent=nf3.format(isNaN(outM3)?0:outM3);
          const sumFire = document.getElementById('sumFire'); if(sumFire) sumFire.textContent=nf3.format(fire<0?0:fire);
          const sumFirePct = document.getElementById('sumFirePct'); if(sumFirePct) sumFirePct.textContent=nf3.format(pct<0?0:pct);
        }
        function m3OfRow(rowEl){
          const en=num(rowEl.querySelector('[name=o_en]')?.value);
          const boy=num(rowEl.querySelector('[name=o_boy]')?.value);
          const gen=num(rowEl.querySelector('[name=o_gen]')?.value);
          const m3=(!isNaN(en)&&!isNaN(boy)&&!isNaN(gen)) ? (en*boy*gen)/1000000 : NaN;
          const m3El = rowEl.querySelector('[name=o_m3]');
          if(m3El) m3El.value=isNaN(m3)?'':nf3.format(m3);
          calcSayalamaTotals();
        }
        function nextAltNo(base){
          if(!base) return "";
          let max=0; Array.from(document.querySelectorAll('#outBody [name=o_no]')).forEach(inp=>{
            const v=(inp.value||'').trim();
            const re=new RegExp('^'+base.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')+'\\/(\\d+)$');
            const m=v.match(re);
            if(m){ const n=parseInt(m[1],10); if(n>max) max=n; }
          });
          return base+'/'+(max+1);
        }
        function addOutRow(){
          const base=document.querySelector('#frmIn [name=blokNo]')?.value||'';
          const tr=document.createElement('tr');
          const next = nextAltNo(base) || (base? base+'/1': '');
          tr.innerHTML=`
            <td><input class="field" name="o_no" value="${next}" placeholder="${base? base+'/1':'örn. 212/1'}"></td>
            <td><input class="field" name="o_en" inputmode="decimal" style="min-width:90px;"></td>
            <td><input class="field" name="o_boy" inputmode="decimal" style="min-width:90px;"></td>
            <td><input class="field" name="o_gen" inputmode="decimal" style="min-width:110px;"></td>
            <td><input class="field" name="o_m3" readonly style="min-width:90px;"></td>
            <td><input class="field" name="o_sure" placeholder="örn. 1 SAAT" style="min-width:110px;"></td>
            <td><input class="field" name="o_fire" placeholder="örn. 16x98x237" style="min-width:120px;"></td>
            <td><button class="btn ghost small btnDel">Sil</button></td>`;
          tr.querySelectorAll('[name=o_en],[name=o_boy],[name=o_gen]').forEach(inp=>inp.addEventListener('input',()=>m3OfRow(tr)));
          tr.querySelector('.btnDel').onclick=()=>{ tr.remove(); calcSayalamaTotals(); };
          document.getElementById('outBody')?.appendChild(tr);
        }
        document.addEventListener('DOMContentLoaded', function(){
          const btnAddOut = document.getElementById('btnAddOut');
          if(btnAddOut) btnAddOut.addEventListener('click', (e)=>{ e.preventDefault(); addOutRow(); });
        });
        function readSayalamaForm(){
          const f=document.getElementById('frmIn');
          const rec={ id: f.querySelector('[name=id]')?.value || (Date.now().toString(36)+Math.random().toString(36).slice(2)), tarih: f.querySelector('[name=tarih]')?.value, blokNo: f.querySelector('[name=blokNo]')?.value, tasin: f.querySelector('[name=tasin]')?.value, en: f.querySelector('[name=en]')?.value, boy: f.querySelector('[name=boy]')?.value, genislik: f.querySelector('[name=genislik]')?.value, m3: f.querySelector('[name=m3]')?.value, out: [] };
          Array.from(document.querySelectorAll('#outBody tr')).forEach(tr=>{ rec.out.push({ no: tr.querySelector('[name=o_no]')?.value, en: tr.querySelector('[name=o_en]')?.value, boy: tr.querySelector('[name=o_boy]')?.value, gen: tr.querySelector('[name=o_gen]')?.value, m3: tr.querySelector('[name=o_m3]')?.value, sure: tr.querySelector('[name=o_sure]')?.value, fire: tr.querySelector('[name=o_fire]')?.value }); });
          return rec;
        }
        function renderSayalamaList(){
          const arr=JSON.parse(localStorage.getItem(SY_KEY)||"[]");
          const tbody=document.getElementById('listBody'); if(!tbody) return;
          tbody.innerHTML='';
          arr.forEach(rec=>{
            const outTotal=(rec.out||[]).reduce((s,r)=> s + (num(r.m3)||0), 0);
            const inM3=num(rec.m3)||0;
            const pct= inM3>0 ? ( (inM3-outTotal)/inM3*100 ) : 0;
            const tr=document.createElement('tr');
            tr.innerHTML=`
              <td>${rec.tarih||''}</td>
              <td>${rec.blokNo||''}</td>
              <td>${rec.m3||''}</td>
              <td>${nf3.format(outTotal)}</td>
              <td>${nf3.format(pct<0?0:pct)}</td>
              <td>${(rec.out||[]).length}</td>
              <td>
                <button class="btn ghost small btnEdit">Düzenle</button>
                <button class="btn danger small btnDel">Sil</button>
              </td>`;
            tr.querySelector('.btnEdit').onclick=()=> loadSayalamaForm(rec);
            tr.querySelector('.btnDel').onclick=()=>{
              const arr2=JSON.parse(localStorage.getItem(SY_KEY)||"[]");
              const i=arr2.findIndex(x=>x.id===rec.id);
              if(i>=0){
                arr2.splice(i,1); localStorage.setItem(SY_KEY, JSON.stringify(arr2));
                // Bu sayalama kaydına bağlı alt blokları kaldır
                try{ removeSBloklarBySource(rec.id); renderSBloklar?.(); }catch(_){ }
                renderSayalamaList();
              }
            };
            tbody.appendChild(tr);
          });
        }
        function loadSayalamaForm(rec){
          const f=document.getElementById('frmIn'); if(!f) return; f.reset();
          f.querySelector('[name=id]').value=rec.id||'';
          ['tarih','blokNo','tasin','en','boy','genislik','m3'].forEach(k=>{ const el=f.querySelector('[name='+k+']'); if(el) el.value = rec[k] || ''; });
          const outBody = document.getElementById('outBody'); if(outBody) outBody.innerHTML='';
          (rec.out||[]).forEach(r=>{
            addOutRow();
            const tr=document.querySelector('#outBody tr:last-child');
            if(tr){ tr.querySelector('[name=o_no]').value=r.no||''; tr.querySelector('[name=o_en]').value=r.en||''; tr.querySelector('[name=o_boy]').value=r.boy||''; tr.querySelector('[name=o_gen]').value=r.gen||''; tr.querySelector('[name=o_m3]').value=r.m3||''; tr.querySelector('[name=o_sure]').value=r.sure||''; tr.querySelector('[name=o_fire]').value=r.fire||''; }
          });
          calcInM3(); calcSayalamaTotals();
        }
        document.addEventListener('DOMContentLoaded', function(){
          const frmIn = document.getElementById('frmIn');
          if(frmIn){
            const blokNoInput = frmIn.querySelector('[name=blokNo]');
            if(blokNoInput){
              blokNoInput.addEventListener('change', async function(){
                // getBloklar may be async (returns a Promise) so await it to get the array
                const bloklar = await (typeof getBloklar === 'function' ? getBloklar() : []);
                let val = (blokNoInput.value||'').trim(); val = normalizeBlokNo(val);
                const secili = Array.isArray(bloklar) ? bloklar.find(b => (b.blokNo||'').trim().toLowerCase() === val.toLowerCase()) : null;
                if(secili){
                  frmIn.querySelector('[name=tasin]').value = secili.blokAdi||'';
                  frmIn.querySelector('[name=en]').value = sanitizeDimensionVal(secili.en||'');
                  frmIn.querySelector('[name=boy]').value = sanitizeDimensionVal(secili.boy||'');
                  frmIn.querySelector('[name=genislik]').value = sanitizeDimensionVal(secili.yukseklik||'');
                  calcInM3();
                } else {
                  ['tasin','en','boy','genislik','m3'].forEach(k=>{ const el=frmIn.querySelector('[name='+k+']'); if(el) el.value=''; });
                }
              });
            }
            document.getElementById('btnSaveSayalama')?.addEventListener('click', async (e)=>{
              e.preventDefault();
              const rec=readSayalamaForm();
              // getBloklar may be async
              const bloklar = await (typeof getBloklar === 'function' ? getBloklar() : []);
              const recBlok = normalizeBlokNo(rec.blokNo||'');
              const secili = Array.isArray(bloklar) ? bloklar.find(b => (b.blokNo||'').trim().toLowerCase() === (recBlok||'').trim().toLowerCase()) : null;
              if(!secili) { alert("Sadece Blok Listesi'nde olan bir blok sayalamaya girebilir!"); blokNoInput?.focus(); return; }
              const arr=JSON.parse(localStorage.getItem(SY_KEY)||"[]");
              const i=arr.findIndex(x=>x.id===rec.id);
              if(i>=0) arr[i]=rec; else arr.unshift(rec);
              localStorage.setItem(SY_KEY, JSON.stringify(arr));
              // Fire-and-forget remote sync to Apps Script (if configured).
              // Show a brief toast on success/failure but do not block the UI.
              try{
                if(typeof syncSayalamaRecord === 'function'){
                  syncSayalamaRecord(rec).then(async r=>{
                    try{
                      if(r && r.ok){ try{ showToast && showToast('Sayalama uzak sunucuya eşitlendi', 2000); }catch(_){ }
                        // If server returned an id, update local record id and any dependent alt-blocks
                        try{
                          const serverId = (r && (r.id || r.result?.id || r.data?.id || r.record?.id)) || null;
                          if(serverId && serverId !== rec.id){
                            const arr2 = JSON.parse(localStorage.getItem(SY_KEY)||'[]');
                            const idx = arr2.findIndex(x=> x.id === rec.id);
                            if(idx >= 0){
                              const oldId = arr2[idx].id;
                              arr2[idx].id = serverId;
                              try{ localStorage.setItem(SY_KEY, JSON.stringify(arr2)); }catch(_){ }
                              // update alt-bloklar'ı (sourceId)
                              try{
                                const sblArr = JSON.parse(localStorage.getItem(SBL_KEY)||'[]');
                                let changed = false;
                                for(let i=0;i<sblArr.length;i++){
                                  if(sblArr[i] && sblArr[i].sourceId === oldId){ sblArr[i].sourceId = serverId; changed = true; }
                                }
                                if(changed){ try{ localStorage.setItem(SBL_KEY, JSON.stringify(sblArr)); }catch(_){ } if(typeof renderSBloklar === 'function') try{ renderSBloklar(); }catch(_){ } }
                              }catch(_){ }
                              try{ if(typeof renderSayalamaList === 'function') renderSayalamaList(); }catch(_){ }
                            }
                          }
                        }catch(_){ }
                      } else { try{ showToast && showToast('Sayalama uzak sunucuya eşitlenemedi', 3000); }catch(_){ } }
                    }catch(_){ }
                  }).catch(e=>{
                    try{ showToast && showToast('Sayalama eşitleme hatası', 3000); }catch(_){ }
                    console.warn('Sayalama remote sync error', e);
                  });
                }
              }catch(_){ }
              // Sayalanmış alt blokları güncelle
              try{ upsertSBloklarFromSayalama(rec); }catch(_){ }
              renderSayalamaList();
              // update host blok record (getBloklar might be async)
              let bloklarArr = await (typeof getBloklar === 'function' ? getBloklar() : []);
              let blok = Array.isArray(bloklarArr) ? bloklarArr.find(x => (x.blokNo||'').trim().toLowerCase() === (rec.blokNo||'').trim().toLowerCase()) : null;
              if(blok && blok.asama !== 'Sayalama') {
                blok.asama = 'Sayalama';
                localStorage.setItem(BL_KEY, JSON.stringify(bloklarArr));
                if(typeof renderBloklar === 'function') renderBloklar();
              }
              frmIn.reset();
              const outBody = document.getElementById('outBody'); if(outBody) outBody.innerHTML='';
              calcInM3(); calcSayalamaTotals();
            });
          }
          renderSayalamaList();
        });
    
        /* ------------------ SAĞLAMLAŞTIRMA (Bohça & Vakum) ------------------ */
        function calcBohcaM3(){
          const f=document.getElementById('frmBohca'); if(!f) return;
          const en=num(f.en?.value), boy=num(f.boy?.value), yuk=num(f.yukseklik?.value);
          const m3 = (!isNaN(en)&&!isNaN(boy)&&!isNaN(yuk)) ? (en*boy*yuk)/1000000 : NaN;
          if(f.m3) f.m3.value = isNaN(m3)?'':nf3.format(m3);
        }
        ['en','boy','yukseklik'].forEach(n=>{ document.addEventListener('input', e=>{ if(e.target && e.target.name===n && e.target.closest('#frmBohca')) calcBohcaM3(); }); });
        function readBohcaForm(){
          const f=document.getElementById('frmBohca'); if(!f) return null;
          return { id: f.id?.value || (Date.now().toString(36)+Math.random().toString(36).slice(2)), tarih: f.tarih?.value || '', blokNo: f.blokNo?.value || '', tasIsmi: f.tasIsmi?.value || '', zaman: f.zaman?.value || '', en: f.en?.value || '', boy: f.boy?.value || '', yukseklik: f.yukseklik?.value || '', m3: f.m3?.value || '', jelKg: f.jelKg?.value || '', fileM2: f.fileM2?.value || '' };
        }
        function getBohca(){ try { return JSON.parse(localStorage.getItem(BOH_KEY)||'[]'); } catch(e){ return []; } }
        function setBohca(arr){ localStorage.setItem(BOH_KEY, JSON.stringify(arr)); }
        function renderBohca(){
          const tbody=document.getElementById('bohcaBody'); if(!tbody) return;
          const arr=getBohca(); tbody.innerHTML='';
          arr.forEach(rec=>{
            const tr=document.createElement('tr');
            tr.innerHTML=`
              <td>${rec.tarih||''}</td><td><b>${rec.blokNo||''}</b></td><td>${typeof toTitleCaseTR==='function'? toTitleCaseTR(rec.tasIsmi||''): (rec.tasIsmi||'')}</td><td>${rec.zaman||''}</td>
              <td>${rec.en||''}</td><td>${rec.boy||''}</td><td>${rec.yukseklik||''}</td><td>${rec.m3||''}</td>
              <td>${rec.jelKg||''}</td><td>${rec.fileM2||''}</td>
              <td><button class="btn ghost small btnEditB">Düzenle</button><button class="btn danger small btnDelB">Sil</button></td>`;
            tr.querySelector('.btnEditB').onclick=()=>{
              const f=document.getElementById('frmBohca'); if(!f) return;
              ['tarih','blokNo','tasIsmi','zaman','en','boy','yukseklik','m3','jelKg','fileM2'].forEach(k=>{ setFormFieldValue(f, k, rec[k]||''); });
              f.id.value = rec.id||'';
              document.querySelector('#saglamlastirma-subtabs .subtab[data-sub="bohca"]').click();
            };
            tr.querySelector('.btnDelB').onclick=()=>{
              if(confirm("Bu Bohça kaydını silmek istiyor musunuz?")){
                const arr2=getBohca();
                const i=arr2.findIndex(x=>x.id===rec.id);
                if(i>=0){ arr2.splice(i,1); setBohca(arr2); renderBohca(); }
              }
            };
            tbody.appendChild(tr);
          });
        }
        document.addEventListener('DOMContentLoaded', function(){
          const f=document.getElementById('frmBohca');
          if(f){
            const blokNoInput = f.querySelector('[name=blokNo]');
            if(blokNoInput){
              blokNoInput.addEventListener('change', async function(){
                // getBloklar may be async; await it and ensure it's an array before using .find
                const bloklar = await (typeof getBloklar === 'function' ? getBloklar() : []);
                let val = (blokNoInput.value||'').trim(); val = normalizeBlokNo(val);
                const secili = Array.isArray(bloklar) ? bloklar.find(b => (b.blokNo||'').trim().toLowerCase() === val.toLowerCase()) : null;
                if(secili){
                  f.tasIsmi.value = secili.blokAdi||'';
                  f.en.value = sanitizeDimensionVal(secili.en||'');
                  f.boy.value = sanitizeDimensionVal(secili.boy||'');
                  f.yukseklik.value = sanitizeDimensionVal(secili.yukseklik||'');
                  calcBohcaM3();
                } else { ['tasIsmi','en','boy','yukseklik','m3'].forEach(k=>{ if(f[k]) f[k].value=''; }); }
              });
            }
            
            const epoxyInput = f.querySelector('[name=epoxyKg]');
            const tarihInput = f.querySelector('[name=tarih]');
            function applyEpoxyOverride(){
              const d = (tarihInput?.value||'').trim(); if(!d) return;
              const val = epoxyInput?.value||'';
              const obj = getPfOverrides(); obj[d] = val; setPfOverrides(obj);
              renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.();
    
        window.addEventListener('storage', function(e){
          if(e.key===PF_KEY || e.key===PF_OVR_KEY || e.key===FF_KEY || e.key===FF_OVR_KEY){
            try{ renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.(); }catch(_){}
          }
        });
    
            }
            if(epoxyInput){
              epoxyInput.addEventListener('input', applyEpoxyOverride);
              epoxyInput.addEventListener('change', applyEpoxyOverride);
            }
            if(tarihInput){
              tarihInput.addEventListener('change', ()=>{
                // tarih değişince mevcut override gösterilsin
                const obj = getPfOverrides(); const d=(tarihInput.value||'').trim();
                if(obj[d]!==undefined && f.epoxyKg) f.epoxyKg.value = obj[d];
                renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.();
    
        window.addEventListener('storage', function(e){
          if(e.key===PF_KEY || e.key===PF_OVR_KEY || e.key===FF_KEY || e.key===FF_OVR_KEY){
            try{ renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.(); }catch(_){}
          }
        });
    
              });
            }
    
            f.addEventListener('submit', async function(e){
              // Bu dinleyici yalnızca Bohça alt-sekmesindeki gönder butonlarından tetiklenmeli
              const boh = document.getElementById('bohca-content');
              const submitter = e.submitter;
              if(!(boh && submitter && boh.contains(submitter))) return; // Kaydet (blok girişi) veya diğer formlar için çalıştırma
              e.preventDefault();
              const rec=readBohcaForm();
              // getBloklar may be async
              const bloklar = await (typeof getBloklar === 'function' ? getBloklar() : []);
              const recBlok = normalizeBlokNo(rec.blokNo||'');
              const secili = Array.isArray(bloklar) ? bloklar.find(b => (b.blokNo||'').trim().toLowerCase() === recBlok.trim().toLowerCase()) : null;
              if(!secili){ alert("Sadece Blok Listesi’nde olan bir blok için Bohça kaydı yapılabilir!"); blokNoInput?.focus(); return; }
              let arr=getBohca(); const i=arr.findIndex(x=>x.id===rec.id);
              if(i>=0) arr[i]=rec; else arr.unshift(rec);
              setBohca(arr); renderBohca();
              try{ scheduleSync(BOH_KEY, rec); }catch(_){ }
              // update blok list (getBloklar may be async)
              const blArr = await (typeof getBloklar === 'function' ? getBloklar() : []);
              const b = Array.isArray(blArr) ? blArr.find(x=> (x.blokNo||'').trim().toLowerCase() === recBlok.trim().toLowerCase()) : null;
              if(b && b.asama !== 'Sağlamlaştırma'){ b.asama='Sağlamlaştırma'; setBloklar(blArr); renderBloklar?.(); }
              f.reset();
            });
          }
          const sag = document.getElementById('saglamlastirma-content');
          if(sag){
            const tabs = sag.querySelectorAll('#saglamlastirma-subtabs .subtab');
            const boh = document.getElementById('bohca-content');
            const vak = document.getElementById('vakum-content');
            tabs.forEach(t=> t.addEventListener('click', function(){
              tabs.forEach(x=>x.classList.remove('active'));
              t.classList.add('active');
              if(t.dataset.sub==='bohca'){ boh.style.display=''; vak.style.display='none'; }
              else { boh.style.display='none'; vak.style.display=''; }
            }));
          }
          renderBohca();
        });
    
        function calcVakumM3(){
          const f=document.getElementById('frmVakum'); if(!f) return;
          const en=num(f.en?.value), boy=num(f.boy?.value), yuk=num(f.yukseklik?.value);
          const m3 = (!isNaN(en)&&!isNaN(boy)&&!isNaN(yuk)) ? (en*boy*yuk)/1000000 : NaN;
          if(f.m3) f.m3.value = isNaN(m3)?'':nf3.format(m3);
        }
        ['en','boy','yukseklik'].forEach(n=>{ document.addEventListener('input', e=>{ if(e.target && e.target.name===n && e.target.closest('#frmVakum')) calcVakumM3(); }); });
        function readVakumForm(){
          const f=document.getElementById('frmVakum'); if(!f) return null;
          return { id: f.id?.value || (Date.now().toString(36)+Math.random().toString(36).slice(2)), tarih: f.tarih?.value || '', blokNo: f.blokNo?.value || '', zaman: f.zaman?.value || '', tasIsmi: f.tasIsmi?.value || '', en: f.en?.value || '', boy: f.boy?.value || '', yukseklik: f.yukseklik?.value || '', m3: f.m3?.value || '', vNaylon: f.vNaylon?.value || '', yBant: f.yBant?.value || '', tGirisAparati: f.tGirisAparati?.value || '', hortum1216: f.hortum1216?.value || '', sprialAkis: f.sprialAkis?.value || '', akisFilesi: f.akisFilesi?.value || '', bohcaFilesi: f.bohcaFilesi?.value || '', sprayYapistirici: f.sprayYapistirici?.value || '', epoxyKg: f.epoxyKg?.value || '' };
        }
        function getVakum(){ try { return JSON.parse(localStorage.getItem(VAK_KEY)||'[]'); } catch(e){ return []; } }
        function setVakum(arr){ localStorage.setItem(VAK_KEY, JSON.stringify(arr)); }
        function renderVakum(){
          const tbody=document.getElementById('vakumBody'); if(!tbody) return;
          const arr=getVakum(); tbody.innerHTML='';
          arr.forEach(rec=>{
            const tr=document.createElement('tr');
            tr.innerHTML=`
              <td>${rec.tarih||''}</td><td><b>${rec.blokNo||''}</b></td><td>${rec.zaman||''}</td><td>${typeof toTitleCaseTR==='function'? toTitleCaseTR(rec.tasIsmi||''): (rec.tasIsmi||'')}</td>
              <td>${rec.en||''}</td><td>${rec.boy||''}</td><td>${rec.yukseklik||''}</td><td>${rec.m3||''}</td>
              <td>${rec.vNaylon||''}</td><td>${rec.yBant||''}</td><td>${rec.tGirisAparati||''}</td><td>${rec.hortum1216||''}</td>
              <td>${rec.sprialAkis||''}</td><td>${rec.akisFilesi||''}</td><td>${rec.bohcaFilesi||''}</td>
              <td>${rec.sprayYapistirici||''}</td><td>${rec.epoxyKg||''}</td>
              <td><button class="btn ghost small btnEditV">Düzenle</button><button class="btn danger small btnDelV">Sil</button></td>`;
            tr.querySelector('.btnEditV').onclick=()=>{
              const f=document.getElementById('frmVakum'); if(!f) return;
              ['tarih','blokNo','zaman','tasIsmi','en','boy','yukseklik','m3','vNaylon','yBant','tGirisAparati','hortum1216','sprialAkis','akisFilesi','bohcaFilesi','sprayYapistirici','epoxyKg'].forEach(k=>{ setFormFieldValue(f, k, rec[k]||''); });
              f.id.value = rec.id||'';
              document.querySelector('#saglamlastirma-subtabs .subtab[data-sub="vakum"]').click();
            };
            tr.querySelector('.btnDelV').onclick=()=>{
              if(confirm("Bu Vakum kaydını silmek istiyor musunuz?")){
                const arr2=getVakum();
                const i=arr2.findIndex(x=>x.id===rec.id);
                if(i>=0){ arr2.splice(i,1); setVakum(arr2); renderVakum(); }
              }
            };
            tbody.appendChild(tr);
          });
        }
        document.addEventListener('DOMContentLoaded', function(){
          const f=document.getElementById('frmVakum');
          if(f){
            const blokNoInput = f.querySelector('[name=blokNo]');
            if(blokNoInput){
              blokNoInput.addEventListener('change', async function(){
                // getBloklar may be async; await it and guard before using .find
                const bloklar = await (typeof getBloklar === 'function' ? getBloklar() : []);
                let val = (blokNoInput.value||'').trim(); val = normalizeBlokNo(val);
                const secili = Array.isArray(bloklar) ? bloklar.find(b => (b.blokNo||'').trim().toLowerCase() === val.toLowerCase()) : null;
                if(secili){
                  f.tasIsmi.value = secili.blokAdi||'';
                  f.en.value = sanitizeDimensionVal(secili.en||'');
                  f.boy.value = sanitizeDimensionVal(secili.boy||'');
                  f.yukseklik.value = sanitizeDimensionVal(secili.yukseklik||'');
                  calcVakumM3();
                } else { ['tasIsmi','en','boy','yukseklik','m3'].forEach(k=>{ if(f[k]) f[k].value=''; }); }
              });
            }
            
            const epoxyInput = f.querySelector('[name=epoxyKg]');
            const tarihInput = f.querySelector('[name=tarih]');
            function applyEpoxyOverride(){
              const d = (tarihInput?.value||'').trim(); if(!d) return;
              const val = epoxyInput?.value||'';
              const obj = getPfOverrides(); obj[d] = val; setPfOverrides(obj);
              renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.();
    
        window.addEventListener('storage', function(e){
          if(e.key===PF_KEY || e.key===PF_OVR_KEY || e.key===FF_KEY || e.key===FF_OVR_KEY){
            try{ renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.(); }catch(_){}
          }
        });
    
            }
            if(epoxyInput){
              epoxyInput.addEventListener('input', applyEpoxyOverride);
              epoxyInput.addEventListener('change', applyEpoxyOverride);
            }
            if(tarihInput){
              tarihInput.addEventListener('change', ()=>{
                // tarih değişince mevcut override gösterilsin
                const obj = getPfOverrides(); const d=(tarihInput.value||'').trim();
                if(obj[d]!==undefined && f.epoxyKg) f.epoxyKg.value = obj[d];
                renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.();
    
        window.addEventListener('storage', function(e){
          if(e.key===PF_KEY || e.key===PF_OVR_KEY || e.key===FF_KEY || e.key===FF_OVR_KEY){
            try{ renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.(); }catch(_){}
          }
        });
    
              });
            }
    
            f.addEventListener('submit', async function(e){
              // Sadece Vakum alt-sekmesi içindeki gönder butonları bu akışı tetiklemeli
              const vak = document.getElementById('vakum-content');
              const submitter = e.submitter;
              if(!(vak && submitter && vak.contains(submitter))) return; // Kaydet (blok girişi) vb. için çalıştırma
              e.preventDefault();
              const rec=readVakumForm();
              // getBloklar may be async
              const bloklar = await (typeof getBloklar === 'function' ? getBloklar() : []);
              const recBlok = normalizeBlokNo(rec.blokNo||'');
              const secili = Array.isArray(bloklar) ? bloklar.find(b => (b.blokNo||'').trim().toLowerCase() === recBlok.trim().toLowerCase()) : null;
              if(!secili){ alert("Sadece Blok Listesi’nde olan bir blok için Vakum kaydı yapılabilir!"); blokNoInput?.focus(); return; }
              let arr=getVakum(); const i=arr.findIndex(x=>x.id===rec.id);
              if(i>=0) arr[i]=rec; else arr.unshift(rec);
              setVakum(arr); renderVakum();
              try{ scheduleSync(VAK_KEY, rec); }catch(_){ }
              // update blok list
              const blArr = await (typeof getBloklar === 'function' ? getBloklar() : []);
              const b = Array.isArray(blArr) ? blArr.find(x=> (x.blokNo||'').trim().toLowerCase() === recBlok.trim().toLowerCase()) : null;
              if(b && b.asama !== 'Sağlamlaştırma'){ b.asama='Sağlamlaştırma'; setBloklar(blArr); renderBloklar?.(); }
              f.reset();
            });
          }
          renderVakum();
        });
    
        /* ------------------ KATRAK ------------------ */
        function calcKatrakM3(){
          const f=document.getElementById('frmKatrak'); if(!f) return;
          const en=num(f.en?.value), boy=num(f.boy?.value), yuk=num(f.yukseklik?.value);
          const m3 = (!isNaN(en)&&!isNaN(boy)&&!isNaN(yuk)) ? (en*boy*yuk)/1000000 : NaN;
          if(f.m3) f.m3.value = isNaN(m3)?'':nf3.format(m3);
        }
        ['en','boy','yukseklik'].forEach(n=>{ document.addEventListener('input', e=>{ if(e.target && e.target.name===n && e.target.closest('#frmKatrak')) calcKatrakM3(); }); });
        function calcKesimSuresi(){
          const f=document.getElementById('frmKatrak'); if(!f) return;
          const d1=f.girTarih?.value, t1=f.girSaat?.value;
          const d2=f.cikTarih?.value, t2=f.cikSaat?.value;
          if(!d1||!t1||!d2||!t2){ f.kesimSuresi.value=''; return; }
          try{
            const start = new Date(d1+'T'+t1+':00');
            const end   = new Date(d2+'T'+t2+':00');
            let ms = end - start;
            if(isNaN(ms)) { f.kesimSuresi.value=''; return; }
            if(ms < 0) ms = 0;
            const minutes = Math.floor(ms/60000);
            const hh = Math.floor(minutes/60);
            const mm = minutes%60;
            f.kesimSuresi.value = pad2(hh)+':'+pad2(mm);
          }catch(_){ f.kesimSuresi.value=''; }
        }
        ['girTarih','girSaat','cikTarih','cikSaat'].forEach(n=>{
          document.addEventListener('input', function(e){ if(e.target && e.target.name===n && e.target.closest('#frmKatrak')) calcKesimSuresi(); });
          document.addEventListener('change', function(e){ if(e.target && e.target.name===n && e.target.closest('#frmKatrak')) calcKesimSuresi(); });
        });
        function readKatrakForm(){
          const f=document.getElementById('frmKatrak'); if(!f) return null;
          return { id: f.idHidden?.value || (Date.now().toString(36)+Math.random().toString(36).slice(2)), girTarih: f.girTarih?.value || '', girSaat: f.girSaat?.value || '', katrakNo: f.katrakNo?.value || '', kalinlik: f.kalinlik?.value || '', blokNo: f.blokNo?.value?.trim() || '', tasIsmi: f.tasIsmi?.value || '', en: f.en?.value || '', boy: f.boy?.value || '', yukseklik: f.yukseklik?.value || '', m3: f.m3?.value || '', cikTarih: f.cikTarih?.value || '', cikSaat: f.cikSaat?.value || '', kesimSuresi: f.kesimSuresi?.value || '', cikanAdet: f.cikanAdet?.value || '', cikanM2: f.cikanM2?.value || '' };
        }
        function getKatrakList(){ try { return JSON.parse(localStorage.getItem(KATRK_KEY)||'[]'); } catch(e){ return []; } }
        function setKatrakList(arr){ localStorage.setItem(KATRK_KEY, JSON.stringify(arr)); }
        function renderKatrakList(){
          const arr=getKatrakList(); const tbody=document.getElementById('katrakBody'); if(!tbody) return;
          tbody.innerHTML='';
          arr.forEach(rec=>{
            const tr=document.createElement('tr');
            tr.innerHTML = `
              <td>${rec.girTarih||''}</td><td>${rec.girSaat||''}</td><td>${rec.katrakNo||''}</td><td>${rec.kalinlik||''}</td>
              <td><b>${rec.blokNo||''}</b></td><td>${rec.tasIsmi||''}</td><td>${rec.en||''}</td><td>${rec.boy||''}</td><td>${rec.yukseklik||''}</td><td>${rec.m3||''}</td>
              <td>${rec.cikTarih||''}</td><td>${rec.cikSaat||''}</td><td>${rec.kesimSuresi||''}</td><td>${rec.cikanAdet||''}</td><td>${rec.cikanM2||''}</td>
              <td><button class="btn ghost small btnEditKat">Düzenle</button><button class="btn danger small btnDelKat">Sil</button></td>`;
            tr.querySelector('.btnEditKat').onclick=()=>{
              const f=document.getElementById('frmKatrak'); if(!f) return;
              ['girTarih','girSaat','katrakNo','kalinlik','blokNo','tasIsmi','en','boy','yukseklik','m3','cikTarih','cikSaat','kesimSuresi','cikanAdet','cikanM2'].forEach(k=>{ setFormFieldValue(f, k, rec[k]||''); });
              f.idHidden.value=rec.id||''; document.querySelector('[data-sub="katrak_kesim"]').click();
            };
            tr.querySelector('.btnDelKat').onclick=()=>{
              if(confirm("Bu katrak kaydını silmek istediğinize emin misiniz?")){
                const arr2=getKatrakList();
                const i=arr2.findIndex(x=>x.id===rec.id);
                if(i>=0){ arr2.splice(i,1); setKatrakList(arr2); renderKatrakList(); }
              }
            };
            tbody.appendChild(tr);
          });
        }
        document.addEventListener('DOMContentLoaded', function(){
          const f=document.getElementById('frmKatrak');
          if(f){
            const blokNoInput = f.querySelector('[name=blokNo]');
            if(blokNoInput){
              blokNoInput.addEventListener('change', async function(){
                const bloklar = await (typeof getBloklar === 'function' ? getBloklar() : []);
                let val = (blokNoInput.value||'').trim(); val = normalizeBlokNo(val);
                const secili = Array.isArray(bloklar) ? bloklar.find(b => (b.blokNo||'').trim().toLowerCase() === val.toLowerCase()) : null;
                if(secili){
                  f.tasIsmi.value = secili.blokAdi || '';
                  f.en.value = sanitizeDimensionVal(secili.en || '');
                  f.boy.value = sanitizeDimensionVal(secili.boy || '');
                  f.yukseklik.value = sanitizeDimensionVal(secili.yukseklik || '');
                  calcKatrakM3();
                } else { ['tasIsmi','en','boy','yukseklik','m3'].forEach(k=> f[k].value=''); }
              });
            }
            
            const epoxyInput = f.querySelector('[name=epoxyKg]');
            const tarihInput = f.querySelector('[name=tarih]');
            function applyEpoxyOverride(){
              const d = (tarihInput?.value||'').trim(); if(!d) return;
              const val = epoxyInput?.value||'';
              const obj = getPfOverrides(); obj[d] = val; setPfOverrides(obj);
              renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.();
    
        window.addEventListener('storage', function(e){
          if(e.key===PF_KEY || e.key===PF_OVR_KEY || e.key===FF_KEY || e.key===FF_OVR_KEY){
            try{ renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.(); }catch(_){}
          }
        });
    
            }
            if(epoxyInput){
              epoxyInput.addEventListener('input', applyEpoxyOverride);
              epoxyInput.addEventListener('change', applyEpoxyOverride);
            }
            if(tarihInput){
              tarihInput.addEventListener('change', ()=>{
                // tarih değişince mevcut override gösterilsin
                const obj = getPfOverrides(); const d=(tarihInput.value||'').trim();
                if(obj[d]!==undefined && f.epoxyKg) f.epoxyKg.value = obj[d];
                renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.();
    
        window.addEventListener('storage', function(e){
          if(e.key===PF_KEY || e.key===PF_OVR_KEY || e.key===FF_KEY || e.key===FF_OVR_KEY){
            try{ renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.(); }catch(_){}
          }
        });
    
              });
            }
    
            f.addEventListener('submit', async function(e){
              // Sadece Katrak formundaki gönderimler bu akışı tetiklemeli
              const frmKatrak = document.getElementById('frmKatrak');
              const submitter = e.submitter;
              if(!(frmKatrak && submitter && frmKatrak.contains(submitter))) return;
              e.preventDefault();
              const rec=readKatrakForm();
              if(!rec.blokNo){ alert("Blok No zorunlu"); return; }
              const bloklar = await (typeof getBloklar === 'function' ? getBloklar() : []);
              const recBlok = normalizeBlokNo(rec.blokNo||'');
              const secili = Array.isArray(bloklar) ? bloklar.find(b => (b.blokNo||'').trim().toLowerCase() === recBlok.trim().toLowerCase()) : null;
              if(!secili){ alert("Sadece Blok Listesi’nde olan bir blok için katrak kaydı yapılabilir!"); blokNoInput?.focus(); return; }
              let arr=getKatrakList(); const i=arr.findIndex(x=>x.id===rec.id);
              if(i>=0) arr[i]=rec; else arr.unshift(rec);
              setKatrakList(arr); renderKatrakList();
              try{ scheduleSync(KATRK_KEY, rec); }catch(_){ }
              const blArr = await (typeof getBloklar === 'function' ? getBloklar() : []);
              const b = Array.isArray(blArr) ? blArr.find(x=> (x.blokNo||'').trim().toLowerCase() === recBlok.trim().toLowerCase()) : null;
              if(b && b.asama !== 'Katrak'){ b.asama='Katrak'; setBloklar(blArr); renderBloklar?.(); }
              f.reset(); f.idHidden.value='';
            });
          }
          renderKatrakList();
        });
    
        /* ------------------ PLAKA SİLİM ------------------ */
        function ps_m2_from(en, boy, adet){
          const e=num(en), b=num(boy), a=parseInt(adet||'0',10);
          const tekPlaka = (!isNaN(e)&&!isNaN(b)) ? (e*b)/10000 : NaN; // cm->m
          if(isNaN(tekPlaka)) return NaN;
          return tekPlaka * (isNaN(a)?0:a);
        }
        function calcPSm2(){
          const f=document.getElementById('frmPS'); if(!f) return;
          const m2 = ps_m2_from(f.en?.value, f.boy?.value, f.adet?.value);
          if(f.m2) f.m2.value = isNaN(m2)?'':nf3.format(m2);
          const e=num(f.en?.value), b=num(f.boy?.value), k=parseInt(f.kirik?.value||'0',10);
          const tek = (!isNaN(e)&&!isNaN(b)) ? (e*b)/10000 : NaN;
          const kirikM2 = isNaN(tek) ? NaN : (tek * (isNaN(k)?0:k));
          if(f.kirikM2) f.kirikM2.value = isNaN(kirikM2)?'':nf3.format(kirikM2);
        }
        ['en','boy','adet','kirik'].forEach(n=>{
          document.addEventListener('input', e=>{ if(e.target && e.target.name===n && e.target.closest('#frmPS')) calcPSm2(); });
        });
        function getPS(){ try { return JSON.parse(localStorage.getItem(PS_KEY)||'[]'); } catch(e){ return []; } }
        function setPS(arr){ localStorage.setItem(PS_KEY, JSON.stringify(arr)); }
        function readPSForm(){
          const f=document.getElementById('frmPS'); if(!f) return null;
          return {
            id: f.idHidden?.value || (Date.now().toString(36)+Math.random().toString(36).slice(2)),
            tarih: f.tarih?.value || '',
            blokNo: f.blokNo?.value || '',
            tasIsmi: f.tasIsmi?.value || '',
            en: f.en?.value || '',
            boy: f.boy?.value || '',
            adet: f.adet?.value || '',
            m2: f.m2?.value || '',
            kirik: f.kirik?.value || '',
            kirikM2: f.kirikM2?.value || '',
            yuzeyIslem: f.yuzeyIslem?.value || '',
            aciklama: f.aciklama?.value || ''
          };
        }
        function renderPSList(){
          const arr=getPS(); const tbody=document.getElementById('psBody'); if(!tbody) return;
          tbody.innerHTML='';
          arr.forEach(rec=>{
            const tr=document.createElement('tr');
            tr.innerHTML = `
              <td>${rec.tarih||''}</td><td><b>${rec.blokNo||''}</b></td><td>${typeof toTitleCaseTR==='function'? toTitleCaseTR(rec.tasIsmi||''): (rec.tasIsmi||'')}</td>
              <td>${rec.en||''}</td><td>${rec.boy||''}</td><td>${rec.adet||''}</td><td>${rec.m2||''}</td>
              <td>${rec.kirik||''}</td><td>${rec.kirikM2||''}</td><td>${rec.yuzeyIslem||''}</td><td>${rec.aciklama||''}</td>
              <td><button class="btn ghost small btnEditPS">Düzenle</button><button class="btn danger small btnDelPS">Sil</button></td>`;
            tr.querySelector('.btnEditPS').onclick=()=>{
              const f=document.getElementById('frmPS'); if(!f) return;
              ['tarih','blokNo','tasIsmi','en','boy','adet','m2','kirik','kirikM2','yuzeyIslem','aciklama'].forEach(k=>{ setFormFieldValue(f, k, rec[k]||''); });
              f.idHidden.value = rec.id||'';
              document.querySelector('[data-sub="plaka_silim"]').click();
            };
            tr.querySelector('.btnDelPS').onclick=()=>{
              if(confirm('Bu Plaka Silim kaydını silmek istiyor musunuz?')){
                const arr2=getPS(); const i=arr2.findIndex(x=>x.id===rec.id);
                if(i>=0){ arr2.splice(i,1); setPS(arr2); renderPSList(); renderBloklar?.(); }
              }
            };
            tbody.appendChild(tr);
          });
        }
        document.addEventListener('DOMContentLoaded', function(){
          const f=document.getElementById('frmPS');
          if(f){
            const blokNoInput = f.querySelector('[name=blokNo]');
            if(blokNoInput){
              blokNoInput.addEventListener('change', async function(){
                const bloklar = await (typeof getBloklar === 'function' ? getBloklar() : []);
                let val = normalizeBlokNo((blokNoInput.value||'').trim());
                const secili = Array.isArray(bloklar) ? bloklar.find(b => (b.blokNo||'').trim().toLowerCase() === val.toLowerCase()) : null;
                if(secili){
                  if(f.tasIsmi) f.tasIsmi.value = secili.blokAdi||'';
                  if(f.en) f.en.value = sanitizeDimensionVal(secili.en||'');
                  if(f.boy) f.boy.value = sanitizeDimensionVal(secili.boy||'');
                  calcPSm2();
                } else {
                  ['tasIsmi','en','boy','m2'].forEach(k=>{ if(f[k]) f[k].value=''; });
                }
              });
            }
            f.addEventListener('submit', async function(e){
              // Sadece Plaka Silim formundan gelen submit tetiklemeleri için çalış
              const frmPS = document.getElementById('frmPS');
              const submitter = e.submitter;
              if(!(frmPS && submitter && frmPS.contains(submitter))) return;
              e.preventDefault();
              const rec = readPSForm();
              if(!rec){ alert('Form okunamadı'); return; }
              // Eğer datalist seçiminden veya elle girme sonucu "56 — Vera Beige" gibi bir değer geldiyse
              // blokNo kısmını sol taraftaki gerçek blokNo'ya indirgeriz.
              if(rec.blokNo && typeof rec.blokNo === 'string' && rec.blokNo.indexOf('—')>=0){ rec.blokNo = rec.blokNo.split('—')[0].trim(); }
              rec.blokNo = (rec.blokNo||'').trim();
              if(!rec.blokNo){ alert('Blok No gerekli'); return; }
    
              const bloklar = await (typeof getBloklar === 'function' ? getBloklar() : []);
              const secili = Array.isArray(bloklar) ? bloklar.find(b => (b.blokNo||'').trim().toLowerCase() === rec.blokNo.trim().toLowerCase()) : null;
              if(!secili){ alert('Sadece Blok Listesi’nde olan bir blok için plaka silim kaydı yapılabilir!'); blokNoInput?.focus(); return; }
    
              let arr = getPS(); const i = arr.findIndex(x=>x.id===rec.id);
              if(i>=0) arr[i]=rec; else arr.unshift(rec);
              setPS(arr); renderPSList();
              try{ scheduleSync(PS_KEY, rec); }catch(_){ }
    
              // Blok aşamasını güncelle (opsiyonel iş kuralı)
              const bi = Array.isArray(bloklar) ? bloklar.findIndex(x=> (x.blokNo||'').trim().toLowerCase() === rec.blokNo.trim().toLowerCase()) : -1;
              if(bi>=0){ if(bloklar[bi].asama !== 'Plaka Silim'){ bloklar[bi].asama = 'Plaka Silim'; if(typeof setBloklar==='function') await setBloklar(bloklar); try{ renderBloklar?.(); }catch(_){ } } }
    
              // Form temizleme
              f.reset(); f.idHidden.value='';
            });
          }
          renderPSList();
        });
    
        /* ------------------ PLAKA FIRIN ------------------ */
        function pf_m2_from(en, boy, adet){
          const e=num(en), b=num(boy), a=parseInt(adet||'0',10);
          const tekPlaka = (!isNaN(e)&&!isNaN(b)) ? (e*b)/10000 : NaN; // cm->m
          if(isNaN(tekPlaka)) return NaN;
          return tekPlaka * (isNaN(a)?0:a);
        }
        function calcPFm2(){
          const f=document.getElementById('frmPF'); if(!f) return;
          const m2 = pf_m2_from(f.en?.value, f.boy?.value, f.adet?.value);
          if(f.m2) f.m2.value = isNaN(m2)?'':nf3.format(m2);
          // Kırık m² otomatik: (en × boy / 10.000) × kırık
          const e=num(f.en?.value), b=num(f.boy?.value), k=parseInt(f.kirik?.value||'0',10);
          const tek = (!isNaN(e)&&!isNaN(b)) ? (e*b)/10000 : NaN;
          const kirikM2 = isNaN(tek) ? NaN : (tek * (isNaN(k)?0:k));
          if(f.kirikM2) f.kirikM2.value = isNaN(kirikM2)?'':nf3.format(kirikM2);
        }
        ['en','boy','adet','kirik'].forEach(n=>{
          document.addEventListener('input', e=>{ if(e.target && e.target.name===n && e.target.closest('#frmPF')) calcPFm2(); });
        });
        function getPF(){ try { return JSON.parse(localStorage.getItem(PF_KEY)||'[]'); } catch(e){ return []; } }
        function setPF(arr){ localStorage.setItem(PF_KEY, JSON.stringify(arr)); }
        function readPFForm(){
          const f=document.getElementById('frmPF'); if(!f) return null;
          return {
            id: f.idHidden?.value || (Date.now().toString(36)+Math.random().toString(36).slice(2)),
            tarih: f.tarih?.value || '',
            blokNo: f.blokNo?.value || '',
            tasIsmi: f.tasIsmi?.value || '',
            kalinlik: f.kalinlik?.value || '',
            en: f.en?.value || '',
            boy: f.boy?.value || '',
            adet: f.adet?.value || '',
            m2: f.m2?.value || '',
            kirik: f.kirik?.value || '',
            kirikM2: f.kirikM2?.value || '',
            epoxyKg: f.epoxyKg?.value || '' // günlük
          };
        }
        function renderPFList(){
          const arr=getPF(); const tbody=document.getElementById('pfBody'); if(!tbody) return;
          // tarih bazında m² toplamı ve günlük epoxy derle
          const byDate = {}; const ovr = getPfOverrides();
          arr.forEach(r=>{
            const d=(r.tarih||'').trim(); if(!d) return;
            if(!byDate[d]) byDate[d] = { m2:0, epoxyKg: NaN };
            const m2v = num(r.m2); if(!isNaN(m2v)) byDate[d].m2 += m2v;
            const e = num(r.epoxyKg);
            if(!isNaN(e)) byDate[d].epoxyKg = e;
            if(ovr[d]!==undefined && !isNaN(num(ovr[d]))) byDate[d].epoxyKg = num(ovr[d]); // aynı günde son girilen epoxy değerini kabul et
            if(ovr[d]!==undefined && !isNaN(num(ovr[d]))) byDate[d].epoxyKg = num(ovr[d]);
          });
    
          tbody.innerHTML='';
          arr.forEach(rec=>{
            const d=(rec.tarih||'').trim();
            const daily = byDate[d] || { m2: NaN, epoxyKg: NaN };
            const ratio = (!isNaN(daily.m2) && daily.m2>0 && !isNaN(daily.epoxyKg)) ? (daily.epoxyKg / daily.m2) : NaN; // kg/m²
    
            const tr=document.createElement('tr');
            tr.innerHTML = `
              <td>${rec.tarih||''}</td><td><b>${rec.blokNo||''}</b></td><td>${typeof toTitleCaseTR==='function'? toTitleCaseTR(rec.tasIsmi||''): (rec.tasIsmi||'')}</td><td>${rec.kalinlik||''}</td>
              <td>${rec.en||''}</td><td>${rec.boy||''}</td><td>${rec.adet||''}</td><td>${rec.m2||''}</td><td>${rec.kirik||''}</td><td>${rec.kirikM2||''}</td>
              <td>${isNaN(ratio)?'':nf3.format(ratio)}</td>
              <td><button class="btn ghost small btnEditPF">Düzenle</button><button class="btn danger small btnDelPF">Sil</button></td>`;
    
            tr.querySelector('.btnEditPF').onclick=()=>{
              const f=document.getElementById('frmPF'); if(!f) return;
              ['tarih','blokNo','tasIsmi','kalinlik','en','boy','adet','m2','kirik','kirikM2','epoxyKg'].forEach(k=>{ setFormFieldValue(f, k, rec[k]||''); });
              f.idHidden.value = rec.id||'';
              document.querySelector('[data-sub="plaka_firin"]').click();
            };
            tr.querySelector('.btnDelPF').onclick=()=>{
              if(confirm("Bu Plaka Fırın kaydını silmek istiyor musunuz?")){
                const arr2=getPF(); const i=arr2.findIndex(x=>x.id===rec.id);
                if(i>=0){ arr2.splice(i,1); setPF(arr2); renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.();
    
        window.addEventListener('storage', function(e){
          if(e.key===PF_KEY || e.key===PF_OVR_KEY || e.key===FF_KEY || e.key===FF_OVR_KEY){
            try{ renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.(); }catch(_){}
          }
        });
     }
              }
            };
            tbody.appendChild(tr);
          });
        }
        function renderPFSummary(){
          const arr=getPF(); const tbody=document.getElementById('pfSummaryBody'); if(!tbody) return;
          const byDate = {}; const ovr = getPfOverrides();
          arr.forEach(r=>{
            const d=(r.tarih||'').trim(); if(!d) return;
            if(!byDate[d]) byDate[d] = { m2:0, epoxyKg: NaN };
            const m2v = num(r.m2); if(!isNaN(m2v)) byDate[d].m2 += m2v;
            const e = num(r.epoxyKg);
            if(!isNaN(e)) byDate[d].epoxyKg = e;
            if(ovr[d]!==undefined && !isNaN(num(ovr[d]))) byDate[d].epoxyKg = num(ovr[d]);
          });
          const rows = Object.entries(byDate).sort((a,b)=> a[0].localeCompare(b[0]));
          tbody.innerHTML='';
          rows.forEach(([d, obj])=>{
            const ratio = (!isNaN(obj.m2) && obj.m2>0 && !isNaN(obj.epoxyKg)) ? (obj.epoxyKg/obj.m2) : NaN; // kg/m²
            const tr=document.createElement('tr');
            tr.innerHTML = `<td>${d}</td><td>${nf3.format(obj.m2)}</td><td>${isNaN(obj.epoxyKg)?'':nf3.format(obj.epoxyKg)}</td><td>${isNaN(ratio)?'':nf3.format(ratio)}</td>`;
            tbody.appendChild(tr);
          });
        }
        document.addEventListener('DOMContentLoaded', function(){
          const f=document.getElementById('frmPF');
          if(f){
            const blokNoInput = f.querySelector('[name=blokNo]');
            if(blokNoInput){
              blokNoInput.addEventListener('change', async function(){
                const bloklar = await (typeof getBloklar === 'function' ? getBloklar() : []);
                let val = (blokNoInput.value||'').trim(); val = normalizeBlokNo(val);
                const secili = Array.isArray(bloklar) ? bloklar.find(b => (b.blokNo||'').trim().toLowerCase() === val.toLowerCase()) : null;
                if(secili){
                  f.tasIsmi.value = secili.blokAdi||'';
                  f.en.value = sanitizeDimensionVal(secili.en||'');
                  f.boy.value = sanitizeDimensionVal(secili.boy||'');
                } else {
                  ['tasIsmi','en','boy'].forEach(k=> f[k].value='');
                }
                calcPFm2();
              });
            }
            
            const epoxyInput = f.querySelector('[name=epoxyKg]');
            const tarihInput = f.querySelector('[name=tarih]');
            function applyEpoxyOverride(){
              const d = (tarihInput?.value||'').trim(); if(!d) return;
              const val = epoxyInput?.value||'';
              const obj = getPfOverrides(); obj[d] = val; setPfOverrides(obj);
              renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.();
    
        window.addEventListener('storage', function(e){
          if(e.key===PF_KEY || e.key===PF_OVR_KEY || e.key===FF_KEY || e.key===FF_OVR_KEY){
            try{ renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.(); }catch(_){}
          }
        });
    
            }
            if(epoxyInput){
              epoxyInput.addEventListener('input', applyEpoxyOverride);
              epoxyInput.addEventListener('change', applyEpoxyOverride);
            }
            if(tarihInput){
              tarihInput.addEventListener('change', ()=>{
                // tarih değişince mevcut override gösterilsin
                const obj = getPfOverrides(); const d=(tarihInput.value||'').trim();
                if(obj[d]!==undefined && f.epoxyKg) f.epoxyKg.value = obj[d];
                renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.();
    
        window.addEventListener('storage', function(e){
          if(e.key===PF_KEY || e.key===PF_OVR_KEY || e.key===FF_KEY || e.key===FF_OVR_KEY){
            try{ renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.(); }catch(_){}
          }
        });
    
              });
            }
    
            f.addEventListener('submit', async function(e){
              // Sadece Plaka Fırın formundan gelen submit tetiklemeleri için çalış
              const frmPF = document.getElementById('frmPF');
              const submitter = e.submitter;
              if(!(frmPF && submitter && frmPF.contains(submitter))) return;
              e.preventDefault();
              const rec=readPFForm();
              const recBlok = normalizeBlokNo(rec.blokNo||'');
              if(!recBlok){ alert("Blok No zorunlu"); return; }
              // persist normalized blokNo in the record
              rec.blokNo = recBlok;
              const bloklar = await (typeof getBloklar === 'function' ? getBloklar() : []);
              const secili = Array.isArray(bloklar) ? bloklar.find(b => (b.blokNo||'').trim().toLowerCase() === recBlok.trim().toLowerCase()) : null;
              if(!secili){ alert("Sadece Blok Listesi’nde olan bir blok için plaka fırın kaydı yapılabilir!"); blokNoInput?.focus(); return; }
              let arr=getPF(); const i=arr.findIndex(x=>x.id===rec.id);
              if(i>=0) arr[i]=rec; else arr.unshift(rec);
              setPF(arr);
              try{ scheduleSync(PF_KEY, rec); }catch(_){ }
              // Override'ı da güncelle (formdaki epoxyKg değeri o gün için geçerli olsun)
              const o = getPfOverrides(); if(rec.tarih) { o[rec.tarih] = rec.epoxyKg||o[rec.tarih]; setPfOverrides(o); }
     renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.();
    
        window.addEventListener('storage', function(e){
          if(e.key===PF_KEY || e.key===PF_OVR_KEY || e.key===FF_KEY || e.key===FF_OVR_KEY){
            try{ renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.(); }catch(_){}
          }
        });
    
              const blArr = await (typeof getBloklar === 'function' ? getBloklar() : []);
              const b = Array.isArray(blArr) ? blArr.find(x=> (x.blokNo||'').trim().toLowerCase() === recBlok.trim().toLowerCase()) : null;
              if(b && b.asama !== 'Plaka Fırın'){ b.asama='Plaka Fırın'; setBloklar(blArr); renderBloklar?.(); }
              f.reset(); f.idHidden.value='';
            });
          }
          renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.();
    
        window.addEventListener('storage', function(e){
          if(e.key===PF_KEY || e.key===PF_OVR_KEY || e.key===FF_KEY || e.key===FF_OVR_KEY){
            try{ renderPFList(); renderPFSummary(); renderFFList?.(); renderFFSummary?.(); renderFFList?.(); renderFFSummary?.(); }catch(_){}
          }
        });
    
        });
      
        /* ------------------ FAYANS FIRIN ------------------ */
        function ff_m2_from(en, boy, adet){
          const e=num(en), b=num(boy), a=parseInt(adet||'0',10);
          const tekPlaka = (!isNaN(e)&&!isNaN(b)) ? (e*b)/10000 : NaN;
          if(isNaN(tekPlaka)) return NaN;
          return tekPlaka * (isNaN(a)?0:a);
        }
        function calcFFm2(){
          const f=document.getElementById('frmFF'); if(!f) return;
          const m2 = ff_m2_from(f.en?.value, f.boy?.value, f.adet?.value);
          if(f.m2) f.m2.value = isNaN(m2)?'':nf3.format(m2);
          const e=num(f.en?.value), b=num(f.boy?.value), k=parseInt(f.kirik?.value||'0',10);
          const tek = (!isNaN(e)&&!isNaN(b)) ? (e*b)/10000 : NaN;
          const kirikM2 = isNaN(tek) ? NaN : (tek * (isNaN(k)?0:k));
          if(f.kirikM2) f.kirikM2.value = isNaN(kirikM2)?'':nf3.format(kirikM2);
        }
        ['en','boy','adet','kirik'].forEach(n=>{
          document.addEventListener('input', e=>{ if(e.target && e.target.name===n && e.target.closest('#frmFF')) calcFFm2(); });
        });
        function getFF(){ try { return JSON.parse(localStorage.getItem(FF_KEY)||'[]'); } catch(e){ return []; } }
        function setFF(arr){ localStorage.setItem(FF_KEY, JSON.stringify(arr)); }
        function readFFForm(){
          const f=document.getElementById('frmFF'); if(!f) return null;
          return {
            id: f.idHidden?.value || (Date.now().toString(36)+Math.random().toString(36).slice(2)),
            tarih: f.tarih?.value || '',
            blokNo: f.blokNo?.value || '',
            tasIsmi: f.tasIsmi?.value || '',
            kalinlik: f.kalinlik?.value || '',
            en: f.en?.value || '',
            boy: f.boy?.value || '',
            adet: f.adet?.value || '',
            m2: f.m2?.value || '',
            kirik: f.kirik?.value || '',
            kirikM2: f.kirikM2?.value || '',
            epoxyKg: f.epoxyKg?.value || ''
          };
        }
        function renderFFList(){
          const arr=getFF(); const tbody=document.getElementById('ffBody'); if(!tbody) return;
          const byDate = {}; const ovr = getFfOverrides();
          arr.forEach(r=>{
            const d=(r.tarih||'').trim(); if(!d) return;
            if(!byDate[d]) byDate[d] = { m2:0, epoxyKg: NaN };
            const m2v = num(r.m2); if(!isNaN(m2v)) byDate[d].m2 += m2v;
            const e = num(r.epoxyKg); if(!isNaN(e)) byDate[d].epoxyKg = e;
            if(ovr[d]!==undefined && !isNaN(num(ovr[d]))) byDate[d].epoxyKg = num(ovr[d]);
          });
          tbody.innerHTML='';
          arr.forEach(rec=>{
            const d=(rec.tarih||'').trim();
            const daily = byDate[d] || { m2: NaN, epoxyKg: NaN };
            const ratio = (!isNaN(daily.m2) && daily.m2>0 && !isNaN(daily.epoxyKg)) ? (daily.epoxyKg / daily.m2) : NaN;
            const tr=document.createElement('tr');
            tr.innerHTML = `
              <td>${rec.tarih||''}</td><td><b>${rec.blokNo||''}</b></td><td>${typeof toTitleCaseTR==='function'? toTitleCaseTR(rec.tasIsmi||''): (rec.tasIsmi||'')}</td><td>${rec.kalinlik||''}</td>
              <td>${rec.en||''}</td><td>${rec.boy||''}</td><td>${rec.adet||''}</td><td>${rec.m2||''}</td><td>${rec.kirik||''}</td><td>${rec.kirikM2||''}</td>
              <td>${isNaN(ratio)?'':nf3.format(ratio)}</td>
              <td><button class="btn ghost small btnEditFF">Düzenle</button><button class="btn danger small btnDelFF">Sil</button></td>`;
            tr.querySelector('.btnEditFF').onclick=()=>{
              const f=document.getElementById('frmFF'); if(!f) return;
              ['tarih','blokNo','tasIsmi','kalinlik','en','boy','adet','m2','kirik','kirikM2','epoxyKg'].forEach(k=>{ setFormFieldValue(f, k, rec[k]||''); });
              f.idHidden.value = rec.id||'';
              document.querySelector('[data-sub="fayans_firin"]').click();
            };
            tr.querySelector('.btnDelFF').onclick=()=>{
              if(confirm("Bu Fayans Fırın kaydını silmek istiyor musunuz?")){
                const arr2=getFF(); const i=arr2.findIndex(x=>x.id===rec.id);
                if(i>=0){ arr2.splice(i,1); setFF(arr2); renderFFList(); renderFFSummary(); }
              }
            };
            tbody.appendChild(tr);
          });
        }
        function renderFFSummary(){
          const arr=getFF(); const tbody=document.getElementById('ffSummaryBody'); if(!tbody) return;
          const byDate = {}; const ovr = getFfOverrides();
          arr.forEach(r=>{
            const d=(r.tarih||'').trim(); if(!d) return;
            if(!byDate[d]) byDate[d] = { m2:0, epoxyKg: NaN };
            const m2v = num(r.m2); if(!isNaN(m2v)) byDate[d].m2 += m2v;
            const e = num(r.epoxyKg); if(!isNaN(e)) byDate[d].epoxyKg = e;
            if(ovr[d]!==undefined && !isNaN(num(ovr[d]))) byDate[d].epoxyKg = num(ovr[d]);
          });
          const rows = Object.entries(byDate).sort((a,b)=> a[0].localeCompare(b[0]));
          tbody.innerHTML='';
          rows.forEach(([d, obj])=>{
            const ratio = (!isNaN(obj.m2) && obj.m2>0 && !isNaN(obj.epoxyKg)) ? (obj.epoxyKg/obj.m2) : NaN;
            const tr=document.createElement('tr');
            tr.innerHTML = `<td>${d}</td><td>${nf3.format(obj.m2)}</td><td>${isNaN(obj.epoxyKg)?'':nf3.format(obj.epoxyKg)}</td><td>${isNaN(ratio)?'':nf3.format(ratio)}</td>`;
            tbody.appendChild(tr);
          });
        }
        // ---- Fayans Fırın Seleksiyon (liste & handlers) ----
        function readFFSForm(){
          const f = document.getElementById('frmFFS'); if(!f) return null;
          return {
            id: f.idHidden?.value || (Date.now().toString(36) + Math.random().toString(36).slice(2,6)),
            tarih: f.tarih?.value || '',
            blokNo: (f.blokNo?.value || '').trim(),
            tasIsmi: f.tasIsmi?.value || '',
            kalinlik: f.kalinlik?.value || '',
            en: f.en?.value || '',
            boy: f.boy?.value || '',
            adet: f.adet?.value || '',
            m2: f.m2?.value || '',
            kirik: f.kirik?.value || '',
            kirikM2: f.kirikM2?.value || '',
            epoxyKg: f.epoxyKg?.value || ''
          };
        }
    
        function renderFFSList(){
          const arr = getFFS(); const tbody = document.getElementById('ffsBody'); if(!tbody) return;
          tbody.innerHTML = '';
          arr.forEach(rec=>{
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td>${rec.tarih||''}</td><td><b>${rec.blokNo||''}</b></td><td>${typeof toTitleCaseTR==='function'? toTitleCaseTR(rec.tasIsmi||''): (rec.tasIsmi||'')}</td><td>${rec.kalinlik||''}</td>
              <td>${rec.en||''}</td><td>${rec.boy||''}</td><td>${rec.adet||''}</td><td>${rec.m2||''}</td><td>${rec.kirik||''}</td><td>${rec.kirikM2||''}</td>
              <td>${rec.epoxyKg||''}</td>
              <td><button class="btn ghost small btnEditFFS">Düzenle</button><button class="btn danger small btnDelFFS">Sil</button></td>`;
            tr.querySelector('.btnEditFFS').onclick = ()=>{
              const f = document.getElementById('frmFFS'); if(!f) return;
              ['tarih','blokNo','tasIsmi','kalinlik','en','boy','adet','m2','kirik','kirikM2','epoxyKg'].forEach(k=>{ setFormFieldValue(f, k, rec[k]||''); });
              f.idHidden.value = rec.id||'';
              document.querySelector('[data-sub="fayans_firin_seleksiyon"]').click();
            };
            tr.querySelector('.btnDelFFS').onclick = ()=>{
              if(confirm('Bu Fayans Fırın Seleksiyon kaydını silmek istiyor musunuz?')){
                const arr2 = getFFS(); const i = arr2.findIndex(x=> x.id===rec.id);
                if(i>=0){ arr2.splice(i,1); setFFS(arr2); renderFFSList(); }
              }
            };
            tbody.appendChild(tr);
          });
        }
    
        // blokNo auto-fill for FFS
        document.addEventListener('DOMContentLoaded', function(){
          const f = document.getElementById('frmFFS'); if(!f) return;
          const blokNoInput = f.querySelector('[name=blokNo]'); if(!blokNoInput) return;
          blokNoInput.addEventListener('change', async function(){
            const bloklar = await (typeof getBloklar === 'function' ? getBloklar() : []);
            let val = (blokNoInput.value||'').trim(); val = normalizeBlokNo(val);
            const secili = Array.isArray(bloklar) ? bloklar.find(b => (b.blokNo||'').trim().toLowerCase() === val.toLowerCase()) : null;
      if(secili){ f.tasIsmi.value = secili.blokAdi||''; f.en.value = sanitizeDimensionVal(secili.en||''); f.boy.value = sanitizeDimensionVal(secili.boy||''); }
            else { ['tasIsmi','en','boy'].forEach(k=> f[k].value=''); }
            // calc m2 if needed
            try{ const en = parseFloat((f.en.value||'').toString().replace(',', '.')) || 0; const boy = parseFloat((f.boy.value||'').toString().replace(',', '.')) || 0; if(en && boy && f.adet) f.m2.value = ((en*boy/10000) * (Number(f.adet.value||0))).toString(); }catch(_){ }
          });
        });
    
        // submit handler for FFS
        document.addEventListener('DOMContentLoaded', function(){
          const f = document.getElementById('frmFFS'); if(!f) return;
          f.addEventListener('submit', async function(e){
            e.preventDefault();
            const rec = readFFSForm(); if(!rec) return;
            const recBlok = normalizeBlokNo(rec.blokNo||''); if(!recBlok){ alert('Blok No zorunlu'); return; }
            rec.blokNo = recBlok;
            const bloklar = await (typeof getBloklar === 'function' ? getBloklar() : []);
            const secili = Array.isArray(bloklar) ? bloklar.find(b => (b.blokNo||'').trim().toLowerCase() === recBlok.trim().toLowerCase()) : null;
            if(!secili){ alert('Sadece Blok Listesi\'nde olan bir blok için seleksiyon kaydı yapılabilir!'); return; }
            let arr = getFFS(); const i = arr.findIndex(x=> x.id === rec.id);
            if(i>=0) arr[i] = rec; else arr.unshift(rec);
            setFFS(arr);
            try{ scheduleSync('v91_fayans_firin_seleksiyon_kayitlar', rec); }catch(_){ }
            renderFFSList();
            f.reset(); f.idHidden.value = '';
          });
        });
        // Live epoxy override per date (like PF)
        document.addEventListener('DOMContentLoaded', function(){
          const f=document.getElementById('frmFF'); if(!f) return;
          const epoxyInput = f.querySelector('[name=epoxyKg]');
          const tarihInput = f.querySelector('[name=tarih]');
          function applyOverride(){
            const d=(tarihInput?.value||'').trim(); if(!d) return;
            const val = epoxyInput?.value||'';
            const obj = getFfOverrides(); obj[d] = val; setFfOverrides(obj);
            renderFFList(); renderFFSummary();
          }
          if(epoxyInput){
            epoxyInput.addEventListener('input', applyOverride);
            epoxyInput.addEventListener('change', applyOverride);
          }
          if(tarihInput){
            tarihInput.addEventListener('change', ()=>{
              const obj = getFfOverrides(); const d=(tarihInput.value||'').trim();
              if(obj[d]!==undefined && f.epoxyKg) f.epoxyKg.value = obj[d];
              renderFFList(); renderFFSummary();
            });
          }
        });
        // Blok no seçilince otomatik doldurma
        document.addEventListener('DOMContentLoaded', function(){
          const f=document.getElementById('frmFF'); if(!f) return;
          const blokNoInput = f.querySelector('[name=blokNo]');
          if(!blokNoInput) return;
          blokNoInput.addEventListener('change', async function(){
            const bloklar = await (typeof getBloklar === 'function' ? getBloklar() : []);
            let val = (blokNoInput.value||'').trim(); val = normalizeBlokNo(val);
            const secili = Array.isArray(bloklar) ? bloklar.find(b => (b.blokNo||'').trim().toLowerCase() === val.toLowerCase()) : null;
            if(secili){
              f.tasIsmi.value = secili.blokAdi||'';
              f.en.value = sanitizeDimensionVal(secili.en||'');
              f.boy.value = sanitizeDimensionVal(secili.boy||'');
            } else { ['tasIsmi','en','boy'].forEach(k=> f[k].value=''); }
            calcFFm2();
          });
        });
        // Submit
        document.addEventListener('DOMContentLoaded', function(){
          const f=document.getElementById('frmFF'); if(!f) return;
          f.addEventListener('submit', async function(e){
            e.preventDefault();
      const rec=readFFForm();
      const recBlok = normalizeBlokNo(rec.blokNo||'');
      if(!recBlok){ alert("Blok No zorunlu"); return; }
      rec.blokNo = recBlok;
      const bloklar = await (typeof getBloklar === 'function' ? getBloklar() : []);
      const secili = Array.isArray(bloklar) ? bloklar.find(b => (b.blokNo||'').trim().toLowerCase() === recBlok.trim().toLowerCase()) : null;
      if(!secili){ alert("Sadece Blok Listesi\’nde olan bir blok için fayans fırın kaydı yapılabilir!"); return; }
            let arr=getFF(); const i=arr.findIndex(x=>x.id===rec.id);
            if(i>=0) arr[i]=rec; else arr.unshift(rec);
            setFF(arr);
            try{ scheduleSync(FF_KEY, rec); }catch(_){ }
            const o = getFfOverrides(); if(rec.tarih) { o[rec.tarih] = rec.epoxyKg||o[rec.tarih]; setFfOverrides(o); }
            renderFFList(); renderFFSummary();
            f.reset(); f.idHidden.value='';
          });
        });
    
    /* ==== BODY inline script #54 ==== */
    // Köprü Kesme: Ölçü ekle / kaydet + storage + fire hesaplama
    document.addEventListener('DOMContentLoaded', function(){
      const KOPRU_KEY = 'v91_kopru_kesme_kayitlar';
      function getKopru(){ try { return JSON.parse(localStorage.getItem(KOPRU_KEY)||'[]'); } catch(e){ return []; } }
      function setKopru(arr){ localStorage.setItem(KOPRU_KEY, JSON.stringify(arr)); }
    
      function renderKopruOut(){
        const tbody = document.getElementById('kopruOutBody'); if(!tbody) return;
        const arr = getKopru(); tbody.innerHTML='';
        arr.forEach(rec=>{
          (rec.out||[]).forEach(o=>{
            const tr = document.createElement('tr');
            // show per-out kayıt no (block-based if present) in the Kayıt No column
            tr.innerHTML = `<td>${o.no||rec.id||''}</td><td>${o.en||''}</td><td>${o.boy||''}</td><td>${o.sadet||''}</td><td>${o.sm2||''}</td><td>${o.kadet||''}</td><td>${o.km2||''}</td>`;
            tbody.appendChild(tr);
          });
        });
      }
      // Mevcut filtreler ve sahne seçimine göre blokları süzen yardımcı
      async function getFilteredBloklar(){
        let arr = await (typeof getBloklar==='function' ? getBloklar() : []);
        if(!Array.isArray(arr)) arr = [];
        const q = (document.getElementById('blokAraInput')?.value||'').trim().toLowerCase();
        const stageFilter = document.querySelector('.filterStage.active')?.getAttribute('data-stage') || 'all';
        const f_gelis_from = document.getElementById('f_gelis_from')?.value || '';
        const f_gelis_to = document.getElementById('f_gelis_to')?.value || '';
        const f_blokNo = (document.getElementById('f_blokNo')?.value||'').trim().toLowerCase();
        const f_fason = (document.getElementById('f_fason')?.value||'').trim().toLowerCase();
        const f_ocak = (document.getElementById('f_ocak')?.value||'').trim().toLowerCase();
        const f_blokAdi = (document.getElementById('f_blokAdi')?.value||'').trim().toLowerCase();
        const f_durum = document.getElementById('f_durum')?.value||'';
        const out = arr
          .filter(b=> !q || (String(b.blokNo||'').toLowerCase().includes(q)))
          .filter(b=> { const d=String(b.gelisTarihi||''); if(f_gelis_from && d < f_gelis_from) return false; if(f_gelis_to && d > f_gelis_to) return false; return true; })
          .filter(b=> !f_blokNo || (String(b.blokNo||'').toLowerCase().includes(f_blokNo)))
          .filter(b=> !f_fason || (String(b.fasoncuKodu||'').toLowerCase().includes(f_fason)))
          .filter(b=> !f_ocak || (String(b.ocakIsmi||'').toLowerCase().includes(f_ocak)))
          .filter(b=> !f_blokAdi || (String(b.blokAdi||'').toLowerCase().includes(f_blokAdi)))
          .filter(b=> !f_durum || (String(b.durum||'')===f_durum))
          .filter(b=> stageFilter==='all' ? true : (stageFilter==='Saglamlastirma' ? b.asama==='Sağlamlaştırma' : b.asama===stageFilter));
        return out;
      }
      // Global erişim için
      window.getFilteredBloklar = getFilteredBloklar;
    
      // Render Köprü Girişler list with per-record Çıkan total and Fire (m² / %)
      function renderKopruList(){
        const tbody = document.getElementById('kopruBody'); if(!tbody) return;
        const arr = getKopru(); tbody.innerHTML='';
        arr.forEach(rec=>{
          const g = num(rec.m2) || 0;
      const sm2Total = (rec.out||[]).reduce((s,o)=> s + (num(o.sm2)||0), 0);
      const km2Total = (rec.out||[]).reduce((s,o)=> s + (num(o.km2)||0), 0);
          const totalOut = sm2Total + km2Total;
          // fire should include kırık as fire => fire = giris - sağlam
          const fire = Math.max(0, g - sm2Total);
          const pct = g>0 ? (fire/g*100) : 0;
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${rec.girTarih||''}</td>
            <td><b>${rec.blokNo||''}</b></td>
            <td>${rec.tas||''}</td>
            <td>${rec.kalinlik||''}</td>
            <td>${rec.en||''}</td>
            <td>${rec.boy||''}</td>
            <td>${rec.adet||''}</td>
            <td>${rec.m2||''}</td>
            <td>${isNaN(sm2Total)?'':nf3.format(sm2Total)}</td>
            <td>${isNaN(km2Total)?'':nf3.format(km2Total)}</td>
      <td>${isNaN(fire)?'':nf3.format(fire)} / ${isNaN(pct)?'':nf3.format(pct)}</td>
      <td>${(rec.out||[]).map(o=>o.no||rec.id).join(', ')}</td>
      <td>${rec.id||''}</td>`;
          // actions cell
          const tdActions = document.createElement('td');
          const btnEdit = document.createElement('button'); btnEdit.className='btn ghost small'; btnEdit.textContent='Düzenle';
          btnEdit.addEventListener('click', ()=> loadKopruForm(rec));
          const btnDel = document.createElement('button'); btnDel.className='btn danger small'; btnDel.textContent='Sil';
          btnDel.addEventListener('click', ()=>{
            if(confirm('Bu kaydı silmek istiyor musunuz?')){
              const a = getKopru(); const i = a.findIndex(x=>x.id===rec.id);
              if(i>=0){ a.splice(i,1); setKopru(a); renderKopruOut(); renderKopruList(); computeAndShowSummary(); }
            }
          });
          tdActions.style.display='flex'; tdActions.style.gap='6px';
          tdActions.appendChild(btnEdit); tdActions.appendChild(btnDel);
          tr.appendChild(tdActions);
          tbody.appendChild(tr);
        });
      }
    
      // Load a saved record into the form for editing
      function loadKopruForm(rec){
        const f = document.getElementById('frmKopru'); if(!f) return;
        try{
          setFormFieldValue(f, 'girTarih', rec.girTarih||'');
          setFormFieldValue(f, 'blokNo', normalizeBlokNo(rec.blokNo||''));
          setFormFieldValue(f, 'tas', rec.tas||'');
          setFormFieldValue(f, 'kalinlik', rec.kalinlik||'');
          setFormFieldValue(f, 'en', rec.en||'');
          setFormFieldValue(f, 'boy', rec.boy||'');
          setFormFieldValue(f, 'adet', rec.adet||'');
          setFormFieldValue(f, 'm2', rec.m2||'');
        }catch(_){ /* ignore */ }
        const outBody = document.getElementById('kopruOlcuBody'); if(!outBody) return; outBody.innerHTML='';
        (rec.out||[]).forEach(o=>{
          addRow();
          const tr = document.querySelector('#kopruOlcuBody tr:last-child');
          if(tr){
            const eEl = tr.querySelector('.olc-en'); if(eEl) eEl.value = sanitizeDimensionVal(o.en||'');
            const bEl = tr.querySelector('.olc-boy'); if(bEl) bEl.value = sanitizeDimensionVal(o.boy||'');
            const sEl = tr.querySelector('.olc-sadet'); if(sEl) sEl.value = sanitizeDimensionVal(o.sadet||'');
            const sm2El = tr.querySelector('.olc-sm2'); if(sm2El) sm2El.value = sanitizeDimensionVal(o.sm2||'');
            const kEl = tr.querySelector('.olc-kadet'); if(kEl) kEl.value = sanitizeDimensionVal(o.kadet||'');
            const km2El = tr.querySelector('.olc-km2'); if(km2El) km2El.value = sanitizeDimensionVal(o.km2||'');
          }
          if(tr){ const hidden = tr.querySelector('.olc-no'); if(hidden) hidden.value = o.no||''; }
        });
        computeAndShowSummary(num(f.m2?.value||''), rec.out);
      }
    
      // Compute and display fire (m² and %) between Giriş and Çıkan.
      // girisM2: numeric Giriş m² (optional)
      // outs: optional array of output rows [{sm2, km2}, ...]. If not provided, uses current DOM rows if present, else falls back to latest saved record.
      function computeAndShowSummary(girisM2, outs){
        // ensure summary container exists (create if missing)
        let summ = document.getElementById('kopruSummary');
        if(!summ){
          const kopruCard = document.getElementById('kopru_kesme-content');
          if(kopruCard){
            summ = document.createElement('div');
            summ.id = 'kopruSummary';
            summ.style.display = 'flex';
            summ.style.gap = '12px';
            summ.style.marginTop = '8px';
            summ.style.marginBottom = '12px';
            // insert after the measurements box if possible, otherwise prepend to card
            const measurementsBox = kopruCard.querySelector('div[style*="border:1px dashed"]');
            if(measurementsBox && measurementsBox.parentNode) measurementsBox.parentNode.insertBefore(summ, measurementsBox.nextSibling);
            else kopruCard.insertBefore(summ, kopruCard.firstChild);
          }
        }
    
        // Determine Sağlam and Kırık totals separately (kırık counts as fire)
        let sm2Total = 0, km2Total = 0;
        if(Array.isArray(outs) && outs.length>0){
          sm2Total = outs.reduce((s,o)=> s + (num(o.sm2)||0), 0);
          km2Total = outs.reduce((s,o)=> s + (num(o.km2)||0), 0);
        } else {
          // try current DOM rows
          const outRows = Array.from(document.querySelectorAll('#kopruOlcuBody tr'));
          if(outRows.length>0){
      sm2Total = outRows.reduce((s,tr)=> s + (num(tr.querySelector('.olc-sm2')?.value)||0), 0);
      km2Total = outRows.reduce((s,tr)=> s + (num(tr.querySelector('.olc-km2')?.value)||0), 0);
          } else {
            // fallback to latest saved record
            const arr = getKopru();
            if(arr.length>0){
              const last = arr[0];
              sm2Total = (last.out||[]).reduce((s,o)=> s + (num(o.sm2)||0), 0);
              km2Total = (last.out||[]).reduce((s,o)=> s + (num(o.km2)||0), 0);
            }
          }
        }
    
        const g = (isNaN(num(girisM2)) ? 0 : num(girisM2)) || 0;
        // fire includes kırık -> fire = giris - sağlam
        const fire = Math.max(0, g - sm2Total);
        const pct = g>0 ? (fire/g*100) : 0;
        if(!summ) return; // nothing to render into
        const totalOut = sm2Total + km2Total;
        summ.innerHTML = `<div class="pill">Giriş m²: <b>${g? nf3.format(g): '0'}</b></div><div class="pill">Sağlam Toplam m²: <b>${nf3.format(sm2Total)}</b></div><div class="pill">Kırık Toplam m²: <b>${nf3.format(km2Total)}</b></div><div class="pill">Çıkan Toplam m²: <b>${nf3.format(totalOut)}</b></div><div class="pill">Fire m²: <b>${nf3.format(fire)}</b></div><div class="pill">Fire %: <b>${isNaN(pct)?'0':nf3.format(pct)}</b></div>`;
      }
    
      function saveKopruMeasurements(){
        const f = document.getElementById('frmKopru'); if(!f) return alert('Form bulunamadı');
        const gir = { id: Date.now().toString(36), girTarih: f.girTarih?.value||'', blokNo: f.blokNo?.value||'', tas: f.tas?.value||'', kalinlik: f.kalinlik?.value||'', en: f.en?.value||'', boy: f.boy?.value||'', adet: f.adet?.value||'', m2: f.m2?.value||'' };
        const outRows = Array.from(document.querySelectorAll('#kopruOlcuBody tr'));
      const outs = outRows.map(tr=>({ no: tr.querySelector('.olc-no')?.value||'', en: tr.querySelector('.olc-en')?.value||'', boy: tr.querySelector('.olc-boy')?.value||'', sadet: tr.querySelector('.olc-sadet')?.value||'', sm2: tr.querySelector('.olc-sm2')?.value||'', kadet: tr.querySelector('.olc-kadet')?.value||'', km2: tr.querySelector('.olc-km2')?.value||'' }));
        if(outs.length===0){ alert('Lütfen önce en/boy/sağlam/kırık satırları ekleyin.'); return; }
        // assign block-based kayıt nos for each out (e.g., 145kk1)
        const base = (gir.blokNo||'').trim();
        const existing = getKopru();
        // collect existing suffix numbers for this base
        let maxIdx = 0;
        try{
          existing.forEach(r=>{ (r.out||[]).forEach(o=>{ if(o && o.no && base){ const m = o.no.match(new RegExp('^'+base.replace(/[-.*+?^${}()|[\\]\\]/g,'\\$&')+'kk(\\d+)$')); if(m){ const n = parseInt(m[1],10); if(!isNaN(n) && n>maxIdx) maxIdx = n; } } }); });
        }catch(_){ }
        let nextIdx = maxIdx + 1;
        outs.forEach(o=>{
          if(!o.no){
            if(base){ o.no = base + 'kk' + (nextIdx++); }
            else { o.no = gir.id + 'k' + (nextIdx++); }
          }
        });
        gir.out = outs;
        let arr = getKopru(); arr.unshift(gir); setKopru(arr);
      renderKopruOut();
      try{ scheduleSync(KOPRU_KEY, gir); }catch(_){ }
      renderKopruList();
      computeAndShowSummary(num(gir.m2), outs);
        // clear inputs
        document.getElementById('kopruOlcuBody').innerHTML='';
        f.reset();
      }
    
      // attach to buttons inside kopru_kesme-content
      const kopruCard = document.getElementById('kopru_kesme-content');
      if(kopruCard){
        const btns = kopruCard.querySelectorAll('button');
        // heuristic: first small button is add, second primary small is save
        let addBtn = kopruCard.querySelector('#btnKopruAdd');
        let saveBtn = kopruCard.querySelector('#btnKopruSave');
        if(!addBtn || !saveBtn){
          // fallback: find by class/text
          addBtn = Array.from(kopruCard.querySelectorAll('button')).find(b=> (b.textContent||'').trim()==='Ölçü Ekle');
          saveBtn = Array.from(kopruCard.querySelectorAll('button')).find(b=> (b.textContent||'').trim()==='Kaydet');
        }
        if(addBtn){ addBtn.addEventListener('click', function(e){ e.preventDefault(); addRow(); }); }
        if(saveBtn){ saveBtn.addEventListener('click', function(e){ e.preventDefault(); saveKopruMeasurements(); }); }
        // render existing saved
        renderKopruOut();
        renderKopruList();
        // show summary for latest saved record (if any)
        computeAndShowSummary();
        // live preview: when any output inputs change, recompute summary using current form m2 and DOM outputs
        kopruCard.addEventListener('input', function(e){
          try{
            if(!e.target) return;
            if(e.target.closest && e.target.closest('#kopruOlcuBody')){
              const f = document.getElementById('frmKopru');
              const g = f ? num(f.m2?.value||'') : 0;
              computeAndShowSummary(g);
            }
          }catch(_){ }
        });
      // Attach autofill for Kopru Blok No: normalize value and populate dimensions from bloklar
        (function attachKopruBlokAutofill(){
          try{
            const kopruForm = document.getElementById('frmKopru'); if(!kopruForm) return;
            const blokInput = kopruForm.querySelector('[name="blokNo"]'); if(!blokInput) return;
            const onBlkChange = async function(e){
              try{
                const v = normalizeBlokNo(this.value||'');
                this.value = v;
                const bloks = await getBloklar();
                if(!Array.isArray(bloks)) return;
                const sec = bloks.find(b=> String(b.blokNo||'')===String(v));
                if(sec){
                  if(kopruForm.tas) kopruForm.tas.value = sec.blokAdi||kopruForm.tas.value||'';
                  setFormFieldValue(kopruForm,'kalinlik', sec.kalinlik||'');
                  setFormFieldValue(kopruForm,'en', sec.en||'');
                  setFormFieldValue(kopruForm,'boy', sec.boy||'');
                  setFormFieldValue(kopruForm,'adet', sec.adet||'');
                  const m = cm2_to_m2(sanitizeDimensionVal(sec.en||''), sanitizeDimensionVal(sec.boy||''), sec.adet||'');
                  if(kopruForm.m2) kopruForm.m2.value = m ? Number(m).toFixed(3) : kopruForm.m2.value||'';
                }
              }catch(_){ }
              try{ calcKopruM2(); }catch(_){ }
            };
            blokInput.addEventListener('change', onBlkChange);
          }catch(_){ }
        })();
    
      // Ensure the Girişler table has columns for Sağlam/Kırık totals, Fire and İşlem (insert headers if missing)
        (function ensureKopruHeaders(){
          try{
            const tbody = document.getElementById('kopruBody'); if(!tbody) return;
            const table = tbody.closest('table'); if(!table) return;
            const theadRow = table.querySelector('thead tr'); if(!theadRow) return;
            const existing = Array.from(theadRow.querySelectorAll('th')).map(th=> (th.textContent||'').trim());
            function insertBefore(refText, txt){ if(existing.includes(txt)) return; const ref = Array.from(theadRow.querySelectorAll('th')).find(th=> (th.textContent||'').trim()===refText); const th = document.createElement('th'); th.style.textAlign='left'; th.style.padding='6px 4px'; th.textContent = txt; if(ref) theadRow.insertBefore(th, ref); else theadRow.appendChild(th); }
      insertBefore('Kayıt No', 'Sağlam Toplam m²');
      insertBefore('Kayıt No', 'Kırık Toplam m²');
      insertBefore('Kayıt No', 'Fire (m² / %)');
      insertBefore('Kayıt No', 'İşlem');
          }catch(_){ }
        })();
      }
    });
    
    (function(){
      let seq = 1;
      function el(tag, attrs={}, children=[]){
        const e = document.createElement(tag);
        Object.entries(attrs).forEach(([k,v])=>{ if(v!=null) e.setAttribute(k,v); });
        (Array.isArray(children)?children:[children]).forEach(c=>{
          if(c==null) return;
          if(typeof c === 'string') e.appendChild(document.createTextNode(c));
          else e.appendChild(c);
        });
        return e;
      }
      // expose helper to global scope for legacy callers
      try{ window.el = el; }catch(_){ }
    
      // Ensure kopru Blok No uses the global datalist even if the input markup lacks list="blokList"
      try{
        document.addEventListener('DOMContentLoaded', function(){
          try{
            const kopruForm = document.getElementById('frmKopru');
            if(!kopruForm) return;
            const blk = kopruForm.querySelector('[name="blokNo"]');
            if(blk && !blk.hasAttribute('list')) blk.setAttribute('list','blokList');
          }catch(_){ }
        });
      }catch(_){ }
      function cm2_to_m2(en, boy, adet){
        // Robust: detect mm vs cm and compute m² with stricter heuristics.
        try{
          const parseDim = v => { if(v===undefined||v===null||v==='') return NaN; const s = String(v).trim(); const m = s.replace(/\s+/g,'').replace(',', '.').match(/([0-9]+(?:\.[0-9]+)?)/); if(!m) return NaN; const n = parseFloat(m[1]); return Number.isFinite(n) ? { n, s } : NaN; };
          const de = parseDim(en); const db = parseDim(boy); if(!de || !db || isNaN(de.n) || isNaN(db.n)) return NaN;
          const enVal = de.n; const boyVal = db.n;
          const enLooksMm = /mm\b/i.test(de.s) || (enVal >= 100 && enVal < 1000);
          const boyLooksMm = /mm\b/i.test(db.s) || (boyVal >= 100 && boyVal < 1000);
          if(enVal >= 1000 || boyVal >= 1000){ console.warn('Dimension value unusually large, please check units (expected cm or mm):', enVal, boyVal); return NaN; }
          const per = (enLooksMm || boyLooksMm) ? (enVal * boyVal) / 1000000 : (enVal * boyVal) / 10000;
          const a = parseFloat(adet||'0') || 0;
          return per * a;
        }catch(e){ return NaN; }
      }
      try{ window.cm2_to_m2 = cm2_to_m2; }catch(_){ }
      // Giriş m² otomatik hesaplama
      function calcKopruM2(){
        const f = document.getElementById('frmKopru');
        if(!f) return;
        const en = f.en?.value;
        const boy = f.boy?.value;
        const adet = f.adet?.value;
        const m2 = cm2_to_m2(en, boy, adet);
        if(f.m2) f.m2.value = (en && boy && adet && !isNaN(m2)) ? m2.toFixed(3) : '';
      }
      document.addEventListener('input', function(e){
        if(e.target && ['en','boy','adet'].includes(e.target.name) && e.target.closest('#frmKopru')){
          calcKopruM2();
        }
      });
      // ...existing code...
      window.addRow = function(){
        try{
          const tbody = document.getElementById('kopruOlcuBody'); if(!tbody) return;
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><input class="olc-en" type="number" step="0.01" placeholder="En (cm)"/></td>
            <td><input class="olc-boy" type="number" step="0.01" placeholder="Boy (cm)"/></td>
            <td><input class="olc-sadet" type="number" step="1" placeholder="Adet"/></td>
            <td><input class="olc-sm2" type="number" step="0.001" placeholder="Sağlam m²" readonly/></td>
            <td><input class="olc-kadet" type="number" step="1" placeholder="Kırık Adet"/></td>
            <td><input class="olc-km2" type="number" step="0.001" placeholder="Kırık m²" readonly/></td>
            <td style="display:none"><input class="olc-no" type="hidden"/></td>
            <td><button class="btn danger small" type="button">Sil</button></td>
          `;
          tbody.appendChild(tr);
    
          const recomputeRow = function(){
            try{
              const en = sanitizeDimensionVal(tr.querySelector('.olc-en')?.value||'');
              const boy = sanitizeDimensionVal(tr.querySelector('.olc-boy')?.value||'');
              const sadet = sanitizeDimensionVal(tr.querySelector('.olc-sadet')?.value||'');
              const kadet = sanitizeDimensionVal(tr.querySelector('.olc-kadet')?.value||'');
              const sm2 = cm2_to_m2(en, boy, sadet);
              const km2 = cm2_to_m2(en, boy, kadet);
              const sm2El = tr.querySelector('.olc-sm2'); if(sm2El) sm2El.value = (!isNaN(sm2) && sm2!==0) ? Number(sm2).toFixed(3) : '';
              const km2El = tr.querySelector('.olc-km2'); if(km2El) km2El.value = (!isNaN(km2) && km2!==0) ? Number(km2).toFixed(3) : '';
            }catch(_){ }
          };
    
          // attach input listeners for live per-row recompute and summary update
          tr.querySelectorAll('input').forEach(inp=>{
            inp.addEventListener('input', function(){
              try{ recomputeRow(); }catch(_){ }
              try{ const f = document.getElementById('frmKopru'); const g = f ? num(f.m2?.value||'') : 0; computeAndShowSummary(g); }catch(_){ }
            });
          });
    
          // delete row button
          const del = tr.querySelector('button'); if(del){ del.addEventListener('click', function(){ try{ tr.remove(); computeAndShowSummary( num(document.getElementById('frmKopru')?.m2?.value||0) ); }catch(_){ } }); }
          return tr;
        }catch(_){ return null; }
      }
      function saveRecord(){
        // ...existing code...
      }
      // ...existing code...
    })();
    
    /* ==== BODY inline script #55 ==== */
    (function(){
      try{
        const run = () => { if(typeof ensureToolbars==='function') ensureToolbars(); };
        if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', run); } else { run(); }
      }catch(e){}
    })();
    
    /* ==== BODY inline script #56 ==== */
    (function(){
      function normalizeAsamalar(){
        document.querySelectorAll('table[data-record-list="1"] tbody tr').forEach(tr=>{
          // heuristics: find a cell that contains buttons labelled "Geri" or "İleri" or a select with stage options
          const cells = Array.from(tr.cells);
          cells.forEach(td=>{
            const text = td.textContent || '';
            if(/Geri|İleri|Aşamalar|Ham|Sayalama|Sağlamlaştırma|Katrak|Plaka Fırın/i.test(text)){
              // Add class and wrap children into inline flex if not already
              td.classList.add('asamalar');
              if(!td.classList.contains('asama-inline')){
                const wrapper = document.createElement('div');
                wrapper.className = 'asama-inline';
                while(td.firstChild){ wrapper.appendChild(td.firstChild); }
                td.appendChild(wrapper);
              }
            }
          });
        });
      }
      const run = ()=> normalizeAsamalar();
      if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', run); } else { run(); }
      new MutationObserver(run).observe(document.documentElement, {subtree:true, childList:true});
    })();
    
    /* ==== BODY inline script #57 ==== */
    (function(){
              const bar = document.getElementById('ara-subtabs');
              if(!bar) return;
    
              // Güvenli yerleşim: v2 kartlarını wrapper içine taşı (DOM sırası uygunsa dokunmaz)
              try{
                const wrapper = document.getElementById('ara_makinalar-content');
                if(wrapper){
                  ['ara_coklu_ebat_v2-content','ara_plaka_ebat_v2-content','ara_pah_makinesi_v2-content'].forEach(id=>{
                    const el = document.getElementById(id);
                    if(el && el.parentElement !== wrapper){
                      wrapper.appendChild(el); // altına taşı
                    }
                  });
                }
              }catch(_){ }
    
              function showSub(sub){
                const ids = ['ara_yarma','ara_coklu_ebat','ara_plaka_ebat','ara_pah_makinesi'];
                // Önce tüm wrapper altı kartları gizle
                try{
                  const wrapper = document.getElementById('ara_makinalar-content');
                  if(wrapper){ Array.from(wrapper.querySelectorAll(':scope > .card')).forEach(c=> c.style.display='none'); }
                }catch(_){ }
                // Eski -content kartlardan seçilen varsa göster
                ids.forEach(id=>{ const el = document.getElementById(id+'-content'); if(el && id===sub) el.style.display = ''; });
                // V2 kartları eşle ve seçilen varsa göster
                const mapV2 = {
                  ara_coklu_ebat: 'ara_coklu_ebat_v2-content',
                  ara_plaka_ebat: 'ara_plaka_ebat_v2-content',
                  ara_pah_makinesi: 'ara_pah_makinesi_v2-content'
                };
                const v2Id = mapV2[sub];
                if(v2Id){ const v2=document.getElementById(v2Id); if(v2){ v2.style.display=''; } }
              }
    
              bar.addEventListener('click', function(e){
                const btn = e.target.closest('.subtab'); if(!btn) return;
                const sub = btn.getAttribute('data-sub');
                bar.querySelectorAll('.subtab').forEach(b=> b.classList.remove('active'));
                btn.classList.add('active');
                showSub(sub);
              });
    
              // İlk yüklemede aktif tuşa göre göster
              try{
                const active = bar.querySelector('.subtab.active');
                const sub = active ? active.getAttribute('data-sub') : 'ara_yarma';
                showSub(sub);
              }catch(_){ }
            })();
    
    /* ==== BODY inline script #58 ==== */
    // Cleanup: remove empty inline style attributes that trip linters (non-destructive)
              // and remove static 'Adet' headers from Köprü Kesme Çıkan Ölçüler tables.
              document.addEventListener('DOMContentLoaded', function(){
                try{
                  var el = document.getElementById("ara_yarma-content");
                  if(el && el.getAttribute("style") === "") el.removeAttribute("style");
    
                  function removeAdetFromTable(tbodyId){
                    try{
                      var tb = document.getElementById(tbodyId);
                      if(!tb) return;
                      var table = tb.closest('table');
                      if(!table) return;
                      var ths = table.querySelectorAll('thead th');
                      ths.forEach(function(th){ if((th.textContent||'').trim() === 'Adet') th.remove(); });
                    }catch(_){ }
                  }
                  removeAdetFromTable('kopruOlcuBody');
                  removeAdetFromTable('kopruOutBody');
                }catch(_){/* ignore */}
              });
    
    /* ==== BODY inline script #59 ==== */
    (function(){
      // Makina bazlı rapor & grafik: günlük/haftalık/aylık/yıllık
    function loadChartJs(cb){ if(window.Chart) return cb(); const s=document.createElement('script'); s.src='vendor/chartjs/chart.umd.min.js'; s.onload=cb; s.onerror=cb; document.head.appendChild(s); }
    
      const KEY_MAP = { SY: SY_KEY, BOH: BOH_KEY, VAK: VAK_KEY, KATRK: KATRK_KEY, PF: PF_KEY, FF: FF_KEY };
      const LABEL_MAP = { SY: 'Sayalama (SY)', BOH: 'Bohça (BOH)', VAK: 'Vakum (VAK)', KATRK: 'Katrak (KATRK)', PF: 'Plaka Fırın (PF)', FF: 'Fayans Fırın (FF)' };
    
      function parseRecDate(rec){
        const cand = rec.tarih || rec.girTarih || rec.girTarih || rec.girTarih2 || rec.gir_tarih || null;
        if(!cand) return null; const d = new Date(cand); if(!isNaN(d)) return d; const p = Date.parse(cand); if(!isNaN(p)) return new Date(p); return null;
      }
    
      function getAllRecords(){
        const keys = [SY_KEY, BOH_KEY, VAK_KEY, KATRK_KEY, PF_KEY, FF_KEY];
        const all = [];
        keys.forEach(k=>{
          try{ const arr = JSON.parse(localStorage.getItem(k)||'[]'); (arr||[]).forEach(r=>{ r._source = k; all.push(r); }); }catch(e){}
        });
        return all;
      }
    
      function getMetricFromRec(rec){
        const cand = [rec.m2, rec.girisM2, rec.giris_m2, rec.giris || rec.m2];
        for(const c of cand){ if(c!==undefined && c!==null && c!==''){ const n = num(c); if(!isNaN(n)) return n; } }
        if(Array.isArray(rec.out) && rec.out.length){ return rec.out.reduce((s,o)=> s + (num(o.sm2)||num(o.sagM2)||num(o.sag_m2)||0), 0); }
        return 0;
      }
    
      function getRecStage(rec){
        if(!rec) return '';
        // common direct fields
        const fields = ['asama','aşama','stage','stageName','asamaCurrent','asamaAdi','asama_ad','stage_name','phase','phasename'];
        for(const f of fields){ if(rec[f]) return String(rec[f]); }
        // try nested metadata
        if(rec.meta && (rec.meta.asama || rec.meta.stage)) return String(rec.meta.asama || rec.meta.stage);
        // try first out entry for stage info
        if(Array.isArray(rec.out) && rec.out.length){ const o = rec.out[0]; for(const f of fields){ if(o && o[f]) return String(o[f]); } }
        // fallback to any key that contains 'asama' or 'stage'
        for(const k of Object.keys(rec||{})){ if(/asama|aşam|stage/i.test(k) && rec[k]) return String(rec[k]); }
        return '';
      }
    
      function bucketKey(date, period){
        const y = date.getFullYear(); const m = pad2(date.getMonth()+1); const d = pad2(date.getDate());
        if(period==='daily') return `${y}-${m}-${d}`;
        if(period==='monthly') return `${y}-${m}`;
        if(period==='yearly') return `${y}`;
        if(period==='weekly'){ const day = (date.getDay()+6)%7; const monday = new Date(date); monday.setDate(date.getDate()-day); return `${monday.getFullYear()}-W${pad2(monday.getMonth()+1)}-${pad2(monday.getDate())}`; }
        return `${y}-${m}-${d}`;
      }
    
      let raporChartInstance = null;
    
      function generateReport(){
        const machine = document.getElementById('raporMachine')?.value || 'all';
        const asamaFilter = document.getElementById('raporAsama')?.value || 'all';
        const blokFilter = (document.getElementById('raporBlok')?.value || '').trim().toLowerCase();
        const selectedMachines = (machine==='all') ? ['SY','BOH','VAK','KATRK','PF','FF'] : [machine];
      // Use optional chaining with safe defaults to avoid runtime errors if elements are missing
      const period = document.getElementById('raporPeriod')?.value || 'monthly';
      const start = document.getElementById('raporStart')?.value || '';
      const end = document.getElementById('raporEnd')?.value || '';
      const metric = document.getElementById('raporMetric')?.value || 'count';
        const all = getAllRecords();
    
        // prepare per-machine aggregations: { machine: { bucketKey: {count,m2} } }
        const per = {};
        selectedMachines.forEach(m=> per[m] = {});
    
        all.forEach(rec=>{
          const dt = parseRecDate(rec); if(!dt) return;
          if(start && new Date(start) > dt) return; if(end && new Date(end) < dt) return;
          // filter by aşama if requested
          if(asamaFilter && asamaFilter!=='all'){
            const recStage = (getRecStage(rec)||'').toString().toLowerCase(); if(recStage.indexOf((asamaFilter||'').toLowerCase())===-1) return;
          }
          // filter by blok if requested
          if(blokFilter){ const recBl = (rec.blokNo || rec.blok_no || rec.blok || '').toString().toLowerCase(); if(!recBl || recBl.indexOf(blokFilter)===-1) return; }
          const src = rec._source;
          const machine = Object.keys(KEY_MAP).find(k=> KEY_MAP[k]===src);
          if(!machine) return;
          if(selectedMachines.indexOf(machine) === -1) return;
          const key = bucketKey(dt, period);
          const val = (metric==='m2') ? getMetricFromRec(rec) : 1;
          if(!per[machine][key]) per[machine][key] = {count:0, m2:0};
          per[machine][key].count += 1;
          per[machine][key].m2 += (isNaN(val)?0:val);
        });
    
        // union labels
        const labelsSet = new Set(); Object.values(per).forEach(obj=> Object.keys(obj).forEach(k=> labelsSet.add(k)) );
        const labels = Array.from(labelsSet).sort();
    
        // prepare datasets (improved palette + border for clarity)
        const palette = [
          {bg:'rgba(59,130,246,0.85)', bd:'rgba(30,64,175,0.9)'},
          {bg:'rgba(16,185,129,0.85)', bd:'rgba(4,120,87,0.9)'},
          {bg:'rgba(234,88,12,0.85)', bd:'rgba(153,27,27,0.9)'},
          {bg:'rgba(236,72,153,0.85)', bd:'rgba(136,19,55,0.9)'},
          {bg:'rgba(249,115,22,0.85)', bd:'rgba(154,52,18,0.9)'},
          {bg:'rgba(99,102,241,0.85)', bd:'rgba(67,56,202,0.9)'}
        ];
        const datasets = selectedMachines.map((m,i)=>{
          const data = labels.map(function(lbl){ const obj = per[m][lbl]; if(!obj) return 0; return metric==='m2' ? obj.m2 : obj.count; });
          const pal = palette[i % palette.length];
          return {
            label: (LABEL_MAP[m]||m) + (metric==='m2' ? ' (m²)' : ' (kayıt)'),
            key: m,
            data: data,
            backgroundColor: pal.bg,
            borderColor: pal.bd,
            borderWidth: 1
          };
        });
    
        // render table with dynamic header
        var tableEl = document.getElementById('raporAggBody');
        if(tableEl){
          const table = tableEl.closest('table');
          if(table){
            const thead = table.querySelector('thead');
            thead.innerHTML = '';
            const trh = document.createElement('tr');
            trh.style.color='#64748b'; trh.style.borderBottom='1px solid #e5e7eb';
            const thTime = document.createElement('th'); thTime.style.textAlign='left'; thTime.style.padding='6px 4px'; thTime.textContent='Zaman'; trh.appendChild(thTime);
            selectedMachines.forEach(function(m){ const th = document.createElement('th'); th.style.textAlign='left'; th.style.padding='6px 4px'; th.textContent = LABEL_MAP[m] || m; trh.appendChild(th); });
            thead.appendChild(trh);
          }
        }
    
        const tbody = document.getElementById('raporAggBody');
        if(tbody){
          tbody.innerHTML='';
          labels.forEach(function(lbl,i){
            const tr=document.createElement('tr');
            let inner = '<td style="padding:6px 4px">' + lbl + '</td>';
      selectedMachines.forEach(function(m){ const ds = datasets.find(function(dd){ return dd.key===m; }); const v = ds ? (ds.data[i] || 0) : 0; inner += '<td style="padding:6px 4px">' + (metric==='m2' ? nf3.format(v) : v) + '</td>'; });
            tr.innerHTML = inner; tbody.appendChild(tr);
          });
        }
    
        // chart: multiple datasets
        loadChartJs(function(){
          try{
            const canvas = document.getElementById('raporChart');
            if(!canvas) return;
            if(raporChartInstance) raporChartInstance.destroy();
            const ctx = canvas.getContext('2d');
            raporChartInstance = new Chart(ctx, {
              type: 'bar',
              data: { labels: labels, datasets: datasets },
              options: {
                responsive: true,
                plugins: {
                  tooltip: {
                    callbacks: {
                      label: function(ctx){
                        const parsed = ctx.parsed && typeof ctx.parsed === 'object' ? ctx.parsed.y : ctx.parsed;
                        const val = (parsed === undefined) ? 0 : parsed;
                        return ctx.dataset.label + ': ' + (metric==='m2' ? nf3.format(val) + ' m²' : val + ' kayıt');
                      }
                    }
                  },
                  legend: { position: 'top' }
                },
                scales: { y: { beginAtZero: true } }
              }
            });
          }catch(e){ console.warn(e); }
        });
      }
    
        function exportCSV(){
          // Build CSV from current table header + rows so multi-machine columns are supported
          const table = document.getElementById('raporAggBody')?.closest('table'); if(!table) return;
          const thead = table.querySelector('thead'); const headerCells = thead ? Array.from(thead.querySelectorAll('th')) : [];
          const headers = headerCells.map(h=> (h.textContent||'').trim());
          const rows = [headers];
          const tbody = table.querySelector('tbody'); if(!tbody) return;
          Array.from(tbody.querySelectorAll('tr')).forEach(tr=>{
            const cols = Array.from(tr.querySelectorAll('td')).map(td=> (td.textContent||'').trim());
            rows.push(cols);
          });
          const csv = rows.map(r=> r.map(c=> '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
          const start = document.getElementById('raporStart')?.value || '';
          const end = document.getElementById('raporEnd')?.value || '';
          const metric = document.getElementById('raporMetric')?.value || 'rapor';
          const fname = `rapor_${metric}_${start || 'all'}_${end || 'all'}.csv`.replace(/[:\\/\s]+/g,'_');
          const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
          const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=fname; a.click(); URL.revokeObjectURL(url);
        }
    
      document.addEventListener('DOMContentLoaded', function(){
        // buttons
        document.getElementById('raporGenerateBtn')?.addEventListener('click', function(e){ e.preventDefault(); generateReport(); });
        document.getElementById('raporExportBtn')?.addEventListener('click', function(e){ e.preventDefault(); exportCSV(); });
    
        // populate aşama select from ASAMALAR
        try{
          const asamaSel = document.getElementById('raporAsama');
          if(asamaSel && Array.isArray(window.ASAMALAR)){
            window.ASAMALAR.forEach(function(a){ const opt=document.createElement('option'); opt.value=a; opt.textContent=a; asamaSel.appendChild(opt); });
          }
        }catch(_){ }
    
        // ensure blok datalist is updated
        try{ if(typeof updateBlokListDatalist === 'function') updateBlokListDatalist(); }catch(_){ }
    
        // default date range: last 30 days
        const s = document.getElementById('raporStart'); const en = document.getElementById('raporEnd');
        if(s && en && !s.value && !en.value){ const today=new Date(); const ago=new Date(); ago.setDate(today.getDate()-30); s.value=ago.toISOString().slice(0,10); en.value=today.toISOString().slice(0,10); }
    
        // generate initial report
        generateReport();
      });
    
    })();
    
    /* ==== BODY inline script #60 ==== */
    // Üretim Kayıt alt sekmeleri: tıklama ile içerik göster/gizle ve Blok Listesi seçilince yeniden çiz
    document.addEventListener('DOMContentLoaded', function(){
      try{
        const kayit = document.getElementById('kayit'); if(!kayit) return;
        const tabs = Array.from(kayit.querySelectorAll('#kayit-subtabs .subtab'));
        // Tüm alt sekme butonlarından dinamik olarak içerik kartlarını çıkar
        const cards = tabs
          .map(btn => kayit.querySelector(`#${btn.dataset.sub}-content`))
          .filter(Boolean);
        function activate(sub){
          tabs.forEach(b=> b.classList.toggle('active', (b.dataset.sub===sub)));
          cards.forEach(c=>{ c.style.display = (c.id === `${sub}-content`) ? '' : 'none'; });
          if(sub==='blok_listesi' && typeof window.renderBloklar==='function') window.renderBloklar();
        }
        tabs.forEach(btn=> btn.addEventListener('click', ()=> activate(btn.dataset.sub)));
        const active = tabs.find(b=> b.classList.contains('active')) || tabs[0];
        if(active) activate(active.dataset.sub);
      }catch(_){ }
    });
    
    /* ==== BODY inline script #61 ==== */
    // Özete ilişkin hesaplama ve modal kontrolü
    document.addEventListener('DOMContentLoaded', function(){
      try{
        const modal = document.getElementById('ozetModal');
        const body = document.getElementById('ozetBody');
        const sections = document.getElementById('ozetSections');
        const badges = document.getElementById('ozetFilterBadges');
        const btnOpen = document.getElementById('btnBlokOzet');
        const btnClose = document.getElementById('ozetClose');
        const btnCSV = document.getElementById('ozetDownloadCSV');
        const btnJSON = document.getElementById('ozetDownloadJSON');
        const selSort = document.getElementById('ozetSortBy');
        const tabBtns = Array.from(body.querySelectorAll('[data-tab]'));
        if(!modal || !body || !btnOpen) return;
    
        function show(){ modal.style.display='flex'; }
        function hide(){ modal.style.display='none'; }
        async function renderSummary(activeTab){
          const list = await getFilteredBloklar();
          const nf = new Intl.NumberFormat('tr-TR');
          const sumM3 = list.reduce((acc,b)=>{ const m=num(b.m3); return acc + (isNaN(m)?0:m); }, 0);
          const sumTon = sumM3 * 2.7;
          const toplam = { adet: list.length, m3: sumM3, ton: sumTon };
    
          // Yetki kontrolü: Ensar Fiyat/Stock sekmesi
          try{
            const uid = (typeof getActiveUserId==='function') ? getActiveUserId() : '';
            const allowEnsarFiyat = (typeof isAllowed==='function') ? isAllowed(uid, 'summary_ensar_fiyat') : true;
            if(activeTab==='ensar-fiyat' && !allowEnsarFiyat){
              sections.innerHTML = `
                <div class="card" style="margin-top:8px;">
                  <div style="display:flex;align-items:center;gap:10px;color:#334155;">
                    <span style="font-size:18px;">🔒</span>
                    <div>
                      <div style="font-weight:700;margin-bottom:4px;">Yetki gerekli</div>
                      <div style="font-size:13px;opacity:0.8;">Ensar Fiyat/Stock sekmesini görüntüleme yetkiniz yok. Bu görünürlüğü Ayarlar → Roller & Güvenlik bölümünden açabilirsiniz.</div>
                    </div>
                  </div>
                </div>`;
              return;
            }
          }catch(_){ /* ignore */ }
    
          // Özel sekme: Ensar Fiyat/Stock — taş bazlı USD/ton fiyat + özet
          if(activeTab==='ensar-fiyat'){
            const ensars = list.filter(b=> String(b.durum||'')==='Ensar');
            const stones = Array.from(new Set(ensars.map(b=> String(b.blokAdi||b.tasIsmi||'').trim()).filter(Boolean)))
              .map(n=> toTitleCaseTR ? toTitleCaseTR(n) : n)
              .sort((a,b)=> a.localeCompare(b,'tr'));
            const KEY = 'ensar_ton_pricing_v2';
            function getPricing(){ try{ const raw = localStorage.getItem(KEY); const obj = raw? JSON.parse(raw): {}; return (obj && typeof obj==='object')? obj : {}; }catch(_){ return {}; } }
            function setPricing(map){ try{ localStorage.setItem(KEY, JSON.stringify(map||{})); }catch(_){ } }
            function nfUSD(val){ try{ const n = Number(val)||0; return n.toLocaleString('tr-TR', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' $'; }catch(_){ return String(val)+' $'; } }
            function compute(){
              const priceMap = getPricing();
              let totalM3=0, totalTon=0, totalValue=0;
              const perStone={};
              ensars.forEach(b=>{
                let m3 = 0; const m3v = Number(b.m3); if(!isNaN(m3v) && m3v>0){ m3=m3v; } else { const en=num(b.en), boy=num(b.boy), yuk=num(b.yukseklik); if(!isNaN(en)&&!isNaN(boy)&&!isNaN(yuk)&&en>0&&boy>0&&yuk>0) m3=(en*boy*yuk)/1_000_000; }
                totalM3 += m3; const ton = m3*2.7; totalTon += ton;
                const stone = toTitleCaseTR ? toTitleCaseTR(String(b.blokAdi||b.tasIsmi||'').trim()) : String(b.blokAdi||b.tasIsmi||'').trim();
                const unit = stone && priceMap[stone] ? (Number(priceMap[stone].price||0) + Number(priceMap[stone].transport||0)) : 0;
                const val = ton * unit; totalValue += val;
                if(stone){ if(!perStone[stone]) perStone[stone] = { count:0, m3:0, ton:0, unit, value:0 }; perStone[stone].count+=1; perStone[stone].m3+=m3; perStone[stone].ton+=ton; perStone[stone].value+=val; }
              });
              return { totalM3, totalTon, totalValue, count: ensars.length, perStone };
            }
    
            const pricingRows = (function(){ const map=getPricing(); return (stones||[]).map(n=>{ const item = map[n] || { price:0, transport:0 }; return `<tr data-stone="${n}"><td style="text-align:left;">${n}</td><td class="right"><input class="field small" type="number" step="0.01" min="0" value="${item.price||0}" /></td><td class="right"><input class="field small" type="number" step="0.01" min="0" value="${item.transport||0}" /></td></tr>`; }).join(''); })();
            const s = compute();
            const content = `
              <div class="card" style="margin-top:8px;">
                <div class="chart-header" style="margin-bottom:8px;">
                  <div class="chart-title">Grafikler (sadece fiyat girilen taşlar)</div>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div class="segmented" id="ensarChartToggle" aria-label="Grafik türü seçimi">
                      <button class="seg-btn" data-chart="ton" type="button">Ton</button>
                      <button class="seg-btn active" data-chart="usd" type="button">USD</button>
                      <button class="seg-btn" data-chart="pie" type="button">USD %</button>
                    </div>
                    <button class="btn ghost small" id="ensarChartDownloadBtn" type="button">PNG indir</button>
                  </div>
                </div>
                <div id="ensarChartsWrap" style="display:grid;grid-template-columns:1fr;gap:12px; position:relative;">
                  <canvas id="ensarChartTon" height="260" style="width:100%;display:none;"></canvas>
                  <canvas id="ensarChartUsd" height="260" style="width:100%;"></canvas>
                  <canvas id="ensarChartPie" height="300" style="width:100%;display:none;"></canvas>
                  <div id="ensarChartLegend" class="chart-legend" style="display:none;"></div>
                  <div id="ensarChartTooltip" class="chart-tooltip" style="display:none;"></div>
                </div>
              </div>
              <div class="card" style="margin-top:10px;">
                <div class="stat-cards">
                  <div class="stat-card blue"><div class="stat-label">${makeIcon('stat-blocks')}Ensar Blok Sayısı</div><div class="stat-value">${s.count}</div></div>
                  <div class="stat-card green"><div class="stat-label">${makeIcon('stat-m3')}Toplam m³</div><div class="stat-value">${s.totalM3.toFixed(3)}</div></div>
                  <div class="stat-card orange"><div class="stat-label">${makeIcon('stat-ton')}Toplam Ton</div><div class="stat-value">${s.totalTon.toFixed(3)}</div></div>
                  <div class="stat-card red"><div class="stat-label">${makeIcon('stat-usd')}Toplam Stok Tutarı</div><div class="stat-value">${nfUSD(s.totalValue)}</div><div class="stat-change">Birim: USD/ton — eksik fiyatlar 0 kabul edilir</div></div>
                </div>
              </div>
              <div class="card" style="margin-top:10px;">
                <div style="font-weight:700;margin-bottom:6px;">Taş Bazlı Fiyatlar (USD / ton)</div>
                <div class="table-wrap"><table style="min-width:600px;"><thead><tr><th style="text-align:left;">Taş</th><th style="text-align:right;">Alış ($/ton)</th><th style="text-align:right;">Nakliye ($/ton)</th></tr></thead><tbody id="ensarPricingBodyInline">${pricingRows}</tbody></table></div>
                <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;"><button class="btn primary small" id="ensarPricingSaveInline">Kaydet ve Özeti Güncelle</button></div>
              </div>
              <div class="card" style="margin-top:10px;">
                <div style="font-weight:700;margin-bottom:6px;">Taş Bazlı Dağılım</div>
                <div class="table-wrap"><table style="min-width:560px;"><thead><tr><th>Taş</th><th class="right">Ton</th><th class="right">Birim (USD/ton)</th><th class="right">Tutar</th></tr></thead><tbody id="ensarDetailBodyInline">${Object.keys(s.perStone).sort().map(st=>{ const ps=s.perStone[st]; return `<tr><td>${st}</td><td class="right">${ps.ton.toFixed(3)}</td><td class="right">${nfUSD(ps.unit)}</td><td class="right">${nfUSD(ps.value)}</td></tr>`; }).join('')}</tbody></table></div>
              </div>`;
            sections.innerHTML = content;
            // Basit bar grafik çizici (Canvas 2D)
            (function(){
              function drawBarChart(canvasId, items, opts){
                try{
                  const canvas = document.getElementById(canvasId); if(!canvas) return;
                  const ctx = canvas.getContext('2d'); if(!ctx) return;
                  const logicalH = canvas.getAttribute('height')? Number(canvas.getAttribute('height')): 260;
                  const WCSS = canvas.clientWidth || (canvas.parentElement?.clientWidth||820);
                  const dpr = Math.max(1, (window.devicePixelRatio||1));
                  canvas.width = Math.round(WCSS * dpr);
                  canvas.height = Math.round(logicalH * dpr);
                  ctx.setTransform(dpr,0,0,dpr,0,0);
                  const W = WCSS; const H = logicalH;
                  // Temizle
                  ctx.clearRect(0,0,W,H);
                  // Kenar boşlukları ve tipografik ayarlar
                  const padL = 120, padR = 24, padT = 22, padB = 28;
                  const labels = items.map(x=> x.label);
                  const values = items.map(x=> x.value);
                  const max = Math.max(0, ...values);
                  const count = items.length;
                  if(!count){
                    ctx.fillStyle = '#64748b'; ctx.font = '12px -apple-system,Segoe UI,Roboto,Arial'; ctx.fillText('Veri yok (fiyat girilen taş bulunamadı).', 12, 24);
                    canvas._barsMeta = [];
                    return;
                  }
                  const barH = Math.max(18, Math.floor((H - padT - padB) / count) - 6);
                  // Arka plan grid ve eksen etiketleri
                  const tickCount = 4; ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1;
                  for(let i=0;i<=tickCount;i++){
                    const x = padL + (i/tickCount)*(W - padL - padR);
                    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
                    const v = max * (i/tickCount);
                    const lbl = (opts && opts.tickFormat) ? opts.tickFormat(v) : String(v.toFixed(0));
                    ctx.fillStyle = '#9aa1a9'; ctx.font = '11px -apple-system,Segoe UI,Roboto,Arial'; ctx.textAlign = 'center'; ctx.fillText(lbl, x, H - padB + 16);
                  }
                  // Yardımcı: rounded rect
                  function roundRect(x,y,w,h,r){ const rr = Math.min(r, Math.min(w,h)/2); ctx.beginPath(); ctx.moveTo(x+rr,y); ctx.arcTo(x+w,y,x+w,y+h,rr); ctx.arcTo(x+w,y+h,x,y+h,rr); ctx.arcTo(x,y+h,x,y,rr); ctx.arcTo(x,y,x+w,y,rr); ctx.closePath(); }
                  // Çubuklar
                  const meta = [];
                  items.forEach((it, idx)=>{
                    const y = padT + idx*(barH+6);
                    const ratio = max>0 ? (it.value/max) : 0;
                    const bw = Math.max(0, Math.round(ratio*(W - padL - padR)));
                    // Label
                    ctx.fillStyle = '#111827'; ctx.font = '12px -apple-system,Segoe UI,Roboto,Arial'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
                    ctx.fillText(String(it.label).slice(0,32), 12, y + barH/2);
                    // Bar bg
                    ctx.fillStyle = '#f1f5f9'; roundRect(padL, y, W - padL - padR, barH, 6); ctx.fill();
                    // Bar fg (gradient)
                    const color = (opts && opts.color) ? opts.color : '#60a5fa';
                    const grad = ctx.createLinearGradient(padL, y, padL + bw, y);
                    grad.addColorStop(0, color);
                    grad.addColorStop(1, color + '');
                    ctx.fillStyle = grad; roundRect(padL, y, bw, barH, 6); ctx.fill();
                    // Değer metni
                    const valStr = (opts && opts.format) ? opts.format(it.value) : String(it.value);
                    ctx.fillStyle = '#0f172a'; ctx.textAlign = 'left';
                    const tx = padL + bw + 8; const ty = y + barH/2;
                    // Eğer bar çok kısa ise değeri bar dışında göster; uzun ise bar içinde beyazla
                    if(bw > 60){ ctx.fillStyle = '#f8fafc'; ctx.textAlign = 'right'; ctx.fillText(valStr, padL + bw - 8, ty); }
                    else { ctx.fillStyle = '#374151'; ctx.textAlign = 'left'; ctx.fillText(valStr, tx, ty); }
                    // Hover meta
                    meta.push({ x: padL, y, w: bw, h: barH, label: it.label, value: it.value, fmt: (opts && opts.format) ? opts.format : (v=> String(v)), unitColor: color });
                  });
                  canvas._barsMeta = meta;
                }catch(_){ /* ignore */ }
              }
              function drawPieChart(canvasId, items){
                try{
                  const canvas = document.getElementById(canvasId); if(!canvas) return;
                  const ctx = canvas.getContext('2d'); if(!ctx) return;
                  const logicalH = canvas.getAttribute('height')? Number(canvas.getAttribute('height')): 300;
                  const WCSS = canvas.clientWidth || (canvas.parentElement?.clientWidth||820);
                  const dpr = Math.max(1, (window.devicePixelRatio||1));
                  canvas.width = Math.round(WCSS * dpr);
                  canvas.height = Math.round(logicalH * dpr);
                  ctx.setTransform(dpr,0,0,dpr,0,0);
                  const W = WCSS; const H = logicalH;
                  ctx.clearRect(0,0,W,H);
                  const cx = W/2, cy = H/2, r = Math.min(W,H)*0.36, ir = r*0.55; // donut
                  const total = items.reduce((a,b)=> a + Number(b.value||0), 0);
                  if(!(total>0)){ ctx.fillStyle='#64748b'; ctx.font='12px -apple-system,Segoe UI,Roboto,Arial'; ctx.textAlign='center'; ctx.fillText('Veri yok (USD toplamı 0).', W/2, H/2); canvas._pieMeta=[]; return; }
                  const palette = ['#2563eb','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899','#0ea5e9'];
                  let start = -Math.PI/2; const meta=[]; items.forEach((it, i)=>{
                    const val = Number(it.value||0); const a = (val/total) * Math.PI*2; const end = start + a;
                    const color = palette[i % palette.length];
                    // slice
                    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, start, end); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
                    // inner cut
                    ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(cx, cy, ir, 0, Math.PI*2); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
                    // store meta
                    meta.push({ start, end, label: it.label, value: val, color }); start = end;
                  });
                  // center label
                  ctx.fillStyle = '#111827'; ctx.font = '600 14px -apple-system,Segoe UI,Roboto,Arial'; ctx.textAlign='center'; ctx.fillText('USD %', cx, cy-4);
                  ctx.fillStyle = '#64748b'; ctx.font = '12px -apple-system,Segoe UI,Roboto,Arial'; ctx.fillText(total.toLocaleString('tr-TR', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' $', cx, cy+14);
                  canvas._pieMeta = { cx, cy, r, ir, slices: meta, total };
                }catch(_){ /* ignore */ }
              }
              // Veri: sadece fiyatı (unit) > 0 olan taşlar
              const priced = Object.entries(s.perStone)
                .filter(([name, ps])=> (Number(ps.unit||0) > 0))
                .map(([name, ps])=> ({ label:name, ton:Number(ps.ton||0), usd:Number(ps.value||0) }));
              // Ton grafiği
              const nfTon = (v)=> (Number(v).toFixed(3)+' ton');
              drawBarChart('ensarChartTon', priced.map(x=> ({ label:x.label, value:x.ton })), { color:'#22c55e', format:nfTon, tickFormat:nfTon });
              // USD grafiği
              drawBarChart('ensarChartUsd', priced.map(x=> ({ label:x.label, value:x.usd })), { color:'#f59e0b', format:(v)=> nfUSD(v), tickFormat:(v)=> nfUSD(v) });
              // Pie (USD %)
              drawPieChart('ensarChartPie', priced.map(x=> ({ label:x.label, value:x.usd })));
              // Legend (DOM-safe construction)
              (function(){
                const legend = document.getElementById('ensarChartLegend'); if(!legend) return;
                const palette = ['#2563eb','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899','#0ea5e9'];
                const total = priced.reduce((a,b)=> a + b.usd, 0);
                legend.innerHTML = '';
                priced.forEach((x,i)=>{
                  try{
                    const pct = total>0 ? ((x.usd/total)*100).toFixed(1) : '0.0';
                    const item = document.createElement('div'); item.className = 'legend-item';
                    const dot = document.createElement('span'); dot.className = 'legend-dot'; dot.style.background = palette[i%palette.length];
                    const lbl = document.createElement('span'); lbl.textContent = x.label;
                    const muted = document.createElement('span'); muted.className = 'muted'; muted.textContent = pct + '%';
                    item.appendChild(dot); item.appendChild(lbl); item.appendChild(muted);
                    legend.appendChild(item);
                  }catch(_){ /* ignore per-item failures */ }
                });
              })();
              // Toggle
              const toggle = document.getElementById('ensarChartToggle');
              const cTon = document.getElementById('ensarChartTon');
              const cUsd = document.getElementById('ensarChartUsd');
              const cPie = document.getElementById('ensarChartPie');
              const legend = document.getElementById('ensarChartLegend');
              toggle && toggle.addEventListener('click', function(ev){ const btn = ev.target.closest('.seg-btn'); if(!btn) return; const type = btn.getAttribute('data-chart'); Array.from(toggle.querySelectorAll('.seg-btn')).forEach(b=> b.classList.toggle('active', b===btn)); if(type==='usd'){ cTon.style.display='none'; cPie.style.display='none'; legend.style.display='none'; cUsd.style.display=''; } else if(type==='ton'){ cUsd.style.display='none'; cPie.style.display='none'; legend.style.display='none'; cTon.style.display=''; } else { cUsd.style.display='none'; cTon.style.display='none'; cPie.style.display=''; legend.style.display='flex'; } });
              // Tooltip hover
              (function(){ const tip = document.getElementById('ensarChartTooltip'); const wrap = document.getElementById('ensarChartsWrap'); function showTip(text, x, y){ if(!tip) return; tip.innerHTML = text; tip.style.left = x+'px'; tip.style.top = y+'px'; tip.style.display='block'; } function hideTip(){ if(tip) tip.style.display='none'; }
                function wireBarHover(canvas, format){ if(!canvas) return; canvas.addEventListener('mousemove', function(ev){ const rect = wrap.getBoundingClientRect(); const cx = ev.clientX - rect.left; const cy = ev.clientY - rect.top; const meta = canvas._barsMeta||[]; const hit = meta.find(m=> cx >= m.x && cx <= (m.x+m.w) && cy >= m.y && cy <= (m.y+m.h)); if(hit){ showTip(`<strong>${hit.label}</strong><br/><span class='muted'>${format(hit.value)}</span>`, cx, cy); } else { hideTip(); } }); canvas.addEventListener('mouseleave', hideTip); }
                wireBarHover(cUsd, (v)=> nfUSD(v)); wireBarHover(cTon, (v)=> nfTon(v));
                function wirePieHover(canvas){ if(!canvas) return; canvas.addEventListener('mousemove', function(ev){ const rect = wrap.getBoundingClientRect(); const cx = ev.clientX - rect.left; const cy = ev.clientY - rect.top; const meta = canvas._pieMeta; if(!meta) return hideTip(); const dx = cx - meta.cx, dy = cy - meta.cy; const dist = Math.sqrt(dx*dx + dy*dy); if(dist < meta.ir || dist > meta.r) return hideTip(); let ang = Math.atan2(dy, dx); if(ang < -Math.PI/2) ang += Math.PI*2; const slice = (meta.slices||[]).find(s=> ang >= s.start && ang <= s.end); if(slice){ const pct = ((slice.value / meta.total) * 100).toFixed(1) + '%'; showTip(`<strong>${slice.label}</strong><br/><span class='muted'>${pct}</span>`, cx, cy); } else { hideTip(); } }); canvas.addEventListener('mouseleave', hideTip); }
                wirePieHover(cPie);
              })();
              // PNG indir
              (function(){ const btn = document.getElementById('ensarChartDownloadBtn'); if(!btn) return; btn.addEventListener('click', function(){ const current = (cUsd.style.display!=='none') ? cUsd : (cTon.style.display!=='none') ? cTon : cPie; if(!current) return; const name = current===cUsd? 'ensar_usd.png' : current===cTon? 'ensar_ton.png' : 'ensar_usd_pct.png'; try{ const url = current.toDataURL('image/png'); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); }catch(_){ } }); })();
              // Resize: yeniden çiz
              let _rsT; window.addEventListener('resize', function(){ clearTimeout(_rsT); _rsT = setTimeout(function(){ drawBarChart('ensarChartTon', priced.map(x=> ({ label:x.label, value:x.ton })), { color:'#22c55e', format:nfTon, tickFormat:nfTon }); drawBarChart('ensarChartUsd', priced.map(x=> ({ label:x.label, value:x.usd })), { color:'#f59e0b', format:(v)=> nfUSD(v), tickFormat:(v)=> nfUSD(v) }); drawPieChart('ensarChartPie', priced.map(x=> ({ label:x.label, value:x.usd }))); }, 80); });
            })();
            // Event: save inline
            const bodyTbl = document.getElementById('ensarPricingBodyInline');
            document.getElementById('ensarPricingSaveInline')?.addEventListener('click', function(){ const map = getPricing(); try{ (bodyTbl?.querySelectorAll('tr[data-stone]')||[]).forEach(tr=>{ const name = tr.getAttribute('data-stone')||''; const inputs = tr.querySelectorAll('input'); const price = Number(inputs[0]?.value||0)||0; const transport = Number(inputs[1]?.value||0)||0; map[name] = { price, transport }; }); setPricing(map); showToast && showToast('Taş fiyatları kaydedildi (USD/ton) ve özet güncellendi','success'); renderSummary('ensar-fiyat'); }catch(e){ console.error('save pricing inline error', e); }});
            return; // Bu sekmede diğer içerik oluşturulmadan çık
          }
    
          // Duruma göre gruplar
          const byDurum = groupBy(list, (b)=> String(b.durum||'Ensar'));
          // Ensar için taş cinsi (blokAdi), Fason için fasoncuKodu detayları
          const ensarList = (byDurum['Ensar']||[]);
          const fasonList = (byDurum['Fason']||[]);
          // Ensar: Ocak İsmi + Blok Adı kombinasyonu
          const ensarTas = groupBy(ensarList, (b)=> `${String(b.ocakIsmi||'Ocak?')} • ${String(b.blokAdi||'Taş?')}`);
          const fasonF = groupBy(fasonList, (b)=> String(b.fasoncuKodu||'Diğer'));
    
          function groupBy(arr, keyFn){ const map={}; arr.forEach(b=>{ const k=keyFn(b); (map[k]||(map[k]=[])).push(b); }); return map; }
          function metrics(arr){ const m3 = arr.reduce((a,b)=>{ const m=num(b.m3); return a+(isNaN(m)?0:m); },0); return { adet: arr.length, m3, ton: m3*2.7 }; }
    
          function sectionHTML(title, items){
            const sortBy = selSort?.value || 'adet';
            const maxM3 = Math.max(0, ...Object.values(items).map(arr=> metrics(arr).m3));
            const rows = Object.entries(items)
              .sort((a,b)=>{
                const ma = metrics(a[1]); const mb = metrics(b[1]);
                return sortBy==='m3' ? (mb.m3 - ma.m3) : (mb.adet - ma.adet);
              })
              .map(([k,arr])=>{
              const m = metrics(arr);
              const barW = maxM3>0 ? Math.round((m.m3/maxM3)*100) : 0;
                const rowId = `row_${title.replace(/\W+/g,'_')}_${k.replace(/\W+/g,'_')}`;
                return `<tr>
                <td style="font-weight:600;">${k}</td>
                  <td style="text-align:center;">${nf.format(m.adet)}</td>
                  <td style="text-align:center;">${m.m3.toFixed(2)}</td>
                  <td style="text-align:center;">${Number(m.ton).toFixed(2)}</td>
                <td style="width:180px;">
                  <div style="height:10px; background:#eef; border:1px solid #dbeafe; border-radius:10px; overflow:hidden;">
                    <div style="width:${barW}%; height:100%; background:#60a5fa;"></div>
                  </div>
                </td>
                </tr>
                <tr id="${rowId}" class="group-details" style="display:none;">
                  <td colspan="5">
                    <div style="padding:8px; border:1px dashed #e5e7eb; border-radius:8px; background:#f8fafc;">
                      <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
                        <input class="field small" data-gsearch placeholder="Detaylarda ara..." style="flex:1;">
                        <select class="field small" data-gpagesize style="width:90px;">
                          <option value="10">10</option>
                          <option value="20" selected>20</option>
                          <option value="50">50</option>
                        </select>
                        <div style="margin-left:auto; display:flex; gap:6px; align-items:center;">
                          <button class="btn ghost small" data-gprev>‹</button>
                          <span data-gpage>1</span>
                          <button class="btn ghost small" data-gnext>›</button>
                        </div>
                      </div>
                      <div data-glist style="display:grid; gap:6px;"></div>
                      <div data-gmeta style="margin-top:6px; font-size:12px; opacity:0.7;"></div>
                      <div data-gitems="${encodeURIComponent(JSON.stringify((arr||[]).map(b=> ({ blokNo:b.blokNo||'', durum:b.durum||'', ocakIsmi:b.ocakIsmi||'', blokAdi:b.blokAdi||'', m3:b.m3||'' }))))}"></div>
                      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
                        <button class="btn ghost small" data-gcsv="${rowId}">Bu grubu CSV</button>
                      </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colspan="5" style="text-align:right;">
                    <button class="btn ghost small" data-toggle="${rowId}">Detaylar</button>
                  </td>
                </tr>`;
            }).join('');
            if(!rows) return '';
            return `<div class="card" style="margin-top:12px;">
              <div style="font-weight:700; margin-bottom:8px;">${title}</div>
              <div class="table-wrap"><table style="min-width:760px;">
                <thead><tr><th>Grup</th><th style="text-align:center;">Adet</th><th style="text-align:center;">M³</th><th style="text-align:center;">Ton (≈2.7×)</th><th>Görsel</th></tr></thead>
                <tbody>${rows}</tbody>
              </table></div>
            </div>`;
          }
    
          const headerHTML = `
            <div class="card">
              <div style="display:flex;gap:12px; flex-wrap:wrap;">
                <div class="badge" style="background:#eef;">Toplam Adet: <b>${nf.format(toplam.adet)}</b></div>
                <div class="badge" style="background:#efe;">Toplam M³: <b>${toplam.m3.toFixed(3)}</b></div>
                <div class="badge" style="background:#fee;">Toplam Ton (≈): <b>${nf.format(Math.round(toplam.ton))}</b></div>
              </div>
            </div>
          `;
          // Basit donut grafik: ilk 8 grup için M³ dağılımı
          function donutHTML(title, items){
            const entries = Object.entries(items).map(([k,arr])=>({ k, m3: metrics(arr).m3 })).sort((a,b)=> b.m3-a.m3).slice(0,8);
            const colors = ['#60a5fa','#34d399','#fbbf24','#f472b6','#a78bfa','#22c55e','#fb7185','#f97316'];
            const legend = entries.map((e,i)=> `<div style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;background:${colors[i%colors.length]};display:inline-block;border-radius:2px;"></span><span style="font-size:12px;opacity:0.8;">${e.k}</span><span style="margin-left:auto;font-size:12px;opacity:0.7;">${e.m3.toFixed(1)} m³</span></div>`).join('');
            return `
              <div class="card" style="margin-top:8px;">
                <div style="font-weight:700;margin-bottom:6px;">${title} – M³ Dağılımı (Top ${entries.length})</div>
                <div style="display:flex;gap:12px;align-items:center;">
                  <canvas id="ozetDonut" width="220" height="220" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.2));"></canvas>
                  <div style="display:grid;grid-template-columns:1fr;gap:4px;">${legend}</div>
                </div>
              </div>`;
          }
    
      const contentHTML = (activeTab==='fason' ? sectionHTML('Durum: Fason (Fasoncu Kodu)', fasonF) : sectionHTML('Durum: Ensar (Ocak • Taş Cinsi)', ensarTas));
          const donut = (activeTab==='fason' ? donutHTML('Fason', fasonF) : donutHTML('Ensar', ensarTas));
          sections.innerHTML = headerHTML + donut + contentHTML;
    
          // Donut çizimi (Canvas 2D)
          try{
            const ctx = document.getElementById('ozetDonut')?.getContext('2d');
            if(ctx){
              const radius = 100, hole = 52; const cx = 110, cy = 110;
              const items = (activeTab==='fason' ? Object.entries(fasonF) : Object.entries(ensarTas))
                .map(([k,arr])=>({ k, m3: metrics(arr).m3 }))
                .sort((a,b)=> b.m3-a.m3).slice(0,8);
              const total = items.reduce((a,x)=> a+x.m3, 0) || 1;
              const cols=['#4f8ef7','#2ecd91','#f0b429','#ec6aa0','#8b73f6','#1fb864','#f25b70','#f28a2e'];
              ctx.clearRect(0,0,220,220);
              // Dilim bilgilerini tıklama için topla
              const slices = [];
    
              // Animasyon: dilimler sıfırdan açılarak gelsin
              const startTS = performance.now();
              const duration = 700;
              function frame(ts){
                const t = Math.min(1, (ts - startTS) / duration);
                const ease = t<0.5 ? 2*t*t : -1 + (4 - 2*t)*t; // easeInOutQuad
    
                ctx.clearRect(0,0,220,220);
                // Arka plan hafif radial gradient
                const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius+8);
                bgGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
                bgGrad.addColorStop(1, 'rgba(245,246,248,0.7)');
                ctx.fillStyle = bgGrad; ctx.beginPath(); ctx.arc(cx,cy,radius+8,0,Math.PI*2); ctx.fill();
    
                let startAng = -Math.PI/2;
                items.forEach((it,i)=>{
                  const angFull = (it.m3/total)*Math.PI*2;
                  const ang = angFull * ease;
                  const endAng = startAng + ang;
    
                  // Dilim gölge
                  ctx.save(); ctx.translate(2, 2);
                  ctx.beginPath(); ctx.moveTo(cx,cy);
                  ctx.arc(cx,cy,radius,startAng,endAng);
                  ctx.closePath(); ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fill(); ctx.restore();
    
                  // Ana dilim - radial gradient
                  const grad = ctx.createRadialGradient(cx-20, cy-20, 8, cx, cy, radius);
                  grad.addColorStop(0, shade(cols[i%cols.length], 1.15));
                  grad.addColorStop(0.6, cols[i%cols.length]);
                  grad.addColorStop(1, shade(cols[i%cols.length], 0.85));
                  ctx.beginPath(); ctx.moveTo(cx,cy);
                  ctx.arc(cx,cy,radius,startAng,endAng);
                  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    
                  // Kenar parıltı
                  ctx.save(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,0.6)';
                  ctx.beginPath(); ctx.arc(cx,cy,radius-0.6,startAng,endAng); ctx.stroke(); ctx.restore();
    
                  // Tıklama eşlemesi için tam açı aralıklarını sakla
                  const fullEndAng = startAng + angFull;
                  slices.push({ key: it.k, start: startAng, end: fullEndAng });
                  startAng += angFull; // bir sonraki dilimin başlangıcı tam değerden ilerler
                });
    
                // İç delik ve gölge
                ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(cx,cy,hole,0,Math.PI*2); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
                ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx,cy,hole+1.5,0,Math.PI*2); ctx.stroke(); ctx.restore();
    
                // Merkez etiketi
                ctx.save(); ctx.font = '600 12px system-ui, -apple-system, Segoe UI'; ctx.fillStyle = '#334155';
                const label = 'Toplam M³'; const val = (total||0).toFixed(1);
                const tw = ctx.measureText(label).width; ctx.fillText(label, cx - tw/2, cy - 4);
                ctx.font = '800 16px system-ui, -apple-system, Segoe UI'; const tv = ctx.measureText(val).width; ctx.fillText(val, cx - tv/2, cy + 12);
                // Alt satıra Top N grup
                const topN = Math.min(8, items.length);
                const tN = `Top ${topN} grup`;
                ctx.font = '600 11px system-ui, -apple-system, Segoe UI';
                const tnw = ctx.measureText(tN).width; ctx.fillText(tN, cx - tnw/2, cy + 28);
                ctx.restore();
    
                if(ease < 1) requestAnimationFrame(frame);
              }
              requestAnimationFrame(frame);
    
              // İç deliği oluştur ve iç gölge ver
              ctx.globalCompositeOperation = 'destination-out';
              ctx.beginPath(); ctx.arc(cx,cy,hole,0,Math.PI*2); ctx.fill();
              ctx.globalCompositeOperation = 'source-over';
              // İç kenar gölgesi (derinlik)
              ctx.save();
              ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 3;
              ctx.beginPath(); ctx.arc(cx,cy,hole+1.5,0,Math.PI*2); ctx.stroke();
              ctx.restore();
    
              // Merkez etiketi (Toplam M³)
              ctx.save();
              ctx.font = '600 13px system-ui, -apple-system, Segoe UI';
              ctx.fillStyle = '#334155';
              const label = 'Toplam M³';
              const val = (total||0).toFixed(1);
              const tw = ctx.measureText(label).width;
              ctx.fillText(label, cx - tw/2, cy - 4);
              ctx.font = '800 16px system-ui, -apple-system, Segoe UI';
              const tv = ctx.measureText(val).width;
              ctx.fillText(val, cx - tv/2, cy + 16);
              ctx.restore();
    
              // Basit yardımcı: rengi aydınlat/karart
              function shade(hex, factor){
                const c = hex.replace('#','');
                const r = parseInt(c.substring(0,2),16), g = parseInt(c.substring(2,4),16), b = parseInt(c.substring(4,6),16);
                const f = factor; const nr = Math.min(255, Math.max(0, Math.round(r*f)));
                const ng = Math.min(255, Math.max(0, Math.round(g*f)));
                const nb = Math.min(255, Math.max(0, Math.round(b*f)));
                return '#' + nr.toString(16).padStart(2,'0') + ng.toString(16).padStart(2,'0') + nb.toString(16).padStart(2,'0');
              }
    
              // Dilim tıklama: ilgili grup detayını aç
              try{
                const canvas = ctx.canvas;
                canvas.__slices = slices;
                canvas.__hole = hole;
                canvas.__radius = radius;
                canvas.__cx = cx;
                canvas.__cy = cy;
                canvas.__activeTitle = (activeTab==='fason' ? 'Durum: Fason (Fasoncu Kodu)' : 'Durum: Ensar (Ocak • Taş Cinsi)');
                canvas.onclick = function(ev){
                  try{
                    const rect = canvas.getBoundingClientRect();
                    const x = ev.clientX - rect.left; const y = ev.clientY - rect.top;
                    const dx = x - canvas.__cx; const dy = y - canvas.__cy;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if(dist < canvas.__hole || dist > canvas.__radius) return; // halkaya tıklanmadı
                    let ang = Math.atan2(dy, dx); // [-PI, PI]
                    // Başlangıç -PI/2 hizasına göre normalize et
                    if(ang < -Math.PI/2) ang += Math.PI*2;
                    // Eşleşen dilimi bul
                    const s = (canvas.__slices||[]).find(sl => ang >= sl.start && ang <= sl.end);
                    if(!s) return;
                    const rowId = `row_${canvas.__activeTitle.replace(/\W+/g,'_')}_${String(s.key).replace(/\W+/g,'_')}`;
                    // Butonu veya satırı bul ve aç
                    const sections = document.getElementById('ozetSections');
                    const btn = sections?.querySelector(`[data-toggle="${CSS?.escape?CSS.escape(rowId):rowId}"]`);
                    const row = document.getElementById(rowId);
                    if(btn){ btn.click(); }
                    if(row){ row.scrollIntoView({behavior:'smooth', block:'center'}); }
                  }catch(e){ console.warn('Donut slice click failed', e); }
                };
              }catch(_){ }
            }
          }catch(_){ }
          // Rozetler: aktif filtrelerin kısa gösterimi
          const stageFilter = document.querySelector('.filterStage.active')?.getAttribute('data-stage') || 'all';
          const f = {
            Arama: (document.getElementById('blokAraInput')?.value||'').trim(),
            Tarih: [document.getElementById('f_gelis_from')?.value||'', document.getElementById('f_gelis_to')?.value||''].filter(Boolean).join(' → '),
            BlokNo: (document.getElementById('f_blokNo')?.value||'').trim(),
            Fasoncu: (document.getElementById('f_fason')?.value||'').trim(),
            Ocak: (document.getElementById('f_ocak')?.value||'').trim(),
            Tas: (document.getElementById('f_blokAdi')?.value||'').trim(),
            Durum: document.getElementById('f_durum')?.value||'',
            Asama: stageFilter==='all' ? '' : stageFilter
          };
          const chips = Object.entries(f).filter(([,v])=> !!v).map(([k,v])=> `<span class="chip">${k}: <b>${v}</b></span>`).join('');
          badges.innerHTML = chips || '<span style="opacity:0.6;">Aktif filtre yok</span>';
        }
    
        btnOpen.addEventListener('click', async function(){ await renderSummary('ensar'); show(); });
        btnClose?.addEventListener('click', hide);
        modal.addEventListener('click', function(e){ if(e.target===modal) hide(); });
      // Varsayılan aktif sekme işaretle
      try{ tabBtns.forEach(b=> b.classList.remove('active')); body.querySelector('[data-tab="ensar"]').classList.add('active'); }catch(_){ }
        // Ensar Fiyat/Stock sekme butonunu rol iznine göre gizle
        try{
          const efBtn = body.querySelector('[data-tab="ensar-fiyat"]');
          if(efBtn){
            const uid = (typeof getActiveUserId==='function') ? getActiveUserId() : '';
            const allow = (typeof isAllowed==='function') ? isAllowed(uid, 'summary_ensar_fiyat') : true;
            efBtn.style.display = allow ? '' : 'none';
          }
        }catch(_){ }
        selSort?.addEventListener('change', async function(){ const active = body.querySelector('[data-tab].active')?.getAttribute('data-tab') || 'ensar'; await renderSummary(active); });
        tabBtns.forEach(btn=> btn.addEventListener('click', async function(){
          const targetTab = btn.getAttribute('data-tab');
          // Yetkisiz ise engelle
          if(targetTab==='ensar-fiyat'){
            try{
              const uid = (typeof getActiveUserId==='function') ? getActiveUserId() : '';
              const allow = (typeof isAllowed==='function') ? isAllowed(uid, 'summary_ensar_fiyat') : true;
              if(!allow){
                if(typeof showToast==='function') showToast('Ensar Fiyat/Stock sekmesi için yetkiniz yok','warning'); else alert('Ensar Fiyat/Stock sekmesi için yetkiniz yok');
                return;
              }
            }catch(_){ }
          }
          tabBtns.forEach(b=> b.classList.remove('active'));
          btn.classList.add('active');
          await renderSummary(targetTab);
        }));
        // PDF export: modal içeriğini yazdırılabilir hale getir ve Print'e gönder
        try{
          const btnPdf = document.getElementById('ozetDownloadPDF');
          if(btnPdf){
            btnPdf.addEventListener('click', function(){
              try{
                // Basit yazdırma CSS'ini enjekte et (tek seferlik)
                if(!document.getElementById('ozetPrintStyle')){
                  const st = document.createElement('style'); st.id='ozetPrintStyle'; st.setAttribute('media','print');
                  st.textContent = `@page{size:A4;margin:10mm;} body *{visibility:hidden;} #ozetModal, #ozetModal *{visibility:visible;} #ozetModal{position:static!important; inset:auto!important; background:none!important; box-shadow:none!important;} #ozetBody{max-height:none!important; overflow:visible!important;} #ozetModal .btn{display:none!important;}`;
                  document.head.appendChild(st);
                }
                window.print();
              }catch(e){ console.error('PDF export failed', e); }
            });
          }
        }catch(_){ }
        // Grup detay toggle
        body.addEventListener('click', function(ev){
          const t = ev.target.closest?.('[data-toggle]'); if(!t) return;
          const id = t.getAttribute('data-toggle');
          let row = null;
          try{ row = body.querySelector('#'+(window.CSS && CSS.escape ? CSS.escape(id) : id)); }catch(_){ row = body.querySelector(`[id="${id}"]`); }
          if(!row) return; const vis = row.style.display !== 'none'; row.style.display = vis ? 'none' : '';
          // Buton metni ve rengi: açıkken kırmızı (danger), kapalıyken normal
          try{
            t.textContent = vis ? 'Detaylar' : 'Detayları Gizle';
            if(!vis){ t.classList.add('danger'); } else { t.classList.remove('danger'); }
          }catch(_){ }
          if(!vis){ // şimdi açıldıysa render et
            try{
              const itemsEl = row.querySelector('[data-gitems]');
              const listEl = row.querySelector('[data-glist]');
              const metaEl = row.querySelector('[data-gmeta]');
              const searchEl = row.querySelector('[data-gsearch]');
              const psEl = row.querySelector('[data-gpagesize]');
              const prevEl = row.querySelector('[data-gprev]');
              const nextEl = row.querySelector('[data-gnext]');
              const pageEl = row.querySelector('[data-gpage]');
              const all = JSON.parse(decodeURIComponent(itemsEl.getAttribute('data-gitems')||'[]'))||[];
              let page=1; let pageSize = parseInt(psEl.value||'20',10)||20; let q='';
              const render = ()=>{
                const filt = !q ? all : all.filter(x=> Object.values(x).some(v=> String(v||'').toLowerCase().includes(q)));
                const total = filt.length; const maxPage = Math.max(1, Math.ceil(total / pageSize)); if(page>maxPage) page=maxPage; if(page<1) page=1;
                const start = (page-1)*pageSize; const slice = filt.slice(start, start+pageSize);
                listEl.innerHTML = slice.map(b=> `<div style=\"display:grid; grid-template-columns: 110px 110px 1fr 1fr 70px; gap:6px; align-items:center; font-size:12px; opacity:0.85;\">`
                  + `<span><b>${b.blokNo||''}</b></span>`
                  + `<span>${b.durum||''}</span>`
                  + `<span>${b.ocakIsmi||''}</span>`
                  + `<span>${b.blokAdi||''}</span>`
                  + `<span>${(b.m3!==undefined && b.m3!==null && String(b.m3)!=='') ? Number(b.m3).toFixed(2) : ''}</span>`
                + `</div>`).join('');
                metaEl.textContent = `${total} kayıt • Sayfa ${page}/${maxPage}`;
                pageEl.textContent = String(page);
              };
              // Grup CSV indir
              row.querySelector('[data-gcsv]')?.addEventListener('click', function(){
                try{
                  const cols = ['blokNo','durum','ocakIsmi','blokAdi','m3'];
                  const header = cols.join(',');
                  const esc = (v)=> '"'+String(v??'').replace(/"/g,'""')+'"';
                  const filt = !q ? all : all.filter(x=> Object.values(x).some(v=> String(v||'').toLowerCase().includes(q)));
                  const rows = filt.map(b=> cols.map(c=> esc(c==='m3' ? (b.m3!==undefined && b.m3!==null && String(b.m3)!=='' ? Number(b.m3).toFixed(1) : '') : b[c])).join(',')).join('\n');
                  const csv = header+'\n'+rows;
                  const blob = new Blob([csv], {type:'text/csv'});
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'grup_detay.csv'; a.click(); setTimeout(()=> URL.revokeObjectURL(a.href), 1000);
                }catch(_){ }
              });
              // Olaylar
              searchEl.addEventListener('input', function(){ q = String(this.value||'').trim().toLowerCase(); page=1; render(); });
              psEl.addEventListener('change', function(){ pageSize = parseInt(this.value||'20',10)||20; page=1; render(); });
              prevEl.addEventListener('click', function(){ if(page>1){ page--; render(); } });
              nextEl.addEventListener('click', function(){ page++; render(); });
              render();
            }catch(_){ }
          }
        });
        btnClose?.addEventListener('click', hide);
        modal.addEventListener('click', function(e){ if(e.target===modal) hide(); });
    
        // İndir butonları
        btnJSON?.addEventListener('click', async function(){
          const list = await getFilteredBloklar();
          const data = { toplam: list.length, kayitlar: list };
          try{
            const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'blok_ozet.json'; a.click(); setTimeout(()=> URL.revokeObjectURL(a.href), 1000);
          }catch(_){ }
        });
        // CSV kolon seçimi
        btnCSV?.addEventListener('click', async function(){
          const list = await getFilteredBloklar();
          const allCols = ['gelisTarihi','blokNo','fasoncuKodu','ocakIsmi','blokAdi','durum','en','boy','yukseklik','m3','ton','asama'];
          const chooser = document.createElement('div'); chooser.style.cssText='position:fixed; inset:0; z-index:3000; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.35)';
          chooser.innerHTML = `
            <div class="card" style="width:520px; max-width:95vw;">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <div style="font-weight:800;">CSV Kolon Seçimi</div>
                <button class="btn danger small" data-close>İptal</button>
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px;">
                ${allCols.map(c=> `<label style=\"display:flex;align-items:center;gap:6px;\"><input type=\"checkbox\" checked data-col=\"${c}\"> <span>${c}</span></label>`).join('')}
              </div>
              <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
                <button class="btn ghost small" data-all>Hepsi</button>
                <button class="btn ghost small" data-none>Temizle</button>
                <button class="btn primary small" data-download>İndir</button>
              </div>
            </div>`;
          document.body.appendChild(chooser);
          const close = ()=> chooser.remove();
          chooser.addEventListener('click', function(e){ if(e.target.hasAttribute('data-close') || e.target===chooser) close(); });
          chooser.querySelector('[data-all]')?.addEventListener('click', function(){ chooser.querySelectorAll('input[type=checkbox][data-col]').forEach(ch=> ch.checked=true); });
          chooser.querySelector('[data-none]')?.addEventListener('click', function(){ chooser.querySelectorAll('input[type=checkbox][data-col]').forEach(ch=> ch.checked=false); });
          chooser.querySelector('[data-download]')?.addEventListener('click', function(){
            const cols = Array.from(chooser.querySelectorAll('input[type=checkbox][data-col]:checked')).map(el=> el.getAttribute('data-col'));
            if(!cols.length){ alert('En az bir kolon seçin.'); return; }
            const header = cols.join(',');
            const esc = (v)=> '"'+String(v??'').replace(/"/g,'""')+'"';
            const rows = list.map(b=> cols.map(c=> esc(c==='ton' ? (num(b.m3)*2.7||'') : b[c])).join(',')).join('\n');
            const csv = header+'\n'+rows;
            try{
              const blob = new Blob([csv], {type:'text/csv'});
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'blok_ozet.csv'; a.click(); setTimeout(()=> URL.revokeObjectURL(a.href), 1000);
              close();
            }catch(_){ }
          });
        });
      }catch(_){ }
    });
    
    /* ==== BODY inline script #62 ==== */
    // One-time clear removed: previously this emptied the blok list on first load.
    // Keeping a sentinel to avoid re-triggering any legacy seed flows.
    document.addEventListener('DOMContentLoaded', function(){
      try{
        const FLAG = 'v92_bloklar_cleared_once';
        if(localStorage.getItem(FLAG)==='done') return;
        // Do NOT clear user's local blok list automatically. Mark as done to avoid legacy seed behavior.
        try{ localStorage.setItem('v92_imported_seed_bloklar','done'); }catch(_){ }
        try{ localStorage.setItem(FLAG,'done'); }catch(_){ }
        try{ /* avoid forcing render */ }catch(_){ }
      }catch(e){ console.error(e); }
    });
    
    /* ==== BODY inline script #63 ==== */
    (function(){
        try {
          const DONE_KEY = 'excel_import_done';
          const BL_KEY = 'bloklar_yeni_demo';
    
          // Sonsuz yenilemeyi engelle: sadece bir kez çalıştır
          if (!localStorage.getItem(DONE_KEY)) {
            // Disabled automatic clearing of local blok list; we still mark the import sentinel below.
            // Konsol için üretilen scripti dosya olarak yükle (stub)
            var s = document.createElement('script');
            s.src = 'depo-sifirdan/console_import.removed.js';
            s.onload = function(){
              // Bir daha tetiklenmemesi için bayrağı koy
              localStorage.setItem(DONE_KEY, '1');
            };
            s.onerror = function(e){ console.error('console_import.js yüklenemedi', e); };
            document.body.appendChild(s);
          }
        } catch (e) {
          console.error('Excel yükleme bootstrap hatası', e);
        }
      })();
    
    /* ==== BODY inline script #64 ==== */
    const EXCEL_BLOKLARI = [];
    
    /* ==== BODY inline script #65 ==== */
    (function(){
      if (window.__ensarOfficeFinalInstalled) return;
      window.__ensarOfficeFinalInstalled = true;
    
      /* ---------- Config ---------- */
      const WEBAPP_URL = (function(){
        try { return localStorage.getItem('v92_gs_webapp_url') || ''; } catch(_) { return ''; }
      })();
      const SYNC_KEYS = ['bloklar','siparisler','stok','ayarlar']; // ortak veriler
      const PULL_INTERVAL = 15000; // ms
      const PUSH_DEBOUNCE = 600;   // ms
      const LOCK_TTL_MS = 5 * 60 * 1000; // 5 dk
      const AUDIT_MAX_RENDER = 150; // panelde gösterilecek
    
      if (!WEBAPP_URL) {
        console.warn('EnsarOfficeFinal: v92_gs_webapp_url bulunamadı. (GS Sync panelinden kaydedebilirsin)');
        return;
      }
    
      /* ---------- UI helpers (toast + panel) ---------- */
      function toast(msg, type){
        try{
          if (typeof window.showToast === 'function') return window.showToast(msg);
        }catch(_){}
        try{
          const bar = document.getElementById('successChipBar');
          if (bar){
            bar.style.display = 'block';
            bar.innerHTML = '<div class="success-chip"><span class="dot"></span><span>'+escapeHtml(String(msg||''))+'</span></div>';
            setTimeout(()=>{ try{ bar.style.display='none'; }catch(_){} }, 2500);
            return;
          }
        }catch(_){}
        try{ console.log('[toast]', msg); }catch(_){}
      }
    
      function ensurePanel(){
        const existingPanel = document.getElementById('ensarOfficePanel');
        const serverContainerTop = document.getElementById('server_office_panel_container');
        if (existingPanel){
          // If the panel already exists but is not inside the server container yet, move it.
          try{ if(serverContainerTop && existingPanel.parentElement !== serverContainerTop) serverContainerTop.appendChild(existingPanel); }catch(_){ }
          return;
        }
        const wrap = document.createElement('div');
        wrap.id = 'ensarOfficePanel';
      const useServerContainer = !!serverContainerTop;
      // When rendering inside Server Ayarları, constrain width so it fits the right column
      wrap.style.cssText = useServerContainer ? 'position:static; max-width:340px; width:100%;' : 'position:fixed;left:12px;bottom:12px;z-index:9999;max-width:420px;';
        wrap.innerHTML = `
          <div class="card" style="padding:10px 12px; box-shadow:0 8px 22px rgba(0,0,0,0.16);">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
              <div style="display:flex;flex-direction:column;gap:2px;">
                <strong style="font-size:13px;">Office Sync</strong>
                <div id="ensarOfficeStatus" style="font-size:12px;color:#64748b;">hazırlanıyor…</div>
              </div>
              <div style="display:flex;gap:6px;align-items:center;">
                <button id="ensarOfficeBtnAudit" class="btn ghost small" style="padding:6px 10px;">Geçmiş</button>
                <button id="ensarOfficeBtnReport" class="btn ghost small" style="padding:6px 10px;">Rapor</button>
                <button id="ensarOfficeBtnClose" class="btn ghost small" style="padding:6px 10px;">Kapat</button>
              </div>
            </div>
            <div id="ensarOfficeBody" style="display:none;margin-top:10px;">
              <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
                <span class="pill" id="ensarOfficeUserPill">Kullanıcı: -</span>
                <span class="pill" id="ensarOfficeRolePill">Yetki: -</span>
                <span class="pill" id="ensarOfficeLastSyncPill">Son Sync: -</span>
              </div>
              <div class="table-wrap" style="padding:8px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
                  <strong id="ensarOfficeTableTitle" style="font-size:13px;">Değişiklik Geçmişi</strong>
                  <button id="ensarOfficeRefresh" class="btn primary small" style="padding:6px 10px;">Yenile</button>
                </div>
                <div style="max-height:240px;overflow:auto;">
                  <table style="font-size:12px;">
                    <thead><tr>
                      <th class="nowrap">Zaman</th>
                      <th class="nowrap">Kullanıcı</th>
                      <th class="nowrap">İşlem</th>
                      <th>Detay</th>
                    </tr></thead>
                    <tbody id="ensarOfficeTbody"></tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        `;
        // If a server-side settings container exists, render the office panel inside it.
        const serverContainer = document.getElementById('server_office_panel_container');
        if(serverContainer){
          // normalize styles so it sits top-right inside the container
          wrap.style.margin = '0';
          wrap.style.alignSelf = 'flex-start';
          wrap.style.maxWidth = '340px';
          serverContainer.appendChild(wrap);
        }
        else { document.body.appendChild(wrap); }
    
        const close = document.getElementById('ensarOfficeBtnClose');
        const body = document.getElementById('ensarOfficeBody');
        const auditBtn = document.getElementById('ensarOfficeBtnAudit');
        const reportBtn = document.getElementById('ensarOfficeBtnReport');
        const refreshBtn = document.getElementById('ensarOfficeRefresh');
    
        close.addEventListener('click', ()=>{ wrap.style.display='none'; });
        // helper to switch table mode (audit/report)
        function setTableMode(mode){
          try{ currentMode = mode; if(mode === 'audit') loadAudit(); else if(mode === 'report') loadReport(); }catch(_){ }
        }
        auditBtn.addEventListener('click', ()=>{ body.style.display = (body.style.display==='none'?'block':'none'); setTableMode('audit'); });
        reportBtn.addEventListener('click', ()=>{ body.style.display = 'block'; setTableMode('report'); });
        refreshBtn.addEventListener('click', ()=>{ if(currentMode==='audit') loadAudit(); else loadReport(); });
    
        function setText(id, v){ const el=document.getElementById(id); if(el) el.textContent=v; }
        function fmtTs(ms){
          try{
            const d = new Date(ms);
            const pad = (n)=>String(n).padStart(2,'0');
            return pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear()+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
          }catch(_){ return String(ms||''); }
        }
    
        let currentMode = 'audit';
        async function loadAudit(){
          setText('ensarOfficeTableTitle','Değişiklik Geçmişi');
          const tb = document.getElementById('ensarOfficeTbody');
          tb.innerHTML = '<tr><td colspan="4">Yükleniyor…</td></tr>';
          try{
            const items = await remoteList();
            const audits = (items||[])
              .filter(x=> String(x.key||'').startsWith('audit::'))
              .sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))
              .slice(0, AUDIT_MAX_RENDER);
            if(!audits.length){
              tb.innerHTML = '<tr><td colspan="4">Kayıt yok</td></tr>';
              return;
            }
            tb.innerHTML = audits.map(a=>{
              const r = a.record || {};
              const det = r.detail ? JSON.stringify(r.detail).slice(0,180) : '';
              return `<tr>
                <td class="nowrap">${escapeHtml(fmtTs(r.ts||a.updatedAt||0))}</td>
                <td class="nowrap">${escapeHtml(r.user||'-')}</td>
                <td class="nowrap">${escapeHtml(r.action||'-')}</td>
                <td class="ellipsis" title="${escapeHtml(det)}">${escapeHtml(det)}</td>
              </tr>`;
            }).join('');
          }catch(e){
            tb.innerHTML = '<tr><td colspan="4">Hata: '+escapeHtml(String(e))+'</td></tr>';
          }
        }
    
        async function loadReport(){
          setText('ensarOfficeTableTitle','Hızlı Rapor');
          const tb = document.getElementById('ensarOfficeTbody');
          tb.innerHTML = '<tr><td colspan="4">Hesaplanıyor…</td></tr>';
          try{
            const out = [];
            const getArr = (k)=>{ try{ const raw=localStorage.getItem(k)||'[]'; const a=JSON.parse(raw); return Array.isArray(a)?a:[]; }catch(_){ return []; } };
            const bloklar = getArr('bloklar') || getArr('bloklar_yeni_demo');
            const sip = getArr('siparisler');
            const stok = getArr('stok');
    
            const m3 = (bloklar||[]).reduce((s,b)=> s + (Number(b.m3)||0), 0);
            const adetBlok = (bloklar||[]).length;
            const adetSip = (sip||[]).length;
            const adetStok = (stok||[]).length;
    
            out.push({k:'Toplam Blok', v: adetBlok});
            out.push({k:'Toplam m³', v: (Math.round(m3*1000)/1000).toLocaleString('tr-TR')});
            out.push({k:'Toplam Sipariş', v: adetSip});
            out.push({k:'Toplam Stok Kalemi', v: adetStok});
    
            tb.innerHTML = out.map(r=>`<tr><td class="nowrap">—</td><td class="nowrap">—</td><td class="nowrap">${escapeHtml(r.k)}</td><td>${escapeHtml(String(r.v))}</td></tr>`).join('');
          }catch(e){
            tb.innerHTML = '<tr><td colspan="4">Hata: '+escapeHtml(String(e))+'</td></tr>';
          }
        }
    
        window.__ensarOfficePanel = {
          setUser(u, role){
            setText('ensarOfficeUserPill', 'Kullanıcı: ' + (u||'-'));
            setText('ensarOfficeRolePill', 'Yetki: ' + (role||'-'));
          },
          setStatus(s){ setText('ensarOfficeStatus', s||''); },
          setLastSync(ts){ setText('ensarOfficeLastSyncPill', 'Son Sync: ' + (ts||'-')); },
          openAudit(){ body.style.display='block'; currentMode='audit'; loadAudit(); },
          openReport(){ body.style.display='block'; currentMode='report'; loadReport(); },
          refresh(){ if(currentMode==='audit') loadAudit(); else loadReport(); },
        };
    
        // default
        currentMode='audit';
        loadAudit();
      }
    
      /* ---------- Identity / RBAC ---------- */
      function getActiveUser(){
        try{
          const id = localStorage.getItem('v91_active_user_id') || '';
          const raw = localStorage.getItem('v91_users');
          const users = raw ? JSON.parse(raw) : [];
          const u = (Array.isArray(users) ? users : []).find(x => (x.id||x.name||'') === id);
          return {
            id: id || (u?.id||u?.name||'guest'),
            name: u?.name || id || 'guest',
            role: u?.role || 'user'
          };
        }catch(_){
          return { id:'guest', name:'guest', role:'user' };
        }
      }
    
      // Basit yetki matrisi
      const PERMS = {
        admin: { edit:true, delete:true, lock:true, audit:true, report:true },
        user:  { edit:true, delete:false, lock:true, audit:true, report:true },
        guest: { edit:false, delete:false, lock:false, audit:false, report:false }
      };
      function can(action){
        try{
          // Temporary session-based bypass (useful for emergency fixes from UI)
          // Also allow force flag for migrations/remote-only mode when explicitly enabled.
          if(action === 'delete' && (sessionStorage.getItem && sessionStorage.getItem('v91_temp_delete_ok') === '1')) return true;
          if(action === 'delete' && window.FORCE_ALLOW_DELETE) return true;
        }catch(_){ }
        const u = getActiveUser();
        const p = PERMS[u.role] || PERMS.user;
        return !!p[action];
      }
    
      /* ---------- Remote API (JSONP) ---------- */
      // JSONP removed: provide simple wrappers that use _gsFetch/_gsPostForm instead
      function jsonp(url){
        return Promise.reject(new Error('JSONP removed.'));
      }

      async function remoteList(){
        const res = await _gsFetch('action=list');
        if(!res || !res.ok) throw new Error('remote list failed');
        const arr = res.items || res.data || [];
        return Array.isArray(arr) ? arr : [];
      }
      async function remoteGet(id){
        const res = await _gsFetch('action=get&id=' + encodeURIComponent(id));
        if(!res || !res.ok) throw new Error('remote get failed');
        return res.record ?? null;
      }
  async function remoteUpsertLegacy(id, record){
        // Compatibility wrapper for callers that use (id, record) signature.
        // Prefer the primary window.remoteUpsert(singleRecord) implementation if available
        // (the newer implementation batches/uses proxy/form-post fallbacks).
        const rec = Object.assign({}, record || {}, { id: id });
        try{
          if(typeof window.remoteUpsert === 'function' && window.remoteUpsert !== remoteUpsert){
            // call the primary single-argument remoteUpsert (declared earlier) with normalized record
            return await window.remoteUpsert(rec);
          }
        }catch(_){ /* fallthrough to JSONP fallback below */ }

        // Fallback: try form-encoded POST via helper
        try{
          const r = await _gsPostForm({ action: 'upsert', record: rec });
          return r;
        }catch(e){
          // last resort: try JSON body POST
          const res = await fetch(GS_WEBAPP_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'upsert', record: rec})});
          if(!res.ok) throw new Error('remote upsert failed: '+res.status);
          return await res.json();
        }
      }
      async function remoteDelete(id){
        // Prefer POST delete via helper
        try{ return await _gsPostForm({ action: 'delete', id: id }); }
        catch(e){
          const res = await fetch(GS_WEBAPP_URL + '?action=delete&id=' + encodeURIComponent(id));
          if(!res || !res.ok) throw new Error('remote delete failed');
          return await res.json();
        }
      }
    
      /* ---------- Locking ---------- */
      function lockKey(resource, id){ return `lock::${resource}::${id}`; }
    
      async function acquireLock(resource, id){
        const u = getActiveUser();
        if(!can('lock')) return { ok:false, reason:'yetki yok' };
    
        const lk = lockKey(resource, id);
        const now = Date.now();
        const current = await remoteGet(lk);
        if(current && current.expiresAt && Number(current.expiresAt) > now && current.owner && current.owner !== u.id){
          return { ok:false, reason:`Kilitli: ${current.owner}` };
        }
        const lockObj = { id: lk, owner: u.id, ownerName: u.name, ts: now, expiresAt: now + LOCK_TTL_MS };
          await remoteUpsertLegacy(lk, lockObj);
        return { ok:true, lock: lockObj };
      }
    
      async function releaseLock(resource, id){
        try{
          const u = getActiveUser();
          const lk = lockKey(resource, id);
          const current = await remoteGet(lk);
          if(current && current.owner && current.owner !== u.id) return false;
          await remoteDelete(lk);
          return true;
        }catch(_){ return false; }
      }
    
      /* ---------- Audit log ---------- */
      async function audit(action, detail){
        try{
          const u = getActiveUser();
          if(!can('audit')) return;
          const ts = Date.now();
          const rid = 'audit::' + ts + '::' + Math.random().toString(36).slice(2,8);
          await remoteUpsertLegacy(rid, { id: rid, ts, user: u.name || u.id, userId: u.id, action, detail: detail || {} });
        }catch(_){}
      }
    
      /* ---------- Sync engine ---------- */
      let lastPullAt = 0;
      let lastSyncStamp = 0;
      const pushTimers = {};
      const pushing = {};
    
      async function pull(){
        if (Date.now() - lastPullAt < 3000) return;
        lastPullAt = Date.now();
    
        const items = await remoteList();
        let changedAny = false;
    
        // data rows: key -> record.value
        for(const row of items){
          const k = String(row.key||row.id||'');
          if(!SYNC_KEYS.includes(k)) continue;
          const rec = row.record || row.value || null;
          const val = rec && rec.value !== undefined ? rec.value : (rec||null);
          if(val === null) continue;
    
          const remoteRaw = JSON.stringify(val);
          const localRaw = localStorage.getItem(k);
          if(localRaw !== remoteRaw){
            // notifikasyon: sadece gerçekten farklıysa
            localStorage.setItem(k, remoteRaw);
            changedAny = true;
            toast(`Remote güncellendi: ${k}`, 'info');
          }
        }
    
        lastSyncStamp = Date.now();
        try{
          const p = window.__ensarOfficePanel;
          if(p){
            p.setLastSync(new Date(lastSyncStamp).toLocaleString('tr-TR'));
            p.setStatus(changedAny ? 'Senkron: güncelleme alındı' : 'Senkron: güncel');
          }
        }catch(_){}
      }
    
      function schedulePush(key, value){
        clearTimeout(pushTimers[key]);
        pushTimers[key] = setTimeout(()=> pushNow(key, value), PUSH_DEBOUNCE);
      }
    
      async function pushNow(key, value){
        if(pushing[key]) return;
        pushing[key] = true;
    
        try{
          const u = getActiveUser();
          const payload = { id: key, value: JSON.parse(value), updatedAt: Date.now(), userId: u.id, userName: u.name };
          await remoteUpsertLegacy(key, payload);
          await audit('upsert:'+key, { key, count: Array.isArray(payload.value)?payload.value.length:undefined });
          toast(`Paylaşıldı: ${key}`, 'success');
        }catch(e){
          console.warn('OfficeSync push failed', e);
          toast('Senkron hatası: bağlantı kontrol et', 'danger');
        }finally{
          pushing[key] = false;
        }
      }
    
      // localStorage hook
      const _setItem = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function(k,v){
        _setItem(k,v);
        if(!SYNC_KEYS.includes(k)) return;
        schedulePush(k, v);
      };
    
      // First panel + status
      ensurePanel();
      try{
        const u = getActiveUser();
        window.__ensarOfficePanel?.setUser(u.name || u.id, u.role);
        window.__ensarOfficePanel?.setStatus('Senkron: başlatıldı');
      }catch(_){}
    
      // Pull loop
      setInterval(()=>{ pull().catch(()=>{ try{ window.__ensarOfficePanel?.setStatus('Senkron: bağlantı sorunu'); }catch(_){}; }); }, PULL_INTERVAL);
      // First pull asap
      pull().catch(()=>{});
    
      /* ---------- Permission enforcement: wrap existing funcs without breaking UI ---------- */
      function wrap(name, fn){
        const orig = window[name];
        if(typeof orig !== 'function') return;
        window[name] = function(){
          try{ return fn(orig, arguments); }catch(e){ return orig.apply(this, arguments); }
        };
      }
    
      // Upsert Blok: lock + audit + permission
      wrap('upsertBlok', async function(orig, args){
        const rec = args[0] || {};
        const id = String(rec.blokNo || rec.id || '').trim();
        if(!can('edit')){ toast('Yetki yok: düzenleme', 'danger'); return; }
        if(id){
          const lk = await acquireLock('bloklar', id);
          if(!lk.ok){ toast(lk.reason, 'warning'); return; }
          try{
            const out = await orig.apply(this, args);
            await audit('bloklar:save', { blokNo:id });
            return out;
          } finally {
            await releaseLock('bloklar', id);
          }
        }
        return orig.apply(this, args);
      });
    
      // Delete Blok: lock + audit + permission
      wrap('deleteBlok', async function(orig, args){
        const blokNo = args[0];
        const id = String(blokNo||'').trim();
        if(!can('delete')){
          try{ console.warn('deleteBlok denied by can("delete"). blokNo=', id); }catch(_){ }
          // Offer temporary session bypass: ask user to confirm granting 60s delete right
          try{
            if(confirm('Silme yetkiniz yok. Geçici olarak silme yetkisi verilsin mi? (60s)')){
              try{ sessionStorage.setItem('v91_temp_delete_ok','1'); setTimeout(function(){ try{ sessionStorage.removeItem('v91_temp_delete_ok'); }catch(_){ } }, 60*1000); }catch(_){ }
              // retry once
              if(!can('delete')){
                toast('Hala yetki yok: silme', 'danger');
                return false;
              }
            } else {
              // Ask user if they want to force-delete instead
              if(confirm('Yetki verilmedi. Bu bloğu (yedek alınıp) zorla silmek ister misiniz?')){
                try{ const ok = await (typeof forceDeleteBlok==='function' ? forceDeleteBlok(id) : false); return ok; }catch(e){ console.error('forceDelete fallback failed', e); toast('Zorla silme başarısız', 'danger'); return false; }
              }
              toast('Yetki yok: silme', 'danger');
              return false;
            }
          }catch(e){ console.error('delete permission flow error', e); toast('Yetki yok: silme', 'danger'); return false; }
        }
        const lk = await acquireLock('bloklar', id || 'unknown');
        if(!lk.ok){ toast(lk.reason, 'warning'); return false; }
        try{
          const ok = await orig.apply(this, args);
          await audit('bloklar:delete', { blokNo:id, ok: !!ok });
          return ok;
        } finally {
          await releaseLock('bloklar', id || 'unknown');
        }
      });
    
      // Auto prompt on first load: offer to migrate localStorage blocks -> Apps Script (opt-in)
      // This is safe: it asks user confirmation and creates a local backup under __ls_backup_full__ before pushing.
      window.addEventListener('load', async function(){
        try{
          if(typeof window.bulkPushLocalToRemote !== 'function' || typeof window.performFullMigration !== 'function') return;
          // detect existing local block data
          let hasBlocks = false;
          try{
            const raw = localStorage.getItem('bloklar_yeni_demo') || localStorage.getItem('bloklar') || '[]';
            const arr = JSON.parse(raw||'[]');
            hasBlocks = Array.isArray(arr) && arr.length > 0;
          }catch(_){ hasBlocks = false; }

          // if blocks exist and no backup yet, ask user once
          if(hasBlocks && !localStorage.getItem('__ls_backup_full__')){
            try{
              const ok = confirm('Yerelde blok verisi bulundu. Bu veriler merkezi Apps Script\'e taşınsın mı? (Önerilir)');
              if(!ok) return;
              const clearAfter = confirm('Push tamamlandığında localStorage temizlensin mi? (OK = temizle, İptal = koru)');
              const res = await window.performFullMigration({ clearLocalStorage: clearAfter });
              try{ alert('Taşıma sonucu: ' + JSON.stringify(res)); }catch(_){ console.log('migration result', res); }
            }catch(e){ console.error('auto migration failed', e); }
          }
        }catch(e){ console.error('migration prompt error', e); }
      });

      // Generic: if you add other save/delete functions later, reuse the same pattern.
    
      // Notification hook: when login changes, refresh panel labels
      try{
        window.addEventListener('storage', function(ev){
          if(ev && (ev.key==='v91_active_user_id' || ev.key==='v91_users')){
            const u = getActiveUser();
            window.__ensarOfficePanel?.setUser(u.name || u.id, u.role);
            toast('Kullanıcı değişti: ' + (u.name||u.id), 'info');
          }
        });
      }catch(_){}
    
      console.log('✅ Ensar Office FINAL aktif →', SYNC_KEYS.join(', '));
    })();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', runAll);
  else runAll();
})();
