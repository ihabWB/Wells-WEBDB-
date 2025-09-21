// Readings List tab: normal list of readings with optional filters by Year, Month, Well, Governorate.
// Loads ALL readings by default (newest first).
(function(){
  'use strict';

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
  const sb = (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  const $ = (id) => document.getElementById(id);
  const rlGov = $('rlGov');
  const rlWell = $('rlWell');
  const rlYear = $('rlYear');
  const rlMonth = $('rlMonth');
  const btnRLLoad = $('btnRLLoad');
  const btnRLCsv = $('btnRLCsv');
  const tblRL = $('tblRL');
  const rlSummary = $('rlSummary');

  const esc = (s) => (s ?? '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtNum = (n) => Number.isFinite(+n) ? (Math.round(+n*100)/100).toLocaleString() : '';

  document.addEventListener('DOMContentLoaded', init);

  async function init(){
    if (!sb) return;
    await populateWells();
    populateYears();

    btnRLLoad?.addEventListener('click', loadReadings);
    btnRLCsv?.addEventListener('click', () => exportTableCSV('readings_list.csv'));

    // Load all readings by default
    loadReadings().catch(()=>{});
  }

  async function populateWells(){
    const { data, error } = await sb
      .from('wells')
      .select('well_id, well_code, well_name')
      .order('well_code', { ascending:true })
      .limit(5000);
    if (error) { console.warn('wells error', error.message); return; }
    rlWell.innerHTML = '<option value="">All Wells</option>' + (data||[]).map(w =>
      `<option value="${w.well_id}">${esc(w.well_code)}${w.well_name ? ' - ' + esc(w.well_name) : ''}</option>`
    ).join('');
  }

  function populateYears(){
    // Simple range: current year down to 2000 (adjust if needed)
    const nowY = new Date().getFullYear();
    const startY = 2000;
    rlYear.innerHTML = '<option value="">All Years</option>' +
      Array.from({length: (nowY - startY + 1)}, (_,i) => nowY - i)
        .map(y => `<option value="${y}">${y}</option>`).join('');
  }

  function monthEnd(y, m){ // m as "01".."12"
    const last = new Date(y, parseInt(m,10), 0).getDate();
    return `${y}-${m}-${String(last).padStart(2,'0')}`;
  }

  async function loadReadings(){
    let q = sb.from('monthly_readings')
      .select('well_id, reading_date, meter_last_m3, meter_current_m3, static_water_level_m, dynamic_water_level_m, pumping_hours, notes, wells!inner(well_code, governorate, district)')
      .order('reading_date', { ascending:false }) // newest first
      .order('well_id', { ascending:true })
      .limit(50000);

    // Filters
    const gov = rlGov?.value || '';
    const wellId = rlWell?.value || '';
    const year = rlYear?.value || '';
    const month = rlMonth?.value || '';

    if (wellId) q = q.eq('well_id', wellId);
    if (gov) q = q.eq('wells.governorate', gov);

    // Date range: if year and month: that specific month; if only year: full year
    if (year && month) {
      q = q.gte('reading_date', `${year}-${month}-01`).lte('reading_date', monthEnd(year, month));
    } else if (year) {
      q = q.gte('reading_date', `${year}-01-01`).lte('reading_date', `${year}-12-31`);
    }

    const { data, error } = await q;
    if (error) { console.warn('readings error', error.message); return; }

    let total = 0, count = 0;
    tblRL.innerHTML = (data||[]).map(r => {
      const last = +r.meter_last_m3 || 0;
      const curr = +r.meter_current_m3 || 0;
      const diff = curr - last;
      if (Number.isFinite(diff)) total += diff;
      count++;
      return `
        <tr>
          <td>${esc(r.wells?.well_code || '')}</td>
          <td>${esc(r.wells?.governorate || '')}</td>
          <td>${esc(r.wells?.district || '')}</td>
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

    rlSummary.textContent = `Records: ${count} • Total abstraction: ${fmtNum(total)} m³${year ? ` • Year: ${year}` : ''}${month ? ` • Month: ${month}` : ''}${wellId ? ' • Well filtered' : ''}${gov ? ` • Gov: ${gov}` : ''}`;
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
