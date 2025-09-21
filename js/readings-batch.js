// Batch Grid for Monthly Readings (Editable + Trigger mode)
// Resilient: wires toggles and shows the grid regardless of Supabase status.
(function(){
  'use strict';
  console.log('[batch] script loaded v3');

  function getSb(){
    if (window.$sb) return window.$sb;
    if (window.APP_CONFIG && window.supabase) {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        window.$sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return window.$sb;
      }
    }
    return null;
  }
  let sb = getSb();

  const $ = (id) => document.getElementById(id);

  // Toggle elements
  const btnModeSingle = $('btnModeSingle');
  const btnModeBatch  = $('btnModeBatch');
  const readingsSingle = $('readingsSingle');
  const readingsBatch  = $('readingsBatch');

  // Batch elements
  const rbDefaultWell = $('rbDefaultWell');
  const rbAddRow = $('rbAddRow');
  const rbDuplicateLast = $('rbDuplicateLast');
  const rbClear = $('rbClear');
  const rbSaveAll = $('rbSaveAll');
  const rbTbody = $('rbTbody');
  const rbStatus = $('rbStatus');

  const wells = [];
  let rows = [];
  let seq = 1;

  // Wire toggles immediately
  (function wireToggles(){
    if (btnModeSingle && btnModeBatch && readingsSingle && readingsBatch) {
      btnModeSingle.addEventListener('click', () => {
        readingsSingle.style.display = '';
        readingsBatch.style.display = 'none';
        btnModeSingle.classList.add('active');
        btnModeBatch.classList.remove('active');
        console.log('[batch] switched to Single Entry');
      });
      btnModeBatch.addEventListener('click', () => {
        readingsSingle.style.display = 'none';
        readingsBatch.style.display = '';
        btnModeBatch.classList.add('active');
        btnModeSingle.classList.remove('active');
        console.log('[batch] switched to Batch Entry');
      });
      console.log('[batch] toggles wired');
    } else {
      console.warn('[batch] Missing toggle elements. Need ids: btnModeSingle, btnModeBatch, readingsSingle, readingsBatch');
    }
  })();

  // Bootstrap grid UI immediately (so you can see it even if Supabase isn’t ready)
  bootstrapGrid();

  async function bootstrapGrid(){
    // Buttons
    rbAddRow?.addEventListener('click', ()=> addRow());
    rbDuplicateLast?.addEventListener('click', duplicateLast);
    rbClear?.addEventListener('click', ()=> { rows = []; renderBatch(); setBatchStatus('Cleared.'); });
    rbSaveAll?.addEventListener('click', saveAllBatch);

    // Show first row
    addRow();

    // Try to ensure Supabase later (don’t block the UI)
    await ensureSupabase();
    if (sb) {
      await loadWells();
      renderBatch();
      document.addEventListener('wells:changed', async ()=>{
        await loadWells();
        renderBatch();
      });
      console.log('[batch] bootstrap complete with wells:', wells.length);
    } else {
      console.warn('[batch] Supabase not initialized yet (APP_CONFIG or supabase-js missing?). Grid visible without wells.');
    }
  }

  async function ensureSupabase(){
    if (sb) return;
    await new Promise(r=>setTimeout(r, 0));
    sb = getSb();
  }

  async function loadWells(){
    try{
      const { data, error } = await sb.from('wells')
        .select('well_id, well_code')
        .order('well_code',{ascending:true})
        .limit(5000);
      if (error) throw error;
      wells.length = 0;
      (data||[]).forEach(w => wells.push(w));
      if (rbDefaultWell) {
        rbDefaultWell.innerHTML = wells.map(w => `<option value="${w.well_id}">${esc(w.well_code)}</option>`).join('');
      }
      console.log('[batch] wells loaded:', wells.length);
    }catch(e){
      setBatchStatus('Failed to load wells list.', true);
      console.error('[batch] loadWells error:', e);
    }
  }

  function addRow(seed){
    const defWell = rbDefaultWell?.value || (wells[0]?.well_id || '');
    const today = new Date().toISOString().slice(0,10);
    rows.push({
      rid: seq++,
      well_id: seed?.well_id ?? defWell,
      date: seed?.date ?? today,
      last: seed?.last ?? '',
      curr: seed?.curr ?? '',
      abs: seed?.abs ?? '',
      manualAbs: seed?.manualAbs ?? false,
      static: seed?.static ?? '',
      dynamic: seed?.dynamic ?? '',
      hours: seed?.hours ?? '',
      notes: seed?.notes ?? '',
      err: ''
    });
    renderBatch();
  }

  function duplicateLast(){
    const last = rows[rows.length - 1];
    if (!last) { addRow(); return; }
    addRow({
      well_id: last.well_id,
      date: last.date,
      last: last.curr || last.last,
      curr: '',
      abs: '',
      manualAbs: false,
      static: '',
      dynamic: '',
      hours: '',
      notes: ''
    });
  }

  function renderBatch(){
    if (!rbTbody) { console.warn('[batch] rbTbody not found'); return; }
    const wOpts = wells.map(w => `<option value="${w.well_id}">${esc(w.well_code)}</option>`).join('');
    rbTbody.innerHTML = rows.map((r, idx)=>{
      const auto = calcAuto(r.last, r.curr);
      const shown = r.manualAbs ? r.abs : (r.abs !== '' ? r.abs : (auto ?? ''));
      return `<tr class="${r.err?'row-error':''}" data-rid="${r.rid}">
        <td>${idx+1}</td>
        <td><select class="inp well">${wOpts.replace(\`value=\"${r.well_id}\"\`, \`value=\"${r.well_id}\" selected\`)}</select></td>
        <td><input type="date" class="inp date" value="${esc(r.date||'')}"/></td>
        <td><input type="number" step="any" class="inp last" value="${esc(r.last)}"/></td>
        <td><input type="number" step="any" class="inp curr" value="${esc(r.curr)}"/></td>
        <td>
          <input type="number" step="any" class="inp abs" value="${esc(shown)}" placeholder="${auto ?? ''}" ${r.manualAbs?'':'data-auto="1'} />
          <small class="hint">${r.manualAbs?'manual':'auto'}</small>
        </td>
        <td><input type="number" step="any" class="inp static" value="${esc(r.static)}"/></td>
        <td><input type="number" step="any" class="inp dynamic" value="${esc(r.dynamic)}"/></td>
        <td><input type="number" step="any" class="inp hours" value="${esc(r.hours)}"/></td>
        <td><input class="inp notes" value="${esc(r.notes)}"/></td>
        <td>${r.err ? `<span class="badge badge-err">${esc(r.err)}</span>` : `<span class="badge badge-ok">OK</span>`}</td>
        <td><button type="button" class="btnRowDel">✕</button></td>
      </tr>`;
    }).join('');

    rbTbody.querySelectorAll('tr').forEach(tr=>{
      const rid = Number(tr.getAttribute('data-rid'));
      const row = rows.find(x=>x.rid===rid); if (!row) return;

      tr.querySelector('.well')?.addEventListener('change', e => { row.well_id = e.target.value; validateRow(row); updateRowView(tr, row); });
      tr.querySelector('.date')?.addEventListener('change', e => { row.date = e.target.value; validateRow(row); updateRowView(tr, row); });
      tr.querySelector('.last')?.addEventListener('input', e => { row.last = e.target.value; if(!row.manualAbs) row.abs=''; validateRow(row); updateRowView(tr, row); });
      tr.querySelector('.curr')?.addEventListener('input', e => { row.curr = e.target.value; if(!row.manualAbs) row.abs=''; validateRow(row); updateRowView(tr, row); });
      tr.querySelector('.abs')?.addEventListener('input', e => { row.abs = e.target.value; row.manualAbs = String(e.target.value).trim() !== ''; validateRow(row); updateRowView(tr, row); });
      tr.querySelector('.static')?.addEventListener('input', e => { row.static = e.target.value; });
      tr.querySelector('.dynamic')?.addEventListener('input', e => { row.dynamic = e.target.value; });
      tr.querySelector('.hours')?.addEventListener('input', e => { row.hours = e.target.value; });
      tr.querySelector('.notes')?.addEventListener('input', e => { row.notes = e.target.value; });
      tr.querySelector('.btnRowDel')?.addEventListener('click', ()=> { rows = rows.filter(x=>x.rid!==rid); renderBatch(); });

      validateRow(row); updateRowView(tr, row);
    });
  }

  function validateRow(r){
    r.err = '';
    if (!r.well_id) { r.err='Well required'; return; }
    if (!r.date) { r.err='Date required'; return; }
    const lOk = r.last==='' || Number.isFinite(Number(r.last));
    const cOk = r.curr==='' || Number.isFinite(Number(r.curr));
    const aOk = r.abs==='' || Number.isFinite(Number(r.abs));
    if (!lOk || !cOk || !aOk) { r.err='Invalid number'; return; }
    if (r.last!=='' && r.curr!=='' && Number(r.curr) < Number(r.last)) { r.err='Current < Last'; return; }
  }

  function updateRowView(tr, row){
    tr.classList.toggle('row-error', !!row.err);
    const statusTd = tr.children[10];
    if (statusTd) statusTd.innerHTML = row.err ? `<span class="badge badge-err">${esc(row.err)}</span>` : `<span class="badge badge-ok">OK</span>`;
    const absEl = tr.querySelector('.abs');
    if (absEl && !row.manualAbs) absEl.placeholder = (calcAuto(row.last,row.curr) ?? '').toString();
    const hint = tr.querySelector('.hint');
    if (hint) hint.textContent = row.manualAbs ? 'manual' : 'auto';
  }

  function calcAuto(last, curr){
    const l = Number(last), c = Number(curr);
    if (!Number.isFinite(l) || !Number.isFinite(c)) return null;
    return c - l;
  }
  function valNumOrNull(v){
    const s = String(v ?? '').trim();
    if (s==='') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function setBatchStatus(msg, err){
    if (!rbStatus) return;
    rbStatus.textContent = msg;
    rbStatus.style.color = err ? '#ef4444' : '';
  }
  function esc(s){ return (s ?? '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  async function saveAllBatch(){
    if (!sb) { setBatchStatus('Supabase not configured.', true); return; }
    setBatchStatus('Saving…');
    rows.forEach(validateRow);
    const bad = rows.filter(r=>r.err);
    if (bad.length){ setBatchStatus(`Fix ${bad.length} row(s).`, true); renderBatch(); return; }

    const payload = rows.map(r => ({
      well_id: r.well_id,
      reading_date: r.date,
      meter_last_m3: valNumOrNull(r.last),
      meter_current_m3: valNumOrNull(r.curr),
      monthly_abstraction_m3: r.manualAbs ? valNumOrNull(r.abs) : null,
      static_water_level_m: valNumOrNull(r.static),
      dynamic_water_level_m: valNumOrNull(r.dynamic),
      pumping_hours: valNumOrNull(r.hours),
      notes: (r.notes||'') || null
    }));

    try{
      const { error } = await sb.from('monthly_readings')
        .upsert(payload, { onConflict: 'well_id,year,month', ignoreDuplicates: false });
      if (error) throw error;
      setBatchStatus(`Saved ${payload.length} row(s).`);
    }catch(e){
      setBatchStatus(`Error: ${e.message}`, true);
      console.error('[batch] saveAll error:', e);
    }
  }

})();
