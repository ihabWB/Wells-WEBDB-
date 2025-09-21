// Robust Readings List from public.monthly_readings with optional filters.
// - Initializes reliably (handles DOMContentLoaded timing).
// - Queries monthly_readings directly (select('*')), newest first.
// - Filters: Governorate (client), Well, Year, Month.
// - Clear errors in UI + console sample logging.
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

  // Helpers
  const esc = (s) => (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtNum = (n) => Number.isFinite(+n) ? (Math.round(+n*100)/100).toLocaleString() : '';
  const setSummary = (text, isError=false) => { if (rlSummary){ rlSummary.textContent = text; rlSummary.style.color = isError ? '#ef4444' : ''; } };

  // well_id -> { well_code, governorate, district }
  const wellMap = new Map();

  // Ensure init runs even if DOMContentLoaded already happened
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init().catch(err => setSummary(`Init error: ${err.message}`, true));
  }

  async function init(){
    if (!sb) { setSummary('Supabase client not initialized (check config.js).', true); return; }

    await loadWells();
    populateYears();

    btnRLLoad?.addEventListener('click', () => loadReadings().catch(err => setSummary(`Load error: ${err.message}`, true)));
    btnRLCsv?.addEventListener('click', () => exportTableCSV('readings_list.csv'));

    // Load ALL readings by default
    await loadReadings();
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
      console.warn('wells load error:', e);
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

    // Build query to monthly_readings with select('*') to avoid column mismatch
    let q = sb.from('monthly_readings')
      .select('*')
      .order('reading_date', { ascending:false }) // newest first
      .order('well_id', { ascending:true })
      .limit(10000); // adjust if needed

    if (wellId) q = q.eq('well_id', wellId);
    if (year && month) {
      q = q.gte('reading_date', `${year}-${month}-01`).lte('reading_date', monthEnd(year, month));
    } else if (year) {
      q = q.gte('reading_date', `${year}-01-01`).lte('reading_date', `${year}-12-31`);
    }

    const { data, error } = await q;

    if (error) {
      console.error('monthly_readings query error:', error);
      setSummary(`Error loading readings: ${error.message}`, true);
      tblRL.innerHTML = '';
      return;
    }

    // Client-side governorate filter (via wells map)
    const rows = (data||[]).filter(r => {
      if (!gov) return true;
      const meta = wellMap.get(String(r.well_id));
      return (meta?.governorate || '') === gov;
    });

    console.log('monthly_readings sample:', rows.slice(0,5)); // Inspect in console

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

    if (!rows.length) {
      setSummary('No readings found for the selected filters.');
      return;
    }

    setSummary(`Records: ${count} • Total abstraction: ${fmtNum(total)} m³${year ? ` • Year: ${year}` : ''}${month ? ` • Month: ${month}` : ''}${wellId ? ' • Well filtered' : ''}${gov ? ` • Gov: ${gov}` : ''}`);
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
