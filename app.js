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
  const exportReadingsBtn = document.getElementById('exportReadingsBtn');
  const exportWellsBtn = document.getElementById('exportWellsBtn');
  const exportAllReadingsBtn = document.getElementById('exportAllReadingsBtn');
  const readingsStatus = document.getElementById('readingsStatus');
  const readingsSummary = document.getElementById('readingsSummary');
  const readingsTable = document.getElementById('readingsTable');
  const readingsTableBody = document.getElementById('readingsTableBody');
  const noReadingsMessage = document.getElementById('noReadingsMessage');
  const estimationInfo = document.getElementById('estimationInfo');
  const dashboardCharts = document.getElementById('dashboardCharts');

  // Edit Reading modal elements
  const editReadingModal = document.getElementById('editReadingModal');
  const formEditReading = document.getElementById('formEditReading');
  const msgEditReading = document.getElementById('msgEditReading');
  const closeEditReadingModal = document.getElementById('closeEditReadingModal');
  const cancelEditReading = document.getElementById('cancelEditReading');
  const editComputedAbstraction = document.getElementById('editComputedAbstraction');

  // Summary elements
  const totalRecords = document.getElementById('totalRecords');
  const totalAbstraction = document.getElementById('totalAbstraction');
  const avgMonthly = document.getElementById('avgMonthly');
  const dateRange = document.getElementById('dateRange');

  // Chart instances
  let charts = {
    annual: null
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
    if (exportReadingsBtn) exportReadingsBtn.style.display = 'inline-block';
    if (noReadingsMessage) noReadingsMessage.style.display = 'none';
    
    // Show quality report button
    const qualityReportBtn = document.getElementById('qualityReportBtn');
    if (qualityReportBtn) {
      qualityReportBtn.style.display = 'inline-block';
    }
    
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
        
        // Add classes for outliers and confidence levels
        let rowClasses = [];
        if (reading.hasEstimation) rowClasses.push('estimated-row');
        if (reading.isOutlier) rowClasses.push('outlier-row');
        if (reading.confidence && reading.confidence < 0.5) rowClasses.push('low-confidence');
        
        return `
          <tr class="${rowClasses.join(' ')}">
            <td>${reading.reading_date || '-'}</td>
            <td>${monthYear}</td>
            <td>${formatNumber(reading.meter_last_m3)}</td>
            <td>${formatNumber(reading.meter_current_m3)}</td>
            <td class="abstraction-cell">${absDisplay}</td>
            <td>${formatNumber(reading.static_water_level_m)}</td>
            <td>${formatNumber(reading.dynamic_water_level_m)}</td>
            <td>${formatNumber(reading.pumping_hours)}</td>
            <td>${esc(reading.notes || '')}</td>
            <td>
              <button type="button" class="btn-edit" onclick="openEditReadingModal('${reading.reading_id}')">Edit</button>
              <button type="button" class="btn-delete" onclick="deleteReading('${reading.reading_id}', '${reading.reading_date}')">Delete</button>
            </td>
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

    // Initialize advanced estimation engine
    const estimationEngine = new AdvancedEstimationEngine();
    
    // Sort by date to ensure proper time series
    const sortedReadings = [...readings].sort((a, b) => 
      new Date(a.reading_date) - new Date(b.reading_date)
    );

    // Step 1: Detect outliers first
    const readingsWithOutliers = estimationEngine.detectOutliers(sortedReadings);
    
    // Step 2: Enhanced seasonal analysis
    const seasonalStats = estimationEngine.enhancedSeasonalAnalysis(readingsWithOutliers);
    
    // Step 3: Process each reading with advanced estimation
    const processedReadings = [];
    let estimationReport = null;
    
    for (let i = 0; i < readingsWithOutliers.length; i++) {
      const reading = readingsWithOutliers[i];
      const abs = reading.monthly_abstraction_m3;
      
      // If abstraction is valid and positive (non-zero), keep it
      if (abs !== null && abs !== undefined && Number.isFinite(abs) && abs > 0) {
        processedReadings.push({ 
          ...reading, 
          hasEstimation: false, 
          estimatedValue: null,
          confidence: null,
          isOutlier: reading.isOutlier,
          zScore: reading.zScore
        });
      } else {
        // Use ML-based estimation
        const estimationResult = estimationEngine.mlBasedEstimation(i, readingsWithOutliers);
        
        // Validate the estimation
        const validation = estimationEngine.validateEstimation(
          estimationResult.estimated, 
          readingsWithOutliers, 
          i
        );
        
        processedReadings.push({
          ...reading,
          hasEstimation: true,
          estimatedValue: validation.adjustedValue,
          originalValue: abs,
          confidence: estimationResult.confidence,
          estimationMethod: estimationResult.method,
          validationWarnings: validation.warnings,
          isOutlier: reading.isOutlier,
          zScore: reading.zScore
        });
      }
    }
    
    // Step 4: Generate comprehensive estimation report
    estimationReport = estimationEngine.generateEstimationReport(sortedReadings, processedReadings);
    
    // Store report globally for display
    window.currentEstimationReport = estimationReport;
    
    // Update estimation info display
    updateEstimationInfo(estimationReport, processedReadings);
    
    return processedReadings;
  }

  // Add function to update estimation info display
  function updateEstimationInfo(report, processedReadings) {
    const estimationInfo = document.getElementById('estimationInfo');
    if (!estimationInfo) return;
    
    const hasEstimations = processedReadings.some(r => r.hasEstimation);
    const hasOutliers = processedReadings.some(r => r.isOutlier);
    
    if (hasEstimations || hasOutliers) {
      estimationInfo.style.display = 'block';
      
      // Update the quick stats content
      const statsGrid = estimationInfo.querySelector('.stats-grid');
      if (statsGrid) {
        statsGrid.innerHTML = `
          <div class="stat-card primary">
            <div class="stat-icon">📊</div>
            <div class="stat-content">
              <div class="stat-value">${report.totalReadings}</div>
              <div class="stat-label">إجمالي القراءات</div>
            </div>
          </div>
          
          <div class="stat-card ${getEstimationStatusClass(report.estimationPercentage)}">
            <div class="stat-icon">🤖</div>
            <div class="stat-content">
              <div class="stat-value">${report.estimatedCount}</div>
              <div class="stat-label">قراءات مقدرة (${report.estimationPercentage}%)</div>
            </div>
          </div>
          
          <div class="stat-card ${getConfidenceStatusClass(report.averageConfidence)}">
            <div class="stat-icon">🎯</div>
            <div class="stat-content">
              <div class="stat-value">${report.averageConfidence}%</div>
              <div class="stat-label">متوسط الثقة</div>
            </div>
          </div>
          
          <div class="stat-card ${getQualityStatusClass(report.dataQuality)}">
            <div class="stat-icon">⭐</div>
            <div class="stat-content">
              <div class="stat-value">${report.dataQuality}</div>
              <div class="stat-label">تقييم الجودة</div>
            </div>
          </div>
          
          ${hasOutliers ? `
            <div class="stat-card warning">
              <div class="stat-icon">⚠️</div>
              <div class="stat-content">
                <div class="stat-value">${processedReadings.filter(r => r.isOutlier).length}</div>
                <div class="stat-label">قراءات شاذة</div>
              </div>
            </div>
          ` : ''}
          
          ${report.recommendations.length > 0 ? `
            <div class="stat-card info">
              <div class="stat-icon">💡</div>
              <div class="stat-content">
                <div class="stat-value">${report.recommendations.length}</div>
                <div class="stat-label">توصيات التحسين</div>
              </div>
            </div>
          ` : ''}
        `;
      }
    } else {
      estimationInfo.style.display = 'none';
    }
  }
  
  // Helper functions for status classes
  function getEstimationStatusClass(percentage) {
    const pct = parseFloat(percentage);
    if (pct < 10) return 'success';
    if (pct < 30) return 'warning';
    return 'danger';
  }
  
  function getConfidenceStatusClass(confidence) {
    const conf = parseFloat(confidence);
    if (conf >= 80) return 'success';
    if (conf >= 60) return 'warning';
    return 'danger';
  }
  
  function getQualityStatusClass(quality) {
    const qualityMap = {
      'ممتازة': 'success',
      'جيدة': 'success',
      'متوسطة': 'warning',
      'ضعيفة': 'danger'
    };
    return qualityMap[quality] || 'info';
  }
  
  // Toggle details panel
  window.toggleDetailsPanel = function() {
    const detailsPanel = document.getElementById('detailsPanel');
    const toggleIcon = document.getElementById('toggleIcon');
    
    if (detailsPanel.style.display === 'none' || !detailsPanel.style.display) {
      detailsPanel.style.display = 'block';
      toggleIcon.textContent = '📋';
    } else {
      detailsPanel.style.display = 'none';
      toggleIcon.textContent = '📊';
    }
  }
  
  // Switch between tabs
  window.switchTab = function(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
      content.style.display = 'none';
      content.classList.remove('active');
    });
    
    // Remove active class from all tab buttons
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab content
    const selectedTab = document.getElementById(tabName + '-tab');
    const selectedBtn = document.querySelector(`[onclick="switchTab('${tabName}')"]`);
    
    if (selectedTab) {
      selectedTab.style.display = 'block';
      selectedTab.classList.add('active');
    }
    
    if (selectedBtn) {
      selectedBtn.classList.add('active');
    }
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
      
      // Add confidence indicator
      const confidencePercent = reading.confidence ? Math.round(reading.confidence * 100) : 0;
      const confidenceClass = confidencePercent >= 70 ? 'high-confidence' : 
                              confidencePercent >= 50 ? 'medium-confidence' : 'low-confidence';
      
      return `
        <span class="estimated-value" title="Estimated value using ${reading.estimationMethod || 'Advanced ML'} (Confidence: ${confidencePercent}%)">
          ${estimated} 
          <span class="estimation-badge">EST</span>
          <span class="confidence-indicator ${confidenceClass}" title="Confidence: ${confidencePercent}%">
            ${confidencePercent}%
          </span>
        </span>
        ${original !== 'N/A' && original !== '-' ? 
          `<br><small class="original-value">Original: ${original}</small>` : ''}
        ${reading.validationWarnings && reading.validationWarnings.length > 0 ? 
          `<br><small class="validation-warning">⚠️ ${reading.validationWarnings.join(', ')}</small>` : ''}
      `;
    } else if (reading.isOutlier) {
      return `
        <span class="outlier-value" title="Possible outlier (Z-score: ${reading.zScore?.toFixed(2) || 'N/A'})">
          ${formatNumber(reading.monthly_abstraction_m3)}
          <span class="outlier-badge">⚠️</span>
        </span>
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
    if (exportReadingsBtn) exportReadingsBtn.style.display = 'none';
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

  function showMessage(elementId, message, type = 'ok') {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = message;
      element.className = `msg ${type}`;
    } else {
      // Fallback to setReadingsStatus if specific element not found
      setReadingsStatus(message, type);
    }
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

    // Create annual summary
    createAnnualSummary(validReadings);
    createAnnualChart(validReadings);
  }

  function destroyCharts() {
    if (charts.annual) {
      charts.annual.destroy();
      charts.annual = null;
    }
  }

  function createAnnualSummary(readings) {
    // Group readings by year and calculate annual totals
    const yearlyData = {};
    
    readings.forEach(r => {
      const year = new Date(r.reading_date).getFullYear();
      const value = r.hasEstimation ? r.estimatedValue : r.monthly_abstraction_m3;
      
      if (value > 0) {
        if (!yearlyData[year]) {
          yearlyData[year] = { total: 0, count: 0, readings: [] };
        }
        yearlyData[year].total += value;
        yearlyData[year].count++;
        yearlyData[year].readings.push(r);
      }
    });

    const years = Object.keys(yearlyData).sort();
    const yearlyTotals = years.map(year => yearlyData[year].total);
    
    // Calculate statistics
    const totalYears = years.length;
    const grandTotal = yearlyTotals.reduce((sum, val) => sum + val, 0);
    const annualAverage = totalYears > 0 ? grandTotal / totalYears : 0;
    
    // Find peak and lowest years
    let peakYear = '-', peakValue = 0;
    let lowestYear = '-', lowestValue = Infinity;
    
    years.forEach(year => {
      const total = yearlyData[year].total;
      if (total > peakValue) {
        peakYear = year;
        peakValue = total;
      }
      if (total < lowestValue) {
        lowestYear = year;
        lowestValue = total;
      }
    });
    
    if (lowestValue === Infinity) lowestValue = 0;

    // Update UI elements
    const totalYearsEl = document.getElementById('totalYears');
    const annualAverageEl = document.getElementById('annualAverage');
    const peakYearEl = document.getElementById('peakYear');
    const peakYearValueEl = document.getElementById('peakYearValue');
    const lowestYearEl = document.getElementById('lowestYear');
    const lowestYearValueEl = document.getElementById('lowestYearValue');

    if (totalYearsEl) totalYearsEl.textContent = totalYears;
    if (annualAverageEl) annualAverageEl.textContent = formatNumber(annualAverage);
    if (peakYearEl) peakYearEl.textContent = peakYear;
    if (peakYearValueEl) peakYearValueEl.textContent = `${formatNumber(peakValue)} m³`;
    if (lowestYearEl) lowestYearEl.textContent = totalYears > 1 ? lowestYear : '-';
    if (lowestYearValueEl) lowestYearValueEl.textContent = totalYears > 1 ? `${formatNumber(lowestValue)} m³` : '-';
  }

  function createAnnualChart(readings) {
    const ctx = document.getElementById('annualChart');
    if (!ctx) return;

    // Group readings by year
    const yearlyData = {};
    
    readings.forEach(r => {
      const year = new Date(r.reading_date).getFullYear();
      const value = r.hasEstimation ? r.estimatedValue : r.monthly_abstraction_m3;
      
      if (value > 0) {
        if (!yearlyData[year]) {
          yearlyData[year] = 0;
        }
        yearlyData[year] += value;
      }
    });

    const years = Object.keys(yearlyData).sort();
    const totals = years.map(year => yearlyData[year]);

    if (years.length === 0) {
      // Show message that no data is available
      const context = ctx.getContext('2d');
      context.font = '14px Arial';
      context.fillStyle = '#999';
      context.textAlign = 'center';
      context.fillText('No annual data available', ctx.width / 2, ctx.height / 2);
      return;
    }

    charts.annual = new Chart(ctx, {
      type: 'line',
      data: {
        labels: years,
        datasets: [{
          label: 'Annual Abstraction',
          data: totals,
          borderColor: '#0e7490',
          backgroundColor: 'rgba(14, 116, 144, 0.1)',
          borderWidth: 3,
          pointBackgroundColor: '#0e7490',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(255, 255, 255, 0.1)',
              lineWidth: 1
            },
            ticks: {
              color: '#a7b6c8',
              font: {
                size: 11
              },
              callback: function(value) {
                return value >= 1000 ? (value/1000).toFixed(1) + 'k' : value.toFixed(0);
              }
            }
          },
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: '#a7b6c8',
              font: {
                size: 11,
                weight: 'bold'
              }
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(11, 19, 36, 0.9)',
            titleColor: '#e8eef5',
            bodyColor: '#a7b6c8',
            borderColor: '#0e7490',
            borderWidth: 1,
            cornerRadius: 6,
            displayColors: false,
            callbacks: {
              title: function(context) {
                return `Year ${context[0].label}`;
              },
              label: function(context) {
                const value = context.parsed.y;
                return `Total: ${formatNumber(value)} m³`;
              }
            }
          }
        },
        layout: {
          padding: {
            top: 10,
            bottom: 5,
            left: 5,
            right: 5
          }
        },
        elements: {
          point: {
            hoverBorderWidth: 3
          }
        }
      }
    });
  }

  // Edit Reading Modal functionality
  window.openEditReadingModal = async function(readingId) {
    if (!supabase || !readingId) return;
    
    // Fetch reading data
    const { data, error } = await supabase
      .from('monthly_readings')
      .select(`
        *,
        wells!inner(well_code, well_name)
      `)
      .eq('reading_id', readingId)
      .single();
    
    if (error) {
      console.warn('Error loading reading for edit:', error.message);
      return;
    }
    
    if (!data) {
      console.warn('Reading not found');
      return;
    }
    
    // Load wells for the dropdown (but it will be disabled)
    await loadWellsForEditReading();
    
    // Populate form fields
    document.getElementById('editReadingId').value = data.reading_id;
    document.getElementById('editReadingWell').value = data.well_id;
    document.getElementById('editReadingDate').value = data.reading_date || '';
    document.getElementById('editMeterLast').value = data.meter_last_m3 || '';
    document.getElementById('editMeterCurrent').value = data.meter_current_m3 || '';
    document.getElementById('editStaticWL').value = data.static_water_level_m || '';
    document.getElementById('editDynamicWL').value = data.dynamic_water_level_m || '';
    document.getElementById('editPumpingHours').value = data.pumping_hours || '';
    document.getElementById('editReadingNotes').value = data.notes || '';
    
    // Calculate and show abstraction
    updateEditReadingAbstraction();
    
    // Show modal
    if (editReadingModal) {
      editReadingModal.style.display = 'block';
      setMsg(msgEditReading, '', 'ok'); // Clear any previous messages
    }
  }

  async function loadWellsForEditReading() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('wells')
      .select('well_id, well_code, well_name')
      .order('well_code', { ascending: true })
      .limit(1000);
    if (error) {
      console.warn('Load wells for edit reading error:', error.message);
      return;
    }
    const options = (data || []).map(w =>
      `<option value="${w.well_id}">${esc(w.well_code)}${w.well_name ? ' - ' + esc(w.well_name) : ''}</option>`
    ).join('');
    const editReadingWell = document.getElementById('editReadingWell');
    if (editReadingWell) {
      editReadingWell.innerHTML = `<option value="">— Select Well —</option>` + options;
    }
  }

  function updateEditReadingAbstraction() {
    const meterLast = document.getElementById('editMeterLast');
    const meterCurrent = document.getElementById('editMeterCurrent');
    const computedField = document.getElementById('editComputedAbstraction');
    
    if (meterLast && meterCurrent && computedField) {
      const a = parseFloat(meterLast.value || '0');
      const b = parseFloat(meterCurrent.value || '0');
      const diff = b - a;
      computedField.value = Number.isFinite(diff) ? diff : '';
    }
  }
  
  function closeEditReadingModalFunc() {
    if (editReadingModal) {
      editReadingModal.style.display = 'none';
    }
    if (formEditReading) {
      formEditReading.reset();
    }
  }
  
  // Modal event listeners for Edit Reading
  if (closeEditReadingModal) {
    closeEditReadingModal.addEventListener('click', closeEditReadingModalFunc);
  }
  if (cancelEditReading) {
    cancelEditReading.addEventListener('click', closeEditReadingModalFunc);
  }
  
  // Close modal when clicking outside
  if (editReadingModal) {
    editReadingModal.addEventListener('click', (e) => {
      if (e.target === editReadingModal) {
        closeEditReadingModalFunc();
      }
    });
  }

  // Reading abstraction preview in edit modal
  if (formEditReading && editComputedAbstraction) {
    formEditReading.addEventListener('input', updateEditReadingAbstraction);
  }
  
  // Edit Reading form submit handler
  if (formEditReading) {
    formEditReading.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const readingId = document.getElementById('editReadingId').value;
      if (!readingId) {
        setMsg(msgEditReading, 'No reading selected for editing.', 'err');
        return;
      }
      
      const payload = getFormPayload(formEditReading, [
        'well_id','reading_date','meter_last_m3','meter_current_m3',
        'static_water_level_m','dynamic_water_level_m','pumping_hours','notes'
      ], ['meter_last_m3','meter_current_m3','static_water_level_m','dynamic_water_level_m','pumping_hours']);

      if (!payload.well_id) return setMsg(msgEditReading, 'Well is required.', 'err');
      if (!payload.reading_date) return setMsg(msgEditReading, 'Reading Date is required.', 'err');
      if (payload.meter_current_m3 < payload.meter_last_m3) {
        return setMsg(msgEditReading, 'Meter Current must be >= Meter Last.', 'err');
      }

      const { error } = await supabase
        .from('monthly_readings')
        .update(payload)
        .eq('reading_id', readingId);
        
      if (error) {
        setMsg(msgEditReading, error.message || 'Error updating reading.', 'err');
      } else {
        setMsg(msgEditReading, 'Reading updated successfully.', 'ok');
        setTimeout(() => {
          closeEditReadingModalFunc();
          // Refresh the readings view
          if (viewReadingsWell && viewReadingsWell.value) {
            loadMonthlyReadings();
          }
        }, 1500);
      }
    });
  }

  // Delete Reading functionality
  window.deleteReading = async function(readingId, readingDate) {
    if (!supabase || !readingId) return;
    
    // Confirm deletion with user
    const formattedDate = new Date(readingDate).toLocaleDateString();
    const confirmMessage = `Are you sure you want to delete the reading from ${formattedDate}?\n\nThis action cannot be undone.`;
    
    if (!confirm(confirmMessage)) {
      return; // User cancelled
    }
    
    try {
      // Set status to show deletion in progress
      setReadingsStatus('Deleting reading...', 'info');
      
      const { error } = await supabase
        .from('monthly_readings')
        .delete()
        .eq('reading_id', readingId);
      
      if (error) {
        setReadingsStatus(`Error deleting reading: ${error.message}`, 'err');
        console.error('Delete reading error:', error);
        return;
      }
      
      setReadingsStatus('Reading deleted successfully.', 'ok');
      
      // Refresh the readings view after successful deletion
      setTimeout(() => {
        if (viewReadingsWell && viewReadingsWell.value) {
          loadMonthlyReadings();
        }
      }, 1000);
      
    } catch (error) {
      console.error('Delete reading error:', error);
      setReadingsStatus(`Error deleting reading: ${error.message}`, 'err');
    }
  }

  // Export functionality
  function exportToCSV(data, filename) {
    if (!data || data.length === 0) {
      alert('No data to export');
      return;
    }

    // Get headers from the first object
    const headers = Object.keys(data[0]);
    
    // Create CSV content
    let csvContent = headers.join(',') + '\n';
    
    data.forEach(row => {
      const values = headers.map(header => {
        let value = row[header];
        // Handle null/undefined values
        if (value === null || value === undefined) {
          value = '';
        }
        // Escape commas and quotes in values
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          value = '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
      });
      csvContent += values.join(',') + '\n';
    });

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Export current readings
  async function exportCurrentReadings() {
    if (!supabase || !viewReadingsWell || !viewReadingsWell.value) {
      alert('Please select a well and load readings first');
      return;
    }

    try {
      setReadingsStatus('Exporting readings...', 'info');

      // Get the well info for filename
      const { data: wellData } = await supabase
        .from('wells')
        .select('well_code, well_name')
        .eq('well_id', viewReadingsWell.value)
        .single();

      const wellCode = wellData?.well_code || 'Unknown';
      const fromDate = viewReadingsFromDate?.value || 'all';
      const toDate = viewReadingsToDate?.value || 'all';

      // Build query
      let query = supabase
        .from('monthly_readings')
        .select(`
          reading_date,
          meter_last_m3,
          meter_current_m3,
          monthly_abstraction_m3,
          static_water_level_m,
          dynamic_water_level_m,
          pumping_hours,
          notes,
          wells!inner(well_code, well_name)
        `)
        .eq('well_id', viewReadingsWell.value)
        .order('reading_date', { ascending: false });

      if (fromDate && fromDate !== 'all') {
        query = query.gte('reading_date', fromDate);
      }
      if (toDate && toDate !== 'all') {
        query = query.lte('reading_date', toDate);
      }

      const { data, error } = await query.limit(1000);

      if (error) throw error;

      if (!data || data.length === 0) {
        setReadingsStatus('No readings to export', 'warn');
        return;
      }

      // Format data for export
      const exportData = data.map(reading => ({
        'Well Code': reading.wells.well_code,
        'Well Name': reading.wells.well_name || '',
        'Reading Date': reading.reading_date,
        'Meter Last (m³)': reading.meter_last_m3,
        'Meter Current (m³)': reading.meter_current_m3,
        'Monthly Abstraction (m³)': reading.monthly_abstraction_m3,
        'Static Water Level (m)': reading.static_water_level_m,
        'Dynamic Water Level (m)': reading.dynamic_water_level_m,
        'Pumping Hours': reading.pumping_hours,
        'Notes': reading.notes || ''
      }));

      const filename = `readings_${wellCode}_${new Date().toISOString().split('T')[0]}.csv`;
      exportToCSV(exportData, filename);
      setReadingsStatus(`Exported ${data.length} readings successfully`, 'ok');

    } catch (error) {
      console.error('Export readings error:', error);
      setReadingsStatus(`Export error: ${error.message}`, 'err');
    }
  }

  // Export all wells data
  async function exportWells() {
    if (!supabase) {
      alert('Database not available');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('wells')
        .select('*')
        .order('well_code', { ascending: true })
        .limit(2000);

      if (error) throw error;

      if (!data || data.length === 0) {
        alert('No wells to export');
        return;
      }

      // Format data for export
      const exportData = data.map(well => ({
        'Well Code': well.well_code,
        'Well Name': well.well_name || '',
        'Governorate': well.governorate || '',
        'District': well.district || '',
        'Village': well.village || '',
        'X (EPSG:28191)': well.x,
        'Y (EPSG:28191)': well.y,
        'Z (Elevation)': well.z,
        'Owner/Service Provider': well.owner_service_provider || '',
        'Aquifer': well.aquifer || '',
        'Well Type': well.well_type || '',
        'Drilling Year': well.drilling_year,
        'Current Status': well.current_status || '',
        'Well Depth (m)': well.well_depth_m,
        'Casing Depth (m)': well.casing_depth_m,
        'Pump Type': well.pump_type || '',
        'Pump Capacity (m³/hr)': well.pump_capacity_m3_per_hr,
        'Design Capacity (m³/year)': well.design_capacity_m3_per_year,
        'Remarks': well.remarks || ''
      }));

      const filename = `wells_database_${new Date().toISOString().split('T')[0]}.csv`;
      exportToCSV(exportData, filename);
      alert(`Successfully exported ${data.length} wells`);

    } catch (error) {
      console.error('Export wells error:', error);
      alert(`Export error: ${error.message}`);
    }
  }

  // Export all readings for all wells
  async function exportAllReadings() {
    if (!supabase) {
      alert('Database not available');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('monthly_readings')
        .select(`
          reading_date,
          meter_last_m3,
          meter_current_m3,
          monthly_abstraction_m3,
          static_water_level_m,
          dynamic_water_level_m,
          pumping_hours,
          notes,
          wells!inner(well_code, well_name, governorate, district, village)
        `)
        .order('reading_date', { ascending: false })
        .limit(5000);

      if (error) throw error;

      if (!data || data.length === 0) {
        alert('No readings to export');
        return;
      }

      // Format data for export
      const exportData = data.map(reading => ({
        'Well Code': reading.wells.well_code,
        'Well Name': reading.wells.well_name || '',
        'Governorate': reading.wells.governorate || '',
        'District': reading.wells.district || '',
        'Village': reading.wells.village || '',
        'Reading Date': reading.reading_date,
        'Meter Last (m³)': reading.meter_last_m3,
        'Meter Current (m³)': reading.meter_current_m3,
        'Monthly Abstraction (m³)': reading.monthly_abstraction_m3,
        'Static Water Level (m)': reading.static_water_level_m,
        'Dynamic Water Level (m)': reading.dynamic_water_level_m,
        'Pumping Hours': reading.pumping_hours,
        'Notes': reading.notes || ''
      }));

      const filename = `all_readings_${new Date().toISOString().split('T')[0]}.csv`;
      exportToCSV(exportData, filename);
      alert(`Successfully exported ${data.length} readings from all wells`);

    } catch (error) {
      console.error('Export all readings error:', error);
      alert(`Export error: ${error.message}`);
    }
  }

  // Quality Report Functions
  function showQualityReport() {
    const qualityReportModal = document.getElementById('qualityReportModal');
    const qualityReportContent = document.getElementById('qualityReportContent');
    
    if (!qualityReportModal || !qualityReportContent) return;
    
    const report = window.currentEstimationReport;
    if (!report) {
      alert('لا يوجد تقرير جودة متاح. يرجى تحميل البيانات أولاً.');
      return;
    }
    
    // Generate detailed quality report
    qualityReportContent.innerHTML = generateDetailedQualityReport(report);
    qualityReportModal.style.display = 'flex';
  }
  
  function generateDetailedQualityReport(report) {
    return `
      <div class="quality-report-sections">
        <!-- Executive Summary -->
        <section class="report-section">
          <h4>📋 الملخص التنفيذي</h4>
          <div class="executive-summary">
            <div class="summary-grid">
              <div class="summary-metric">
                <div class="metric-value ${getQualityClass(report.dataQuality)}">${report.dataQuality}</div>
                <div class="metric-label">تقييم جودة البيانات</div>
              </div>
              <div class="summary-metric">
                <div class="metric-value">${report.estimationPercentage}%</div>
                <div class="metric-label">نسبة القراءات المقدرة</div>
              </div>
              <div class="summary-metric">
                <div class="metric-value">${report.averageConfidence}%</div>
                <div class="metric-label">متوسط مستوى الثقة</div>
              </div>
              <div class="summary-metric">
                <div class="metric-value">${report.totalReadings}</div>
                <div class="metric-label">إجمالي القراءات</div>
              </div>
            </div>
          </div>
        </section>
        
        <!-- Data Completeness Analysis -->
        <section class="report-section">
          <h4>📊 تحليل اكتمال البيانات</h4>
          <div class="completeness-analysis">
            <div class="progress-container">
              <div class="progress-label">القراءات الفعلية</div>
              <div class="progress-bar">
                <div class="progress-fill actual-data" style="width: ${100 - parseFloat(report.estimationPercentage)}%"></div>
              </div>
              <div class="progress-value">${100 - parseFloat(report.estimationPercentage)}%</div>
            </div>
            <div class="progress-container">
              <div class="progress-label">القراءات المقدرة</div>
              <div class="progress-bar">
                <div class="progress-fill estimated-data" style="width: ${report.estimationPercentage}%"></div>
              </div>
              <div class="progress-value">${report.estimationPercentage}%</div>
            </div>
          </div>
        </section>
        
        <!-- Recommendations -->
        ${report.recommendations.length > 0 ? `
        <section class="report-section">
          <h4>🔧 التوصيات والإجراءات المطلوبة</h4>
          <div class="recommendations-list">
            ${report.recommendations.map((rec, index) => `
              <div class="recommendation-item">
                <div class="recommendation-priority">
                  ${index < 2 ? '🔴 عالي' : index < 4 ? '🟡 متوسط' : '🟢 منخفض'}
                </div>
                <div class="recommendation-text">${rec}</div>
              </div>
            `).join('')}
          </div>
        </section>
        ` : ''}
        
        <!-- Technical Details -->
        <section class="report-section">
          <h4>⚙️ التفاصيل التقنية</h4>
          <div class="technical-details">
            <div class="detail-grid">
              <div class="detail-item">
                <strong>خوارزمية التقدير:</strong>
                <span>التعلم الآلي مع الانحدار الخطي</span>
              </div>
              <div class="detail-item">
                <strong>طريقة كشف الشواذ:</strong>
                <span>Z-Score Analysis (threshold: 2.5)</span>
              </div>
              <div class="detail-item">
                <strong>التحليل الموسمي:</strong>
                <span>أنماط الاستهلاك الفصلية</span>
              </div>
              <div class="detail-item">
                <strong>التحقق من الجودة:</strong>
                <span>تطبيق قواعد التحقق التلقائي</span>
              </div>
            </div>
          </div>
        </section>
        
        <!-- Action Items -->
        <section class="report-section">
          <h4>📝 خطة العمل المقترحة</h4>
          <div class="action-items">
            <div class="action-timeline">
              <div class="timeline-item">
                <div class="timeline-marker immediate"></div>
                <div class="timeline-content">
                  <h5>فوري (1-7 أيام)</h5>
                  <ul>
                    <li>مراجعة القراءات المميزة كشاذة</li>
                    <li>تحديث القراءات المفقودة إن أمكن</li>
                  </ul>
                </div>
              </div>
              <div class="timeline-item">
                <div class="timeline-marker short-term"></div>
                <div class="timeline-content">
                  <h5>قصير المدى (1-4 أسابيع)</h5>
                  <ul>
                    <li>وضع جدول منتظم لقراءة العدادات</li>
                    <li>تدريب الفريق على الإجراءات الصحيحة</li>
                  </ul>
                </div>
              </div>
              <div class="timeline-item">
                <div class="timeline-marker long-term"></div>
                <div class="timeline-content">
                  <h5>طويل المدى (1-3 أشهر)</h5>
                  <ul>
                    <li>تطوير نظام تنبيهات للقراءات المتأخرة</li>
                    <li>تحسين دقة خوارزميات التقدير</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;
  }
  
  function getQualityClass(quality) {
    const qualityClasses = {
      'ممتازة': 'quality-excellent',
      'جيدة': 'quality-good', 
      'متوسطة': 'quality-average',
      'ضعيفة': 'quality-poor'
    };
    return qualityClasses[quality] || 'quality-unknown';
  }

  if (loadReadingsBtn) {
    loadReadingsBtn.addEventListener('click', loadMonthlyReadings);
  }

  if (clearReadingsBtn) {
    clearReadingsBtn.addEventListener('click', clearReadingsFilters);
  }
  
  // Quality Report Event Listeners
  const qualityReportBtn = document.getElementById('qualityReportBtn');
  const closeQualityReportModal = document.getElementById('closeQualityReportModal');
  const qualityReportModal = document.getElementById('qualityReportModal');
  
  if (qualityReportBtn) {
    qualityReportBtn.addEventListener('click', showQualityReport);
  }
  
  if (closeQualityReportModal) {
    closeQualityReportModal.addEventListener('click', () => {
      qualityReportModal.style.display = 'none';
    });
  }
  
  if (qualityReportModal) {
    qualityReportModal.addEventListener('click', (e) => {
      if (e.target === qualityReportModal) {
        qualityReportModal.style.display = 'none';
      }
    });
  }

  if (exportReadingsBtn) {
    exportReadingsBtn.addEventListener('click', exportCurrentReadings);
  }

  if (exportWellsBtn) {
    exportWellsBtn.addEventListener('click', exportWells);
  }

  if (exportAllReadingsBtn) {
    exportAllReadingsBtn.addEventListener('click', exportAllReadings);
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
      const summaryGrid = document.querySelector('.annual-summary-grid');
      const chartContainer = document.querySelector('.compact-chart-container');
      if (summaryGrid && chartContainer) {
        const isHidden = summaryGrid.style.display === 'none';
        summaryGrid.style.display = isHidden ? 'grid' : 'none';
        chartContainer.style.display = isHidden ? 'block' : 'none';
        toggleChartsBtn.textContent = isHidden ? 'Hide Summary' : 'Show Summary';
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
    
    // Initialize advanced systems
    initializeAdvancedSystems();
  })();

  // ========= Advanced Systems Integration =========
  let reportsEngine = null;
  let predictionEngine = null;
  let alertSystem = null;

  function initializeAdvancedSystems() {
    try {
      // Initialize Reports Engine
      if (typeof AdvancedReportsEngine !== 'undefined') {
        reportsEngine = new AdvancedReportsEngine();
        console.log('✅ محرك التقارير المتقدم تم تهيئته بنجاح');
      }

      // Initialize Prediction Engine
      if (typeof PredictionEngine !== 'undefined') {
        predictionEngine = new PredictionEngine();
        console.log('✅ محرك التنبؤ تم تهيئته بنجاح');
      }

      // Initialize Smart Alert System
      if (typeof SmartAlertSystem !== 'undefined') {
        alertSystem = new SmartAlertSystem();
        
        // Subscribe to alerts
        alertSystem.subscribe('main_app', (alert) => {
          displayAlert(alert);
          updateAlertCounts();
        });
        
        console.log('✅ نظام التنبيهات الذكية تم تهيئته بنجاح');
      }

      // Initialize event listeners for new features
      initializeReportsListeners();
      initializeAlertsListeners();
      
    } catch (error) {
      console.error('خطأ في تهيئة الأنظمة المتقدمة:', error);
    }
  }

  // ========= Reports Integration =========
  function initializeReportsListeners() {
    // Report type change handler
    const reportType = document.getElementById('reportType');
    if (reportType) {
      reportType.addEventListener('change', handleReportTypeChange);
    }

    // Monthly report filters
    const monthlyPeriod = document.getElementById('monthlyPeriod');
    if (monthlyPeriod) {
      monthlyPeriod.addEventListener('change', (e) => {
        const specificMonthPicker = document.getElementById('specificMonthPicker');
        if (specificMonthPicker) {
          specificMonthPicker.style.display = e.target.value === 'specific_month' ? 'block' : 'none';
        }
      });
    }

    // Annual report filters
    const annualPeriod = document.getElementById('annualPeriod');
    if (annualPeriod) {
      annualPeriod.addEventListener('change', (e) => {
        const specificYearPicker = document.getElementById('specificYearPicker');
        if (specificYearPicker) {
          specificYearPicker.style.display = e.target.value === 'specific_year' ? 'block' : 'none';
        }
      });
    }

    // Comparative report filters
    const comparisonType = document.getElementById('comparisonType');
    if (comparisonType) {
      comparisonType.addEventListener('change', (e) => {
        const monthlyComparison = document.getElementById('monthlyComparison');
        const yearlyComparison = document.getElementById('yearlyComparison');
        const customComparison = document.getElementById('customComparison');
        
        if (monthlyComparison) monthlyComparison.style.display = 'none';
        if (yearlyComparison) yearlyComparison.style.display = 'none';
        if (customComparison) customComparison.style.display = 'none';
        
        switch (e.target.value) {
          case 'monthly':
            if (monthlyComparison) monthlyComparison.style.display = 'block';
            break;
          case 'yearly':
            if (yearlyComparison) yearlyComparison.style.display = 'block';
            break;
          case 'custom':
            if (customComparison) customComparison.style.display = 'block';
            break;
        }
      });
    }

    // Forecast report filters
    const forecastPeriod = document.getElementById('forecastPeriod');
    if (forecastPeriod) {
      forecastPeriod.addEventListener('change', (e) => {
        const forecastCustomPeriod = document.getElementById('forecastCustomPeriod');
        if (forecastCustomPeriod) {
          forecastCustomPeriod.style.display = e.target.value === 'custom_period' ? 'block' : 'none';
        }
      });
    }

    // Wells analysis filters
    const wellsPeriod = document.getElementById('wellsPeriod');
    if (wellsPeriod) {
      wellsPeriod.addEventListener('change', (e) => {
        const wellsCustomPeriod = document.getElementById('wellsCustomPeriod');
        if (wellsCustomPeriod) {
          wellsCustomPeriod.style.display = e.target.value === 'custom' ? 'block' : 'none';
        }
      });
    }

    // Generate report button
    const generateReportBtn = document.getElementById('generateReportBtn');
    if (generateReportBtn) {
      generateReportBtn.addEventListener('click', generateSelectedReport);
    }

    // Export report button
    const exportReportBtn = document.getElementById('exportReportBtn');
    if (exportReportBtn) {
      exportReportBtn.addEventListener('click', exportCurrentReport);
    }

    // Comparison buttons
    const comparePeriodsBtn = document.getElementById('comparePeriodsBtn');
    if (comparePeriodsBtn) {
      comparePeriodsBtn.addEventListener('click', generateComparison);
    }

    // Forecast buttons
    const generateForecastBtn = document.getElementById('generateForecastBtn');
    if (generateForecastBtn) {
      generateForecastBtn.addEventListener('click', generateForecast);
    }
  }

  // Export and comparison functions
  function exportCurrentReport() {
    console.log('تصدير التقرير الحالي');
    // Implementation for exporting current report
    showMessage('msgReadings', 'سيتم تطبيق ميزة التصدير قريباً', 'ok');
  }

  function generateComparison() {
    console.log('إنشاء مقارنة');
    // Implementation for generating comparison
    showMessage('msgReadings', 'سيتم تطبيق ميزة المقارنة قريباً', 'ok');
  }

  function generateForecast() {
    if (!predictionEngine) {
      showMessage('msgReadings', 'محرك التنبؤ غير متاح', 'err');
      return;
    }

    console.log('إنشاء التنبؤ');
    // Implementation for generating forecast
    showMessage('msgReadings', 'سيتم تطبيق ميزة التنبؤ قريباً', 'ok');

    // Scenario tabs
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('scenario-tab')) {
        handleScenarioTabClick(e.target);
      }
    });
  }

  function handleScenarioTabClick(tab) {
    // Remove active class from all scenario tabs
    document.querySelectorAll('.scenario-tab').forEach(t => t.classList.remove('active'));
    
    // Add active class to clicked tab
    tab.classList.add('active');
    
    // Update scenario content based on selected tab
    const scenario = tab.dataset.scenario;
    const scenarioContent = document.getElementById('scenarioContent');
    
    if (scenarioContent) {
      scenarioContent.innerHTML = `
        <div class="scenario-display">
          <h5>سيناريو ${getScenarioName(scenario)}</h5>
          <p>سيتم عرض بيانات ${getScenarioName(scenario)} هنا بعد إنشاء التنبؤ</p>
        </div>
      `;
    }
  }

  function getScenarioName(scenario) {
    const names = {
      realistic: 'واقعي',
      optimistic: 'متفائل',
      pessimistic: 'متشائم',
      conservation: 'توفير'
    };
    return names[scenario] || scenario;
  }

  function filterDataByPeriod(data, period) {
    if (!data || data.length === 0) return [];
    
    const now = new Date();
    let startDate, endDate;
    
    switch (period) {
      case 'current':
        // Current month
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
        
      case 'last3':
        // Last 3 months
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
        
      case 'last6':
        // Last 6 months
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
        
      case 'lastyear':
        // Last year
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31);
        break;
        
      case 'custom':
        // Custom date range
        const startInput = document.getElementById('reportStartDate');
        const endInput = document.getElementById('reportEndDate');
        if (startInput && endInput && startInput.value && endInput.value) {
          startDate = new Date(startInput.value);
          endDate = new Date(endInput.value);
        } else {
          return data; // Return all data if custom dates not set
        }
        break;
        
      default:
        return data; // Return all data for unknown period
    }
    
    return data.filter(reading => {
      const readingDate = new Date(reading.reading_date);
      return readingDate >= startDate && readingDate <= endDate;
    });
  }

  function getDateInfoFromPeriod(period) {
    const now = new Date();
    
    switch (period) {
      case 'current':
        return {
          year: now.getFullYear(),
          month: now.getMonth() + 1
        };
        
      case 'last3':
      case 'last6':
        return {
          year: now.getFullYear(),
          month: now.getMonth() + 1
        };
        
      case 'lastyear':
        return {
          year: now.getFullYear() - 1,
          month: 12
        };
        
      case 'custom':
        const startInput = document.getElementById('reportStartDate');
        if (startInput && startInput.value) {
          const startDate = new Date(startInput.value);
          return {
            year: startDate.getFullYear(),
            month: startDate.getMonth() + 1
          };
        }
        return {
          year: now.getFullYear(),
          month: now.getMonth() + 1
        };
        
      default:
        return {
          year: now.getFullYear(),
          month: now.getMonth() + 1
        };
    }
  }

  // New functions for specific report data filtering
  // دالة لتحديث نطاق الشهور المتاحة في حقل الاختيار
  function updateAvailableMonthsRange(data) {
    const selectedMonthInput = document.getElementById('selectedMonth');
    if (!selectedMonthInput || !data || data.length === 0) return;
    
    const availableRange = getAvailableDateRange(data);
    if (!availableRange) return;
    
    // تحديث الحد الأدنى والأقصى لحقل الشهر
    selectedMonthInput.min = availableRange.minFormatted;
    selectedMonthInput.max = availableRange.maxFormatted;
    
    // إضافة تلميح للمستخدم
    selectedMonthInput.title = `النطاق المتاح: من ${availableRange.minFormatted} إلى ${availableRange.maxFormatted}`;
    
    console.log(`🔄 تم تحديث نطاق الشهور المتاحة: ${availableRange.minFormatted} إلى ${availableRange.maxFormatted}`);
  }

  // دالة للحصول على نطاق التواريخ المتاحة في البيانات
  function getAvailableDateRange(data) {
    if (!data || data.length === 0) return null;
    
    const dates = data.map(item => {
      const dateValue = item.reading_date || item.readingDate || item.date || item.measurement_date;
      return dateValue ? new Date(dateValue) : null;
    }).filter(date => date && !isNaN(date.getTime()));
    
    if (dates.length === 0) return null;
    
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    
    return {
      min: minDate,
      max: maxDate,
      minFormatted: minDate.toISOString().slice(0, 7), // YYYY-MM format
      maxFormatted: maxDate.toISOString().slice(0, 7)
    };
  }

  function getMonthlyReportData(allReadings) {
    const monthlyPeriod = document.getElementById('monthlyPeriod')?.value;
    const now = new Date();
    let startDate, endDate;
    
    console.log(`=== التقرير الشهري ===`);
    console.log(`نوع الفترة: ${monthlyPeriod}`);
    console.log(`إجمالي البيانات: ${allReadings ? allReadings.length : 'لا توجد'}`);
    
    // عرض نطاق التواريخ المتاحة
    const availableRange = getAvailableDateRange(allReadings);
    if (availableRange) {
      console.log(`📅 نطاق التواريخ المتاحة: من ${availableRange.minFormatted} إلى ${availableRange.maxFormatted}`);
      console.log(`   التواريخ الكاملة: من ${availableRange.min.toLocaleDateString('ar')} إلى ${availableRange.max.toLocaleDateString('ar')}`);
    }

    switch (monthlyPeriod) {
      case 'current_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
        
      case 'last_month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
        
      case 'last_6_months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
        
      case 'specific_month':
        const selectedMonth = document.getElementById('selectedMonth')?.value;
        console.log(`الشهر المحدد: ${selectedMonth}`);
        
        // التحقق من توفر البيانات للشهر المحدد
        if (availableRange && selectedMonth) {
          const [year, month] = selectedMonth.split('-');
          const selectedDate = new Date(parseInt(year), parseInt(month) - 1, 15); // منتصف الشهر للمقارنة
          
          if (selectedDate < availableRange.min || selectedDate > availableRange.max) {
            console.warn(`⚠️ الشهر المحدد ${selectedMonth} خارج نطاق البيانات المتاحة (${availableRange.minFormatted} إلى ${availableRange.maxFormatted})`);
            alert(`الشهر المحدد ${selectedMonth} خارج نطاق البيانات المتاحة.\nالنطاق المتاح: من ${availableRange.minFormatted} إلى ${availableRange.maxFormatted}`);
            return [];
          }
        }
        
        if (selectedMonth) {
          const [year, month] = selectedMonth.split('-');
          console.log(`تفكيك التاريخ: سنة=${year}, شهر=${month}`);
          startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
          endDate = new Date(parseInt(year), parseInt(month), 0);
          console.log(`تواريخ محسوبة: من ${startDate.toISOString()} إلى ${endDate.toISOString()}`);
          console.log(`تواريخ بالعربي: من ${startDate.toLocaleDateString('ar')} إلى ${endDate.toLocaleDateString('ar')}`);
          console.log(`نطاق مطلوب: ${startDate.getTime()} إلى ${endDate.getTime()}`);
        } else {
          console.warn('لم يتم اختيار شهر محدد، إرجاع جميع البيانات');
          return allReadings;
        }
        break;
        
      default:
        console.warn('نوع فترة غير معروف، إرجاع جميع البيانات');
        return allReadings;
    }

    console.log(`نطاق التصفية النهائي: من ${startDate} إلى ${endDate}`);
    const filteredData = filterDataByDateRange(allReadings, startDate, endDate);
    console.log(`البيانات بعد التصفية: ${filteredData.length} عنصر`);
    
    return filteredData;
  }

  function getAnnualReportData(allReadings) {
    const annualPeriod = document.getElementById('annualPeriod')?.value;
    const now = new Date();
    let startDate, endDate;

    switch (annualPeriod) {
      case 'current_year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
        
      case 'last_year':
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31);
        break;
        
      case 'specific_year':
        const selectedYear = document.getElementById('selectedYear')?.value;
        if (selectedYear) {
          const yearNum = parseInt(selectedYear);
          const currentYear = new Date().getFullYear();
          
          // التحقق من معقولية السنة
          if (yearNum < 1970) {
            alert('يجب أن تكون السنة 1970 أو أحدث');
            return allReadings;
          }
          if (yearNum > currentYear + 20) {
            alert(`يجب أن تكون السنة ${currentYear + 20} أو أقل`);
            return allReadings;
          }
          
          startDate = new Date(yearNum, 0, 1);
          endDate = new Date(yearNum, 11, 31);
        } else {
          return allReadings;
        }
        break;
        
      default:
        return allReadings;
    }

    return filterDataByDateRange(allReadings, startDate, endDate);
  }

  function getForecastReportData(allReadings) {
    const forecastPeriod = document.getElementById('forecastPeriod')?.value;
    const now = new Date();
    let startDate, endDate;

    switch (forecastPeriod) {
      case 'last_6_months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
        
      case 'last_12_months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 12, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
        
      case 'last_24_months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 24, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
        
      case 'custom_period':
        const forecastStartDate = document.getElementById('forecastStartDate')?.value;
        const forecastEndDate = document.getElementById('forecastEndDate')?.value;
        if (forecastStartDate && forecastEndDate) {
          startDate = new Date(forecastStartDate);
          endDate = new Date(forecastEndDate);
        } else {
          return allReadings;
        }
        break;
        
      default:
        return allReadings;
    }

    return filterDataByDateRange(allReadings, startDate, endDate);
  }

  function getWellsReportData(allReadings) {
    const wellsPeriod = document.getElementById('wellsPeriod')?.value;
    const now = new Date();
    let startDate, endDate;

    switch (wellsPeriod) {
      case 'current_year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
        
      case 'last_year':
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31);
        break;
        
      case 'last_6_months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
        
      case 'all_time':
        return allReadings;
        
      case 'custom':
        const wellsStartDate = document.getElementById('wellsStartDate')?.value;
        const wellsEndDate = document.getElementById('wellsEndDate')?.value;
        if (wellsStartDate && wellsEndDate) {
          startDate = new Date(wellsStartDate);
          endDate = new Date(wellsEndDate);
        } else {
          return allReadings;
        }
        break;
        
      default:
        return allReadings;
    }

    return filterDataByDateRange(allReadings, startDate, endDate);
  }

  function getMonthlyDateInfo() {
    const monthlyPeriod = document.getElementById('monthlyPeriod')?.value;
    const now = new Date();
    
    switch (monthlyPeriod) {
      case 'current_month':
        return { year: now.getFullYear(), month: now.getMonth() + 1 };
        
      case 'last_month':
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return { year: lastMonth.getFullYear(), month: lastMonth.getMonth() + 1 };
        
      case 'specific_month':
        const selectedMonth = document.getElementById('selectedMonth')?.value;
        if (selectedMonth) {
          const [year, month] = selectedMonth.split('-');
          return { year: parseInt(year), month: parseInt(month) };
        }
        return { year: now.getFullYear(), month: now.getMonth() + 1 };
        
      default:
        return { year: now.getFullYear(), month: now.getMonth() + 1 };
    }
  }

  function getAnnualDateInfo() {
    const annualPeriod = document.getElementById('annualPeriod')?.value;
    const now = new Date();
    
    switch (annualPeriod) {
      case 'current_year':
        return { year: now.getFullYear() };
        
      case 'last_year':
        return { year: now.getFullYear() - 1 };
        
      case 'specific_year':
        const selectedYear = document.getElementById('selectedYear')?.value;
        if (selectedYear) {
          const yearNum = parseInt(selectedYear);
          const currentYear = now.getFullYear();
          
          // التحقق من معقولية السنة
          if (yearNum < 1970) {
            alert('يجب أن تكون السنة 1970 أو أحدث');
            return { year: currentYear };
          }
          if (yearNum > currentYear + 20) {
            alert(`يجب أن تكون السنة ${currentYear + 20} أو أقل`);
            return { year: currentYear };
          }
          
          return { year: yearNum };
        }
        return { year: now.getFullYear() };
        
      default:
        return { year: now.getFullYear() };
    }
  }

  function filterDataByDateRange(data, startDate, endDate) {
    console.log(`تصفية البيانات من ${startDate.toLocaleDateString('ar')} إلى ${endDate.toLocaleDateString('ar')}`);
    console.log(`إجمالي البيانات للتصفية: ${data.length}`);
    
    // عرض عينة من البيانات
    if (data.length > 0) {
      console.log('أول عنصر بيانات:', data[0]);
      console.log('مفاتيح البيانات:', Object.keys(data[0]));
      
      // عرض عينة من التواريخ
      const sampleDates = data.slice(0, 3).map((item, index) => {
        const dateFields = ['reading_date', 'readingDate', 'date', 'measurement_date'];
        const dates = {};
        dateFields.forEach(field => {
          if (item[field]) dates[field] = item[field];
        });
        return `عنصر ${index}: ${JSON.stringify(dates)}`;
      });
      console.log('عينة التواريخ:', sampleDates);
    }
    
    const filteredData = data.filter((reading, index) => {
      // التحقق من جميع أشكال تواريخ القراءة الممكنة
      const dateValue = reading.reading_date || reading.readingDate || reading.date || reading.measurement_date;
      
      if (!dateValue) {
        if (index < 3) console.log(`قراءة ${index} بدون تاريخ:`, Object.keys(reading));
        return false;
      }
      
      // تحويل التاريخ إلى كائن Date
      let readingDate;
      if (typeof dateValue === 'string') {
        readingDate = new Date(dateValue);
      } else if (dateValue instanceof Date) {
        readingDate = dateValue;
      } else {
        if (index < 3) console.log(`تنسيق تاريخ غير مدعوم في ${index}:`, dateValue);
        return false;
      }
      
      // التحقق من صحة التاريخ
      if (isNaN(readingDate.getTime())) {
        if (index < 3) console.log(`تاريخ غير صحيح في ${index}:`, dateValue);
        return false;
      }
      
      const readingTime = readingDate.getTime();
      const startTime = startDate.getTime();
      const endTime = endDate.getTime();
      
      const inRange = readingTime >= startTime && readingTime <= endTime;
      
      if (index < 5 || inRange) {  // عرض أول 5 عناصر أو العناصر في النطاق
        console.log(`قراءة ${index}: ${dateValue} -> ${readingDate.toISOString()}`);
        console.log(`  التوقيت: ${readingTime} (${readingDate.toLocaleDateString('ar')})`);
        console.log(`  النطاق: ${startTime} إلى ${endTime}`);
        console.log(`  في النطاق؟ ${inRange ? '✓' : '✗'}`);
      }
      
      return inRange;
    });
    
    console.log(`البيانات المصفاة: ${filteredData.length} من أصل ${data.length}`);
    return filteredData;
  }

  function handleReportTypeChange() {
    const reportType = document.getElementById('reportType');
    if (!reportType) return;

    // Hide all filter sections first
    const filterSections = [
      'monthlyFilters', 'annualFilters', 'comparativeFilters', 
      'forecastFilters', 'wellsFilters'
    ];
    
    filterSections.forEach(sectionId => {
      const section = document.getElementById(sectionId);
      if (section) section.style.display = 'none';
    });

    // Show relevant filter section based on selected type
    switch (reportType.value) {
      case 'monthly':
        const monthlyFilters = document.getElementById('monthlyFilters');
        if (monthlyFilters) monthlyFilters.style.display = 'block';
        break;
        
      case 'annual':
        const annualFilters = document.getElementById('annualFilters');
        if (annualFilters) annualFilters.style.display = 'block';
        break;
        
      case 'comparative':
        const comparativeFilters = document.getElementById('comparativeFilters');
        if (comparativeFilters) comparativeFilters.style.display = 'block';
        break;
        
      case 'forecast':
        const forecastFilters = document.getElementById('forecastFilters');
        if (forecastFilters) forecastFilters.style.display = 'block';
        break;
        
      case 'wells':
        const wellsFilters = document.getElementById('wellsFilters');
        if (wellsFilters) wellsFilters.style.display = 'block';
        break;
    }
  }

  async function generateSelectedReport() {
    if (!reportsEngine) {
      showMessage('msgReadings', 'محرك التقارير غير متاح', 'err');
      return;
    }

    const reportType = document.getElementById('reportType');
    const reportResults = document.getElementById('reportResults');
    
    if (!reportType || !reportResults) return;

    try {
      // Show loading state
      reportResults.innerHTML = '<div class="report-placeholder"><div class="placeholder-icon">⏳</div><h3>جاري إنشاء التقرير...</h3></div>';

      // Get all readings data
      const allReadings = await getAllReadingsData();
      
      if (!allReadings || allReadings.length === 0) {
        reportResults.innerHTML = '<div class="report-placeholder"><div class="placeholder-icon">📭</div><h3>لا توجد بيانات</h3><p>لا توجد قراءات كافية لإنشاء التقرير</p></div>';
        return;
      }

      let reportData = null;
      let filteredData = [];

      switch (reportType.value) {
        case 'monthly':
          filteredData = getMonthlyReportData(allReadings);
          console.log(`البيانات المصفاة للتقرير الشهري: ${filteredData.length}`);
          if (filteredData.length === 0) {
            const monthlyPeriod = document.getElementById('monthlyPeriod')?.value || 'غير محدد';
            const selectedMonth = document.getElementById('selectedMonth')?.value || 'غير محدد';
            console.error(`لا توجد بيانات للتقرير الشهري:`);
            console.error(`- نوع الفترة: ${monthlyPeriod}`);
            console.error(`- الشهر المحدد: ${selectedMonth}`);
            console.error(`- إجمالي البيانات الأصلية: ${allReadings.length}`);
            throw new Error(`لا توجد بيانات للفترة المحددة. نوع الفترة: ${monthlyPeriod}, الشهر: ${selectedMonth}`);
          }
          // تمرير البيانات المصفاة مباشرة بدلاً من إعادة التصفية
          const monthInfo = getMonthlyDateInfo();
          reportData = {
            period: { year: monthInfo.year, month: monthInfo.month, monthName: getMonthName(monthInfo.month) },
            summary: reportsEngine.calculateMonthlySummary(filteredData),
            trends: reportsEngine.analyzeMonthlyTrends(filteredData),
            qualityMetrics: reportsEngine.calculateQualityMetrics(filteredData),
            consumption: reportsEngine.analyzeConsumptionPatterns(filteredData),
            wells: reportsEngine.analyzeWellsPerformance(filteredData),
            alerts: reportsEngine.generateMonthlyAlerts(filteredData),
            recommendations: reportsEngine.generateMonthlyRecommendations(filteredData)
          };
          break;
          
        case 'annual':
          filteredData = getAnnualReportData(allReadings);
          console.log(`البيانات المصفاة للتقرير السنوي: ${filteredData.length}`);
          if (filteredData.length === 0) {
            throw new Error('لا توجد بيانات للفترة المحددة');
          }
          // تمرير البيانات المصفاة مباشرة بدلاً من إعادة التصفية
          const yearInfo = getAnnualDateInfo();
          reportData = {
            period: { year: yearInfo.year },
            summary: reportsEngine.calculateAnnualSummary(filteredData),
            monthlyBreakdown: reportsEngine.getMonthlyBreakdown(filteredData),
            seasonalAnalysis: reportsEngine.analyzeSeasonalPatterns(filteredData),
            trends: reportsEngine.analyzeAnnualTrends(filteredData),
            performance: reportsEngine.calculateAnnualPerformance(filteredData),
            forecasting: reportsEngine.generateAnnualForecast(filteredData),
            achievements: reportsEngine.calculateAchievements(filteredData),
            recommendations: reportsEngine.generateAnnualRecommendations(filteredData)
          };
          break;
          
        case 'comparative':
          reportData = generateComparativeReport(allReadings);
          break;
          
        case 'forecast':
          filteredData = getForecastReportData(allReadings);
          if (filteredData.length < 3) {
            throw new Error('البيانات غير كافية للتنبؤ - يحتاج على الأقل 3 قراءات');
          }
          reportData = generateAdvancedForecastReport(filteredData);
          break;
          
        case 'wells':
          filteredData = getWellsReportData(allReadings);
          reportData = generateWellsAnalysisReport(filteredData);
          break;
          
        default:
          throw new Error('نوع تقرير غير مدعوم: ' + reportType.value);
      }

      // Display the report
      displayReport(reportData, reportType.value);
      
    } catch (error) {
      console.error('خطأ في إنشاء التقرير:', error);
      reportResults.innerHTML = `<div class="report-placeholder"><div class="placeholder-icon">❌</div><h3>خطأ في إنشاء التقرير</h3><p>${error.message}</p></div>`;
    }
  }

  function displayReport(reportData, reportType) {
    const reportResults = document.getElementById('reportResults');
    if (!reportResults) return;

    let html = '<div class="report-content">';
    
    switch (reportType) {
      case 'monthly':
        html += generateMonthlyReportHTML(reportData);
        break;
      case 'annual':
        html += generateAnnualReportHTML(reportData);
        break;
      case 'wells':
        html += generateWellsReportHTML(reportData);
        break;
      case 'comparative':
        html += generateComparativeReportHTML(reportData);
        break;
      case 'forecast':
        html += generateForecastReportHTML(reportData);
        break;
    }
    
    html += '</div>';
    reportResults.innerHTML = html;
  }

  function generateMonthlyReportHTML(report) {
    return `
      <div class="report-header">
        <h3>📅 التقرير الشهري - ${report.period.monthName} ${report.period.year}</h3>
      </div>
      
      <div class="report-summary">
        <div class="summary-grid">
          <div class="summary-metric">
            <div class="metric-value">${report.summary.totalReadings}</div>
            <div class="metric-label">إجمالي القراءات</div>
          </div>
          <div class="summary-metric">
            <div class="metric-value">${report.summary.totalConsumption.toFixed(2)}</div>
            <div class="metric-label">إجمالي الاستهلاك (م³)</div>
          </div>
          <div class="summary-metric">
            <div class="metric-value">${report.summary.activeWells}</div>
            <div class="metric-label">الآبار النشطة</div>
          </div>
          <div class="summary-metric">
            <div class="metric-value">${(report.summary.dataQualityScore * 100).toFixed(1)}%</div>
            <div class="metric-label">جودة البيانات</div>
          </div>
        </div>
      </div>
      
      <div class="report-recommendations">
        <h4>📋 التوصيات</h4>
        <ul>
          ${report.recommendations.map(rec => `<li><strong>${rec.title}:</strong> ${rec.description}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  function generateAnnualReportHTML(report) {
    return `
      <div class="report-header">
        <h3>📊 التقرير السنوي - ${report.period.year}</h3>
      </div>
      
      <div class="report-summary">
        <div class="summary-grid">
          <div class="summary-metric">
            <div class="metric-value">${report.summary.totalReadings}</div>
            <div class="metric-label">إجمالي القراءات</div>
          </div>
          <div class="summary-metric">
            <div class="metric-value">${report.summary.totalConsumption.toFixed(2)}</div>
            <div class="metric-label">إجمالي الاستهلاك (م³)</div>
          </div>
          <div class="summary-metric">
            <div class="metric-value">${report.summary.averageMonthlyConsumption.toFixed(2)}</div>
            <div class="metric-label">متوسط الاستهلاك الشهري</div>
          </div>
          <div class="summary-metric">
            <div class="metric-value">${(report.summary.growthRate * 100).toFixed(1)}%</div>
            <div class="metric-label">معدل النمو</div>
          </div>
        </div>
      </div>
      
      <div class="seasonal-analysis">
        <h4>🌦️ التحليل الموسمي</h4>
        <div class="seasonal-grid">
          ${Object.keys(report.seasonalAnalysis).map(season => `
            <div class="season-card">
              <h5>${getSeasonName(season)}</h5>
              <p>الاستهلاك: ${report.seasonalAnalysis[season].totalConsumption.toFixed(2)} م³</p>
              <p>المتوسط: ${report.seasonalAnalysis[season].averageConsumption.toFixed(2)} م³</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function getSeasonName(season) {
    const names = {
      winter: 'الشتاء',
      spring: 'الربيع', 
      summer: 'الصيف',
      autumn: 'الخريف'
    };
    return names[season] || season;
  }

  // Generate missing report functions
  function generateWellsAnalysisReport(allReadings) {
    const wellsData = {};
    
    allReadings.forEach(reading => {
      const wellId = reading.wells?.well_code || reading.well_id;
      if (!wellsData[wellId]) {
        wellsData[wellId] = {
          wellId: wellId,
          wellName: reading.wells?.well_name || 'Unknown',
          readings: [],
          totalConsumption: 0,
          averageConsumption: 0
        };
      }
      wellsData[wellId].readings.push(reading);
      const consumption = getCorrectedConsumption(reading);
      wellsData[wellId].totalConsumption += consumption;
    });

    // Calculate averages
    Object.keys(wellsData).forEach(wellId => {
      const well = wellsData[wellId];
      well.averageConsumption = well.readings.length > 0 ? well.totalConsumption / well.readings.length : 0;
    });

    return {
      type: 'wells_analysis',
      period: { type: 'filtered_period' },
      wells: Object.values(wellsData),
      summary: {
        totalWells: Object.keys(wellsData).length,
        totalReadings: allReadings.length,
        totalConsumption: Object.values(wellsData).reduce((sum, well) => sum + well.totalConsumption, 0)
      }
    };
  }

  function generateComparativeReport(allReadings) {
    const comparisonType = document.getElementById('comparisonType')?.value;
    
    switch (comparisonType) {
      case 'monthly':
        return generateMonthlyComparison(allReadings);
      case 'yearly':
        return generateYearlyComparison(allReadings);
      case 'custom':
        return generateCustomComparison(allReadings);
      default:
        return generateBasicComparativeReport(allReadings);
    }
  }

  function generateMonthlyComparison(allReadings) {
    const firstMonth = document.getElementById('firstMonth')?.value;
    const secondMonth = document.getElementById('secondMonth')?.value;
    
    if (!firstMonth || !secondMonth) {
      throw new Error('يجب اختيار الشهرين للمقارنة');
    }

    const [year1, month1] = firstMonth.split('-');
    const [year2, month2] = secondMonth.split('-');
    
    const firstPeriod = allReadings.filter(reading => {
      const date = new Date(reading.reading_date);
      return date.getFullYear() == year1 && (date.getMonth() + 1) == month1;
    });
    
    const secondPeriod = allReadings.filter(reading => {
      const date = new Date(reading.reading_date);
      return date.getFullYear() == year2 && (date.getMonth() + 1) == month2;
    });

    const firstTotal = firstPeriod.reduce((sum, r) => sum + getCorrectedConsumption(r), 0);
    const secondTotal = secondPeriod.reduce((sum, r) => sum + getCorrectedConsumption(r), 0);
    
    const change = secondTotal - firstTotal;
    const changePercent = firstTotal > 0 ? (change / firstTotal) * 100 : 0;

    return {
      type: 'comparative',
      period1: { 
        name: `${getMonthName(parseInt(month1))} ${year1}`, 
        total: firstTotal, 
        count: firstPeriod.length 
      },
      period2: { 
        name: `${getMonthName(parseInt(month2))} ${year2}`, 
        total: secondTotal, 
        count: secondPeriod.length 
      },
      comparison: {
        change: change,
        changePercent: changePercent,
        trend: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'stable'
      }
    };
  }

  function generateYearlyComparison(allReadings) {
    const firstYear = document.getElementById('firstYear')?.value;
    const secondYear = document.getElementById('secondYear')?.value;
    
    if (!firstYear || !secondYear) {
      throw new Error('يجب اختيار السنتين للمقارنة');
    }
    
    // التحقق من معقولية السنوات
    const firstYearNum = parseInt(firstYear);
    const secondYearNum = parseInt(secondYear);
    const currentYear = new Date().getFullYear();
    
    if (firstYearNum < 1970 || firstYearNum > currentYear + 20) {
      throw new Error(`يجب أن تكون السنة الأولى بين 1970 و ${currentYear + 20}`);
    }
    
    if (secondYearNum < 1970 || secondYearNum > currentYear + 20) {
      throw new Error(`يجب أن تكون السنة الثانية بين 1970 و ${currentYear + 20}`);
    }
    
    const firstPeriod = allReadings.filter(reading => {
      const date = new Date(reading.reading_date);
      return date.getFullYear() == firstYearNum;
    });
    
    const secondPeriod = allReadings.filter(reading => {
      const date = new Date(reading.reading_date);
      return date.getFullYear() == secondYearNum;
    });

    const firstTotal = firstPeriod.reduce((sum, r) => sum + (parseFloat(r.monthly_abstraction_m3) || 0), 0);
    const secondTotal = secondPeriod.reduce((sum, r) => sum + (parseFloat(r.monthly_abstraction_m3) || 0), 0);
    
    const change = secondTotal - firstTotal;
    const changePercent = firstTotal > 0 ? (change / firstTotal) * 100 : 0;

    return {
      type: 'comparative',
      period1: { 
        name: `سنة ${firstYearNum}`, 
        total: firstTotal, 
        count: firstPeriod.length 
      },
      period2: { 
        name: `سنة ${secondYearNum}`, 
        total: secondTotal, 
        count: secondPeriod.length 
      },
      comparison: {
        change: change,
        changePercent: changePercent,
        trend: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'stable'
      }
    };
  }

  function generateCustomComparison(allReadings) {
    const firstPeriodStart = document.getElementById('firstPeriodStart')?.value;
    const firstPeriodEnd = document.getElementById('firstPeriodEnd')?.value;
    const secondPeriodStart = document.getElementById('secondPeriodStart')?.value;
    const secondPeriodEnd = document.getElementById('secondPeriodEnd')?.value;
    
    if (!firstPeriodStart || !firstPeriodEnd || !secondPeriodStart || !secondPeriodEnd) {
      throw new Error('يجب تحديد جميع تواريخ الفترات للمقارنة');
    }
    
    const firstPeriod = filterDataByDateRange(allReadings, new Date(firstPeriodStart), new Date(firstPeriodEnd));
    const secondPeriod = filterDataByDateRange(allReadings, new Date(secondPeriodStart), new Date(secondPeriodEnd));

    const firstTotal = firstPeriod.reduce((sum, r) => sum + (parseFloat(r.monthly_abstraction_m3) || 0), 0);
    const secondTotal = secondPeriod.reduce((sum, r) => sum + (parseFloat(r.monthly_abstraction_m3) || 0), 0);
    
    const change = secondTotal - firstTotal;
    const changePercent = firstTotal > 0 ? (change / firstTotal) * 100 : 0;

    return {
      type: 'comparative',
      period1: { 
        name: `${new Date(firstPeriodStart).toLocaleDateString('ar')} - ${new Date(firstPeriodEnd).toLocaleDateString('ar')}`, 
        total: firstTotal, 
        count: firstPeriod.length 
      },
      period2: { 
        name: `${new Date(secondPeriodStart).toLocaleDateString('ar')} - ${new Date(secondPeriodEnd).toLocaleDateString('ar')}`, 
        total: secondTotal, 
        count: secondPeriod.length 
      },
      comparison: {
        change: change,
        changePercent: changePercent,
        trend: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'stable'
      }
    };
  }

  function generateAdvancedForecastReport(filteredData) {
    try {
      // Get forecast horizon
      const forecastHorizon = parseInt(document.getElementById('forecastHorizon')?.value) || 6;
      
      if (predictionEngine && filteredData.length >= 6) {
        const forecastData = predictionEngine.predictFutureConsumption(filteredData, forecastHorizon, 'hybrid');
        return {
          type: 'forecast',
          predictions: forecastData.predictions,
          accuracy: forecastData.accuracy,
          confidence: forecastData.confidence,
          methodology: forecastData.methodology,
          dataCount: filteredData.length,
          horizon: forecastHorizon
        };
      } else {
        // Enhanced simple forecast
        if (filteredData.length < 3) {
          throw new Error('البيانات غير كافية للتنبؤ - يحتاج على الأقل 3 قراءات للتحليل الأساسي');
        }
        
        const sortedData = filteredData.sort((a, b) => new Date(a.reading_date) - new Date(b.reading_date));
        const recentData = sortedData.slice(-Math.min(12, sortedData.length)); // Last 12 or available readings
        
        const totalConsumption = recentData.reduce((sum, r) => sum + (parseFloat(r.monthly_abstraction_m3) || 0), 0);
        const averageConsumption = recentData.length > 0 ? totalConsumption / recentData.length : 0;
        
        // Calculate linear trend
        let trend = 0;
        let seasonality = 0;
        
        if (recentData.length >= 6) {
          const midPoint = Math.floor(recentData.length / 2);
          const firstHalf = recentData.slice(0, midPoint);
          const secondHalf = recentData.slice(midPoint);
          
          const firstAvg = firstHalf.reduce((sum, r) => sum + (parseFloat(r.monthly_abstraction_m3) || 0), 0) / firstHalf.length;
          const secondAvg = secondHalf.reduce((sum, r) => sum + (parseFloat(r.monthly_abstraction_m3) || 0), 0) / secondHalf.length;
          
          trend = (secondAvg - firstAvg) / midPoint; // Monthly trend
          
          // Simple seasonality detection
          if (recentData.length >= 12) {
            const monthlyAvg = {};
            recentData.forEach(reading => {
              const month = new Date(reading.reading_date).getMonth() + 1;
              if (!monthlyAvg[month]) monthlyAvg[month] = [];
              monthlyAvg[month].push(parseFloat(reading.monthly_abstraction_m3) || 0);
            });
            
            const monthlyVariation = Object.keys(monthlyAvg).map(month => {
              const avg = monthlyAvg[month].reduce((sum, val) => sum + val, 0) / monthlyAvg[month].length;
              return Math.abs(avg - averageConsumption);
            });
            
            seasonality = monthlyVariation.reduce((sum, val) => sum + val, 0) / monthlyVariation.length;
          }
        }
        
        // Generate predictions
        const predictions = [];
        const currentDate = new Date();
        
        for (let i = 1; i <= forecastHorizon; i++) {
          const futureDate = new Date(currentDate);
          futureDate.setMonth(futureDate.getMonth() + i);
          
          // Apply trend and seasonal adjustment
          const seasonalFactor = seasonality > 0 ? (Math.sin((futureDate.getMonth() * Math.PI) / 6) * seasonality * 0.1) : 0;
          const predictedValue = averageConsumption + (trend * i) + seasonalFactor;
          
          predictions.push({
            period: futureDate.toLocaleDateString('ar', { year: 'numeric', month: 'long' }),
            value: Math.max(0, predictedValue),
            confidence: Math.max(0.3, 1 - (i * 0.1)) // Decreasing confidence over time
          });
        }
        
        return {
          type: 'forecast',
          simple: true,
          currentAverage: averageConsumption,
          trend: trend,
          seasonality: seasonality,
          predictions: predictions,
          confidence: recentData.length >= 12 ? 'متوسط' : 'منخفض',
          dataCount: filteredData.length,
          horizon: forecastHorizon,
          note: recentData.length < 12 ? 
            'تنبؤ أولي - للحصول على تحليل أكثر دقة يُنصح بتوفير 12 شهر من البيانات على الأقل' : 
            'تنبؤ محسن مع اكتشاف الاتجاهات والمواسم'
        };
      }
    } catch (error) {
      throw new Error('خطأ في إنشاء التنبؤ: ' + error.message);
    }
  }

  function getMonthName(monthNumber) {
    const months = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    return months[monthNumber - 1] || 'غير معروف';
  }

  // Helper function to get corrected consumption value
  function getCorrectedConsumption(reading) {
    // أولوية للبيانات المُصححة والمُقدرة
    return parseFloat(reading.corrected_abstraction) || 
           parseFloat(reading.estimated_abstraction) ||
           parseFloat(reading.monthly_abstraction_m3) || 
           parseFloat(reading.abstraction) || 0;
  }

  function generateBasicForecastReport(filteredData) {
    try {
      if (predictionEngine && filteredData.length >= 6) {
        const forecastData = predictionEngine.predictFutureConsumption(filteredData, 6, 'hybrid');
        return {
          type: 'forecast',
          predictions: forecastData.predictions,
          accuracy: forecastData.accuracy,
          confidence: forecastData.confidence,
          methodology: forecastData.methodology,
          dataCount: filteredData.length
        };
      } else {
        // Simple trend-based forecast fallback
        const recentData = filteredData.slice(-6); // Last 6 readings
        const totalConsumption = recentData.reduce((sum, r) => sum + (parseFloat(r.monthly_abstraction_m3) || parseFloat(r.abstraction) || 0), 0);
        const averageConsumption = recentData.length > 0 ? totalConsumption / recentData.length : 0;
        
        // Simple linear trend calculation
        let trend = 0;
        if (recentData.length >= 3) {
          const firstHalf = recentData.slice(0, Math.floor(recentData.length / 2));
          const secondHalf = recentData.slice(Math.floor(recentData.length / 2));
          
          const firstAvg = firstHalf.reduce((sum, r) => sum + (parseFloat(r.monthly_abstraction_m3) || parseFloat(r.abstraction) || 0), 0) / firstHalf.length;
          const secondAvg = secondHalf.reduce((sum, r) => sum + (parseFloat(r.monthly_abstraction_m3) || parseFloat(r.abstraction) || 0), 0) / secondHalf.length;
          
          trend = secondAvg - firstAvg;
        }
        
        return {
          type: 'forecast',
          simple: true,
          currentAverage: averageConsumption,
          trend: trend,
          projectedConsumption: averageConsumption * 6 + (trend * 3), // 6 months with trend
          confidence: filteredData.length >= 12 ? 'متوسط' : 'منخفض',
          dataCount: filteredData.length,
          note: filteredData.length < 6 ? 
            'يحتاج المزيد من البيانات للتحليل الدقيق (أقل من 6 قراءات)' : 
            'تنبؤ مبسط - للحصول على تحليل متقدم يرجى ضمان توفر محرك التنبؤ'
        };
      }
    } catch (error) {
      return {
        type: 'forecast',
        error: 'خطأ في إنشاء التنبؤ: ' + error.message,
        simple: true,
        dataCount: filteredData ? filteredData.length : 0
      };
    }
  }

  function generateWellsReportHTML(report) {
    return `
      <div class="report-header">
        <h3>🏗️ تحليل الآبار</h3>
      </div>
      
      <div class="report-summary">
        <div class="summary-grid">
          <div class="summary-metric">
            <div class="metric-value">${report.summary.totalWells}</div>
            <div class="metric-label">إجمالي الآبار</div>
          </div>
          <div class="summary-metric">
            <div class="metric-value">${report.summary.totalReadings}</div>
            <div class="metric-label">إجمالي القراءات</div>
          </div>
          <div class="summary-metric">
            <div class="metric-value">${report.summary.totalConsumption.toFixed(2)}</div>
            <div class="metric-label">إجمالي الاستهلاك (م³)</div>
          </div>
        </div>
      </div>
      
      <div class="wells-analysis">
        <h4>📊 تفاصيل الآبار</h4>
        <div class="wells-grid">
          ${report.wells.map(well => `
            <div class="well-card">
              <h5>${well.wellId} - ${well.wellName}</h5>
              <p>عدد القراءات: ${well.readings.length}</p>
              <p>إجمالي الاستهلاك: ${well.totalConsumption.toFixed(2)} م³</p>
              <p>متوسط الاستهلاك: ${well.averageConsumption.toFixed(2)} م³</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function generateComparativeReportHTML(report) {
    const trendIcon = report.comparison.trend === 'increase' ? '📈' : 
                     report.comparison.trend === 'decrease' ? '📉' : '➡️';
    const trendColor = report.comparison.trend === 'increase' ? '#ef4444' : 
                      report.comparison.trend === 'decrease' ? '#10b981' : '#6b7280';

    return `
      <div class="report-header">
        <h3>🔄 التقرير المقارن</h3>
      </div>
      
      <div class="comparison-summary">
        <div class="comparison-grid">
          <div class="period-card">
            <h4>${report.period1.name}</h4>
            <div class="period-value">${report.period1.total.toFixed(2)} م³</div>
            <div class="period-count">${report.period1.count} قراءة</div>
          </div>
          
          <div class="comparison-indicator">
            <div class="trend-icon" style="color: ${trendColor}">${trendIcon}</div>
            <div class="change-value" style="color: ${trendColor}">
              ${report.comparison.change > 0 ? '+' : ''}${report.comparison.change.toFixed(2)} م³
            </div>
            <div class="change-percent" style="color: ${trendColor}">
              ${report.comparison.changePercent > 0 ? '+' : ''}${report.comparison.changePercent.toFixed(1)}%
            </div>
          </div>
          
          <div class="period-card">
            <h4>${report.period2.name}</h4>
            <div class="period-value">${report.period2.total.toFixed(2)} م³</div>
            <div class="period-count">${report.period2.count} قراءة</div>
          </div>
        </div>
      </div>
    `;
  }

  function generateForecastReportHTML(report) {
    if (report.error) {
      return `
        <div class="report-header">
          <h3>🔮 تقرير التنبؤ</h3>
        </div>
        <div class="error-message">
          <p>${report.error}</p>
        </div>
      `;
    }

    if (report.simple) {
      const trendText = report.trend > 0 ? 'ارتفاع' : report.trend < 0 ? 'انخفاض' : 'استقرار';
      const trendIcon = report.trend > 0 ? '📈' : report.trend < 0 ? '📉' : '📊';
      const confidenceColor = report.confidence === 'متوسط' ? '#f59e0b' : '#ef4444';
      
      return `
        <div class="report-header">
          <h3>🔮 تقرير التنبؤ المحسن</h3>
        </div>
        
        <div class="forecast-summary">
          <div class="summary-grid">
            <div class="summary-metric">
              <div class="metric-value">${report.currentAverage.toFixed(2)}</div>
              <div class="metric-label">متوسط الاستهلاك الشهري (م³)</div>
            </div>
            <div class="summary-metric">
              <div class="metric-value">${trendIcon}</div>
              <div class="metric-label">اتجاه الاستهلاك: ${trendText}</div>
            </div>
            <div class="summary-metric">
              <div class="metric-value" style="color: ${confidenceColor}">${report.confidence}</div>
              <div class="metric-label">مستوى الثقة</div>
            </div>
            <div class="summary-metric">
              <div class="metric-value">${report.horizon}</div>
              <div class="metric-label">فترة التنبؤ (أشهر)</div>
            </div>
          </div>
          
          ${report.predictions && report.predictions.length > 0 ? `
            <div class="predictions-list">
              <h4>📊 التنبؤات المستقبلية</h4>
              ${report.predictions.map(pred => `
                <div class="prediction-item">
                  <span>${pred.period}</span>
                  <span>${pred.value.toFixed(2)} م³</span>
                  <span class="confidence">ثقة: ${(pred.confidence * 100).toFixed(0)}%</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
          
          <div class="note">
            <p><strong>عدد القراءات المستخدمة:</strong> ${report.dataCount}</p>
            <p>${report.note}</p>
            ${report.trend !== 0 ? `<p><strong>التغيير الشهري المتوقع:</strong> ${report.trend > 0 ? '+' : ''}${report.trend.toFixed(2)} م³</p>` : ''}
            ${report.seasonality > 0 ? `<p><strong>تأثير الموسمية:</strong> ${report.seasonality.toFixed(2)} م³</p>` : ''}
          </div>
        </div>
      `;
    }

    return `
      <div class="report-header">
        <h3>🔮 تقرير التنبؤ المتقدم</h3>
      </div>
      
      <div class="forecast-summary">
        <div class="summary-grid">
          <div class="summary-metric">
            <div class="metric-value">${(report.confidence * 100).toFixed(1)}%</div>
            <div class="metric-label">مستوى الثقة</div>
          </div>
          <div class="summary-metric">
            <div class="metric-value">${(report.accuracy * 100).toFixed(1)}%</div>
            <div class="metric-label">دقة النموذج</div>
          </div>
        </div>
        
        <div class="predictions-list">
          <h4>📊 التنبؤات القادمة</h4>
          ${report.predictions.map((pred, index) => `
            <div class="prediction-item">
              <span>الفترة ${index + 1}: ${pred.value.toFixed(2)} م³</span>
              <span class="confidence">(ثقة: ${(pred.confidence * 100).toFixed(1)}%)</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ========= Alerts Integration =========
  function initializeAlertsListeners() {
    // Refresh alerts button
    const refreshAlertsBtn = document.getElementById('refreshAlertsBtn');
    if (refreshAlertsBtn) {
      refreshAlertsBtn.addEventListener('click', refreshAlerts);
    }

    // Alert settings button
    const alertSettingsBtn = document.getElementById('alertSettingsBtn');
    if (alertSettingsBtn) {
      alertSettingsBtn.addEventListener('click', () => {
        const modal = document.getElementById('alertSettingsModal');
        if (modal) modal.style.display = 'block';
      });
    }

    // Alert filter handlers
    const alertFilter = document.getElementById('alertFilter');
    const alertTypeFilter = document.getElementById('alertTypeFilter');
    
    if (alertFilter) alertFilter.addEventListener('change', filterAlerts);
    if (alertTypeFilter) alertTypeFilter.addEventListener('change', filterAlerts);

    // Modal handlers
    setupAlertModalHandlers();
  }

  function filterAlerts() {
    console.log('تطبيق فلاتر التنبيهات');
    // Implementation for filtering alerts based on selected criteria
    updateAlertsDisplay();
  }

  function saveAlertSettingsHandler() {
    console.log('حفظ إعدادات التنبيهات');
    
    // Get settings values
    const highConsumptionThreshold = document.getElementById('highConsumptionThreshold')?.value;
    const lowWaterThreshold = document.getElementById('lowWaterThreshold')?.value;
    const irregularPatternThreshold = document.getElementById('irregularPatternThreshold')?.value;
    const dataQualityThreshold = document.getElementById('dataQualityThreshold')?.value;
    
    if (alertSystem) {
      const newSettings = {
        thresholds: {
          highConsumption: {
            multiplier: parseFloat(highConsumptionThreshold) || 1.5
          },
          lowWaterLevel: {
            percentage: parseInt(lowWaterThreshold) || 30
          },
          irregularPattern: {
            deviationThreshold: parseFloat(irregularPatternThreshold) || 0.8
          },
          dataQuality: {
            minQualityScore: parseInt(dataQualityThreshold) / 100 || 0.6
          }
        }
      };
      
      alertSystem.updateSettings(newSettings);
      showMessage('msgReadings', 'تم حفظ إعدادات التنبيهات بنجاح', 'ok');
      
      // Close modal
      const modal = document.getElementById('alertSettingsModal');
      if (modal) modal.style.display = 'none';
    }
  }

  function setupAlertModalHandlers() {
    // Alert settings modal
    const alertSettingsModal = document.getElementById('alertSettingsModal');
    const closeAlertSettingsModal = document.getElementById('closeAlertSettingsModal');
    const saveAlertSettings = document.getElementById('saveAlertSettings');
    const cancelAlertSettings = document.getElementById('cancelAlertSettings');

    if (closeAlertSettingsModal) {
      closeAlertSettingsModal.addEventListener('click', () => {
        if (alertSettingsModal) alertSettingsModal.style.display = 'none';
      });
    }

    if (cancelAlertSettings) {
      cancelAlertSettings.addEventListener('click', () => {
        if (alertSettingsModal) alertSettingsModal.style.display = 'none';
      });
    }

    if (saveAlertSettings) {
      saveAlertSettings.addEventListener('click', saveAlertSettingsHandler);
    }
  }

  async function refreshAlerts() {
    if (!alertSystem) return;

    try {
      // Get latest readings data
      const allReadings = await getAllReadingsData();
      
      if (allReadings && allReadings.length > 0) {
        // Analyze data for alerts
        const newAlerts = alertSystem.analyzeData(allReadings);
        
        // Update the alerts display
        updateAlertsDisplay();
        updateAlertCounts();
        
        showMessage('msgReadings', `تم تحديث التنبيهات - تم العثور على ${newAlerts.length} تنبيه جديد`, 'ok');
      }
    } catch (error) {
      console.error('خطأ في تحديث التنبيهات:', error);
      showMessage('msgReadings', 'خطأ في تحديث التنبيهات', 'err');
    }
  }

  function updateAlertsDisplay() {
    if (!alertSystem) return;

    const activeAlerts = alertSystem.getActiveAlerts();
    const activeAlertsList = document.getElementById('activeAlertsList');
    
    if (!activeAlertsList) return;

    if (activeAlerts.length === 0) {
      activeAlertsList.innerHTML = `
        <div class="no-alerts-message">
          <div class="no-alerts-icon">✅</div>
          <h4>لا توجد تنبيهات نشطة</h4>
          <p>النظام يعمل بشكل طبيعي - لا توجد مشاكل تتطلب الانتباه</p>
        </div>
      `;
      return;
    }

    let html = '';
    activeAlerts.forEach(alert => {
      html += generateAlertCardHTML(alert);
    });
    
    activeAlertsList.innerHTML = html;
  }

  function generateAlertCardHTML(alert) {
    return `
      <div class="alert-card" data-alert-id="${alert.id}">
        <div class="alert-icon ${alert.severity}">
          ${getAlertIcon(alert.type)}
        </div>
        <div class="alert-content">
          <div class="alert-title">${alert.title}</div>
          <div class="alert-message">${alert.message}</div>
          <div class="alert-meta">
            <span>الوقت: ${new Date(alert.timestamp).toLocaleString('ar')}</span>
            ${alert.wellId ? `<span>البئر: ${alert.wellId}</span>` : ''}
            <span>الأولوية: ${getSeverityText(alert.severity)}</span>
          </div>
          <div class="alert-actions">
            <button class="alert-btn primary" onclick="acknowledgeAlert('${alert.id}')">تأكيد الاستلام</button>
            <button class="alert-btn" onclick="viewAlertDetails('${alert.id}')">عرض التفاصيل</button>
            <button class="alert-btn" onclick="resolveAlert('${alert.id}')">تم الحل</button>
          </div>
        </div>
      </div>
    `;
  }

  function getAlertIcon(type) {
    const icons = {
      high_consumption: '📈',
      low_water_level: '⬇️',
      irregular_pattern: '📊',
      data_quality: '📋',
      forecast: '🔮',
      system: '⚙️'
    };
    return icons[type] || '⚠️';
  }

  function getSeverityText(severity) {
    const severityTexts = {
      critical: 'حرج',
      high: 'عالي',
      medium: 'متوسط',
      low: 'منخفض'
    };
    return severityTexts[severity] || severity;
  }

  function updateAlertCounts() {
    if (!alertSystem) return;

    const activeAlerts = alertSystem.getActiveAlerts();
    
    const criticalCount = activeAlerts.filter(a => a.severity === 'critical').length;
    const warningCount = activeAlerts.filter(a => a.severity === 'high' || a.severity === 'medium').length;
    const infoCount = activeAlerts.filter(a => a.severity === 'low').length;
    const resolvedCount = alertSystem.alerts.filter(a => a.status === 'resolved').length;

    // Update count displays
    const criticalElement = document.getElementById('criticalAlertsCount');
    const warningElement = document.getElementById('warningAlertsCount');
    const infoElement = document.getElementById('infoAlertsCount');
    const resolvedElement = document.getElementById('resolvedAlertsCount');

    if (criticalElement) criticalElement.textContent = criticalCount;
    if (warningElement) warningElement.textContent = warningCount;
    if (infoElement) infoElement.textContent = infoCount;
    if (resolvedElement) resolvedElement.textContent = resolvedCount;
  }

  // Global functions for alert actions
  window.acknowledgeAlert = function(alertId) {
    if (alertSystem) {
      alertSystem.acknowledgeAlert(alertId);
      updateAlertsDisplay();
      updateAlertCounts();
    }
  };

  window.resolveAlert = function(alertId) {
    if (alertSystem) {
      const resolution = prompt('أدخل تفاصيل الحل:');
      if (resolution) {
        alertSystem.resolveAlert(alertId, resolution);
        updateAlertsDisplay();
        updateAlertCounts();
      }
    }
  };

  window.viewAlertDetails = function(alertId) {
    // Implementation for viewing alert details
    console.log('عرض تفاصيل التنبيه:', alertId);
  };

  // Helper function to get all readings data
  async function getAllReadingsData() {
    if (!supabase) {
      console.warn('⚠️ Supabase غير متاح');
      return [];
    }
    
    try {
      console.log('🔄 جاري جلب بيانات القراءات...');
      
      // أولاً: فحص إحصائيات من قاعدة البيانات مباشرة
      console.log('📊 فحص إحصائيات البيانات من قاعدة البيانات...');
      const { data: statsData, error: statsError } = await supabase
        .from('monthly_readings')
        .select('reading_date')
        .order('reading_date', { ascending: true })
        .limit(1);
        
      const { data: latestData, error: latestError } = await supabase
        .from('monthly_readings')
        .select('reading_date')
        .order('reading_date', { ascending: false })
        .limit(1);
        
      if (statsData && statsData.length > 0 && latestData && latestData.length > 0) {
        console.log(`📅 أقدم قراءة في قاعدة البيانات: ${statsData[0].reading_date}`);
        console.log(`📅 أحدث قراءة في قاعدة البيانات: ${latestData[0].reading_date}`);
      }
      
      // ثانياً: جلب كل البيانات بالتدريج للتغلب على حد 1000
      console.log('📥 جاري جلب كامل البيانات من قاعدة البيانات...');
      
      let allData = [];
      let hasMore = true;
      let offset = 0;
      const batchSize = 1000;
      
      while (hasMore) {
        console.log(`📥 جلب الدفعة ${Math.floor(offset/batchSize) + 1} (من ${offset} إلى ${offset + batchSize})...`);
        
        const { data: batchData, error: batchError } = await supabase
          .from('monthly_readings')
          .select(`
            *,
            wells(well_code, well_name)
          `)
          .order('reading_date', { ascending: false })
          .range(offset, offset + batchSize - 1);
          
        if (batchError) {
          console.error('خطأ في جلب الدفعة:', batchError);
          break;
        }
        
        if (batchData && batchData.length > 0) {
          allData.push(...batchData);
          console.log(`✅ تم جلب ${batchData.length} قراءة في هذه الدفعة (الإجمالي: ${allData.length})`);
          
          // إذا كانت الدفعة أقل من الحد الأقصى، فهذا يعني أنها الدفعة الأخيرة
          if (batchData.length < batchSize) {
            hasMore = false;
          } else {
            offset += batchSize;
          }
        } else {
          hasMore = false;
        }
      }
      
      console.log(`🎉 تم جلب جميع البيانات: ${allData.length} قراءة`);
      const data = allData;
      const error = null;
        
      // فحص إضافي: التحقق من اكتمال البيانات
      const { count, error: countError } = await supabase
        .from('monthly_readings')
        .select('*', { count: 'exact', head: true });
        
      if (!countError && count !== null) {
        console.log(`📊 إجمالي البيانات في قاعدة البيانات: ${count} قراءة`);
        console.log(`📥 تم جلب: ${data ? data.length : 0} قراءة`);
        
        if (data && data.length === count) {
          console.log(`✅ تم جلب جميع البيانات بنجاح!`);
        } else if (data && data.length < count) {
          console.warn(`⚠️ تحذير: تم جلب ${data.length} من أصل ${count} قراءة`);
        } else if (data && data.length > count) {
          console.warn(`⚠️ غريب: تم جلب ${data.length} ولكن قاعدة البيانات تحتوي على ${count} فقط`);
        }
      }
      
      if (error) throw error;
      
      console.log(`✅ تم جلب ${data ? data.length : 0} قراءة`);
      
      // تحليل شامل للبيانات المجلبة
      if (data && data.length > 0) {
        console.log('📊 تحليل البيانات المجلبة:');
        
        // فحص توزيع السنوات
        const yearCounts = {};
        const allDates = [];
        
        data.forEach(reading => {
          const dateValue = reading.reading_date || reading.readingDate || reading.date || reading.measurement_date;
          if (dateValue) {
            const date = new Date(dateValue);
            if (!isNaN(date.getTime())) {
              const year = date.getFullYear();
              yearCounts[year] = (yearCounts[year] || 0) + 1;
              allDates.push(date);
            }
          }
        });
        
        console.log('📅 توزيع البيانات حسب السنة:', yearCounts);
        
        if (allDates.length > 0) {
          const minDate = new Date(Math.min(...allDates));
          const maxDate = new Date(Math.max(...allDates));
          console.log(`📈 النطاق الزمني الكامل: من ${minDate.toLocaleDateString('ar')} إلى ${maxDate.toLocaleDateString('ar')}`);
          console.log(`📈 النطاق بالسنوات: من ${minDate.getFullYear()} إلى ${maxDate.getFullYear()}`);
          
          // التحقق من وجود فجوة في البيانات
          const oldestInData = minDate.getFullYear();
          const oldestInDB = new Date(statsData[0].reading_date).getFullYear();
          
          if (oldestInData > oldestInDB) {
            console.warn(`⚠️ تم اكتشاف فجوة في البيانات!`);
            console.warn(`أقدم بيانات في قاعدة البيانات: ${oldestInDB}`);
            console.warn(`أقدم بيانات تم جلبها: ${oldestInData}`);
            console.warn(`البيانات المفقودة: من ${oldestInDB} إلى ${oldestInData - 1}`);
          }
        }
        
        updateAvailableMonthsRange(data);
      }
      
      // طباعة عينة من البيانات للتصحيح
      if (data && data.length > 0) {
        console.log('عينة من البيانات المجلبة:');
        data.slice(0, 5).forEach((reading, index) => {
          console.log(`  قراءة ${index + 1}:`, {
            reading_id: reading.reading_id,
            reading_date: reading.reading_date,
            well_id: reading.well_id,
            year: reading.year,
            month: reading.month,
            abstraction: reading.abstraction,
            corrected_abstraction: reading.corrected_abstraction,
            estimated_abstraction: reading.estimated_abstraction,
            monthly_abstraction_m3: reading.monthly_abstraction_m3
          });
        });
        
        // فحص لنوع وتنسيق التواريخ
        console.log('🔍 فحص تنسيق التواريخ:');
        const sampleDates = data.slice(0, 10).map((reading, index) => {
          const dateValue = reading.reading_date;
          if (dateValue) {
            const date = new Date(dateValue);
            return {
              index: index,
              raw: dateValue,
              type: typeof dateValue,
              parsed: date.toISOString(),
              valid: !isNaN(date.getTime()),
              year: date.getFullYear()
            };
          }
          return { index, raw: 'لا يوجد تاريخ' };
        });
        console.table(sampleDates);
      }
      
      return data || [];
    } catch (error) {
      console.error('❌ خطأ في جلب بيانات القراءات:', error);
      return [];
    }
  }

  function displayAlert(alert) {
    // Display alert notification in the UI
    console.log('تنبيه جديد:', alert);
    
    // You can add toast notification or other UI feedback here
    if (alert.severity === 'critical' || alert.severity === 'high') {
      // Show immediate notification for critical alerts
      showMessage('msgReadings', `تنبيه ${getSeverityText(alert.severity)}: ${alert.message}`, 'warn');
    }
  }

  // معالجات الفلاتر المخصصة
  function handleMonthlyPeriodChange() {
    const monthlyPeriod = document.getElementById('monthlyPeriod');
    const specificMonthPicker = document.getElementById('specificMonthPicker');
    
    if (monthlyPeriod && specificMonthPicker) {
      if (monthlyPeriod.value === 'specific_month') {
        specificMonthPicker.style.display = 'block';
      } else {
        specificMonthPicker.style.display = 'none';
      }
    }
  }

  function handleAnnualPeriodChange() {
    const annualPeriod = document.getElementById('annualPeriod');
    const specificYearPicker = document.getElementById('specificYearPicker');
    
    if (annualPeriod && specificYearPicker) {
      if (annualPeriod.value === 'specific_year') {
        specificYearPicker.style.display = 'block';
      } else {
        specificYearPicker.style.display = 'none';
      }
    }
  }

  // تصدير الدوال للاستخدام العام
  window.handleReportTypeChange = handleReportTypeChange;
  window.handleMonthlyPeriodChange = handleMonthlyPeriodChange;
  window.handleAnnualPeriodChange = handleAnnualPeriodChange;
})();
