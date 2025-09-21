// Readings List: normal list with optional filters by Year, Month, Well, Governorate.
// Directly reads from public.monthly_readings. Uses wells map for labels and governorate filter.
// Loads ALL readings by default (newest first).
(function () {
  'use strict';

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
  const sb = (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  // Elements
  const $ = (id) => document.getElementById(id);
  const rlGov = $('rlGov');
  const rlWell = $('rlWell');
  const rlYear = $('rlYear');
  const rlMonth = $('rlMonth');
  const btnRLLoad = $('btnRLLoad');
  const btnRLCsv = $('btnRLCsv');
  const tblRL = $('tblRL');
  const rlSummary = $('rlSummary');

  // Utils
  const esc = (s) => (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtNum = (n) => Number.isFinite(+n) ? (Math.round(+n*100)/100).toLocaleString() : '';

  // In-memory wells map: well_id -> {well_code, governorate, district}
  const wellMap = new Map();

  document.addEventListener('DOMContentLoaded', init);

  async function init(){
    if (!sb) return;

    // Build wells list and map (used for labels and governorate filtering)
    await loadWells();

    // Populate years dropdown
    populateYears();

    // Wire up actions
    btnRLLoad?.addEventListener('click', loadReadings);
    btnRLCsv?.addEventListener('click', () => exportTableCSV('readings_list.csv'));

    // Load ALL readings by default
    loadReadings().catch(err => setSummary(`Error: ${err.message}`, true));
  }

  async function loadWells(){
    try {
      const { data, error } = await sb
        .from('wells')
        .select('well_id, well_code, well_name, governorate, district')
        .order('well_code', { ascending:true })
        .limit(5000);
      if (error) throw error;

      rlWell.innerHTML = '<option value="">All Wells</option>' + (data||[]).map(w =>
        `<option value="${w.well_id}">${esc(w.well_code)}${w.well_name ? ' - ' + esc(w.well_name) : ''}</option>`
      ).join('');

      (data||[]).forEach(w => {
        wellMap.set(String(w.well_id), {
          well_code: w.well_code || '',
          governorate: w.governorate || '',
          district: w.district || ''
        });
      });
    } catch (e) {
      console.warn('wells load error:', e.message);
      // Keep UI usable even if wells fail; readings will still render (with blank labels)
      rlWell.innerHTML = '<option value="">All Wells</option>';
    }
  }

  function populateYears(){
    const nowY = new Date().getFullYear();
    const startY = 2000;
    rlYear.innerHTML = '<option value="">All Years</option>' +
      Array.from({length: (nowY - startY + 1)}, (_,i) => nowY - i)
        .map(y => `<option value="${y}">${y}</option>`).join('');
  }

  function monthEnd(y, m){ // m "01".."12"
    const last = new Date(y, parseInt(m,10), 0).getDate();
    return `${y}-${m}-${String(last).padStart(2,'0')}`;
  }

  async function loadReadings(){
    setSummary('Loading…');

    const gov = rlGov?.value || '';
    const wellId = rlWell?.value || '';
    const year = rlYear?.value || '';
    const month = rlMonth?.value || '';

    // Base query: direct from monthly_readings (no joins)
    let q = sb.from('monthly_readings')
      .select('well_id, reading_date, meter_last_m3, meter_current_m3, static_water_level_m, dynamic_water_level_m, pumping_hours, notes')
      .order('reading_date', { ascending:false }) // newest first
      .order('well_id', { ascending:true })
      .limit(50000);

    // Apply filters that the table can handle
    if (wellId) q = q.eq('well_id', wellId);
    if (year && month) {
      q = q.gte('reading_date', `${year}-${month}-01`).lte('reading_date', monthEnd(year, month));
    } else if (year) {
      q = q.gte('reading_date', `${year}-01-01`).lte('reading_date', `${year}-12-31`);
    }

    const { data, error } = await q;
    if (error) {
      setSummary(`Error loading readings: ${error.message}`, true);
      tblRL.innerHTML = '';
      return;
    }

    // Optional governorate filter is applied client-side via the wells map
    const rows = (data||[]).filter(r => {
      if (!gov) return true;
      const meta = wellMap.get(String(r.well_id));
      return (meta?.governorate || '') === gov;
    });

    // Render
    let total = 0, count = 0;
    tblRL.innerHTML = rows.map(r => {
      const meta = wellMap.get(String(r.well_id)) || {};
      const last = +r.meter_last_m3 || 0;
      const curr = +r.meter_current_m3 || 0;
      const diff = curr - last;
      if (Number.isFinite(diff)) total += diff;
      count++;
      return `
        <tr>
          <td>${esc(meta.well_code || '')}</td>
          <td>${esc(meta.governorate || '')}</td>
          <td>${esc(meta.district || '')}</td>
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

    const infoBits = [
      rows.length ? '' : 'No rows',
      year ? `Year: ${year}` : '',
      month ? `Month: ${month}` : '',
      wellId ? 'Well: selected' : '',
      gov ? `Gov: ${gov}` : ''
    ].filter(Boolean).join(' • ');

    setSummary(`Records: ${count} • Total abstraction: ${fmtNum(total)} m³${infoBits ? ' • ' + infoBits : ''}`);
  }

  function setSummary(text, isError = false){
    if (!rlSummary) return;
    rlSummary.textContent = text;
    rlSummary.style.color = isError ? '#ef4444' : '';
  }

  function exportTableCSV(filename){
    const table = tblRL?.closest('table'); if (!table) return;
    const rows = Array.from(table.querySelectorAll('tr'));
    const csv = rows.map(tr => Array.from(tr.children).map(td => {
      const t = td.textContent.replace(/\s+/g,' ').trim();
      return t.includes(',') || t.includes('"') ? `"${t.replace(/"/g,'""')}"` : t;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  }

})();
