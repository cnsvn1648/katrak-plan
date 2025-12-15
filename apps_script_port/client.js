// Minimal client for Apps Script HTML Service using google.script.run
(function(){
  function el(id){ return document.getElementById(id); }
  function render(list){
    const wrap = el('list');
    wrap.innerHTML = '';
    if(!list || list.length===0){ wrap.textContent = 'Henüz kayıt yok.'; return; }
    const ul = document.createElement('div');
    ul.className = 'record-list';
    list.forEach(r=>{
      const row = document.createElement('div'); row.className='record';
      const title = document.createElement('div'); title.className='r-title'; title.textContent = (r.ad||'') + ' — ' + (r.grup||'');
      const sub = document.createElement('div'); sub.className='r-sub'; sub.textContent = (r.alt||'') + ' · ' + (r.aciklama||'');
      const actions = document.createElement('div'); actions.className='r-actions';
      const btnEdit = document.createElement('button'); btnEdit.textContent='Düzenle'; btnEdit.addEventListener('click', function(){ loadToForm(r); });
      const btnDel = document.createElement('button'); btnDel.textContent='Sil'; btnDel.className='danger'; btnDel.addEventListener('click', function(){ if(!confirm('Silinsin mi?')) return; google.script.run.withSuccessHandler(refresh).deleteRecord(r.id); });
      actions.appendChild(btnEdit); actions.appendChild(btnDel);
      row.appendChild(title); row.appendChild(sub); row.appendChild(actions);
      ul.appendChild(row);
    });
    wrap.appendChild(ul);
  }

  function refresh(){
    google.script.run.withSuccessHandler(render).listRecords();
  }

  function loadToForm(rec){
    el('recId').value = rec.id || '';
    el('fieldGrup').value = rec.grup || '';
    el('fieldAlt').value = rec.alt || '';
    el('fieldAd').value = rec.ad || '';
    el('fieldAc').value = rec.aciklama || '';
  }

  function clearForm(){
    el('recId').value=''; el('fieldGrup').value=''; el('fieldAlt').value=''; el('fieldAd').value=''; el('fieldAc').value='';
  }

  function save(){
    const rec = {
      id: el('recId').value || undefined,
      grup: el('fieldGrup').value || '',
      alt: el('fieldAlt').value || '',
      ad: el('fieldAd').value || '',
      aciklama: el('fieldAc').value || ''
    };
    google.script.run.withSuccessHandler(function(res){
      if(res && res.ok){ clearForm(); refresh(); }
      else alert('Kayıt sırasında hata: ' + (res && res.error));
    }).upsertRecord(rec);
  }

  document.addEventListener('DOMContentLoaded', function(){
    el('saveBtn').addEventListener('click', save);
    el('cancelBtn').addEventListener('click', clearForm);
    refresh();
  });
})();