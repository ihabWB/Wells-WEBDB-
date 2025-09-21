// Reports module: lists, summaries, compliance & trends (works with your current index.html)
(function(){
  'use strict';

  // Supabase
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
  const sb = (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  function $(id){ return document.getElementById(id); }
  const esc = (s) => (s ?? '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtNum = (n) => Number.isFinite(+n) ? (Math.round(+n*100)/100).toLocaleString() : '';
  const fmtPct = (n) => Number.isFinite(+n) ? `${(Math.round(+n*10)/10).toLocaleString()}%` : '';
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
  const readingListWell=$('readingListWell'), readingListFrom=$('readingListFrom'), readingListTo=$('readingListTo'),
        btnReadingListLoad=$('btnReadingListLoad'), btnReadingListCSV=$('btnReadingListCSV'), tblReadingList=$('tblReadingList'),
        readingListSummary=$('readingListSummary');

  const rptAWell=$('rptAWell'), rptAStartMonth=$('rptAStartMonth'), rptAEndMonth=$('rptAEndMonth'), btnRptALoad=$('btnRptALoad'), btnRptACSV=$('btnRptACSV'), tblRptA=$('tblRptA'), rptASummary=$('rptASummary');

  const rptBGroupBy=$('rptBGroupBy'), rptBStartMonth=$('rptBStartMonth'), rptBEndMonth=$('rptBEndMonth'), btnRptBLoad=$('btnRptBLoad'), btnRptBCSV=$('btnRptBCSV'), tblRptB=$('tblRptB');

  const rptCDays=$('rptCDays'), btnRptCLoad=$('btnRptCLoad'), btnRptCCSV=$('btnRptCCSV'), tblRptC=$('tblRptC');

  const rptDWell=$('rptDWell'), rptDFrom=$('rptDFrom'), rptDTo=$('rptDTo'), btnRptDLoad=$('btnRptDLoad'), btnRptDCSV=$('btnRptDCSV'), tblRptD=$('tblRptD');

  const rptEParam=$('rptEParam'), rptELevel=$('rptELevel'), rptEFrom=$('rptEFrom'), rptETo=$('rptETo'),
        btnRptELoad=$('btnRptELoad'), btnRptECSV=$('btnRptECSV'), tblRptE=$('tblRptE'), chartQualityEl=$('chartQuality');

  const rptFStartMonth=$('rptFStartMonth'), rptFEndMonth=$('rptFEndMonth'), btnRptFLoad=$('btnRptFLoad'), btnRptFCSV=$('btnRptFCSV'), tblRptF=$('tblRptF');

  const rptGWell=$('rptGWell'), rptGFrom=$('rptGFrom'), rptGTo=$('rptGTo'), btnRptGLoad=$('btnRptGLoad'), chartLevelsEl=$('chartLevels');

  const rptHWell=$('rptHWell'), rptHYear=$('rptHYear'), btnRptHLoad=$('btnRptHLoad'), tblRptH=$('tblRptH');

  const rptIWell=$('rptIWell'), btnRptILoad=$('btnRptILoad'), btnRptICSV=$('btnRptICSV'), tblRptI=$('tblRptI');

  let chartQuality=null, chartLevels=null;

  document.addEventListener('DOMContentLoaded', init);

  async function init(){
    if (!sb) return;

    const wells = await fetchWells();
    const wellOpts = ['<option value="">— Select Well —</option>']
      .concat(wells.map(w => `<option value="${w.well_id}">${esc(w.well_code)}${w.well_name?' - '+esc(w.well_name):''}</option>`)).join('');
    [readingListWell,rptAWell,rptDWell,rptGWell,rptHWell,rptIWell].forEach(sel=> sel && (sel.innerHTML=wellOpts));

    // Defaults
    const today=new Date(), yyyy=today.getFullYear(), mm=String(today.getMonth()+1).padStart(2,'0');
    if (readingListTo) readingListTo.value = `${yyyy}-${mm}-${String(today.getDate()).padStart(2,'0')}`;
    if (readingListFrom){ const d=new Date(today); d.setMonth(d.getMonth()-5); readingListFrom.value=d.toISOString().slice(0,10); }
    [rptAStartMonth,rptBStartMonth,rptFStartMonth].forEach(el=>{ if(el){ const d=new Date(today); d.setMonth(d.getMonth()-5); el.value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}});
    [rptAEndMonth,rptBEndMonth,rptFEndMonth].forEach(el=>{ if(el) el.value=`${yyyy}-${mm}`; });

    // Bind events
    btnReadingListLoad && btnReadingListLoad.addEventListener('click', loadReadingList);
    btnReadingListCSV && btnReadingListCSV.addEventListener('click', ()=> csvFromTable(tblReadingList,'readings_by_well.csv'));

    btnRptALoad && btnRptALoad.addEventListener('click', loadRptA);
    btnRptACSV && btnRptACSV.addEventListener('click', ()=> csvFromTable(tblRptA,'monthly_abstraction_by_well.csv'));

    btnRptBLoad && btnRptBLoad.addEventListener('click', loadRptB);
    btnRptBCSV && btnRptBCSV.addEventListener('click', ()=> csvFromTable(tblRptB,'total_abstraction_by_area.csv'));

    btnRptCLoad && btnRptCLoad.addEventListener('click', loadRptC);
    btnRptCCSV && btnRptCCSV.addEventListener('click', ()=> csvFromTable(tblRptC,'non_operational_wells.csv'));

    btnRptDLoad && btnRptDLoad.addEventListener('click', loadRptD);
    btnRptDCSV && btnRptDCSV.addEventListener('click', ()=> csvFromTable(tblRptD,'maintenance_logs.csv'));

    btnRptELoad && btnRptELoad.addEventListener('click', loadRptE);
    btnRptECSV && btnRptECSV.addEventListener('click', ()=> csvFromTable(tblRptE,'water_quality.csv'));

    btnRptFLoad && btnRptFLoad.addEventListener('click', loadRptF);
    btnRptFCSV && btnRptFCSV.addEventListener('click', ()=> csvFromTable(tblRptF,'over_abstraction.csv'));

    btnRptGLoad && btnRptGLoad.addEventListener('click', loadRptG);

    btnRptHLoad && btnRptHLoad.addEventListener('click', loadRptH);

    btnRptILoad && btnRptILoad.addEventListener('click', loadRptI);
    btnRptICSV && btnRptICSV.addEventListener('click', ()=> csvFromTable(tblRptI,'yoy_abstraction.csv'));
  }

  // Fetch helpers
  async function fetchWells(){
    const { data, error } = await sb.from('wells')
      .select('well_id,well_code,well_name,governorate,district,owner_service_provider,design_capacity_m3_per_year,permitted_capacity_m3_per_year,current_status')
      .order('well_code', { ascending:true }).limit(5000);
    if (error) { console.warn('wells error', error.message); return []; }
    return data||[];
  }

  // 1) Readings list by well
  async function loadReadingList(){
    if (!readingListWell?.value) return;
    let q = sb.from('monthly_readings')
      .select('reading_date,meter_last_m3,meter_current_m3,static_water_level_m,dynamic_water_level_m,pumping_hours,notes')
      .eq('well_id', readingListWell.value)
      .order('reading_date', { ascending:true }).limit(5000);
    if (readingListFrom?.value) q = q.gte('reading_date', readingListFrom.value);
    if (readingListTo?.value) q = q.lte('reading_date', readingListTo.value);
    const { data, error } = await q;
    if (error) { console.warn('readings list', error.message); return; }
    let total=0;
    tblReadingList.innerHTML=(data||[]).map(r=>{
      const last=+r.meter_last_m3||0, curr=+r.meter_current_m3||0, diff=curr-last;
      if (Number.isFinite(diff)) total+=diff;
      return `<tr>
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
    if (readingListSummary) readingListSummary.textContent = `Records: ${(data||[]).length} • Total abstraction: ${fmtNum(total)} m³`;
  }

  // A) Monthly Abstraction per Well (compare to capacity)
  async function loadRptA(){
    let rows=[];
    try{
      let q = sb.from('v_abstraction_vs_capacity')
        .select('*').order('well_code',{ascending:true}).order('year',{ascending:true}).order('month',{ascending:true}).limit(10000);
      if (rptAWell?.value) q = q.eq('well_id', rptAWell.value);
      const { data, error } = await q;
      if (error) throw error;
      rows = (data||[]).filter(mFilter(rptAStartMonth?.value, rptAEndMonth?.value));
    }catch{
      // Fallback compute
      const wells = await fetchWells();
      let q = sb.from('monthly_readings')
        .select('well_id,reading_date,meter_last_m3,meter_current_m3')
        .order('reading_date',{ascending:true}).limit(20000);
      if (rptAWell?.value) q = q.eq('well_id', rptAWell.value);
      const { data } = await q;
      const map = new Map(); // key: well|y|m
      (data||[]).forEach(r=>{
        const d=new Date(r.reading_date), y=d.getFullYear(), m=d.getMonth()+1, k=`${r.well_id}|${y}|${m}`;
        const diff=(+r.meter_current_m3||0)-(+r.meter_last_m3||0);
        if (!map.has(k)) map.set(k,{ well_id:r.well_id, year:y, month:m, abstraction:0 });
        map.get(k).abstraction += Number.isFinite(diff)?diff:0;
      });
      rows = Array.from(map.values()).map(x=>{
        const w = wells.find(w=>w.well_id===x.well_id)||{};
        const allowedYear = Number(w.permitted_capacity_m3_per_year)||Number(w.design_capacity_m3_per_year)||0;
        const allowedMo = allowedYear? allowedYear/12 : 0;
        const pct = allowedMo? (x.abstraction/allowedMo)*100 : null;
        return {
          well_id:x.well_id, well_code:w.well_code, governorate:w.governorate, district:w.district,
          year:x.year, month:x.month, abstraction_m3:x.abstraction, allowed_m3_per_month:allowedMo, pct_of_allowed:pct,
          status: (allowedMo && x.abstraction>allowedMo) ? 'Over' : 'OK'
        };
      }).filter(mFilter(rptAStartMonth?.value, rptAEndMonth?.value, r=> r.year*100+r.month));
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
    let rows=[];
    try{
      let q = sb.from('v_total_abstraction_by_area')
        .select('group_key,total_abstraction_m3,year_month_key')
        .eq('group_by', groupBy);
      const { data, error } = await q;
      if (error) throw error;
      rows = (data||[]).filter(mFilter(rptBStartMonth?.value, rptBEndMonth?.value, r=> r.year_month_key));
    }catch{
      // Fallback
      const { data: joined } = await sb.from('monthly_readings')
        .select('meter_last_m3,meter_current_m3,reading_date,wells!inner(' + groupBy + ')')
        .order('reading_date',{ascending:true}).limit(50000);
      const totals = {};
      (joined||[]).forEach(r=>{
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
    }
    // Aggregate across selected range per group
    const agg = rows.reduce((m,r)=> (m[r.group_key]=(m[r.group_key]||0)+(Number(r.total_abstraction_m3)||0), m), {});
    const out = Object.entries(agg).sort((a,b)=> b[1]-a[1]);
    tblRptB.innerHTML = out.map(([k,v])=> `<tr><td>${esc(k)}</td><td>${fmtNum(v)}</td></tr>`).join('');
  }

  // C) Non-operational wells
  async function loadRptC(){
    const days = Number(rptCDays?.value)||45;
    let rows=[];
    try{
      let q = sb.from('v_non_operational_wells').select('*');
      const { data, error } = await q; if (error) throw error; rows = data||[];
      // Filter by custom days if view uses fixed 45
      rows = rows.filter(r => (Number(r.days_since_last_reading)||9999) >= days || (r.current_status && r.current_status !== 'Active') || !r.last_reading_date);
    }catch{
      // Fallback: compute last reading per well
      const { data: reads } = await sb.from('monthly_readings').select('well_id, reading_date').order('reading_date',{ascending:false}).limit(50000);
      const lastMap = new Map();
      (reads||[]).forEach(r=> { if(!lastMap.has(r.well_id)) lastMap.set(r.well_id, r.reading_date); });
      const wells = await fetchWells();
      const now = new Date();
      rows = wells.map(w=>{
        const lastD = lastMap.get(w.well_id);
        const since = lastD? Math.round((now - new Date(lastD))/(1000*60*60*24)) : null;
        let reason = '';
        if (w.current_status && w.current_status !== 'Active') reason = `Status: ${w.current_status}`;
        if (since==null || since>days) reason = reason ? `${reason}; No reading ${since??'>' + days}+ days` : `No reading ${since??'>' + days}+ days`;
        return {
          well_code:w.well_code, governorate:w.governorate, district:w.district,
          current_status:w.current_status||'', last_reading:lastD? String(lastD).slice(0,10):'—', reason
        };
      }).filter(r=> r.reason);
    }
    tblRptC.innerHTML = rows.map(r=>`
      <tr>
        <td>${esc(r.well_code)}</td>
        <td>${esc(r.governorate||'')}</td>
        <td>${esc(r.district||'')}</td>
        <td>${esc(r.current_status||'')}</td>
        <td>${esc(r.last_reading? String(r.last_reading).slice(0,10):'—')}</td>
        <td>${esc(r.reason||'')}</td>
      </tr>`).join('');
  }

  // D) Maintenance logs
  async function loadRptD(){
    let q = sb.from('maintenance_visits').select('visit_date,technician_team,activity,notes,cost,wells!inner(well_code)').order('visit_date',{ascending:false}).limit(10000);
    if (rptDWell?.value) q = q.eq('well_id', rptDWell.value);
    if (rptDFrom?.value) q = q.gte('visit_date', rptDFrom.value);
    if (rptDTo?.value) q = q.lte('visit_date', rptDTo.value);
    const { data, error } = await q; if (error){ console.warn('maintenance', error.message); return; }
    tblRptD.innerHTML = (data||[]).map(r=>`
      <tr>
        <td>${esc(String(r.visit_date).slice(0,10))}</td>
        <td>${esc(r.wells?.well_code||'')}</td>
        <td>${esc(r.technician_team||'')}</td>
        <td>${esc(r.activity||'')}</td>
        <td>${esc(r.notes||'')}</td>
        <td>${fmtNum(r.cost)}</td>
      </tr>`).join('');
  }

  // E) Water quality: parameter + compliance + trend + alerts
  async function loadRptE(){
    const param = rptEParam?.value || 'EC';
    let q = sb.from('water_quality')
      .select('well_id,sample_date,parameter_name,parameter_value,unit,wells!inner(well_code,governorate,district)')
      .eq('parameter_name', param)
      .order('sample_date',{ascending:true}).limit(20000);
    if (rptEFrom?.value) q = q.gte('sample_date', rptEFrom.value);
    if (rptETo?.value) q = q.lte('sample_date', rptETo.value);
    const { data, error } = await q; if (error) { console.warn('quality', error.message); return; }

    // Standards table optional; compliance will show '—' if absent
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
      // Alerts for sudden changes
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
        well_code: r.wells?.well_code||'',
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

    // Trend chart for the well with most samples
    const grouped = groupBy(rows, 'well_code');
    const best = Object.entries(grouped).sort((a,b)=> b[1].length - a[1].length)[0];
    if (best && window.Chart){
      const series = best[1].slice().sort((a,b)=> a.date.localeCompare(b.date));
      const labels = series.map(x=>x.date);
      const values = series.map(x=> Number(x.value) || null);
      if (chartQuality) chartQuality.destroy();
      chartQuality = new Chart(chartQualityEl, {
        type: 'line',
        data: { labels, datasets: [{ label: `${param} - ${best[0]}`, data: values, borderColor:'#22d3ee', tension: .2, fill:false }] },
        options: { responsive: true, plugins:{ legend:{ display:true } }, scales:{ x:{ ticks:{ maxRotation:0 } }, y:{ beginAtZero:false } } }
      });
    }
  }

  // F) Over-abstraction
  async function loadRptF(){
    let rows=[];
    try{
      let q = sb.from('v_over_abstraction_monthly').select('*').order('well_code',{ascending:true});
      const { data, error } = await q; if (error) throw error; rows = data||[];
    }catch{
      // Fallback: derive from v_abstraction_vs_capacity if present
      try{
        let { data } = await sb.from('v_abstraction_vs_capacity').select('*');
        rows = (data||[]).filter(r => Number(r.allowed_m3_per_month)>0 && Number(r.monthly_abstraction_m3)>Number(r.allowed_m3_per_month))
          .map(r=>({
            well_code:r.well_code, year:r.year, month:r.month,
            abstraction_m3:r.monthly_abstraction_m3,
            allowed_m3_per_month:r.allowed_m3_per_month,
            excess_m3: (r.monthly_abstraction_m3 - r.allowed_m3_per_month),
            pct_over: (r.monthly_abstraction_m3 - r.allowed_m3_per_month)/r.allowed_m3_per_month*100
          }));
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

  // G) Water levels trend chart
  async function loadRptG(){
    if (!rptGWell?.value) return;
    let q = sb.from('monthly_readings')
      .select('reading_date,static_water_level_m,dynamic_water_level_m')
      .eq('well_id', rptGWell.value).order('reading_date',{ascending:true}).limit(5000);
    if (rptGFrom?.value) q = q.gte('reading_date', rptGFrom.value);
    if (rptGTo?.value) q = q.lte('reading_date', rptGTo.value);
    const { data, error } = await q; if (error){ console.warn('levels', error.message); return; }
    const labels=(data||[]).map(r=> String(r.reading_date).slice(0,10));
    const stat=(data||[]).map(r=> Number(r.static_water_level_m) || null);
    const dyn=(data||[]).map(r=> Number(r.dynamic_water_level_m) || null);
    if (chartLevels) chartLevels.destroy();
    if (window.Chart){
      chartLevels = new Chart(chartLevelsEl, {
        type:'line',
        data:{ labels, datasets:[
          { label:'Static WL (m)', data:stat, borderColor:'#22d3ee', tension:.2 },
          { label:'Dynamic WL (m)', data:dyn, borderColor:'#8b5cf6', tension:.2 }
        ]},
        options:{ responsive:true, plugins:{ legend:{ display:true } } }
      });
    }
  }

  // H) Seasonal (May–Oct vs Nov–Apr)
  async function loadRptH(){
    if (!rptHWell?.value || !rptHYear?.value) return;
    const y = Number(rptHYear.value);
    let q = sb.from('monthly_readings')
      .select('reading_date,meter_last_m3,meter_current_m3')
      .eq('well_id', rptHWell.value)
      .gte('reading_date', `${y}-01-01`).lte('reading_date', `${y}-12-31`)
      .order('reading_date',{ascending:true}).limit(5000);
    const { data, error } = await q; if (error){ console.warn('seasonal', error.message); return; }
    let summer=0, winter=0;
    (data||[]).forEach(r=>{
      const m=(new Date(r.reading_date)).getMonth()+1;
      const diff=(+r.meter_current_m3||0)-(+r.meter_last_m3||0);
      if ([5,6,7,8,9,10].includes(m)) summer += Number.isFinite(diff)?diff:0;
      else winter += Number.isFinite(diff)?diff:0;
    });
    const code = await wellCode(rptHWell.value);
    tblRptH.innerHTML = `
      <tr><td>${esc(code||'')}</td><td>Summer (May–Oct)</td><td>${fmtNum(summer)}</td></tr>
      <tr><td>${esc(code||'')}</td><td>Winter (Nov–Apr)</td><td>${fmtNum(winter)}</td></tr>
    `;
  }

  // I) Year-to-year change
  async function loadRptI(){
    if (!rptIWell?.value) return;
    let q = sb.from('monthly_readings').select('reading_date,meter_last_m3,meter_current_m3').eq('well_id', rptIWell.value).order('reading_date',{ascending:true}).limit(10000);
    const { data, error } = await q; if (error){ console.warn('yoy', error.message); return; }
    const byYear={};
    (data||[]).forEach(r=>{
      const y=(new Date(r.reading_date)).getFullYear();
      const diff=(+r.meter_current_m3||0)-(+r.meter_last_m3||0);
      byYear[y]=(byYear[y]||0)+(Number.isFinite(diff)?diff:0);
    });
    const years=Object.keys(byYear).map(n=>+n).sort((a,b)=>a-b);
    const rows=years.map((y,i)=>({ year:y, total:byYear[y], pct:i? ((byYear[y]-byYear[years[i-1]])/(byYear[years[i-1]]||1))*100 : null }));
    const code=await wellCode(rptIWell.value);
    tblRptI.innerHTML = rows.map(r=>`
      <tr>
        <td>${esc(code||'')}</td>
        <td>${r.year}</td>
        <td>${fmtNum(r.total)}</td>
        <td>${fmtPct(r.pct)}</td>
      </tr>`).join('');
  }

  // Utilities
  async function wellCode(id){
    const { data } = await sb.from('wells').select('well_code').eq('well_id', id).limit(1); return data?.[0]?.well_code || '';
  }
  function groupBy(arr, key){ return (arr||[]).reduce((m,x)=>{ const k=x[key]||''; (m[k]=m[k]||[]).push(x); return m; },{}); }
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

})();