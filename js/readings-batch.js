// Batch Grid for Monthly Readings (Single-well mode) — v5
// - Choose one Well at the top; grid rows are months/dates for that well.
// - Upserts on (well_id, year, month) with Editable+Trigger for abstraction.
// - Deduplicates rows per (well, year-month) to avoid "ON CONFLICT ... cannot affect row a second time".
(function(){
  'use strict';
  console.log('[batch] single-well v5 loaded');

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

  // Toggle elements (Single vs Batch)
  const btnModeSingle = $('btnModeSingle');
  const btnModeBatch  = $('btnModeBatch');
  const readingsSingle = $('readingsSingle');
  const readingsBatch  = $('readingsBatch');

  // Batch elements (single-well)
  const rbWell = $('rbWell');
  const rbAddRow = $('rbAddRow');
  const rbDuplicateLast = $('rbDuplicateLast');
  const rbClear = $('rbClear');
  const rbSaveAll = $('rbSaveAll');
  const rbTbody = $('rbTbody');
  const rbStatus = $('rbStatus');

  const wells = [];
  let rows = [];
  let seq = 1;

  // Wire toggles
  (function wireToggles(){
    if (btnModeSingle && btnModeBatch && readingsSingle && readingsBatch) {
      btnModeSingle.addEventListener('click', () => {
        readingsSingle.style.display = '';
        readingsBatch.style.display = 'none';
        btnModeSingle.classList.add('active');
        btnModeBatch.classList.remove('active');
      });
      btnModeBatch.addEventListener('click', () => {
        readingsSingle.style.display = 'none';
        readingsBatch.style.display = '';
        btnModeBatch.classList.add('active');
        btnModeSingle.classList.remove('active');
      });
    } else {
      console.warn('[batch] Missing toggle containers/ids.');
    }
  })();

  // Bootstrap grid UI (visible even if Supabase not ready)
  bootstrapGrid();

  async function bootstrapGrid(){
    rbAddRow?.addEventListener('click', ()=> addRow());
    rbDuplicateLast?.addEventListener('click', addNextMonthFromLast);
    rbClear?.addEventListener('click', ()=> { rows = []; renderBatch(); setBatchStatus('Cleared.'); });
    rbSaveAll?.addEventListener('click', saveAllBatch);
    rbWell?.addEventListener('change', ()=>{
      rows.forEach(r => r.well_id = rbWell.value || '');
      renderBatch();
    });

    addRow(); // show first row

    await ensureSupabase();
    if (sb) {
      await loadWells();
      if (rbWell && !rbWell.value && wells[0]) {
        rbWell.value = wells[0].well_id;
        rows.forEach(r => r.well_id = rbWell.value);
      }
      renderBatch();
      document.addEventListener('wells:changed', async ()=>{
        await loadWells();
        renderBatch();
      });
    } else {
      console.warn('[batch] Supabase not initialized yet. Grid visible; wells empty.');
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
      if (rbWell) {
        const current = rbWell.value;
        rbWell.innerHTML = wells.map(w => `<option value="${w.well_id}">${esc(w.well_code)}</option>`).join('');
        if (current && wells.some(w=>w.well_id===current)) rbWell.value = current;
      }
      console.log('[batch] wells loaded:', wells.length);
    }catch(e){
      setBatchStatus('Failed to load wells.', true);
      console.error('[batch] loadWells error:', e);
    }
  }

  function addRow(seed){
    const well = rbWell?.value || '';
    const today = toFirstOfMonthISO(seed?.date ?? new Date().toISOString().slice(0,10));
    rows.push({
      rid: seq++,
      well_id: well,
      date: today,
      last: seed?.last ?? '',
      curr: seed?.curr ?? '',
      abs: seed?.abs ?? '',       // if '', save NULL so trigger fills auto
      manualAbs: seed?.manualAbs ?? false,
      static: seed?.static ?? '',
      dynamic: seed?.dynamic ?? '',
      hours: seed?.hours ?? '',
      notes: seed?.notes ?? '',
      err: ''
    });
    renderBatch();
  }

  function addNextMonthFromLast(){
    const last = rows[rows.length - 1];
    if (!last) { addRow(); return; }
    const nextDate = addOneMonthISO(last.date || new Date().toISOString().slice(0,10));
    addRow({
      date: nextDate,
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
    rbTbody.innerHTML = rows.map((r, idx)=>{
      const auto = calcAuto(r.last, r.curr);
      const shown = r.manualAbs ? r.abs : (r.abs !== '' ? r.abs : (auto ?? ''));
      return `<tr class="${r.err?'row-error':''}" data-rid="${r.rid}">
        <td>${idx+1}</td>
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

      tr.querySelector('.date')?.addEventListener('change', e => {
        row.date = toFirstOfMonthISO(e.target.value);
        validateRow(row); updateRowView(tr, row);
      });
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
    if (!rbWell || !rbWell.value) { r.err='Select a well above'; return; }
    if (!r.date) { r.err='Date required'; return; }
    const lOk = r.last==='' || Number.isFinite(Number(r.last));
    const cOk = r.curr==='' || Number.isFinite(Number(r.curr));
    const aOk = r.abs==='' || Number.isFinite(Number(r.abs));
    if (!lOk || !cOk || !aOk) { r.err='Invalid number'; return; }
    if (r.last!=='' && r.curr!=='' && Number(r.curr) < Number(r.last)) { r.err='Current < Last'; return; }
  }

  function updateRowView(tr, row){
    tr.classList.toggle('row-error', !!row.err);
    const statusTd = tr.children[9]; // status column index
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

  function ymKey(iso){
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00Z');
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth()+1).padStart(2,'0');
    return `${y}-${m}`;
  }
  function toFirstOfMonthISO(iso){
    if (!iso) return new Date().toISOString().slice(0,10);
    const d = new Date(iso + 'T00:00:00Z');
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const first = new Date(Date.UTC(y, m, 1));
    return first.toISOString().slice(0,10);
  }
  function addOneMonthISO(iso){
    if (!iso) return toFirstOfMonthISO(new Date().toISOString().slice(0,10));
    const d = new Date(iso + 'T00:00:00Z');
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const next = new Date(Date.UTC(y, m+1, 1));
    return next.toISOString().slice(0,10);
  }

  async function saveAllBatch(){
    if (!sb) { setBatchStatus('Supabase not configured.', true); return; }
    if (!rbWell || !rbWell.value) { setBatchStatus('Select a well.', true); return; }

    setBatchStatus('Saving…');
    rows.forEach(validateRow);
    const bad = rows.filter(r=>r.err);
    if (bad.length){ setBatchStatus(`Fix ${bad.length} row(s).`, true); renderBatch(); return; }

    const well_id = rbWell.value;

    // Deduplicate per month to avoid ON CONFLICT updating same row twice
    const dedup = new Map(); // key: yyyy-mm -> payload
    for (const r of rows){
      const key = ymKey(r.date);
      if (!key) continue;
      // last one wins (so process in natural order; later rows overwrite earlier)
      dedup.set(key, {
        well_id,
        reading_date: toFirstOfMonthISO(r.date),
        meter_last_m3: valNumOrNull(r.last),
        meter_current_m3: valNumOrNull(r.curr),
        monthly_abstraction_m3: r.manualAbs ? valNumOrNull(r.abs) : null,
        static_water_level_m: valNumOrNull(r.static),
        dynamic_water_level_m: valNumOrNull(r.dynamic),
        pumping_hours: valNumOrNull(r.hours),
        notes: (r.notes||'') || null
      });
    }
    const payload = Array.from(dedup.values());
    const collapsed = rows.length - payload.length;
    if (collapsed > 0){
      setBatchStatus(`Saving… (collapsed ${collapsed} duplicate month(s))`);
    }

    try{
      const { error } = await sb.from('monthly_readings')
        .upsert(payload, { onConflict: 'well_id,year,month', ignoreDuplicates: false });

      if (error) throw error;
      setBatchStatus(`Saved ${payload.length} row(s).${collapsed>0?` (${collapsed} duplicates collapsed)`:''}`);
    }catch(e){
      setBatchStatus(`Error: ${e.message}`, true);
      console.error('[batch] saveAll error:', e);
    }
  }

})();
