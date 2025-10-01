// Wells PWA app: adds Aquifer, Governorate list, and Map with EPSG:28191 -> WGS84 conversion
(function () {
  'use strict';

  // Create Supabase client
  if (!window.APP_CONFIG) {
    console.error('Missing config.js with SUPABASE_URL and SUPABASE_ANON_KEY');
  }
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
  const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  // Service Worker (optional if you already have one)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
    });
  }

  // Network status indicator
  const netStatus = document.getElementById('netStatus');
  const btnSync = document.getElementById('btnSync');
  function updateNetStatus() {
    const online = navigator.onLine;
    if (netStatus) netStatus.textContent = online ? 'Online' : 'Offline';
  }
  window.addEventListener('online', updateNetStatus);
  window.addEventListener('offline', updateNetStatus);
  updateNetStatus();
  if (btnSync) btnSync.addEventListener('click', () => location.reload());

  // Tabs (robust with delegation)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    const id = btn.dataset.tab;
    const panel = document.getElementById(id);
    if (!panel) return;
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    panel.classList.add('active');

    if (id === 'mapPanel') {
      ensureMap().then(() => {
        renderMap();
        setTimeout(() => { if (map) map.invalidateSize(); }, 120);
      });
    }
  });

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

  // Edit modal elements
  const editWellModal = document.getElementById('editWellModal');
  const formEditWell = document.getElementById('formEditWell');
  const msgEditWell = document.getElementById('msgEditWell');
  const closeEditModal = document.getElementById('closeEditModal');
  const cancelEdit = document.getElementById('cancelEdit');

  // Load wells into dropdowns
  async function loadWellsToDropdowns() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('wells')
      .select('well_id, well_code, well_name')
      .order('well_code', { ascending: true })
      .limit(1000);
    if (error) {
      console.warn('Load wells error:', error.message);
      return;
    }
    const options = (data || []).map(w =>
      `<option value="${w.well_id}">${esc(w.well_code)}${w.well_name ? ' - ' + esc(w.well_name) : ''}</option>`
    ).join('');
    [readingWell, qualityWell, maintenanceWell, serviceWell].forEach(sel => {
      if (sel) sel.innerHTML = `<option value="">— Select —</option>` + options;
    });
  }

  // Wells table
  async function refreshWells() {
    if (!supabase || !tblWells) return;
    const q = (filterText?.value || '').trim();
    let query = supabase
      .from('wells')
      .select('well_id, well_code, well_name, governorate, district, village, aquifer, well_type, current_status, x, y')
      .order('well_code', { ascending: true })
      .limit(1000);
    if (q) {
      query = query.or(`well_code.ilike.%${q}%,well_name.ilike.%${q}%`);
    }
    const { data, error } = await query;
    if (error) {
      console.warn('Refresh wells error:', error.message);
      return;
    }
    tblWells.innerHTML = (data || []).map(w => `
      <tr>
        <td>${esc(w.well_code)}</td>
        <td>${esc(w.well_name || '')}</td>
        <td>${esc([w.governorate, w.district, w.village].filter(Boolean).join(' / '))}</td>
        <td>${esc(w.aquifer || '')}</td>
        <td>${esc(w.well_type || '')}</td>
        <td>${esc(w.current_status || '')}</td>
        <td><button type="button" class="btn-edit" onclick="openEditModal('${w.well_id}')">Edit</button></td>
      </tr>
    `).join('');
    
    // Update map markers if map is already loaded
    if (map) renderMap(data || []);
  }
  if (btnRefresh) btnRefresh.addEventListener('click', refreshWells);
  if (filterText) {
    filterText.addEventListener('input', () => {
      clearTimeout(filterText._t);
      filterText._t = setTimeout(refreshWells, 250);
    });
  }

  // Reading abstraction preview
  if (formReading && computedAbstraction) {
    formReading.addEventListener('input', () => {
      const a = parseFloat(formReading.meter_last_m3.value || '0');
      const b = parseFloat(formReading.meter_current_m3.value || '0');
      const diff = b - a;
      computedAbstraction.value = Number.isFinite(diff) ? diff : '';
    });
  }

  // Submit handlers
  if (formWell) {
    formWell.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = getFormPayload(formWell, [
        'well_code','well_name','governorate','district','village',
        'x','y','z','owner_service_provider','aquifer','well_type',
        'drilling_year','well_depth_m','casing_depth_m','pump_type',
        'pump_capacity_m3_per_hr','design_capacity_m3_per_year',
        'current_status','remarks'
      ], ['x','y','z','drilling_year','well_depth_m','casing_depth_m','pump_capacity_m3_per_hr','design_capacity_m3_per_year']);

      if (!payload.well_code || !payload.well_code.trim()) {
        return setMsg(msgWell, 'Well Code is required.', 'err');
      }

      const { error } = await supabase.from('wells').insert(payload);
      if (error) {
        setMsg(msgWell, error.message || 'Error saving well.', 'err');
      } else {
        setMsg(msgWell, 'Well saved.', 'ok');
        formWell.reset();
        await loadWellsToDropdowns();
        await refreshWells();
      }
    });
  }

  if (formReading) {
    formReading.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = getFormPayload(formReading, [
        'well_id','reading_date','meter_last_m3','meter_current_m3',
        'static_water_level_m','dynamic_water_level_m','pumping_hours','notes'
      ], ['meter_last_m3','meter_current_m3','static_water_level_m','dynamic_water_level_m','pumping_hours']);

      if (!payload.well_id) return setMsg(msgReading, 'Well is required.', 'err');
      if (!payload.reading_date) return setMsg(msgReading, 'Reading Date is required.', 'err');
      if (payload.meter_current_m3 < payload.meter_last_m3) {
        return setMsg(msgReading, 'Meter Current must be >= Meter Last.', 'err');
      }

      const { error } = await supabase.from('monthly_readings').insert(payload);
      if (error) setMsg(msgReading, error.message || 'Error saving reading.', 'err');
      else { setMsg(msgReading, 'Reading saved.', 'ok'); formReading.reset(); if (computedAbstraction) computedAbstraction.value=''; }
    });
  }

  if (formQuality) {
    formQuality.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = getFormPayload(formQuality, [
        'well_id','sample_date','parameter_name','parameter_value','unit','sampling_agency','technician','remarks'
      ], ['parameter_value']);

      if (!payload.well_id) return setMsg(msgQuality, 'Well is required.', 'err');
      if (!payload.sample_date) return setMsg(msgQuality, 'Sample Date is required.', 'err');
      if (!payload.parameter_name || !payload.parameter_name.trim()) return setMsg(msgQuality, 'Parameter Name is required.', 'err');

      const { error } = await supabase.from('water_quality').insert(payload);
      if (error) setMsg(msgQuality, error.message || 'Error saving water quality.', 'err');
      else { setMsg(msgQuality, 'Quality saved.', 'ok'); formQuality.reset(); }
    });
  }

  if (formMaintenance) {
    formMaintenance.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = getFormPayload(formMaintenance, [
        'well_id','visit_date','technician_team','activity','notes','cost'
      ], ['cost']);

      if (!payload.well_id) return setMsg(msgMaintenance, 'Well is required.', 'err');
      if (!payload.visit_date) return setMsg(msgMaintenance, 'Visit Date is required.', 'err');

      const { error } = await supabase.from('maintenance_visits').insert(payload);
      if (error) setMsg(msgMaintenance, error.message || 'Error saving maintenance.', 'err');
      else { setMsg(msgMaintenance, 'Maintenance saved.', 'ok'); formMaintenance.reset(); }
    });
  }

  if (formService) {
    formService.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = getFormPayload(formService, [
        'well_id','community_facility','population_served','water_demand_m3_per_month'
      ], ['population_served','water_demand_m3_per_month']);

      if (!payload.well_id) return setMsg(msgService, 'Well is required.', 'err');

      const { error } = await supabase.from('service_areas').insert(payload);
      if (error) setMsg(msgService, error.message || 'Error saving service area.', 'err');
      else { setMsg(msgService, 'Service area saved.', 'ok'); formService.reset(); }
    });
  }

  // Edit Well Modal functionality
  window.openEditModal = async function(wellId) {
    if (!supabase || !wellId) return;
    
    // Fetch well data
    const { data, error } = await supabase
      .from('wells')
      .select('*')
      .eq('well_id', wellId)
      .single();
    
    if (error) {
      console.warn('Error loading well for edit:', error.message);
      return;
    }
    
    if (!data) {
      console.warn('Well not found');
      return;
    }
    
    // Populate form fields
    document.getElementById('editWellId').value = data.well_id;
    document.getElementById('editWellCode').value = data.well_code || '';
    document.getElementById('editWellName').value = data.well_name || '';
    document.getElementById('editGovernorate').value = data.governorate || '';
    document.getElementById('editDistrict').value = data.district || '';
    document.getElementById('editVillage').value = data.village || '';
    document.getElementById('editX').value = data.x || '';
    document.getElementById('editY').value = data.y || '';
    document.getElementById('editZ').value = data.z || '';
    document.getElementById('editOwner').value = data.owner_service_provider || '';
    document.getElementById('editAquifer').value = data.aquifer || '';
    document.getElementById('editWellType').value = data.well_type || '';
    document.getElementById('editDrillingYear').value = data.drilling_year || '';
    document.getElementById('editStatus').value = data.current_status || '';
    document.getElementById('editWellDepth').value = data.well_depth_m || '';
    document.getElementById('editCasingDepth').value = data.casing_depth_m || '';
    document.getElementById('editPumpType').value = data.pump_type || '';
    document.getElementById('editPumpCapacity').value = data.pump_capacity_m3_per_hr || '';
    document.getElementById('editDesignCapacity').value = data.design_capacity_m3_per_year || '';
    document.getElementById('editRemarks').value = data.remarks || '';
    
    // Show modal
    if (editWellModal) {
      editWellModal.style.display = 'block';
      setMsg(msgEditWell, '', 'ok'); // Clear any previous messages
    }
  }
  
  function closeEditModalFunc() {
    if (editWellModal) {
      editWellModal.style.display = 'none';
    }
    if (formEditWell) {
      formEditWell.reset();
    }
  }
  
  // Modal event listeners
  if (closeEditModal) {
    closeEditModal.addEventListener('click', closeEditModalFunc);
  }
  if (cancelEdit) {
    cancelEdit.addEventListener('click', closeEditModalFunc);
  }
  
  // Close modal when clicking outside
  if (editWellModal) {
    editWellModal.addEventListener('click', (e) => {
      if (e.target === editWellModal) {
        closeEditModalFunc();
      }
    });
  }
  
  // Edit form submit handler
  if (formEditWell) {
    formEditWell.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const wellId = document.getElementById('editWellId').value;
      if (!wellId) {
        setMsg(msgEditWell, 'No well selected for editing.', 'err');
        return;
      }
      
      const payload = getFormPayload(formEditWell, [
        'well_code','well_name','governorate','district','village',
        'x','y','z','owner_service_provider','aquifer','well_type',
        'drilling_year','well_depth_m','casing_depth_m','pump_type',
        'pump_capacity_m3_per_hr','design_capacity_m3_per_year',
        'current_status','remarks'
      ], ['x','y','z','drilling_year','well_depth_m','casing_depth_m','pump_capacity_m3_per_hr','design_capacity_m3_per_year']);

      if (!payload.well_code || !payload.well_code.trim()) {
        return setMsg(msgEditWell, 'Well Code is required.', 'err');
      }

      const { error } = await supabase
        .from('wells')
        .update(payload)
        .eq('well_id', wellId);
        
      if (error) {
        setMsg(msgEditWell, error.message || 'Error updating well.', 'err');
      } else {
        setMsg(msgEditWell, 'Well updated successfully.', 'ok');
        setTimeout(() => {
          closeEditModalFunc();
          refreshWells();
          loadWellsToDropdowns(); // Refresh dropdowns in case name/code changed
        }, 1500);
      }
    });
  }

  function getFormPayload(form, fields, numeric = []) {
    const num = new Set(numeric);
    const out = {};
    fields.forEach(n => {
      const val = form[n]?.value ?? '';
      if (val === '') out[n] = null;
      else if (num.has(n)) {
        const v = Number(val);
        out[n] = Number.isFinite(v) ? v : null;
      } else {
        out[n] = val;
      }
    });
    return out;
  }

  function setMsg(el, text, type = 'ok') {
    if (!el) return;
    el.className = `msg ${type}`;
    el.textContent = text;
  }

  function esc(s) {
    return (s || '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Map + EPSG:28191 conversion
  let map = null;
  let markersLayer = null;

  async function ensureMap() {
    if (map) return map;
    if (typeof L === 'undefined') {
      console.warn('Leaflet not loaded');
      return null;
    }
    // Register EPSG:28191 in proj4 if available
    if (typeof proj4 !== 'undefined' && !proj4.defs['EPSG:28191']) {
      proj4.defs('EPSG:28191',
        '+proj=cass +lat_0=31.73439361111111 +lon_0=35.21208055555556 +x_0=170251.555 +y_0=126867.909 +a=6378300.789 +rf=293.4663155389811 +towgs84=-235.41,-85.33,-264.94,0,0,0,0 +units=m +no_defs'
      );
    }

    map = L.map('map', { preferCanvas: true }).setView([31.95, 35.23], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
    return map;
  }

  function toWgs84From28191(x, y) {
    if (typeof proj4 === 'undefined' || !proj4.defs['EPSG:28191']) return null;
    try {
      const [lon, lat] = proj4('EPSG:28191', 'WGS84', [Number(x), Number(y)]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
      return [lat, lon];
    } catch {
      return null;
    }
  }

  async function renderMap(existing) {
    if (!map || !supabase) return;
    let rows = existing;
    if (!Array.isArray(rows)) {
      const { data, error } = await supabase
        .from('wells')
        .select('well_code, well_name, governorate, district, village, aquifer, x, y')
        .limit(1000);
      if (error) {
        console.warn('Map load wells error:', error.message);
        return;
      }
      rows = data || [];
    }

    markersLayer.clearLayers();
    const bounds = [];

    for (const w of rows) {
      if (w == null || w.x == null || w.y == null) continue;
      const latlon = toWgs84From28191(w.x, w.y);
      if (!latlon) continue;
      const [lat, lon] = latlon;
      const popup = `
        <strong>${esc(w.well_code || '')}</strong>${w.well_name ? ' - ' + esc(w.well_name) : ''}<br/>
        ${esc([w.governorate, w.district, w.village].filter(Boolean).join(' / '))}<br/>
        Aquifer: ${esc(w.aquifer || '—')}<br/>
        <small>Lat: ${lat.toFixed(6)}, Lon: ${lon.toFixed(6)}</small><br/>
        <a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" rel="noopener">Open in Google Maps</a>
      `;
      L.marker([lat, lon]).bindPopup(popup).addTo(markersLayer);
      bounds.push([lat, lon]);
    }

    if (bounds.length) {
      map.fitBounds(bounds, { padding: [18,18] });
    }
  }

  // View Readings functionality
  const viewReadingsWell = document.getElementById('viewReadingsWell');
  const viewReadingsFromDate = document.getElementById('viewReadingsFromDate');
  const viewReadingsToDate = document.getElementById('viewReadingsToDate');
  const loadReadingsBtn = document.getElementById('loadReadingsBtn');
  const clearReadingsBtn = document.getElementById('clearReadingsBtn');
  const readingsStatus = document.getElementById('readingsStatus');
  const readingsSummary = document.getElementById('readingsSummary');
  const readingsTable = document.getElementById('readingsTable');
  const readingsTableBody = document.getElementById('readingsTableBody');
  const noReadingsMessage = document.getElementById('noReadingsMessage');

  // Summary elements
  const totalRecords = document.getElementById('totalRecords');
  const totalAbstraction = document.getElementById('totalAbstraction');
  const avgMonthly = document.getElementById('avgMonthly');
  const dateRange = document.getElementById('dateRange');

  async function loadWellsForReadingsView() {
    if (!supabase || !viewReadingsWell) return;
    
    const { data, error } = await supabase
      .from('wells')
      .select('well_id, well_code, well_name')
      .order('well_code', { ascending: true })
      .limit(1000);
      
    if (error) {
      console.warn('Load wells for readings view error:', error.message);
      return;
    }
    
    const options = (data || []).map(w =>
      `<option value="${w.well_id}">${esc(w.well_code)}${w.well_name ? ' - ' + esc(w.well_name) : ''}</option>`
    ).join('');
    
    viewReadingsWell.innerHTML = `<option value="">— Select Well —</option>` + options;
  }

  async function loadMonthlyReadings() {
    if (!supabase || !viewReadingsWell || !viewReadingsWell.value) {
      setReadingsStatus('Please select a well first.', 'err');
      return;
    }

    const wellId = viewReadingsWell.value;
    const fromDate = viewReadingsFromDate?.value || null;
    const toDate = viewReadingsToDate?.value || null;

    setReadingsStatus('Loading readings...', 'info');

    try {
      let query = supabase
        .from('monthly_readings')
        .select('*')
        .eq('well_id', wellId)
        .order('reading_date', { ascending: false });

      if (fromDate) {
        query = query.gte('reading_date', fromDate);
      }
      if (toDate) {
        query = query.lte('reading_date', toDate);
      }

      const { data, error } = await query.limit(500);

      if (error) throw error;

      displayReadings(data || []);
      setReadingsStatus(`Found ${(data || []).length} reading(s).`, 'ok');

    } catch (error) {
      console.error('Error loading readings:', error);
      setReadingsStatus(`Error: ${error.message}`, 'err');
      showNoReadingsMessage();
    }
  }

  function displayReadings(readings) {
    if (!readings || readings.length === 0) {
      showNoReadingsMessage();
      return;
    }

    // Show table and summary
    if (readingsTable) readingsTable.style.display = 'table';
    if (readingsSummary) readingsSummary.style.display = 'flex';
    if (noReadingsMessage) noReadingsMessage.style.display = 'none';

    // Populate table
    if (readingsTableBody) {
      readingsTableBody.innerHTML = readings.map(reading => {
        const date = new Date(reading.reading_date);
        const monthYear = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        
        return `
          <tr>
            <td>${reading.reading_date || '-'}</td>
            <td>${monthYear}</td>
            <td>${formatNumber(reading.meter_last_m3)}</td>
            <td>${formatNumber(reading.meter_current_m3)}</td>
            <td class="abstraction-cell">${formatNumber(reading.monthly_abstraction_m3)}</td>
            <td>${formatNumber(reading.static_water_level_m)}</td>
            <td>${formatNumber(reading.dynamic_water_level_m)}</td>
            <td>${formatNumber(reading.pumping_hours)}</td>
            <td>${esc(reading.notes || '')}</td>
          </tr>
        `;
      }).join('');
    }

    // Calculate and display summary
    updateReadingsSummary(readings);
  }

  function updateReadingsSummary(readings) {
    const count = readings.length;
    const abstractions = readings
      .map(r => r.monthly_abstraction_m3)
      .filter(a => a !== null && a !== undefined && Number.isFinite(a));
    
    const totalAbs = abstractions.reduce((sum, val) => sum + val, 0);
    const avgAbs = abstractions.length > 0 ? totalAbs / abstractions.length : 0;

    const dates = readings
      .map(r => r.reading_date)
      .filter(d => d)
      .sort();
    
    const dateRangeText = dates.length > 0 
      ? dates.length === 1 
        ? dates[0]
        : `${dates[0]} to ${dates[dates.length - 1]}`
      : '-';

    if (totalRecords) totalRecords.textContent = count;
    if (totalAbstraction) totalAbstraction.textContent = formatNumber(totalAbs);
    if (avgMonthly) avgMonthly.textContent = formatNumber(avgAbs);
    if (dateRange) dateRange.textContent = dateRangeText;
  }

  function showNoReadingsMessage() {
    if (readingsTable) readingsTable.style.display = 'none';
    if (readingsSummary) readingsSummary.style.display = 'none';
    if (noReadingsMessage) noReadingsMessage.style.display = 'block';
  }

  function clearReadingsFilters() {
    if (viewReadingsWell) viewReadingsWell.value = '';
    if (viewReadingsFromDate) viewReadingsFromDate.value = '';
    if (viewReadingsToDate) viewReadingsToDate.value = '';
    showNoReadingsMessage();
    setReadingsStatus('', 'ok');
  }

  function setReadingsStatus(message, type = 'ok') {
    if (!readingsStatus) return;
    readingsStatus.textContent = message;
    readingsStatus.className = `status-text ${type}`;
  }

  function formatNumber(value) {
    if (value === null || value === undefined || value === '') return '-';
    if (!Number.isFinite(Number(value))) return '-';
    return Number(value).toLocaleString(undefined, { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 2 
    });
  }

  // Event listeners for View Readings
  if (loadReadingsBtn) {
    loadReadingsBtn.addEventListener('click', loadMonthlyReadings);
  }

  if (clearReadingsBtn) {
    clearReadingsBtn.addEventListener('click', clearReadingsFilters);
  }

  if (viewReadingsWell) {
    viewReadingsWell.addEventListener('change', () => {
      if (viewReadingsWell.value) {
        loadMonthlyReadings();
      } else {
        showNoReadingsMessage();
      }
    });
  }

  // Initial load
  (async function init() {
    await loadWellsToDropdowns();
    await loadWellsForReadingsView(); // Load wells for readings view
    await refreshWells();
  })();
})();
