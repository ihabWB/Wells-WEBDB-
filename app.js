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
  const estimationInfo = document.getElementById('estimationInfo');
  const dashboardCharts = document.getElementById('dashboardCharts');

  // Summary elements
  const totalRecords = document.getElementById('totalRecords');
  const totalAbstraction = document.getElementById('totalAbstraction');
  const avgMonthly = document.getElementById('avgMonthly');
  const dateRange = document.getElementById('dateRange');

  // Chart instances
  let charts = {
    timeSeries: null,
    monthlyPattern: null,
    waterLevel: null,
    pumping: null
  };

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

    // Process readings with intelligent abstraction estimation
    const processedReadings = estimateAbstractions(readings);

    // Show table and summary
    if (readingsTable) readingsTable.style.display = 'table';
    if (readingsSummary) readingsSummary.style.display = 'flex';
    if (dashboardCharts) dashboardCharts.style.display = 'block';
    if (noReadingsMessage) noReadingsMessage.style.display = 'none';
    
    // Show estimation info if any readings are estimated
    const hasEstimations = processedReadings.some(r => r.hasEstimation);
    if (estimationInfo) {
      estimationInfo.style.display = hasEstimations ? 'block' : 'none';
    }

    // Populate table
    if (readingsTableBody) {
      readingsTableBody.innerHTML = processedReadings.map(reading => {
        const date = new Date(reading.reading_date);
        const monthYear = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        
        // Determine abstraction display
        const absDisplay = getAbstractionDisplay(reading);
        
        return `
          <tr class="${reading.hasEstimation ? 'estimated-row' : ''}">
            <td>${reading.reading_date || '-'}</td>
            <td>${monthYear}</td>
            <td>${formatNumber(reading.meter_last_m3)}</td>
            <td>${formatNumber(reading.meter_current_m3)}</td>
            <td class="abstraction-cell">${absDisplay}</td>
            <td>${formatNumber(reading.static_water_level_m)}</td>
            <td>${formatNumber(reading.dynamic_water_level_m)}</td>
            <td>${formatNumber(reading.pumping_hours)}</td>
            <td>${esc(reading.notes || '')}</td>
          </tr>
        `;
      }).join('');
    }

    // Calculate and display summary
    updateReadingsSummary(processedReadings);
    
    // Create charts
    createDashboardCharts(processedReadings);
  }

  function estimateAbstractions(readings) {
    if (!readings || readings.length <= 1) return readings;

    // Sort by date to ensure proper time series
    const sortedReadings = [...readings].sort((a, b) => 
      new Date(a.reading_date) - new Date(b.reading_date)
    );

    // Calculate normalized monthly rates from irregular readings
    const monthlyRates = [];
    for (let i = 1; i < sortedReadings.length; i++) {
      const current = sortedReadings[i];
      const previous = sortedReadings[i - 1];
      
      const currentAbs = current.monthly_abstraction_m3;
      const monthsGap = getMonthsDifference(
        new Date(previous.reading_date),
        new Date(current.reading_date)
      );
      
      // Only use positive abstractions and valid time gaps
      if (currentAbs > 0 && monthsGap > 0) {
        const monthlyRate = currentAbs / monthsGap; // Average per month
        monthlyRates.push({
          rate: monthlyRate,
          totalAbstraction: currentAbs,
          monthsSpan: monthsGap,
          index: i,
          date: current.reading_date,
          startDate: previous.reading_date,
          endDate: current.reading_date
        });
      }
    }

    // If we have fewer than 2 valid rates, can't estimate effectively
    if (monthlyRates.length < 2) {
      return sortedReadings.map(r => ({ ...r, hasEstimation: false }));
    }

    // Calculate statistics from monthly rates
    const rates = monthlyRates.map(r => r.rate);
    const avgMonthlyRate = rates.reduce((sum, r) => sum + r, 0) / rates.length;
    const medianMonthlyRate = calculateMedian(rates);
    const seasonalRates = analyzeSeasonalRates(monthlyRates);
    const trend = calculateRateTrend(monthlyRates);

    // Process each reading for estimation
    const processedReadings = sortedReadings.map((reading, index) => {
      const abs = reading.monthly_abstraction_m3;
      
      // If abstraction is valid and positive (non-zero), keep it
      if (abs !== null && abs !== undefined && Number.isFinite(abs) && abs > 0) {
        return { ...reading, hasEstimation: false, estimatedValue: null };
      }

      // Estimate the abstraction using gap-aware algorithm
      const estimated = estimateAbstractionForGap(
        index, 
        sortedReadings, 
        monthlyRates, 
        avgMonthlyRate, 
        medianMonthlyRate,
        trend, 
        seasonalRates
      );
      
      return {
        ...reading,
        hasEstimation: true,
        estimatedValue: estimated,
        originalValue: abs
      };
    });

    return processedReadings;
  }

  function analyzeSeasonalRates(monthlyRates) {
    if (monthlyRates.length < 4) return {}; // Need sufficient data
    
    const seasonalData = {};
    
    monthlyRates.forEach(rate => {
      const startDate = new Date(rate.startDate);
      const endDate = new Date(rate.endDate);
      
      // Distribute the rate across all months in the span
      let currentDate = new Date(startDate);
      currentDate.setMonth(currentDate.getMonth() + 1); // Start from month after start date
      
      while (currentDate <= endDate) {
        const month = currentDate.getMonth();
        if (!seasonalData[month]) {
          seasonalData[month] = { rates: [], count: 0 };
        }
        seasonalData[month].rates.push(rate.rate);
        seasonalData[month].count++;
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    });
    
    // Calculate averages for each month
    const seasonalAverages = {};
    for (const month in seasonalData) {
      const rates = seasonalData[month].rates;
      if (rates.length > 0) {
        seasonalAverages[month] = rates.reduce((sum, r) => sum + r, 0) / rates.length;
      }
    }
    
    return seasonalAverages;
  }

  function calculateRateTrend(monthlyRates) {
    if (monthlyRates.length < 2) return 0;
    
    // Calculate trend based on time progression
    const n = monthlyRates.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    monthlyRates.forEach((rate, i) => {
      sumX += i;
      sumY += rate.rate;
      sumXY += i * rate.rate;
      sumX2 += i * i;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return isFinite(slope) ? slope : 0;
  }

  function estimateAbstractionForGap(targetIndex, allReadings, monthlyRates, avgMonthlyRate, medianMonthlyRate, trend, seasonalRates) {
    const targetReading = allReadings[targetIndex];
    const targetDate = new Date(targetReading.reading_date);
    
    // Find the previous valid reading to calculate the gap
    let previousReading = null;
    for (let i = targetIndex - 1; i >= 0; i--) {
      if (allReadings[i].meter_current_m3 !== null && allReadings[i].meter_current_m3 !== undefined) {
        previousReading = allReadings[i];
        break;
      }
    }
    
    if (!previousReading) {
      // No previous reading, use seasonal or median rate for 1 month
      const targetMonth = targetDate.getMonth();
      const monthlyRate = seasonalRates[targetMonth] || medianMonthlyRate || avgMonthlyRate;
      return Math.max(0, monthlyRate);
    }
    
    // Calculate months gap between previous reading and target
    const monthsGap = getMonthsDifference(
      new Date(previousReading.reading_date),
      targetDate
    );
    
    if (monthsGap <= 0) {
      return Math.max(0, medianMonthlyRate || avgMonthlyRate);
    }
    
    // Method 1: Find similar gap patterns in historical data
    const similarGaps = monthlyRates.filter(rate => 
      Math.abs(rate.monthsSpan - monthsGap) <= 1 // Allow ±1 month difference
    );
    
    if (similarGaps.length > 0) {
      const avgRate = similarGaps.reduce((sum, r) => sum + r.rate, 0) / similarGaps.length;
      return Math.max(0, avgRate * monthsGap); // Total for the gap period
    }
    
    // Method 2: Use seasonal awareness for the target month
    const targetMonth = targetDate.getMonth();
    let estimatedRate = seasonalRates[targetMonth] || medianMonthlyRate || avgMonthlyRate;
    
    // Apply trend if we have enough data
    if (monthlyRates.length >= 3) {
      const timePosition = targetIndex / allReadings.length;
      estimatedRate += trend * timePosition;
    }
    
    // Return total abstraction for the gap period
    return Math.max(0, estimatedRate * monthsGap);
  }

  function getMonthsDifference(date1, date2) {
    if (!date1 || !date2) return 0;
    
    const months = (date2.getFullYear() - date1.getFullYear()) * 12 + 
                   (date2.getMonth() - date1.getMonth());
    
    // Add fractional month based on days
    const daysInMonth = new Date(date2.getFullYear(), date2.getMonth() + 1, 0).getDate();
    const daysDiff = date2.getDate() - date1.getDate();
    const fractionalMonth = daysDiff / daysInMonth;
    
    return Math.max(0, months + fractionalMonth);
  }

  function calculateMedian(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  function analyzeSeasonalPattern(validAbstractions) {
    if (validAbstractions.length < 12) return {}; // Need at least a year of data
    
    const monthlyAverages = {};
    const monthlyCount = {};
    
    validAbstractions.forEach(item => {
      const month = new Date(item.date).getMonth(); // 0-11
      if (!monthlyAverages[month]) {
        monthlyAverages[month] = 0;
        monthlyCount[month] = 0;
      }
      monthlyAverages[month] += item.value;
      monthlyCount[month]++;
    });
    
    // Calculate averages for each month
    for (const month in monthlyAverages) {
      monthlyAverages[month] = monthlyAverages[month] / monthlyCount[month];
    }
    
    return monthlyAverages;
  }

  function estimateAbstractionValueEnhanced(targetIndex, allReadings, validAbstractions, avgAbstraction, medianAbstraction, trend, seasonalPattern) {
    const targetDate = new Date(allReadings[targetIndex].reading_date);
    const targetMonth = targetDate.getMonth();
    
    // Find nearest valid non-zero values before and after
    const before = validAbstractions.filter(v => v.index < targetIndex).pop();
    const after = validAbstractions.find(v => v.index > targetIndex);
    
    // Method 1: Seasonal-aware interpolation between nearest values
    if (before && after) {
      const beforeDate = new Date(allReadings[before.index].reading_date);
      const afterDate = new Date(allReadings[after.index].reading_date);
      const totalDays = (afterDate - beforeDate) / (1000 * 60 * 60 * 24);
      const targetDays = (targetDate - beforeDate) / (1000 * 60 * 60 * 24);
      
      if (totalDays > 0) {
        const ratio = targetDays / totalDays;
        let interpolated = before.value + (after.value - before.value) * ratio;
        
        // Apply seasonal adjustment if available
        if (seasonalPattern[targetMonth] && avgAbstraction > 0) {
          const seasonalFactor = seasonalPattern[targetMonth] / avgAbstraction;
          interpolated *= seasonalFactor;
        }
        
        return Math.max(0, interpolated);
      }
    }
    
    // Method 2: Enhanced extrapolation with seasonal awareness
    if (before) {
      const monthsDiff = getMonthsDifference(
        new Date(allReadings[before.index].reading_date),
        targetDate
      );
      
      let estimated = before.value + (trend * monthsDiff);
      
      // Apply seasonal adjustment
      if (seasonalPattern[targetMonth] && avgAbstraction > 0) {
        const seasonalFactor = seasonalPattern[targetMonth] / avgAbstraction;
        estimated = (estimated * 0.7) + (seasonalPattern[targetMonth] * 0.3); // Weighted combination
      }
      
      return Math.max(0, estimated);
    }
    
    if (after) {
      const monthsDiff = getMonthsDifference(
        targetDate,
        new Date(allReadings[after.index].reading_date)
      );
      
      let estimated = after.value - (trend * monthsDiff);
      
      // Apply seasonal adjustment
      if (seasonalPattern[targetMonth] && avgAbstraction > 0) {
        const seasonalFactor = seasonalPattern[targetMonth] / avgAbstraction;
        estimated = (estimated * 0.7) + (seasonalPattern[targetMonth] * 0.3);
      }
      
      return Math.max(0, estimated);
    }
    
    // Method 3: Seasonal or median fallback (prefer median over average for robustness)
    if (seasonalPattern[targetMonth]) {
      return Math.max(0, seasonalPattern[targetMonth]);
    }
    
    // Use median as it's more robust against outliers than average
    return Math.max(0, medianAbstraction || avgAbstraction);
  }

  function calculateTrend(validAbstractions) {
    if (validAbstractions.length < 2) return 0;
    
    // Simple linear trend calculation using non-zero values only
    const n = validAbstractions.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    validAbstractions.forEach((item, i) => {
      sumX += i;
      sumY += item.value;
      sumXY += i * item.value;
      sumX2 += i * i;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return isFinite(slope) ? slope : 0;
  }

  function calculateMedian(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  function getMonthsDifference(date1, date2) {
    const months = (date2.getFullYear() - date1.getFullYear()) * 12 + 
                   (date2.getMonth() - date1.getMonth());
    return Math.abs(months);
  }

  function getAbstractionDisplay(reading) {
    if (reading.hasEstimation) {
      const estimated = formatNumber(reading.estimatedValue);
      const original = reading.originalValue !== null && reading.originalValue !== undefined 
        ? formatNumber(reading.originalValue) 
        : 'N/A';
      
      return `
        <span class="estimated-value" title="Estimated value based on time series analysis">
          ${estimated} <span class="estimation-badge">EST</span>
        </span>
        ${original !== 'N/A' && original !== '-' ? 
          `<br><small class="original-value">Original: ${original}</small>` : ''}
      `;
    } else {
      return formatNumber(reading.monthly_abstraction_m3);
    }
  }

  function updateReadingsSummary(readings) {
    const count = readings.length;
    const estimatedCount = readings.filter(r => r.hasEstimation).length;
    
    // Get abstraction values (use estimated values where available, exclude zeros)
    const abstractions = readings
      .map(r => r.hasEstimation ? r.estimatedValue : r.monthly_abstraction_m3)
      .filter(a => a !== null && a !== undefined && Number.isFinite(a) && a > 0);
    
    const totalAbs = abstractions.reduce((sum, val) => sum + val, 0);
    const validReadingsCount = abstractions.length;

    // Calculate time-based average considering irregular intervals
    let avgAbs = 0;
    const dates = readings
      .map(r => r.reading_date)
      .filter(d => d)
      .sort();
    
    if (dates.length >= 2 && totalAbs > 0) {
      // Calculate total months covered from first to last reading
      const firstDate = new Date(dates[0]);
      const lastDate = new Date(dates[dates.length - 1]);
      const totalMonths = getMonthsDifference(firstDate, lastDate);
      
      if (totalMonths > 0) {
        avgAbs = totalAbs / totalMonths; // True monthly average accounting for gaps
      } else {
        avgAbs = validReadingsCount > 0 ? totalAbs / validReadingsCount : 0;
      }
    } else if (validReadingsCount > 0) {
      avgAbs = totalAbs / validReadingsCount; // Fallback for single reading
    }
    
    const dateRangeText = dates.length > 0 
      ? dates.length === 1 
        ? dates[0]
        : `${dates[0]} to ${dates[dates.length - 1]}`
      : '-';

    // Update summary with estimation info and time-aware calculation
    if (totalRecords) {
      const recordsText = estimatedCount > 0 
        ? `${count} total (${estimatedCount} estimated, ${validReadingsCount} with pumping)`
        : `${count} total (${validReadingsCount} with pumping)`;
      totalRecords.innerHTML = `<span title="Total readings / Estimated readings / Readings with actual pumping">${recordsText}</span>`;
    }
    if (totalAbstraction) {
      totalAbstraction.innerHTML = `<span title="Total abstraction excluding zero values">${formatNumber(totalAbs)}</span>`;
    }
    if (avgMonthly) {
      const tooltipText = dates.length >= 2 
        ? `Average monthly rate across ${Math.round(getMonthsDifference(new Date(dates[0]), new Date(dates[dates.length - 1])))} months (${dates[0]} to ${dates[dates.length - 1]})` 
        : "Average monthly abstraction excluding zero values";
      avgMonthly.innerHTML = `<span title="${tooltipText}">${formatNumber(avgAbs)}</span>`;
    }
    if (dateRange) dateRange.textContent = dateRangeText;
  }

  function showNoReadingsMessage() {
    if (readingsTable) readingsTable.style.display = 'none';
    if (readingsSummary) readingsSummary.style.display = 'none';
    if (dashboardCharts) dashboardCharts.style.display = 'none';
    if (noReadingsMessage) noReadingsMessage.style.display = 'block';
    if (estimationInfo) estimationInfo.style.display = 'none';
    
    // Destroy existing charts
    destroyCharts();
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

  // Chart Management Functions
  function createDashboardCharts(readings) {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js not loaded');
      return;
    }

    // Destroy existing charts
    destroyCharts();

    // Filter valid readings for charts
    const validReadings = readings.filter(r => r.reading_date);
    
    if (validReadings.length === 0) return;

    // Create individual charts
    createTimeSeriesChart(validReadings);
    createMonthlyPatternChart(validReadings);
    createWaterLevelChart(validReadings);
    createPumpingChart(validReadings);
  }

  function destroyCharts() {
    Object.keys(charts).forEach(key => {
      if (charts[key]) {
        charts[key].destroy();
        charts[key] = null;
      }
    });
  }

  function createTimeSeriesChart(readings) {
    const ctx = document.getElementById('timeSeriesChart');
    if (!ctx) return;

    const sortedReadings = [...readings].sort((a, b) => new Date(a.reading_date) - new Date(b.reading_date));
    
    const labels = sortedReadings.map(r => new Date(r.reading_date).toLocaleDateString());
    const abstractionData = sortedReadings.map(r => {
      const value = r.hasEstimation ? r.estimatedValue : r.monthly_abstraction_m3;
      return value > 0 ? value : null;
    });
    const estimatedData = sortedReadings.map(r => r.hasEstimation && r.estimatedValue > 0 ? r.estimatedValue : null);

    charts.timeSeries = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Actual Abstraction (m³)',
          data: abstractionData,
          borderColor: '#0e7490',
          backgroundColor: 'rgba(14, 116, 144, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#0e7490',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 4
        }, {
          label: 'Estimated Values',
          data: estimatedData,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.2)',
          borderWidth: 2,
          borderDash: [5, 5],
          pointBackgroundColor: '#f59e0b',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointStyle: 'triangle'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Abstraction (m³)'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Reading Date'
            }
          }
        },
        plugins: {
          legend: {
            display: true
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        }
      }
    });
  }

  function createMonthlyPatternChart(readings) {
    const ctx = document.getElementById('monthlyPatternChart');
    if (!ctx) return;

    // Group readings by month (0-11)
    const monthlyData = new Array(12).fill(0);
    const monthlyCounts = new Array(12).fill(0);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    readings.forEach(r => {
      const value = r.hasEstimation ? r.estimatedValue : r.monthly_abstraction_m3;
      if (value > 0) {
        const month = new Date(r.reading_date).getMonth();
        monthlyData[month] += value;
        monthlyCounts[month]++;
      }
    });

    // Calculate averages
    const monthlyAverages = monthlyData.map((total, i) => 
      monthlyCounts[i] > 0 ? total / monthlyCounts[i] : 0
    );

    charts.monthlyPattern = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthNames,
        datasets: [{
          label: 'Average Abstraction (m³)',
          data: monthlyAverages,
          backgroundColor: 'rgba(14, 116, 144, 0.7)',
          borderColor: '#0e7490',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Average Abstraction (m³)'
            }
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  }

  function createWaterLevelChart(readings) {
    const ctx = document.getElementById('waterLevelChart');
    if (!ctx) return;

    const sortedReadings = [...readings].sort((a, b) => new Date(a.reading_date) - new Date(b.reading_date));
    const labels = sortedReadings.map(r => new Date(r.reading_date).toLocaleDateString());
    
    const staticLevels = sortedReadings.map(r => 
      r.static_water_level_m !== null && r.static_water_level_m !== undefined ? r.static_water_level_m : null
    );
    const dynamicLevels = sortedReadings.map(r => 
      r.dynamic_water_level_m !== null && r.dynamic_water_level_m !== undefined ? r.dynamic_water_level_m : null
    );

    // Check if we have any water level data
    const hasStaticData = staticLevels.some(v => v !== null);
    const hasDynamicData = dynamicLevels.some(v => v !== null);

    if (!hasStaticData && !hasDynamicData) {
      // Show message that no water level data is available
      ctx.getContext('2d').font = '16px Arial';
      ctx.getContext('2d').fillStyle = '#666';
      ctx.getContext('2d').textAlign = 'center';
      ctx.getContext('2d').fillText('No water level data available', ctx.width / 2, ctx.height / 2);
      return;
    }

    const datasets = [];
    
    if (hasStaticData) {
      datasets.push({
        label: 'Static Water Level (m)',
        data: staticLevels,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2,
        fill: false,
        tension: 0.3
      });
    }
    
    if (hasDynamicData) {
      datasets.push({
        label: 'Dynamic Water Level (m)',
        data: dynamicLevels,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 2,
        fill: false,
        tension: 0.3
      });
    }

    charts.waterLevel = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            title: {
              display: true,
              text: 'Water Level (m)'
            }
          }
        },
        plugins: {
          legend: {
            display: true
          }
        }
      }
    });
  }

  function createPumpingChart(readings) {
    const ctx = document.getElementById('pumpingChart');
    if (!ctx) return;

    // Filter readings that have both pumping hours and abstraction data
    const validData = readings.filter(r => {
      const abstraction = r.hasEstimation ? r.estimatedValue : r.monthly_abstraction_m3;
      return r.pumping_hours !== null && r.pumping_hours !== undefined && 
             abstraction > 0 && r.pumping_hours > 0;
    }).map(r => ({
      x: r.pumping_hours,
      y: r.hasEstimation ? r.estimatedValue : r.monthly_abstraction_m3,
      date: r.reading_date
    }));

    if (validData.length === 0) {
      // Show message that no pumping data is available
      ctx.getContext('2d').font = '16px Arial';
      ctx.getContext('2d').fillStyle = '#666';
      ctx.getContext('2d').textAlign = 'center';
      ctx.getContext('2d').fillText('No pumping hours data available', ctx.width / 2, ctx.height / 2);
      return;
    }

    charts.pumping = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Pumping Efficiency',
          data: validData,
          backgroundColor: 'rgba(14, 116, 144, 0.6)',
          borderColor: '#0e7490',
          borderWidth: 1,
          pointRadius: 6,
          pointHoverRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: {
              display: true,
              text: 'Pumping Hours'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Abstraction (m³)'
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const point = context.parsed;
                const dataPoint = validData[context.dataIndex];
                return [
                  `Date: ${new Date(dataPoint.date).toLocaleDateString()}`,
                  `Pumping Hours: ${point.x}`,
                  `Abstraction: ${point.y.toFixed(2)} m³`,
                  `Efficiency: ${(point.y / point.x).toFixed(2)} m³/hour`
                ];
              }
            }
          }
        }
      }
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

  // Chart control event listeners
  const toggleChartsBtn = document.getElementById('toggleCharts');
  const refreshChartsBtn = document.getElementById('refreshCharts');

  if (toggleChartsBtn) {
    toggleChartsBtn.addEventListener('click', () => {
      const chartsGrid = document.querySelector('.charts-grid');
      if (chartsGrid) {
        const isHidden = chartsGrid.style.display === 'none';
        chartsGrid.style.display = isHidden ? 'grid' : 'none';
        toggleChartsBtn.textContent = isHidden ? 'Hide Charts' : 'Show Charts';
      }
    });
  }

  if (refreshChartsBtn) {
    refreshChartsBtn.addEventListener('click', () => {
      if (viewReadingsWell && viewReadingsWell.value) {
        loadMonthlyReadings();
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
