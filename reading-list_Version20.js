// Monthly Readings: Single Entry (classic) + Batch Entry grid
// - Single Entry: choose well, enter meters/levels/notes; monthly abstraction auto or manual
// - Batch Entry: multiple rows, per-row well selector; Save All upserts on (well_id,year,month)
(function(){
  'use strict';

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
  const sb = (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  const $ = (id) => document.getElementById(id);

  // Mode toggle
  const btnModeSingle = $('btnModeSingle');
  const btnModeBatch  = $('btnModeBatch');
  const readingsSingle = $('readingsSingle');
  const readingsBatch  = $('readingsBatch');

  // Single entry elements
  const singleWell   = $('singleWell');
  const singleDate   = $('singleDate');
  const singleAbs    = $('singleAbs');
  const singleLast   = $('singleLast');
  const singleCurr   = $('singleCurr');
  const singleHours  = $('singleHours');
  const singleStatic = $('singleStatic');
  const singleDynamic= $('singleDynamic');
  const singleNotes  = $('singleNotes');
  const btnSingleSave= $('btnSingleSave');
  const singleStatus = $('singleStatus');

  // Batch elements
  const rbDefaultWell = $('rbDefaultWell');
  const rbAddRow = $('rbAddRow');
  const rbDuplicateLast = $('rbDuplicateLast');
  const rbClear = $('rbClear');
  const rbSaveAll = $('rbSaveAll');
  const rbTbody = $('rbTbody');
  const rbStatus = $('rbStatus');

  // Data
  const wells = [];
  const wellById = new Map();
  let rows = []; // batch rows
  let seq = 1;
  let singleAbsTouched = false;

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  async function init(){
    if (!sb) { setSingleStatus('Supabase not configured (check config.js).', true); return; }

    await loadWells();

    // Default mode: Single entry (classic)
    setMode('single');

    // Single: bindings
    ['input','change'].forEach(evt=>{
      singleLast?.addEventListener(evt, onMetersChange);
      singleCurr?.addEventListener(evt, onMetersChange);
    });
    singleAbs?.addEventListener('input', ()=>{
      const v = String(singleAbs.value || '').trim();
      singleAbsTouched = v !== '';
    });
    btnSingleSave?.addEventListener('click', onSingleSave);
    $('formReadingSingle')?.addEventListener('submit', (e)=>{ e.preventDefault(); onSingleSave(); });

    // Batch: default one row
    addRow();
    rbAddRow?.addEventListener('click', ()=> addRow());
    rbDuplicateLast?.addEventListener('click', duplicateLast);
    rbClear?.addEventListener('click', ()=> { rows=[]; renderBatch(); setBatchStatus('Cleared.'); });
    rbSaveAll?.addEventListener('click', saveAllBatch);

    // Mode switch
    btnModeSingle?.addEventListener('click', ()=> setMode('single'));
    btnModeBatch?.addEventListener('click', ()=> setMode('batch'));
  }

  function setMode(mode){
    const isSingle = mode === 'single';
    readingsSingle.style.display = isSingle ? '' : 'none';
    readingsBatch.style.display  = isSingle ? 'none' : '';
    btnModeSingle?.classList.toggle('active', isSingle);
    btnModeBatch?.classList.toggle('active', !isSingle);
  }

  async function loadWells(){
    try{
      const { data, error } = await sb.from('wells')
        .select('well_id, well_code')
        .order('well_code', { ascending:true })
        .limit(5000);
      if (error) throw error;
      (data||[]).forEach(w => { wells.push(w); wellById.set(String(w.well_id), w); });

      // Populate single well select
      if (singleWell){
        singleWell.innerHTML = (wells||[]).map(w => `<option value="${w.well_id}">${esc(w.well_code)}</option>`).join('');
      }
      // Populate batch default well select
      if (rbDefaultWell){
        rbDefaultWell.innerHTML = (wells||[]).map(w => `<option value="${w.well_id}">${esc(w.well_code)}</option>`).join('');
      }
    }catch(e){
      setSingleStatus('Failed to load wells list.', true);
      setBatchStatus('Failed to load wells list.', true);
    }
  }

  // Single entry helpers
  function onMetersChange(){
    if (singleAbsTouched) return; // user overrides
    const l = Number(singleLast.value);
    const c = Number(singleCurr.value);
    if (Number.isFinite(l) && Number.isFinite(c)) {
      singleAbs.value = String(c - l);
    } else {
      singleAbs.value = '';
    }
  }

  async function onSingleSave(){
    setSingleStatus('Saving…');

    const payload = {
      well_id: singleWell?.value || '',
      reading_date: singleDate?.value || '',
      meter_last_m3: valNumOrNull(singleLast?.value),
      meter_current_m3: valNumOrNull(singleCurr?.value),
      static_water_level_m: valNumOrNull(singleStatic?.value),
      dynamic_water_level_m: valNumOrNull(singleDynamic?.value),
      pumping_hours: valNumOrNull(singleHours?.value),
      notes: (singleNotes?.value || '') || null
    };

    if (!payload.well_id) { setSingleStatus('Select a well.', true); return; }
    if (!payload.reading_date) { setSingleStatus('Select a date.', true); return; }
    // DB constraint
    if (isFiniteNum(payload.meter_last_m3) && isFiniteNum(payload.meter_current_m3) && payload.meter_current_m3 < payload.meter_last_m3) {
      setSingleStatus('Meter current is less than last (DB constraint).', true);
      return;
    }

    const manualAbs = (String(singleAbs?.value || '').trim() !== '') ? Number(singleAbs.value) : null;

    // Try with manual abstraction if provided; on failure retry without it (warn)
    let errorMsg = null;
    let warnedManual = false;

    try {
      const withAbs = manualAbs!=null
        ? { ...payload, monthly_abstraction_m3: manualAbs }
        : { ...payload, monthly_abstraction_m3: null }; // null lets trigger (if installed) fill from meters
      const { error } = await sb.from('monthly_readings')
        .upsert(withAbs, { onConflict: 'well_id,year,month', ignoreDuplicates: false });
      if (error) {
        // Retry without manual field if DB rejects writing to generated column
        if (manualAbs!=null && /generated|cannot insert|immutable column/i.test(error.message || '')) {
          const { error: e2 } = await sb.from('monthly_readings')
            .upsert(payload, { onConflict: 'well_id,year,month', ignoreDuplicates: false });
          if (e2) throw e2;
          warnedManual = true;
        } else {
          throw error;
        }
      }
    } catch(e){
      errorMsg = e.message || String(e);
    }

    if (errorMsg){
      setSingleStatus(`Error: ${errorMsg}`, true);
      return;
    }

    if (warnedManual) {
      setSingleStatus('Saved (DB ignored manual abstraction; apply the migration to allow manual values).');
    } else {
      setSingleStatus('Saved.');
    }
  }

  function setSingleStatus(msg, isErr){
    if (!singleStatus) return;
    singleStatus.textContent = msg;
    singleStatus.style.color = isErr ? '#ef4444' : '';
  }

  // Batch entry grid
  function addRow(seed){
    const defWell = rbDefaultWell?.value || (wells[0]?.well_id || '');
    const today = new Date().toISOString().slice(0,10);
    rows.push({
      rid: seq++,
      well_id: seed?.well_id ?? defWell,
      date: seed?.date ?? today,
      last: seed?.last ?? '',
      curr: seed?.curr ?? '',
      abs: seed?.abs ?? '',      // manual if set
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
    const last = rows[rows.length-1];
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
    rbTbody.innerHTML = rows.map((r, idx)=>{
      const wOpts = wells.map(w => `<option value="${w.well_id}" ${String(r.well_id)===String(w.well_id)?'selected':''}>${esc(w.well_code)}</option>`).join('');
      const auto = calcAuto(r.last, r.curr);
      const absShown = r.manualAbs ? r.abs : (r.abs!=='' ? r.abs : (auto ?? ''));
      return `<tr class="${r.err?'row-error':''}" data-rid="${r.rid}">
        <td>${idx+1}</td>
        <td><select class="inp well">${wOpts}</select></td>
        <td><input type="date" class="inp date" value="${esc(r.date||'')}"/></td>
        <td><input type="number" step="any" class="inp last" value="${esc(r.last)}"/></td>
        <td><input type="number" step="any" class="inp curr" value="${esc(r.curr)}"/></td>
        <td>
          <input type="number" step="any" class="inp abs" value="${esc(absShown)}" placeholder="${auto ?? ''}" ${r.manualAbs?'':'data-auto="1'} />
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

  function updateRowView(tr, row){
    const statusTd = tr.children[10];
    if (statusTd) statusTd.innerHTML = row.err ? `<span class="badge badge-err">${esc(row.err)}</span>` : `<span class="badge badge-ok">OK</span>`;
    tr.classList.toggle('row-error', !!row.err);
    const absEl = tr.querySelector('.abs');
    const hint = tr.querySelector('.hint');
    if (absEl && !row.manualAbs) absEl.placeholder = (calcAuto(row.last,row.curr) ?? '').toString();
    if (hint) hint.textContent = row.manualAbs ? 'manual' : 'auto';
  }

  function validateRow(r){
    r.err = '';
    if (!r.well_id) { r.err='Well required'; return; }
    if (!r.date) { r.err='Date required'; return; }
    // numeric validity
    const lOk = r.last==='' || Number.isFinite(Number(r.last));
    const cOk = r.curr==='' || Number.isFinite(Number(r.curr));
    const aOk = r.abs==='' || Number.isFinite(Number(r.abs));
    if (!lOk || !cOk || !aOk) { r.err='Invalid number'; return; }
    // DB constraint
    if (r.last!=='' && r.curr!=='' && Number(r.curr) < Number(r.last)) { r.err='Current < Last'; return; }
  }

  async function saveAllBatch(){
    setBatchStatus('Saving…');
    rows.forEach(validateRow);
    const bad = rows.filter(r=>r.err);
    if (bad.length){ setBatchStatus(`Fix ${bad.length} row(s).`, true); renderBatch(); return; }

    // Build payload
    const payload = rows.map(r => {
      return {
        well_id: r.well_id,
        reading_date: r.date,
        meter_last_m3: valNumOrNull(r.last),
        meter_current_m3: valNumOrNull(r.curr),
        monthly_abstraction_m3: r.manualAbs ? valNumOrNull(r.abs) : null,
        static_water_level_m: valNumOrNull(r.static),
        dynamic_water_level_m: valNumOrNull(r.dynamic),
        pumping_hours: valNumOrNull(r.hours),
        notes: (r.notes||'') || null
      };
    });

    // Try bulk upsert
    let bulkErr = null, warnedManual = false;
    try{
      const { error } = await sb.from('monthly_readings')
        .upsert(payload, { onConflict: 'well_id,year,month', ignoreDuplicates: false });
      if (error) {
        // If DB rejects writing to monthly_abstraction_m3 (generated), retry without the field
        if (/generated|cannot insert|immutable column/i.test(error.message||'')) {
          warnedManual = true;
          const payloadNoAbs = payload.map(p => {
            const { monthly_abstraction_m3, ...rest } = p;
            return rest;
          });
          const { error: e2 } = await sb.from('monthly_readings')
            .upsert(payloadNoAbs, { onConflict: 'well_id,year,month', ignoreDuplicates: false });
          if (e2) throw e2;
        } else {
          throw error;
        }
      }
    }catch(e){
      bulkErr = e;
    }

    if (bulkErr){
      setBatchStatus(`Error: ${bulkErr.message}`, true);
      return;
    }

    setBatchStatus(warnedManual ? 'Saved (manual abstraction ignored by DB; apply migration to allow manual values).' : `Saved ${payload.length} row(s).`);
  }

  // Utilities
  function calcAuto(last, curr){
    const l = Number(last), c = Number(curr);
    if (!Number.isFinite(l) || !Number.isFinite(c)) return null;
    return c - l;
  }
  function valNumOrNull(v){
    if (v===undefined || v===null) return null;
    const s = String(v).trim();
    if (s==='') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function isFiniteNum(n){ return typeof n==='number' && Number.isFinite(n); }
  function setBatchStatus(msg, err){
    if (!rbStatus) return;
    rbStatus.textContent = msg;
    rbStatus.style.color = err ? '#ef4444' : '';
  }
  function esc(s){ return (s ?? '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

})();
