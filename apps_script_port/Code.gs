/*
  Minimal Apps Script backend for Ensar Mermer — MVP
  - Stores records in ScriptProperties under key ENSAR_RECORDS (small datasets only)
  - Provides API via doGet/doPost and server-side functions usable from HtmlService via google.script.run
  - NOTE: For larger datasets switch to Spreadsheet or Drive-based storage.
*/

// Support multiple named collections. If no collection provided, fallback to ENSAR_RECORDS.
function _buildKey(collection){
  if(!collection) return 'ENSAR_RECORDS';
  return 'ENSAR_' + String(collection).toUpperCase();
}

function getRecordsRaw(collection){
  var key = _buildKey(collection);
  var p = PropertiesService.getScriptProperties().getProperty(key);
  if(!p) return [];
  try{ return JSON.parse(p); }catch(e){ return []; }
}

function saveRecords(arr, collection){
  var key = _buildKey(collection);
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(arr||[]));
}

function listRecords(collection){
  return getRecordsRaw(collection);
}

function upsertRecord(record, collection){
  var arr = getRecordsRaw(collection);
  if(!record) return {ok:false, error:'missing record'};
  if(!record.id) record.id = Utilities.getUuid();
  var idx = arr.findIndex(function(r){ return r.id === record.id; });
  if(idx >= 0){ arr[idx] = record; }
  else { arr.unshift(record); }
  saveRecords(arr, collection);
  return {ok:true, action:'upsert', id: record.id};
}

function deleteRecord(id, collection){
  if(!id) return {ok:false, error:'missing id'};
  var arr = getRecordsRaw(collection);
  var before = arr.length;
  arr = arr.filter(function(r){ return r.id !== id; });
  saveRecords(arr, collection);
  return {ok:true, action:'delete', deleted: (before - arr.length)};
}

// Generic HTTP GET API
function doGet(e){
  try{
    if(e && e.parameter && e.parameter.action){
      var action = e.parameter.action.toLowerCase();
      var coll = e.parameter.collection || null;
      if(action === 'list'){
        return ContentService.createTextOutput(JSON.stringify({ok:true, action:'list', data: listRecords(coll)})).setMimeType(ContentService.MimeType.JSON);
      }
      if(action === 'get' && e.parameter.id){
        var rec = listRecords(coll).find(function(r){ return r.id === e.parameter.id; });
        return ContentService.createTextOutput(JSON.stringify({ok:true, action:'get', data: rec || null})).setMimeType(ContentService.MimeType.JSON);
      }
    }
    // otherwise serve the UI
    return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('Ensar Mermer');
  }catch(err){
    return ContentService.createTextOutput(JSON.stringify({ok:false, error: String(err)})).setMimeType(ContentService.MimeType.JSON);
  }
}

// Generic HTTP POST API (expects JSON body with {action: 'upsert'|'delete', record/id})
function doPost(e){
  try{
    var body = {};
    if(e.postData && e.postData.contents){
      body = JSON.parse(e.postData.contents || '{}');
    }
    var action = (body.action || '').toLowerCase();
    var coll = body.collection || null;
    if(action === 'upsert'){
      var rec = body.record || body;
      var res = upsertRecord(rec, coll);
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }
    if(action === 'delete'){
      var id = body.id;
      var res = deleteRecord(id, coll);
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ok:false, error:'unknown action'})).setMimeType(ContentService.MimeType.JSON);
  }catch(err){
    return ContentService.createTextOutput(JSON.stringify({ok:false, error: String(err)})).setMimeType(ContentService.MimeType.JSON);
  }
}

// Utility: clear all records (for testing) — use with care
function _clearAllRecords(){
  saveRecords([]);
  return {ok:true};
}