// Simple PWA app for Wells DB using Supabase
(function () {
  'use strict';

  // Config
  if (!window.APP_CONFIG) {
    console.error('Missing config.js. Copy config.example.js to config.js and set your Supabase URL/Key.');
  }
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
  const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  // Service worker registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
    });
  }

  // Network status
  const netStatus = document.getElementById('netStatus');
  const btnSync = document.getElementById('btnSync');
  function updateNetStatus() {
    const online = navigator.onLine;
    netStatus.textContent = online ? 'Online' : 'Offline';
    netStatus.style.background = online ? '#064e3b' : '#7c2d12';
  }
  window.addEventListener('online', () => { updateNetStatus(); flushQueue(); });
  window.addEventListener('offline', updateNetStatus);
  updateNetStatus();

  // Tabs
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const id = btn.dataset.tab;
      document.getElementById(id).classList.add('active');
    });
  });

  // Offline queue (localStorage)
  const QUEUE_KEY = 'wells_queue_v1';
  const queue = {
    all() {
      try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
    },
    push(item) {
      const data = queue.all();
      data.push(item);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(data));
    },
    setAll(items) {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    }
  };

  async function flushQueue() {
    if (!navigator.onLine || !supabase) return;
    let items = queue.all();
    if (!items.length) return;
    const remaining = [];
    for (const item of items) {
      try {
        // { table, payload }
        const { table, payload } = item;
        const { error } = await supabase.from(table).insert(payload);
        if (error) {
          console.warn('Queue insert error', error.message);
          remaining.push(item);
        }
      } catch (e) {
        console.warn('Queue flush exception', e);
        remaining.push(item);
      }
    }
    queue.setAll(remaining);
    if (remaining.length === 0) {
      toast('All queued items synced.', 'ok');
    } else {
      toast(`${remaining.length} item(s) still queued.`, 'warn');
    }
  }
  btnSync.addEventListener('click', flushQueue);

  // Toast/message helpers
  function setMsg(el, text, type='ok') {
    el.className = `msg ${type}`;
    el.textContent = text;
  }
  function toast(text, type='ok') {
    const bar = document.createElement('div');
    bar.textContent = text;
    bar.style.position = 'fixed';
    bar.style.bottom = '12px';
    bar.style.right = '12px';
    bar.style.background = type === 'ok' ? '#064e3b' : type === 'err' ? '#7f1d1d' : '#92400e';
    bar.style.color = 'white';
    bar.style.padding = '8px 12px';
    bar.style.borderRadius = '8px';
    bar.style.zIndex = 9999;
    document.body.appendChild(bar);
    setTimeout(() => bar.remove(), 2800);
  }

  // DOM elements
  const formWell = document.getElementById('formWell');
  const msgWell = document.getElementById('msgWell');

  const formReading = document.getElementById('formReading');
  const msgReading = document.getElementById('msgReading');
  const readingWell = document.getElementById('readingWell');
  const computedAbstraction = document.getElementById('computedAbstraction');

  const formQuality = document.getElementById('formQuality');
  const msgQuality = document.getElementById('msgQuality');
  const qualityWell = document.getElementById('qualityWell');

  const formMaintenance = document.getElementById('formMaintenance');
  const msgMaintenance = document.getElementById('msgMaintenance');
  const maintenanceWell = document.getElementById('maintenanceWell');

  const formService = document.getElementById('formService');
  const msgService = document.getElementById('msgService');
  const serviceWell = document.getElementById('serviceWell');

  const tblWells = document.getElementById('tblWells');
  const btnRefresh = document.getElementById('btnRefresh');
  const filterText = document.getElementById('filterText');

  // Load wells to dropdowns
  async function loadWells() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('wells')
      .select('well_id, well_code, well_name')
      .order('well_code', { ascending: true });
    if (error) {
      console.warn('Load wells error', error.message);
      return;
    }
    const opts = (data || []).map(w => `<option value="${w.well_id}">${escapeHtml(w.well_code)}${w.well_name ? ' - ' + escapeHtml(w.well_name) : ''}</option>`).join('');
    [readingWell, qualityWell, maintenanceWell, serviceWell].forEach(sel => {
      sel.innerHTML = `<option value="">— Select —</option>` + opts;
    });
  }

  // Wells list
  async function refreshWells() {
    if (!supabase) return;
    const q = (filterText.value || '').trim();
    let query = supabase
      .from('wells')
      .select('well_code, well_name, governorate, district, village, well_type, current_status')
      .order('well_code', { ascending: true })
      .limit(500);
    if (q) {
      query = query.or(`well_code.ilike.%${q}%,well_name.ilike.%${q}%`);
    }
    const { data, error } = await query;
    if (error) {
      console.warn('Refresh wells error', error.message);
      return;
    }
    tblWells.innerHTML = (data || []).map(w => `
      <tr>
        <td>${escapeHtml(w.well_code)}</td>
        <td>${escapeHtml(w.well_name || '')}</td>
        <td>${escapeHtml([w.governorate, w.district, w.village].filter(Boolean).join(' / '))}</td>
        <td>${escapeHtml(w.well_type || '')}</td>
        <td>${escapeHtml(w.current_status || '')}</td>
      </tr>
    `).join('');
  }
  btnRefresh.addEventListener('click', refreshWells);
  filterText.addEventListener('input', () => {
    clearTimeout(filterText._t);
    filterText._t = setTimeout(refreshWells, 250);
  });

  // Compute abstraction client-side for display
  formReading.addEventListener('input', () => {
    const last = parseFloat(formReading.meter_last_m3.value || '0');
    const curr = parseFloat(formReading.meter_current_m3.value || '0');
    const diff = (isFinite(curr) && isFinite(last)) ? (curr - last) : '';
    computedAbstraction.value = isFinite(diff) ? diff : '';
  });

  // Submit handlers
  formWell.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = pick(formWell, [
      'well_code','well_name','governorate','district','village','x','y','z',
      'owner_service_provider','well_type','drilling_year','well_depth_m','casing_depth_m',
      'pump_type','pump_capacity_m3_per_hr','design_capacity_m3_per_year','current_status','remarks'
    ], { number: ['x','y','z','drilling_year','well_depth_m','casing_depth_m','pump_capacity_m3_per_hr','design_capacity_m3_per_year'] });

    if (!payload.well_code || !payload.well_code.trim()) {
      return setMsg(msgWell, 'Well Code is required.', 'err');
    }

    const ok = await insertOrQueue('wells', payload);
    if (ok) {
      setMsg(msgWell, 'Well saved.', 'ok');
      formWell.reset();
      await loadWells();
      await refreshWells();
    } else {
      setMsg(msgWell, 'Saved to offline queue. Will sync when online.', 'warn');
      formWell.reset();
    }
  });

  formReading.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = pick(formReading, [
      'well_id','reading_date','meter_last_m3','meter_current_m3','static_water_level_m','dynamic_water_level_m','pumping_hours','notes'
    ], { number: ['meter_last_m3','meter_current_m3','static_water_level_m','dynamic_water_level_m','pumping_hours'] });

    if (!payload.well_id) return setMsg(msgReading, 'Well is required.', 'err');
    if (!payload.reading_date) return setMsg(msgReading, 'Reading Date is required.', 'err');

    if (payload.meter_current_m3 < payload.meter_last_m3) {
      return setMsg(msgReading, 'Meter Current must be >= Meter Last.', 'err');
    }

    const ok = await insertOrQueue('monthly_readings', payload);
    if (ok) {
      setMsg(msgReading, 'Reading saved.', 'ok');
      formReading.reset();
      computedAbstraction.value = '';
    } else {
      setMsg(msgReading, 'Saved to offline queue. Will sync when online.', 'warn');
      formReading.reset();
      computedAbstraction.value = '';
    }
  });

  formQuality.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = pick(formQuality, [
      'well_id','sample_date','parameter_name','parameter_value','unit','sampling_agency','technician','remarks'
    ], { number: ['parameter_value'] });

    if (!payload.well_id) return setMsg(msgQuality, 'Well is required.', 'err');
    if (!payload.sample_date) return setMsg(msgQuality, 'Sample Date is required.', 'err');
    if (!payload.parameter_name || !payload.parameter_name.trim()) return setMsg(msgQuality, 'Parameter Name is required.', 'err');

    const ok = await insertOrQueue('water_quality', payload);
    if (ok) {
      setMsg(msgQuality, 'Quality record saved.', 'ok');
      formQuality.reset();
    } else {
      setMsg(msgQuality, 'Saved to offline queue. Will sync when online.', 'warn');
      formQuality.reset();
    }
  });

  formMaintenance.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = pick(formMaintenance, [
      'well_id','visit_date','technician_team','activity','notes','cost'
    ], { number: ['cost'] });

    if (!payload.well_id) return setMsg(msgMaintenance, 'Well is required.', 'err');
    if (!payload.visit_date) return setMsg(msgMaintenance, 'Visit Date is required.', 'err');

    const ok = await insertOrQueue('maintenance_visits', payload);
    if (ok) {
      setMsg(msgMaintenance, 'Maintenance saved.', 'ok');
      formMaintenance.reset();
    } else {
      setMsg(msgMaintenance, 'Saved to offline queue. Will sync when online.', 'warn');
      formMaintenance.reset();
    }
  });

  formService.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = pick(formService, [
      'well_id','community_facility','population_served','water_demand_m3_per_month'
    ], { number: ['population_served','water_demand_m3_per_month'] });

    if (!payload.well_id) return setMsg(msgService, 'Well is required.', 'err');

    const ok = await insertOrQueue('service_areas', payload);
    if (ok) {
      setMsg(msgService, 'Service area saved.', 'ok');
      formService.reset();
    } else {
      setMsg(msgService, 'Saved to offline queue. Will sync when online.', 'warn');
      formService.reset();
    }
  });

  // Helpers
  function pick(form, names, opts = {}) {
    const numbers = new Set(opts.number || []);
    const out = {};
    names.forEach(n => {
      const v = form[n]?.value ?? '';
      if (v === '') {
        out[n] = null;
      } else if (numbers.has(n)) {
        const num = Number(v);
        out[n] = Number.isFinite(num) ? num : null;
      } else {
        out[n] = v;
      }
    });
    return out;
  }

  async function insertOrQueue(table, payload) {
    if (!supabase) {
      queue.push({ table, payload });
      return false;
    }
    if (!navigator.onLine) {
      queue.push({ table, payload });
      return false;
    }
    const { error } = await supabase.from(table).insert(payload);
    if (error) {
      if (isTransient(error)) {
        queue.push({ table, payload });
        return false;
      }
      toast(error.message || 'Insert error', 'err');
      return false;
    }
    return true;
  }

  function isTransient(error) {
    const msg = (error && error.message || '').toLowerCase();
    return msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || !navigator.onLine;
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  // Initial load
  (async function init() {
    await loadWells();
    await refreshWells();
    setInterval(() => { if (navigator.onLine) refreshWells(); }, 15000);
  })();
})();