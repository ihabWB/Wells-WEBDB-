// Readings List tab: lists readings with filters; default loads ALL readings
(function(){
  'use strict';

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
  const sb = (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  const $ = (id) => document.getElementById(id);
  const rlWells = $('rlWells');
  const rlFrom = $('rlFrom');
  const rlTo = $('rlTo');
  const btnRLLoad = $('btnRLLoad');
  const btnRLCsv = $('btnRLCsv');
  const tblRL = $('tblRL');
  const rlSummary = $('rlSummary');

  const esc = (s) => (s ?? '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtNum = (n) => Number.isFinite(+n) ? (Math.round(+n*100)/100).toLocaleString() : '';
  const getVals = (sel) => Array.from((sel?.selectedOptions||[])).map(o => o.value).filter(Boolean);

  document.addEventListener('DOMContentLoaded', init);

  async function init(){
    if (!sb) return;
    await loadWells();
    // Optional: prefill last 6 months; leave blank to show ALL
    // const d=new Date(); const yyyy=d.getFullYear(), mm=String(d.getMonth()+1).padStart(2,'0');
    // rlTo.value = `${yyyy}-${mm}-${String(d.getDate()).padStart(2,'0')}`;
    // const f=new Date(d); f.setMonth(f.getMonth()-5); rlFrom.value=f.toISOString().slice(0,10);

    btnRLLoad?.addEventListener('click', loadReadings);
    btnRLCsv?.addEventListener('click', () => exportTableCSV('readings_list.csv'));

    // Load ALL readings by default
    loadReadings().catch(()=>{});
  }

  async function loadWells(){
    const { data, error } = await sb
      .from('wells')
      .select('well_id, well_code, well_name')
      .order('well_code', { ascending:true })
      .limit(5000);
    if (error) { console.warn('wells error', error.message); return; }
    rlWells.innerHTML = (data||[]).map(w =>
      `<option value="${w.well_id}">${esc(w.well_code)}${w.well_name ? ' - ' + esc(w.well_name) : ''}</option>`
    ).join('');
  }

  async function loadReadings(){
    let q = sb.from('monthly_readings')
      .select('well_id, reading_date, meter_last_m3, meter_current_m3, static_water_level_m, dynamic_water_level_m, pumping_hours, notes, wells!inner(well_code)')
      .order('well_id', { ascending:true })
      .order('reading_date', { ascending:true })
      .limit(50000);

    const ids = getVals(rlWells);
    if (ids.length) q = q.in('well_id', ids);
    if (rlFrom?.value) q = q.gte('reading_date', rlFrom.value);
    if (rlTo?.value) q = q.lte('reading_date', rlTo.value);

    const { data, error } = await q;
    if (error) { console.warn('readings error', error.message); return; }

    let total = 0, count = 0;
    tblRL.innerHTML = (data||[]).map(r => {
      const last = +r.meter_last_m3 || 0;
      const curr = +r.meter_current_m3 || 0;
      const diff = curr - last;
      if (Number.isFinite(diff)) total += diff;
      count++;
      const code = r.wells?.well_code || '';
      return `
        <tr>
          <td>${esc(code)}</td>
          <td>${esc(String(r.reading_date).slice(0,10))}</td>
          <td>${fmtNum(r.meter_last_m3)}</td>
          <td>${fmtNum(r.meter_current_m3)}</td>
          <td>${fmtNum(diff)}</td>
          <td>${fmtNum(r.static_water_level_m)}</td>
          <td>${fmtNum(r.dynamic_water_level_m)}</td>
          <td>${fmtNum(r.pumping_hours)}</td>
          <td>${esc(r.notes||'')}</td>
        </tr>
      `;
    }).join('');

    rlSummary.textContent = `Records: ${count} • Total abstraction: ${fmtNum(total)} m³`;
  }

  function exportTableCSV(filename){
    const table = tblRL?.closest('table'); if (!table) return;
    const rows = Array.from(table.querySelectorAll('tr'));
    const csv = rows.map(tr => Array.from(tr.children).map(td => {
      const t = td.textContent.replace(/\s+/g,' ').trim();
      return t.includes(',') || t.includes('"') ? `"${t.replace(/"/g,'""')}"` : t;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  }

})();