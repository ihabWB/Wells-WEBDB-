// Reports module with report picker + global multi-well filter + multi-well Reading List
(function(){
  'use strict';

  // Supabase
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
  const sb = (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  // DOM helpers
  const $ = (id) => document.getElementById(id);
  const esc = (s) => (s ?? '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtNum = (n) => Number.isFinite(+n) ? (Math.round(+n*100)/100).toLocaleString() : '';
  const fmtPct = (n) => Number.isFinite(+n) ? `${(Math.round(+n*10)/10).toLocaleString()}%` : '';
  const getSelectedValues = (sel) => Array.from((sel||{}).selectedOptions||[]).map(o => o.value).filter(Boolean);
  function csvFromTable(tbody, file){
    const table = tbody?.closest('table'); if (!table) return;
    const rows = Array.from(table.querySelectorAll('tr'));
    const csv = rows.map(tr => Array.from(tr.children).map(td=>{
      const t = td.textContent.replace(/\s+/g,' ').trim();
      return t.includes(',')||t.includes('"') ? `"${t.replace(/"/g,'""')}"` : t;
    }).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // Elements
  // Reading list
  const readingListWells=$('readingListWells'), btnReadingListSelectAll=$('btnReadingListSelectAll'), btnReadingListClear=$('btnReadingListClear');
  const readingListFrom=$('readingListFrom'), readingListTo=$('readingListTo'), btnReadingListLoad=$('btnReadingListLoad'), btnReadingListCSV=$('btnReadingListCSV'), tblReadingList=$('tblReadingList'), readingListSummary=$('readingListSummary');

  // Report picker + global wells
  const reportPicker=$('reportPicker'), rptWells=$('rptWells'), btnRptWellsAll=$('btnRptWellsAll'), btnRptWellsClear=$('btnRptWellsClear');

  // Report-specific controls
  const rptAStartMonth=$('rptAStartMonth'), rptAEndMonth=$('rptAEndMonth'), btnRptALoad=$('btnRptALoad'), btnRptACSV=$('btnRptACSV'), tblRptA=$('tblRptA'), rptASummary=$('rptASummary');

  const rptBGroupBy=$('rptBGroupBy'), rptBStartMonth=$('rptBStartMonth'), rptBEndMonth=$('rptBEndMonth'), btnRptBLoad=$('btnRptBLoad'), btnRptBCSV=$('btnRptBCSV'), tblRptB=$('tblRptB');

  const rptCDays=$('rptCDays'), btnRptCLoad=$('btnRptCLoad'), btnRptCCSV=$('btnRptCCSV'), tblRptC=$('tblRptC');

  const rptDFrom=$('rptDFrom'), rptDTo=$('rptDTo'), btnRptDLoad=$('btnRptDLoad'), btnRptDCSV=$('btnRptDCSV'), tblRptD=$('tblRptD');

  const rptEParam=$('rptEParam'), rptELevel=$('rptELevel'), rptEFrom=$('rptEFrom'), rptETo=$('rptETo'), btnRptELoad=$('btnRptELoad'), btnRptECSV=$('btnRptECSV'), tblRptE=$('tblRptE'), chartQualityEl=$('chartQuality');

  const rptFStartMonth=$('rptFStartMonth'), rptFEndMonth=$('rptFEndMonth'), btnRptFLoad=$('btnRptFLoad'), btnRptFCSV=$('btnRptFCSV'), tblRptF=$('tblRptF');

  const rptGFrom=$('rptGFrom'), rptGTo=$('rptGTo'), btnRptGLoad=$('btnRptGLoad'), chartLevelsEl=$('chartLevels');

  const rptHYear=$('rptHYear'), btnRptHLoad=$('btnRptHLoad'), tblRptH=$('tblRptH');

  const btnRptILoad=$('btnRptILoad'), btnRptICSV=$('btnRptICSV'), tblRptI=$('tblRptI');

  let chartQuality=null, chartLevels=null;
  let wellIndexById = new Map(); // well_id -> {well_code, governorate, district}

  document.addEventListener('DOMContentLoaded', init);

  async function init(){
    if (!sb) return;

    // Load well list once for multi-selects
    const wells = await fetchWells();
    const options = wells.map(w => `<option value="${w.well_id}">${esc(w.well_code)}${w.well_name? ' - '+esc(w.well_name):''}</option>`).join('');
    [readingListWells, rptWells].forEach(sel => { if (sel) sel.innerHTML = options; });

    // Build quick index
    wells.forEach(w => wellIndexById.set(String(w.well_id), {well_code:w.well_code, governorate:w.governorate, district:w.district}));

    // Defaults
    const today=new Date(), yyyy=today.getFullYear(), mm=String(today.getMonth()+1).padStart(2,'0');
    if (readingListTo) readingListTo.value = `${yyyy}-${mm}-${String(today.getDate()).padStart(2,'0')}`;
    if (readingListFrom){ const d=new Date(today); d.setMonth(d.getMonth()-5); readingListFrom.value=d.toISOString().slice(0,10); }
    [rptAStartMonth,rptBStartMonth,rptFStartMonth].forEach(el=>{ if(el){ const d=new Date(today); d.setMonth(d.getMonth()-5); el.value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}});
    [rptAEndMonth,rptBEndMonth,rptFEndMonth].forEach(el=>{ if(el) el.value=`${yyyy}-${mm}`; });

    // Report picker toggle
    reportPicker?.addEventListener('change', () => showReport(reportPicker.value));
    showReport(reportPicker?.value || 'A');

    // Bind multi-select helpers
    btnReadingListSelectAll?.addEventListener('click', ()=> selectAll(readingListWells, true));
    btnReadingListClear?.addEventListener('click', ()=> selectAll(readingListWells, false));
    btnRptWellsAll?.addEventListener('click', ()=> selectAll(rptWells, true));
    btnRptWellsClear?.addEventListener('click', ()=> selectAll(rptWells, false));

    // Reading list events
    btnReadingListLoad?.addEventListener('click', loadReadingList);
    btnReadingListCSV?.addEventListener('click', ()=> csvFromTable(tblReadingList,'readings_by_well.csv'));

    // Reports events
    btnRptALoad?.addEventListener('click', loadRptA);
    btnRptACSV?.addEventListener('click', ()=> csvFromTable(tblRptA,'monthly_abstraction_by_well.csv'));

    btnRptBLoad?.addEventListener('click', loadRptB);
    btnRptBCSV?.addEventListener('click', ()=> csvFromTable(tblRptB,'total_abstraction_by_area.csv'));

    btnRptCLoad?.addEventListener('click', loadRptC);
    btnRptCCSV?.addEventListener('click', ()=> csvFromTable(tblRptC,'non_operational_wells.csv'));

    btnRptDLoad?.addEventListener('click', loadRptD);
    btnRptDCSV?.addEventListener('click', ()=> csvFromTable(tblRptD,'maintenance_logs.csv'));

    btnRptELoad?.addEventListener('click', loadRptE);
    btnRptECSV?.addEventListener('click', ()=> csvFromTable(tblRptE,'water_quality.csv'));

    btnRptFLoad?.addEventListener('click', loadRptF);
    btnRptFCSV?.addEventListener('click', ()=> csvFromTable(tblRptF,'over_abstraction.csv'));

    btnRptGLoad?.addEventListener('click', loadRptG);

    btnRptHLoad?.addEventListener('click', loadRptH);

    btnRptILoad?.addEventListener('click', loadRptI);
    btnRptICSV?.addEventListener('click', ()=> csvFromTable(tblRptI,'yoy_abstraction.csv'));
  }

  function showReport(key){
    document.querySelectorAll('.report-block').forEach(div => {
      div.style.display = div.getAttribute('data-report') === key ? '' : 'none';
    });
  }

  function selectAll(selectEl, on){
    if (!selectEl) return;
    Array.from(selectEl.options).forEach(o => o.selected = !!on);
    // Trigger change if someone listens (not required here)
    const ev = new Event('change'); selectEl.dispatchEvent(ev);
  }

  // Fetch helpers
  async function fetchWells(){
    const { data, error } = await sb.from('wells')
      .select('well_id,well_code,well_name,governorate,district,owner_service_provider,design_capacity_m3_per_year,permitted_capacity_m3_per_year,current_status')
      .order('well_code', { ascending:true }).limit(5000);
    if (error) { console.warn('wells error', error.message); return []; }
    return data||[];
  }

  // 1) Readings list (multi wells)
  async function loadReadingList(){
    const wellIds = getSelectedValues(readingListWells);
    let q = sb.from('monthly_readings')
      .select('well_id,reading_date,meter_last_m3,meter_current_m3,static_water_level_m,dynamic_water_level_m,pumping_hours,notes,wells!inner(well_code)')
      .order('well_id',{ascending:true}).order('reading_date',{ascending:true}).limit(20000);
    if (wellIds.length) q = q.in('well_id', wellIds);
    if (readingListFrom?.value) q = q.gte('reading_date', readingListFrom.value);
    if (readingListTo?.value) q = q.lte('reading_date', readingListTo.value);
    const { data, error } = await q;
    if (error) { console.warn('readings list', error.message); return; }

    // Render
    let total=0, count=0; const perWell = {};
    tblReadingList.innerHTML=(data||[]).map(r=>{
      const last=+r.meter_last_m3||0, curr=+r.meter_current_m3||0, diff=curr-last;
      if (Number.isFinite(diff)) { total+=diff; }
      count++;
      const code = r.wells?.well_code || (wellIndexById.get(String(r.well_id))?.well_code || '');
      perWell[code] = (perWell[code]||0) + (Number.isFinite(diff)?diff:0);
      return `<tr>
        <td>${esc(code)}</td>
        <td>${esc(String(r.reading_date).slice(0,10))}</td>
        <td>${fmtNum(r.meter_last_m3)}</td>
        <td>${fmtNum(r.meter_current_m3)}</td>
        <td>${fmtNum(diff)}</td>
        <td>${fmtNum(r.static_water_level_m)}</td>
        <td>${fmtNum(r.dynamic_water_level_m)}</td>
        <td>${fmtNum(r.pumping_hours)}</td>
        <td>${esc(r.notes||'')}</td>
      </tr>`;
    }).join('');

    // Summary
    const parts = Object.entries(perWell).sort((a,b)=> b[1]-a[1]).slice(0,5).map(([k,v])=> `${k}: ${fmtNum(v)} m³`);
    readingListSummary.textContent = `Wells: ${Object.keys(perWell).length||'All'} • Records: ${count} • Total: ${fmtNum(total)} m³${parts.length? ' • Top: ' + parts.join(' | ') : ''}`;
  }

  // A) Monthly Abstraction per Well (compare to capacity)
  async function loadRptA(){
    const wellIds = getSelectedValues(rptWells);
    let rows=[];
    try{
      let q = sb.from('v_abstraction_vs_capacity')
        .select('*').order('well_code',{ascending:true}).order('year',{ascending:true}).order('month',{ascending:true}).limit(20000);
      if (wellIds.length) q = q.in('well_id', wellIds);
      const { data, error } = await q;
      if (error) throw error;
      rows = (data||[]).filter(mFilter(rptAStartMonth?.value, rptAEndMonth?.value));
    }catch{
      // Fallback compute
      const { data: mrs } = await sb.from('monthly_readings')
        .select('well_id,reading_date,meter_last_m3,meter_current_m3')
        .order('reading_date',{ascending:true}).limit(50000);
      const filtered = wellIds.length ? (mrs||[]).filter(r => wellIds.includes(String(r.well_id))) : (mrs||[]);
      const map = new Map();
      filtered.forEach(r=>{
        const d=new Date(r.reading_date), y=d.getFullYear(), m=d.getMonth()+1, k=`${r.well_id}|${y}|${m}`;
        const diff=(+r.meter_current_m3||0)-(+r.meter_last_m3||0);
        if (!map.has(k)) map.set(k,{ well_id:String(r.well_id), year:y, month:m, abstraction:0 });
        map.get(k).abstraction += Number.isFinite(diff)?diff:0;
      });
      rows = Array.from(map.values());
      // Join well meta
      rows = rows.map(x=>{
        const w = wellIndexById.get(String(x.well_id))||{};
        const allowedYear = Number(w.permitted_capacity_m3_per_year)||Number(w.design_capacity_m3_per_year)||0;
        const allowedMo = allowedYear? allowedYear/12 : 0;
        const pct = allowedMo? (x.abstraction/allowedMo)*100 : null;
        return {
          well_id:x.well_id, well_code:w.well_code, governorate:w.governorate, district:w.district,
          year:x.year, month:x.month, abstraction_m3:x.abstraction, allowed_m3_per_month:allowedMo, pct_of_allowed:pct,
          status: (allowedMo && x.abstraction>allowedMo) ? 'Over' : 'OK'
        };
      }).filter(mFilter(rptAStartMonth?.value, rptAEndMonth?.value, r=> r.year*100+r.month))
        .sort((a,b)=> (a.well_code||'').localeCompare(b.well_code||'') || (a.year-b.year) || (a.month-b.month));
    }
    tblRptA.innerHTML = rows.map(r=>`
      <tr>
        <td>${esc(r.well_code||'')}</td>
        <td>${esc([r.governorate,r.district].filter(Boolean).join(' / '))}</td>
        <td>${r.year}</td>
        <td>${String(r.month).padStart(2,'0')}</td>
        <td>${fmtNum(r.abstraction_m3||r.monthly_abstraction_m3)}</td>
        <td>${fmtNum(r.allowed_m3_per_month)}</td>
        <td>${fmtPct(r.pct_of_allowed)}</td>
        <td>${esc(r.status||((r.allowed_m3_per_month && (r.monthly_abstraction_m3>r.allowed_m3_per_month))?'Over':'OK'))}</td>
      </tr>`).join('');
    if (rptASummary) {
      const total = rows.reduce((s,r)=> s + Number(r.abstraction_m3||r.monthly_abstraction_m3||0), 0);
      rptASummary.textContent = `Rows: ${rows.length} • Total abstraction: ${fmtNum(total)} m³`;
    }
  }

  // B) Totals by Area
  async function loadRptB(){
    const groupBy = rptBGroupBy?.value || 'governorate';
    const wellIds = getSelectedValues(rptWells);
    let rows=[];
    if (wellIds.length){
      // Compute with filter
      const { data: joined } = await sb.from('monthly_readings')
        .select(`well_id, meter_last_m3, meter_current_m3, reading_date, wells!inner(${groupBy})`)
        .order('reading_date',{ascending:true}).limit(50000);
      const filtered = (joined||[]).filter(r => wellIds.includes(String(r.well_id)));
      const totals = {};
      filtered.forEach(r=>{
        const ym = ymk(r.reading_date);
        const grp = r.wells?.[groupBy] || '—';
        const diff = (+r.meter_current_m3||0)-(+r.meter_last_m3||0);
        const key = `${grp}|${ym}`;
        totals[key] = (totals[key]||0) + (Number.isFinite(diff)?diff:0);
      });
      rows = Object.entries(totals).map(([k,val])=>{
        const [group_key, ym] = k.split('|');
        return { group_key, year_month_key: Number(ym), total_abstraction_m3: val };
      }).filter(mFilter(rptBStartMonth?.value, rptBEndMonth?.value, r=> r.year_month_key));
    } else {
      // Use view when all wells
      try{
        let q = sb.from('v_total_abstraction_by_area').select('group_key,total_abstraction_m3,year_month_key').eq('group_by', groupBy);
        const { data, error } = await q;
        if (error) throw error;
        rows = (data||[]).filter(mFilter(rptBStartMonth?.value, rptBEndMonth?.value, r=> r.year_month_key));
      }catch{ rows=[]; }
    }
    const agg = rows.reduce((m,r)=> (m[r.group_key]=(m[r.group_key]||0)+(Number(r.total_abstraction_m3)||0), m), {});
    const out = Object.entries(agg).sort((a,b)=> b[1]-a[1]);
    tblRptB.innerHTML = out.map(([k,v])=> `<tr><td>${esc(k)}</td><td>${fmtNum(v)}</td></tr>`).join('');
  }

  // C) Non-operational wells
  async function loadRptC(){
    const days = Number(rptCDays?.value)||45;
    const wellIds = getSelectedValues(rptWells);
    let rows=[];
    // Fallback computation respects wellIds
    const { data: reads } = await sb.from('monthly_readings')
      .select('well_id, reading_date').order('reading_date',{ascending:false}).limit(50000);
    const filteredReads = wellIds.length ? (reads||[]).filter(r => wellIds.includes(String(r.well_id))) : (reads||[]);
    const lastMap = new Map();
    filteredReads.forEach(r=> { if(!lastMap.has(r.well_id)) lastMap.set(String(r.well_id), r.reading_date); });

    // Wells universe to consider
    const allWellIds = wellIds.length ? wellIds : Array.from(wellIndexById.keys());
    const now = new Date();
    rows = allWellIds.map(id=>{
      const w = wellIndexById.get(String(id)) || {};
      const lastD = lastMap.get(String(id));
      const since = lastD? Math.round((now - new Date(lastD))/(1000*60*60*24)) : null;
      let reason = '';
      if (w.current_status && w.current_status !== 'Active') reason = `Status: ${w.current_status}`;
      if (since==null || since>days) reason = reason ? `${reason}; No reading ${since??'>' + days}+ days` : `No reading ${since??'>' + days}+ days`;
      if (!reason) return null;
      return {
        well_code:w.well_code, governorate:w.governorate, district:w.district,
        current_status:w.current_status||'', last_reading:lastD? String(lastD).slice(0,10):'—', reason
      };
    }).filter(Boolean).sort((a,b)=> (a.well_code||'').localeCompare(b.well_code||''));
    tblRptC.innerHTML = rows.map(r=>`
      <tr>
        <td>${esc(r.well_code)}</td>
        <td>${esc(r.governorate||'')}</td>
        <td>${esc(r.district||'')}</td>
        <td>${esc(r.current_status||'')}</td>
        <td>${esc(r.last_reading)}</td>
        <td>${esc(r.reason||'')}</td>
      </tr>`).join('');
  }

  // D) Maintenance logs
  async function loadRptD(){
    const wellIds = getSelectedValues(rptWells);
    let q = sb.from('maintenance_visits')
      .select('well_id,visit_date,technician_team,activity,notes,cost,wells!inner(well_code)')
      .order('visit_date',{ascending:false}).limit(10000);
    if (wellIds.length) q = q.in('well_id', wellIds);
    if (rptDFrom?.value) q = q.gte('visit_date', rptDFrom.value);
    if (rptDTo?.value) q = q.lte('visit_date', rptDTo.value);
    const { data, error } = await q; if (error){ console.warn('maintenance', error.message); return; }
    tblRptD.innerHTML = (data||[]).map(r=>`
      <tr>
        <td>${esc(String(r.visit_date).slice(0,10))}</td>
        <td>${esc(r.wells?.well_code|| (wellIndexById.get(String(r.well_id))?.well_code || ''))}</td>
        <td>${esc(r.technician_team||'')}</td>
        <td>${esc(r.activity||'')}</td>
        <td>${esc(r.notes||'')}</td>
        <td>${fmtNum(r.cost)}</td>
      </tr>`).join('');
  }

  // E) Water quality: parameter + compliance + trend + alerts
  async function loadRptE(){
    const wellIds = getSelectedValues(rptWells);
    const param = rptEParam?.value || 'EC';
    let q = sb.from('water_quality')
      .select('well_id,sample_date,parameter_name,parameter_value,unit,wells!inner(well_code,governorate,district)')
      .eq('parameter_name', param)
      .order('sample_date',{ascending:true}).limit(20000);
    if (wellIds.length) q = q.in('well_id', wellIds);
    if (rptEFrom?.value) q = q.gte('sample_date', rptEFrom.value);
    if (rptETo?.value) q = q.lte('sample_date', rptETo.value);
    const { data, error } = await q; if (error) { console.warn('quality', error.message); return; }

    const { data: stds } = await sb.from('water_quality_standards').select('parameter_name,limit_type,limit_value').eq('parameter_name', param).limit(1);
    const std = stds?.[0] || null;

    let lastValueByWell = new Map();
    const rows = (data||[]).map(r=>{
      const areaLevel = rptELevel?.value;
      const area = areaLevel ? (r.wells?.[areaLevel] || '') : '';
      let compliance = '—';
      if (std && Number.isFinite(+r.parameter_value)) {
        if (std.limit_type === 'max') compliance = (+r.parameter_value <= +std.limit_value) ? 'OK' : 'Exceed';
        if (std.limit_type === 'min') compliance = (+r.parameter_value >= +std.limit_value) ? 'OK' : 'Exceed';
      }
      let alert = '';
      const prev = lastValueByWell.get(r.well_id);
      if (prev != null && Number.isFinite(+r.parameter_value)) {
        const delta = (+r.parameter_value) - prev;
        const pct = prev ? (delta/prev)*100 : null;
        const p = (param||'').toLowerCase();
        if ((p==='ec' || p==='tds') && pct!=null && pct >= 30) alert = 'ALERT: +30% jump';
        if (p==='nitrate' && delta >= 10) alert = 'ALERT: +10 mg/L';
      }
      if (Number.isFinite(+r.parameter_value)) lastValueByWell.set(r.well_id, +r.parameter_value);
      return {
        well_code: r.wells?.well_code|| (wellIndexById.get(String(r.well_id))?.well_code || ''),
        area,
        date: String(r.sample_date).slice(0,10),
        param: r.parameter_name,
        value: r.parameter_value,
        unit: r.unit,
        compliance,
        alert
      };
    });

    // Table
    tblRptE.innerHTML = rows.map(r=>`
      <tr>
        <td>${esc(r.well_code)}</td>
        <td>${esc(r.area)}</td>
        <td>${esc(r.date)}</td>
        <td>${esc(r.param)}</td>
        <td>${fmtNum(r.value)}</td>
        <td>${esc(r.unit||'')}</td>
        <td>${esc(r.alert || r.compliance)}</td>
      </tr>`).join('');

    // Trend chart: up to 5 wells with most samples
    if (window.Chart){
      const grouped = groupBy(rows, 'well_code');
      const wellsSorted = Object.entries(grouped).sort((a,b)=> b[1].length - a[1].length).slice(0,5);
      const labels = Array.from(new Set([].concat(...wellsSorted.map(([_, arr]) => arr.map(x=>x.date))))).sort();
      const palette = ['#22d3ee','#8b5cf6','#10b981','#f59e0b','#ef4444'];
      const datasets = wellsSorted.map(([code, arr], i) => {
        const map = new Map(arr.map(x=> [x.date, Number(x.value)||null]));
        return { label: `${param} - ${code}`, data: labels.map(d=> map.get(d) ?? null), borderColor: palette[i%palette.length], tension:.2, spanGaps:true };
      });
      if (chartQuality) chartQuality.destroy();
      chartQuality = new Chart(chartQualityEl, { type:'line', data:{ labels, datasets }, options:{ responsive:true, plugins:{ legend:{ display:true } } } });
    }
  }

  // F) Over-abstraction
  async function loadRptF(){
    const wellIds = getSelectedValues(rptWells);
    let rows=[];
    if (wellIds.length){
      try{
        let { data } = await sb.from('v_abstraction_vs_capacity').select('*').in('well_id', wellIds);
        rows = (data||[]).filter(r => Number(r.allowed_m3_per_month)>0 && Number(r.monthly_abstraction_m3)>Number(r.allowed_m3_per_month))
          .map(r=>({
            well_code:r.well_code, year:r.year, month:r.month,
            abstraction_m3:r.monthly_abstraction_m3,
            allowed_m3_per_month:r.allowed_m3_per_month,
            excess_m3: (r.monthly_abstraction_m3 - r.allowed_m3_per_month),
            pct_over: (r.monthly_abstraction_m3 - r.allowed_m3_per_month)/r.allowed_m3_per_month*100
          }));
      }catch{ rows=[]; }
    } else {
      try{
        let q = sb.from('v_over_abstraction_monthly').select('*').order('well_code',{ascending:true});
        const { data, error } = await q; if (error) throw error; rows = data||[];
      }catch{ rows=[]; }
    }
    rows = rows.filter(mFilter(rptFStartMonth?.value, rptFEndMonth?.value, r=> (r.year*100+r.month)));
    tblRptF.innerHTML = rows.map(r=>`
      <tr>
        <td>${esc(r.well_code)}</td>
        <td>${r.year}</td>
        <td>${String(r.month).padStart(2,'0')}</td>
        <td>${fmtNum(r.abstraction_m3||r.monthly_abstraction_m3)}</td>
        <td>${fmtNum(r.allowed_m3_per_month)}</td>
        <td>${fmtNum(r.excess_m3 || ((r.monthly_abstraction_m3||0)-(r.allowed_m3_per_month||0)))}</td>
        <td>${fmtPct(r.pct_over || (((r.monthly_abstraction_m3||0)-(r.allowed_m3_per_month||0))/(r.allowed_m3_per_month||1)*100))}</td>
      </tr>`).join('');
  }

  // G) Water levels trend chart (up to 5 wells plotted)
  async function loadRptG(){
    const wellIds = getSelectedValues(rptWells);
    if (!wellIds.length) {
      // If none selected, pick top 3 wells alphabetically to show something
      const all = Array.from(wellIndexById.keys()).slice(0,3);
      wellIds.push(...all);
    }
    const ids = wellIds.slice(0,5); // limit to 5 datasets
    const { data, error } = await sb.from('monthly_readings')
      .select('well_id,reading_date,static_water_level_m,dynamic_water_level_m')
      .in('well_id', ids).order('reading_date',{ascending:true}).limit(50000);
    if (error){ console.warn('levels', error.message); return; }
    // Build datasets by well (static and dynamic per well)
    const byWell = groupBy(data||[], 'well_id');
    const labels = Array.from(new Set((data||[]).map(r => String(r.reading_date).slice(0,10)))).sort();
    const palette = ['#22d3ee','#8b5cf6','#10b981','#f59e0b','#ef4444'];
    const datasets = [];
    Object.entries(byWell).forEach(([id, arr], i) => {
      const code = wellIndexById.get(String(id))?.well_code || id;
      const mapS = new Map(arr.map(x=> [String(x.reading_date).slice(0,10), Number(x.static_water_level_m)||null]));
      const mapD = new Map(arr.map(x=> [String(x.reading_date).slice(0,10), Number(x.dynamic_water_level_m)||null]));
      datasets.push({ label:`Static WL - ${code}`, data: labels.map(d=> mapS.get(d) ?? null), borderColor: palette[i%palette.length], tension:.2, spanGaps:true });
      datasets.push({ label:`Dynamic WL - ${code}`, data: labels.map(d=> mapD.get(d) ?? null), borderColor: palette[(i+1)%palette.length], tension:.2, spanGaps:true, borderDash:[6,4] });
    });
    if (chartLevels) chartLevels.destroy();
    if (window.Chart){
      chartLevels = new Chart(chartLevelsEl, { type:'line', data:{ labels, datasets }, options:{ responsive:true, plugins:{ legend:{ display:true } } } });
    }
  }

  // H) Seasonal (May–Oct vs Nov–Apr) per selected wells
  async function loadRptH(){
    if (!rptHYear?.value){ notify('Enter a year (e.g., 2025)'); return; }
    const y = Number(rptHYear.value);
    const wellIds = getSelectedValues(rptWells);
    const ids = wellIds.length ? wellIds : Array.from(wellIndexById.keys());
    const { data, error } = await sb.from('monthly_readings')
      .select('well_id,reading_date,meter_last_m3,meter_current_m3')
      .in('well_id', ids).gte('reading_date', `${y}-01-01`).lte('reading_date', `${y}-12-31`)
      .order('reading_date',{ascending:true}).limit(100000);
    if (error){ console.warn('seasonal', error.message); return; }
    const perWell = {};
    (data||[]).forEach(r=>{
      const m=(new Date(r.reading_date)).getMonth()+1;
      const diff=(+r.meter_current_m3||0)-(+r.meter_last_m3||0);
      const key = String(r.well_id);
      if (!perWell[key]) perWell[key] = { summer:0, winter:0 };
      if ([5,6,7,8,9,10].includes(m)) perWell[key].summer += Number.isFinite(diff)?diff:0;
      else perWell[key].winter += Number.isFinite(diff)?diff:0;
    });
    const rows = Object.entries(perWell).flatMap(([id, v])=>{
      const code = wellIndexById.get(id)?.well_code || id;
      return [
        `<tr><td>${esc(code)}</td><td>Summer (May–Oct)</td><td>${fmtNum(v.summer)}</td></tr>`,
        `<tr><td>${esc(code)}</td><td>Winter (Nov–Apr)</td><td>${fmtNum(v.winter)}</td></tr>`,
      ];
    }).join('');
    tblRptH.innerHTML = rows || '<tr><td colspan="3">No data.</td></tr>';
  }

  // I) Year-to-year change per selected wells
  async function loadRptI(){
    const wellIds = getSelectedValues(rptWells);
    const ids = wellIds.length ? wellIds : Array.from(wellIndexById.keys());
    const { data, error } = await sb.from('monthly_readings')
      .select('well_id,reading_date,meter_last_m3,meter_current_m3')
      .in('well_id', ids).order('reading_date',{ascending:true}).limit(200000);
    if (error){ console.warn('yoy', error.message); return; }
    const byWellYear = {};
    (data||[]).forEach(r=>{
      const y=(new Date(r.reading_date)).getFullYear();
      const diff=(+r.meter_current_m3||0)-(+r.meter_last_m3||0);
      const key = `${r.well_id}|${y}`;
      byWellYear[key] = (byWellYear[key]||0) + (Number.isFinite(diff)?diff:0);
    });
    const grouped = {};
    Object.entries(byWellYear).forEach(([k,v])=>{
      const [id,y] = k.split('|');
      (grouped[id]=grouped[id]||[]).push({ year:+y, total:+v });
    });
    const rows = Object.entries(grouped).flatMap(([id, arr])=>{
      const code = wellIndexById.get(String(id))?.well_code || id;
      arr.sort((a,b)=>a.year-b.year);
      return arr.map((r,i)=> {
        const prev = i? arr[i-1].total : null;
        const pct = prev ? ((r.total - prev)/(prev||1))*100 : null;
        return `<tr><td>${esc(code)}</td><td>${r.year}</td><td>${fmtNum(r.total)}</td><td>${fmtPct(pct)}</td></tr>`;
      });
    }).join('');
    tblRptI.innerHTML = rows || '<tr><td colspan="4">No data.</td></tr>';
  }

  // Utils
  function groupBy(arr, key){ return (arr||[]).reduce((m,x)=>{ const k=String(x[key]||''); (m[k]=m[k]||[]).push(x); return m; },{}); }
  function ymk(date){ const d=new Date(date); return d.getFullYear()*100 + (d.getMonth()+1); }
  function mFilter(start,end,getKey){
    const s = start ? Number(start.replace('-','')) : null;
    const e = end ? Number(end.replace('-','')) : null;
    return (r)=>{
      const k = getKey ? getKey(r) : (r.year*100+r.month);
      if (s && k < s) return false;
      if (e && k > e) return false;
      return true;
    };
  }
  function notify(msg) {
    try {
      const bar = document.createElement('div');
      bar.textContent = msg;
      bar.style.position = 'fixed';
      bar.style.bottom = '12px';
      bar.style.right = '12px';
      bar.style.background = '#103451';
      bar.style.color = '#fff';
      bar.style.padding = '8px 12px';
      bar.style.borderRadius = '8px';
      bar.style.zIndex = 9999;
      document.body.appendChild(bar);
      setTimeout(() => bar.remove(), 2400);
    } catch {}
  }

})();
