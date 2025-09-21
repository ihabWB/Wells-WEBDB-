// Readings List (same UX as Wells List): text filter + Refresh, shows all by default (newest first)
(function () {
  'use strict';

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
  const sb = (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  const $ = (id) => document.getElementById(id);
  const rlFilterText = $('rlFilterText');
  const btnRLRefresh = $('btnRLRefresh');
  const tblReadings = $('tblReadings');
  const rlStatus = $('rlStatus');

  // Cache for client-side filtering
  let readingsCache = [];
  const wellsMap = new Map(); // well_id -> {well_code, governorate, district}

  document.addEventListener('DOMContentLoaded', init);

  async function init(){
    if (!sb) return;

    // Load wells metadata once (used to label readings and for filter text)
    await preloadWells();

    // Bind UI
    btnRLRefresh?.addEventListener('click', loadAndRender);
    rlFilterText?.addEventListener('input', () => render(readingsCache, rlFilterText.value));

    // Load all readings initially
    await loadAndRender();
  }

  async function preloadWells(){
    try{
      const { data, error } = await sb.from('wells')
        .select('well_id, well_code, governorate, district')
        .order('well_code', { ascending:true })
        .limit(5000);
      if (error) throw error;
      (data||[]).forEach(w => wellsMap.set(String(w.well_id), {
        well_code: w.well_code || '',
        governorate: w.governorate || '',
        district: w.district || ''
      }));
    }catch(e){
      console.warn('Failed to load wells for labels:', e.message);
    }
  }

  async function loadAndRender(){
    setStatus('Loading…');
    try{
      // Read everything newest first, no join (robust with RLS). Limit can be adjusted.
      const { data, error } = await sb.from('monthly_readings')
        .select('well_id, reading_date, meter_last_m3, meter_current_m3, static_water_level_m, dynamic_water_level_m, pumping_hours, notes')
        .order('reading_date', { ascending:false })
        .order('well_id', { ascending:true })
        .limit(20000);
      if (error) throw error;

      readingsCache = data || [];
      render(readingsCache, rlFilterText?.value || '');
      setStatus(`Loaded ${readingsCache.length} readings`);
    }catch(e){
      console.error('Readings load error:', e);
      readingsCache = [];
      render([], '');
      setStatus(`Error: ${e.message}`, true);
    }
  }

  function render(rows, filterText){
    const q = (filterText || '').toLowerCase().trim();
    const out = [];
    let shown = 0;

    for (const r of rows){
      const meta = wellsMap.get(String(r.well_id)) || {};
      const code = meta.well_code || '';
      const gov = meta.governorate || '';
      const dist = meta.district || '';
      const date = (r.reading_date ? String(r.reading_date).slice(0,10) : '');
      const last = +r.meter_last_m3 || 0;
      const curr = +r.meter_current_m3 || 0;
      const diff = curr - last;
      const notes = r.notes || '';

      // Simple text filter (same spirit as Wells List)
      const hay = `${code} ${gov} ${dist} ${date} ${notes} ${last} ${curr} ${diff}`.toLowerCase();
      if (q && !hay.includes(q)) continue;

      out.push(`<tr>
        <td>${esc(code)}</td>
        <td>${esc(gov)}</td>
        <td>${esc(dist)}</td>
        <td>${esc(date)}</td>
        <td>${fmtNum(last)}</td>
        <td>${fmtNum(curr)}</td>
        <td>${fmtNum(diff)}</td>
        <td>${fmtNum(r.static_water_level_m)}</td>
        <td>${fmtNum(r.dynamic_water_level_m)}</td>
        <td>${fmtNum(r.pumping_hours)}</td>
        <td>${esc(notes)}</td>
      </tr>`);
      shown++;
    }

    tblReadings.innerHTML = out.join('');
    if (shown === 0) setStatus('No readings match the current filter.');
    else setStatus(`Showing ${shown} of ${rows.length} readings`);
  }

  function setStatus(text, isError=false){
    if (!rlStatus) return;
    rlStatus.textContent = text;
    rlStatus.style.color = isError ? '#ef4444' : '';
  }

  // Utils
  function esc(s){ return (s ?? '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtNum(n){ return Number.isFinite(+n) ? (Math.round(+n*100)/100).toLocaleString() : ''; }

})();
