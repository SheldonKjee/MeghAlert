// MeghAlert Admin Dashboard - Complete Rebuild
// Features: Login, Real-time SOS tracking, Fixed Points Management, Live device tracking

// Configuration
const CONFIG = {
  API_BASE: window.location.origin,
  WS_PROTOCOL: window.location.protocol === 'https:' ? 'wss:' : 'ws:',
  STORAGE_KEY: 'meghalert_auth',
  FIXED_POINTS_KEY: 'meghalert_fixed_points',
  DEFAULT_CENTER: [25.5788, 91.8933], // Shillong, Meghalaya
  DEFAULT_ZOOM: 13,
  RECONNECT_INTERVAL: 5000,
  MAX_RECONNECT_ATTEMPTS: 10
};

// Global State
const state = {
  token: null,
  user: null,
  ws: null,
  reconnectAttempts: 0,
  reconnectTimer: null,
  sosEvents: [],
  devices: {},
  fixedPoints: [],
  maps: {},
  markers: {},
  currentTab: 'overview',
  autoFollow: true
};

function escapeHtml(value) {
  if (value === null || typeof value === 'undefined') return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

function initializeApp() {
  // Load fixed points from localStorage
  loadFixedPoints();
  
  // Check for existing session
  const storedAuth = localStorage.getItem(CONFIG.STORAGE_KEY);
  if (storedAuth) {
    try {
      const auth = JSON.parse(storedAuth);
      state.token = auth.token;
      state.user = auth.user;
      showDashboard();
      connectWebSocket();
      loadInitialData();
    } catch (e) {
      showLogin();
    }
  } else {
    showLogin();
  }
  
  // Setup event listeners
  setupEventListeners();
}

// ============ AUTHENTICATION ============
function showLogin() {
  document.getElementById('login-screen').classList.add('active');
  document.getElementById('dashboard-screen').classList.remove('active');
}

function showDashboard() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('dashboard-screen').classList.add('active');
  
  if (state.user) {
    document.getElementById('welcome-text').textContent = `Welcome, ${state.user.name || state.user.email}`;
  }
  
  // Initialize maps when dashboard is shown
  setTimeout(() => {
    initializeMaps();
    updateStats();
  }, 100);
}

async function login(email, password) {
  try {
    const response = await fetch(`${CONFIG.API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
      throw new Error('Invalid credentials');
    }
    
    const data = await response.json();
    state.token = data.token;
    state.user = { email, name: email.split('@')[0] };
    
    // Save to localStorage
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
      token: state.token,
      user: state.user
    }));
    
    return true;
  } catch (error) {
    console.error('Login error:', error);
    return false;
  }
}

function logout() {
  localStorage.removeItem(CONFIG.STORAGE_KEY);
  state.token = null;
  state.user = null;
  
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  
  showLogin();
}

// ============ WEBSOCKET CONNECTION ============
function connectWebSocket() {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    return;
  }
  
  updateConnectionStatus('connecting');
  
  const wsUrl = `${CONFIG.WS_PROTOCOL}//${window.location.host}${state.token ? `?token=${state.token}` : ''}`;
  
  state.ws = new WebSocket(wsUrl);
  
  state.ws.onopen = () => {
    console.log('WebSocket connected');
    state.reconnectAttempts = 0;
    updateConnectionStatus('connected');
  };
  
  state.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  };
  
  state.ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
  
  state.ws.onclose = () => {
    console.log('WebSocket closed');
    updateConnectionStatus('disconnected');
    attemptReconnect();
  };
}

function attemptReconnect() {
  if (state.reconnectAttempts >= CONFIG.MAX_RECONNECT_ATTEMPTS) {
    console.error('Max reconnection attempts reached');
    return;
  }
  
  state.reconnectAttempts++;
  console.log(`Reconnecting... (Attempt ${state.reconnectAttempts})`);
  
  clearTimeout(state.reconnectTimer);
  state.reconnectTimer = setTimeout(() => {
    connectWebSocket();
  }, CONFIG.RECONNECT_INTERVAL);
}

function updateConnectionStatus(status) {
  const statusEl = document.getElementById('ws-status');
  statusEl.className = 'status-badge';
  
  switch (status) {
    case 'connected':
      statusEl.textContent = 'Connected';
      statusEl.classList.add('connected');
      break;
    case 'connecting':
      statusEl.textContent = 'Connecting...';
      statusEl.classList.add('connecting');
      break;
    case 'disconnected':
      statusEl.textContent = 'Disconnected';
      break;
  }
}

function handleWebSocketMessage(data) {
  console.log('WebSocket message:', data);
  
  switch (data.type) {
    case 'welcome':
      console.log('Welcome message received');
      break;
      
    case 'devices':
      if (Array.isArray(data.devices)) {
        data.devices.forEach(device => {
          state.devices[device.id] = device;
        });
        updateDeviceMarkers();
        updateTrackingDevicesList();
      }
      break;
      
    case 'sos':
      handleSOSEvent(data.event, data.device);
      break;
      
    case 'device_update':
      if (data.device) {
        state.devices[data.device.id] = data.device;
        updateDeviceMarker(data.device);
        updateTrackingDevicesList();
      }
      break;
      
    case 'sos_resolved':
      handleSOSResolved(data.eventId, data.event, data.device);
      break;
      
    case 'sos_unresolved':
      handleSOSUnresolved(data.eventId, data.event, data.device);
      break;
  }
}

// ============ DATA LOADING ============
async function loadInitialData() {
  try {
    // Load SOS events
    const sosResponse = await fetch(`${CONFIG.API_BASE}/api/sos/list?limit=50`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    
    if (sosResponse.ok) {
      const sosData = await sosResponse.json();
      state.sosEvents = sosData.rows || [];
      updateSOSEventsList();
      updateRecentActivity();
      updateLiveTrackingAlerts();
    }
    
    // Load devices
    const devicesResponse = await fetch(`${CONFIG.API_BASE}/api/devices`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    
    if (devicesResponse.ok) {
      const devices = await devicesResponse.json();
      devices.forEach(device => {
        state.devices[device.id] = device;
      });
      updateDeviceMarkers();
      updateTrackingDevicesList();
      updateLiveTrackingAlerts();
    }
    
    updateStats();
  } catch (error) {
    console.error('Failed to load initial data:', error);
  }
}

// ============ SOS EVENT HANDLING ============
function handleSOSEvent(event, device) {
  // Add to events list
  state.sosEvents.unshift({ event, device });
  
  // Update device state
  if (device) {
    state.devices[device.id] = device;
  }
  
  // Update UI
  updateSOSEventsList();
  updateRecentActivity();
  updateLiveTrackingAlerts();
  updateStats();
  updateDeviceMarker(device);
  
  // Show notification with detailed info
  const deviceName = device?.name || event.deviceId;
  const location = `${event.lat.toFixed(4)}, ${event.lng.toFixed(4)}`;
  showNotification(`🚨 SOS Alert from ${deviceName} at ${location}`, 'danger');
  
  // Log for debugging
  console.log('📍 SOS Event Received:', {
    device: deviceName,
    location: { lat: event.lat, lng: event.lng },
    time: new Date(event.time || Date.now()).toLocaleString()
  });
}

function handleSOSResolved(eventId, event, device) {
  // Update the event in state
  const idx = state.sosEvents.findIndex(e => e.event.id === eventId);
  if (idx !== -1) {
    state.sosEvents[idx].event = event;
  }
  
  // Update device state
  if (device) {
    state.devices[device.id] = device;
  }
  
  // Update UI
  updateSOSEventsList();
  updateRecentActivity();
  updateLiveTrackingAlerts();
  updateDeviceMarker(device);
  
  showNotification(`✅ SOS Event #${eventId} marked as resolved`, 'success');
}

function handleSOSUnresolved(eventId, event, device) {
  // Update the event in state
  const idx = state.sosEvents.findIndex(e => e.event.id === eventId);
  if (idx !== -1) {
    state.sosEvents[idx].event = event;
  }
  
  // Update device state
  if (device) {
    state.devices[device.id] = device;
  }
  
  // Update UI
  updateSOSEventsList();
  updateRecentActivity();
  updateLiveTrackingAlerts();
  updateDeviceMarker(device);
  
  showNotification(`⚠️ SOS Event #${eventId} marked as unresolved`, 'warning');
}

async function resolveSOSEvent(eventId) {
  try {
    const response = await fetch(`${CONFIG.API_BASE}/api/sos/${eventId}/resolve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    
    if (!response.ok) throw new Error('Failed to resolve event');
    
    const data = await response.json();
    handleSOSResolved(eventId, data.event, data.device);
  } catch (error) {
    console.error('Error resolving SOS event:', error);
    showNotification('Failed to resolve SOS event', 'danger');
  }
}

async function unresolveSOSEvent(eventId) {
  try {
    const response = await fetch(`${CONFIG.API_BASE}/api/sos/${eventId}/unresolve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    
    if (!response.ok) throw new Error('Failed to unresolve event');
    
    const data = await response.json();
    handleSOSUnresolved(eventId, data.event, data.device);
  } catch (error) {
    console.error('Error unresolving SOS event:', error);
    showNotification('Failed to unresolve SOS event', 'danger');
  }
}

// ============ FIXED POINTS MANAGEMENT ============
function loadFixedPoints() {
  const stored = localStorage.getItem(CONFIG.FIXED_POINTS_KEY);
  if (stored) {
    try {
      state.fixedPoints = JSON.parse(stored);
    } catch (e) {
      state.fixedPoints = [];
    }
  }
}

function saveFixedPoints() {
  localStorage.setItem(CONFIG.FIXED_POINTS_KEY, JSON.stringify(state.fixedPoints));
  updateStats();
}

function addFixedPoint(point) {
  point.id = Date.now().toString();
  state.fixedPoints.push(point);
  saveFixedPoints();
  updateFixedPointsList();
  updateFixedPointsMap();
  updateAllMapsWithFixedPoints();
}

function updateFixedPoint(id, updatedPoint) {
  const index = state.fixedPoints.findIndex(p => p.id === id);
  if (index !== -1) {
    state.fixedPoints[index] = { ...state.fixedPoints[index], ...updatedPoint };
    saveFixedPoints();
    updateFixedPointsList();
    updateFixedPointsMap();
    updateAllMapsWithFixedPoints();
  }
}

function deleteFixedPoint(id) {
  state.fixedPoints = state.fixedPoints.filter(p => p.id !== id);
  saveFixedPoints();
  updateFixedPointsList();
  updateFixedPointsMap();
  updateAllMapsWithFixedPoints();
}

function getFixedPointIcon(type) {
  const icons = {
    police: '🚓',
    hospital: '🏥',
    fire: '🚒',
    shelter: '🏠',
    other: '📍'
  };
  return icons[type] || icons.other;
}

function getFixedPointColor(type) {
  const colors = {
    police: '#3b82f6',
    hospital: '#ef4444',
    fire: '#f59e0b',
    shelter: '#10b981',
    other: '#6366f1'
  };
  return colors[type] || colors.other;
}

// ============ MAP INITIALIZATION ============
function initializeMaps() {
  // Main map (Overview tab)
  if (!state.maps.main) {
    state.maps.main = L.map('main-map').setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(state.maps.main);
    state.markers.main = {};
  }
  
  // Events map
  if (!state.maps.events) {
    state.maps.events = L.map('events-map').setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(state.maps.events);
    state.markers.events = {};
  }
  
  // Fixed points map
  if (!state.maps.fixedPoints) {
    state.maps.fixedPoints = L.map('fixed-points-map').setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(state.maps.fixedPoints);
    state.markers.fixedPoints = {};
    
    // Add click handler for adding new points
    state.maps.fixedPoints.on('click', (e) => {
      openPointModal(null, e.latlng);
    });
  }
  
  // Tracking map
  if (!state.maps.tracking) {
    state.maps.tracking = L.map('tracking-map').setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(state.maps.tracking);
    state.markers.tracking = {};
  }
  
  // Update all maps with current data
  updateDeviceMarkers();
  updateFixedPointsMap();
  updateAllMapsWithFixedPoints();
}

// ============ MAP UPDATES ============
function buildDeviceMarkerIcon(device) {
  const markerClass = device.sos ? 'is-sos' : 'is-normal';
  const name = escapeHtml(device.name || device.id);
  const statusLabel = device.sos
    ? '<span class="marker-status marker-status--sos">SOS Active</span>'
    : '<span class="marker-status">Live</span>';

  return L.divIcon({
    className: 'device-marker-wrapper',
    html: `
      <div class="device-marker ${markerClass}">
        <div class="marker-stack">
          <span class="marker-pulse"></span>
          <span class="marker-dot"></span>
        </div>
        <div class="marker-label">
          <span class="marker-name">${name}</span>
          ${statusLabel}
        </div>
      </div>
    `,
    iconSize: [90, 90],
    iconAnchor: [45, 45]
  });
}

function buildDevicePopup(device) {
  const name = escapeHtml(device.name || device.id);
  const phone = escapeHtml(device.phone || 'N/A');
  const statusHtml = device.sos
    ? '<span style="color: #ef4444; font-weight: 600;">🚨 SOS ACTIVE</span>'
    : '<span style="color: #10b981; font-weight: 500;">✓ Normal</span>';

  return `
    <div class="popup-title">${name}</div>
    <div class="popup-info">📱 ${phone}</div>
    <div class="popup-info">📍 ${device.lat.toFixed(5)}, ${device.lng.toFixed(5)}</div>
    <div class="popup-info">Status: ${statusHtml}</div>
    <div class="popup-info">Last seen: ${new Date(device.lastSeen).toLocaleString()}</div>
  `;
}

function updateDeviceMarkers() {
  const maps = ['main', 'events', 'tracking'];
  
  maps.forEach(mapName => {
    const map = state.maps[mapName];
    if (!map) return;
    
    const markers = state.markers[mapName] || {};
    
    // Clear old markers
    Object.values(markers).forEach(marker => {
      if (marker && marker.remove) marker.remove();
    });
    state.markers[mapName] = {};
    
    // Add new markers for devices
    Object.values(state.devices).forEach(device => {
      const marker = L.marker([device.lat, device.lng], {
        icon: buildDeviceMarkerIcon(device)
      })
        .bindPopup(buildDevicePopup(device))
        .addTo(map);
      
      state.markers[mapName][device.id] = marker;
    });
  });
}

function updateDeviceMarker(device) {
  if (!device) return;
  
  const maps = ['main', 'events', 'tracking'];
  
  maps.forEach(mapName => {
    const map = state.maps[mapName];
    if (!map) return;
    
    const markers = state.markers[mapName] || {};
    const existingMarker = markers[device.id];
    
    if (existingMarker) {
      existingMarker.setLatLng([device.lat, device.lng]);
      existingMarker.setIcon(buildDeviceMarkerIcon(device));
      existingMarker.setPopupContent(buildDevicePopup(device));
      
      // Auto-follow if enabled and on tracking tab
      if (state.autoFollow && state.currentTab === 'tracking' && device.sos) {
        state.maps.tracking.setView([device.lat, device.lng], 15, { animate: true });
      }
    }
  });
}

function updateFixedPointsMap() {
  const map = state.maps.fixedPoints;
  if (!map) return;
  
  // Clear existing markers
  if (state.markers.fixedPoints) {
    Object.values(state.markers.fixedPoints).forEach(marker => {
      if (marker && marker.remove) marker.remove();
    });
  }
  state.markers.fixedPoints = {};
  
  // Add markers for fixed points
  state.fixedPoints.forEach(point => {
    const icon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="background: ${getFixedPointColor(point.type)}; color: white; padding: 8px 12px; border-radius: 20px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">${getFixedPointIcon(point.type)} ${point.name}</div>`,
      iconSize: [150, 40],
      iconAnchor: [75, 20]
    });
    
    const marker = L.marker([point.lat, point.lng], { icon })
      .bindPopup(`
        <div class="popup-title">${getFixedPointIcon(point.type)} ${point.name}</div>
        <div class="popup-info">Type: ${point.type}</div>
        ${point.address ? `<div class="popup-info">📍 ${point.address}</div>` : ''}
        ${point.phone ? `<div class="popup-info">📱 ${point.phone}</div>` : ''}
        <div class="popup-info">Coordinates: ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}</div>
        ${point.notes ? `<div class="popup-info">Notes: ${point.notes}</div>` : ''}
      `)
      .addTo(map);
    
    marker.on('click', () => {
      openPointModal(point);
    });
    
    state.markers.fixedPoints[point.id] = marker;
  });
}

function updateAllMapsWithFixedPoints() {
  const maps = ['main', 'events', 'tracking'];
  
  maps.forEach(mapName => {
    const map = state.maps[mapName];
    if (!map) return;
    
    // Clear existing fixed point markers
    if (state.markers[`${mapName}_fixed`]) {
      Object.values(state.markers[`${mapName}_fixed`]).forEach(marker => {
        if (marker && marker.remove) marker.remove();
      });
    }
    state.markers[`${mapName}_fixed`] = {};
    
    // Add fixed point markers
    state.fixedPoints.forEach(point => {
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background: ${getFixedPointColor(point.type)}; color: white; padding: 6px 10px; border-radius: 20px; font-weight: bold; font-size: 0.85rem; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">${getFixedPointIcon(point.type)} ${point.name}</div>`,
        iconSize: [120, 32],
        iconAnchor: [60, 16]
      });
      
      const marker = L.marker([point.lat, point.lng], { icon })
        .bindPopup(`
          <div class="popup-title">${getFixedPointIcon(point.type)} ${point.name}</div>
          <div class="popup-info">Type: ${point.type}</div>
          ${point.address ? `<div class="popup-info">📍 ${point.address}</div>` : ''}
          ${point.phone ? `<div class="popup-info">📱 ${point.phone}</div>` : ''}
        `)
        .addTo(map);
      
      state.markers[`${mapName}_fixed`][point.id] = marker;
    });
  });
}

// ============ UI UPDATES ============
function updateStats() {
  document.getElementById('stat-total-sos').textContent = state.sosEvents.length;
  document.getElementById('stat-active-devices').textContent = Object.keys(state.devices).length;
  document.getElementById('stat-fixed-points').textContent = state.fixedPoints.length;
}

function updateRecentActivity() {
  const container = document.getElementById('recent-activity');

  const uniqueEvents = [];
  const seen = new Set();

  for (const entry of state.sosEvents) {
    const deviceId = entry?.event?.deviceId;
    if (!deviceId) continue;
    if (!seen.has(deviceId)) {
      uniqueEvents.push(entry);
      seen.add(deviceId);
    }
    if (uniqueEvents.length >= 10) break;
  }

  if (uniqueEvents.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>No SOS events yet</p></div>';
    return;
  }
  
  container.innerHTML = uniqueEvents.map(({ event, device }) => {
    const resolvedClass = event.resolved ? 'resolved' : '';
    const statusBadge = event.resolved ? 
      `<div class="activity-badge resolved">Resolved</div>` : 
      `<div class="activity-badge">SOS</div>`;
    
    return `
      <div class="activity-item ${resolvedClass}" data-lat="${event.lat}" data-lng="${event.lng}">
        <div class="activity-info">
          <div class="activity-device">${device?.name || event.deviceId}</div>
          <div class="activity-time">${formatTimestamp(event.time)}</div>
        </div>
        ${statusBadge}
      </div>
    `;
  }).join('');
  
  // Add click handlers
  container.querySelectorAll('.activity-item').forEach(item => {
    item.addEventListener('click', () => {
      const lat = parseFloat(item.dataset.lat);
      const lng = parseFloat(item.dataset.lng);
      zoomToLocation(lat, lng);
    });
  });
}

function updateSOSEventsList() {
  const tbody = document.getElementById('events-table-body');
  
  if (state.sosEvents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;"><div class="empty-state"><div class="empty-state-icon">📭</div><p>No SOS events recorded</p></div></td></tr>';
    return;
  }
  
  tbody.innerHTML = state.sosEvents.map(({ event, device }) => {
    const statusBadge = event.resolved ? 
      `<span class="status-badge resolved">✓ Resolved</span>` : 
      `<span class="status-badge active">⚠ Active</span>`;
    
    const actionButtons = event.resolved ?
      `<button class="btn-sm btn-warning" data-event-id="${event.id}" data-action="unresolve">Reopen</button>` :
      `<button class="btn-sm btn-success" data-event-id="${event.id}" data-action="resolve">Mark Resolved</button>`;
    
    return `
      <tr class="${event.resolved ? 'resolved-row' : ''}">
        <td>${formatTimestamp(event.time)}</td>
        <td>${event.deviceId}</td>
        <td>${device?.name || 'N/A'}</td>
        <td>${device?.phone || 'N/A'}</td>
        <td>${event.lat.toFixed(5)}, ${event.lng.toFixed(5)}</td>
        <td>${statusBadge}</td>
        <td class="actions-cell">
          <button class="btn-sm btn-primary" data-lat="${event.lat}" data-lng="${event.lng}" data-action="view">View Map</button>
          ${actionButtons}
        </td>
      </tr>
    `;
  }).join('');
  
  // Add click handlers for all buttons
  tbody.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action;
      
      if (action === 'view') {
        const lat = parseFloat(btn.dataset.lat);
        const lng = parseFloat(btn.dataset.lng);
        zoomToLocation(lat, lng);
      } else if (action === 'resolve') {
        const eventId = parseInt(btn.dataset.eventId);
        if (confirm('Mark this SOS event as resolved?')) {
          resolveSOSEvent(eventId);
        }
      } else if (action === 'unresolve') {
        const eventId = parseInt(btn.dataset.eventId);
        if (confirm('Reopen this SOS event?')) {
          unresolveSOSEvent(eventId);
        }
      }
    });
  });
}

function updateFixedPointsList() {
  const container = document.getElementById('fixed-points-list');
  
  if (state.fixedPoints.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📍</div><p>No fixed points added yet</p></div>';
    return;
  }
  
  container.innerHTML = state.fixedPoints.map(point => `
    <div class="point-item" data-point-id="${point.id}">
      <div class="point-header">
        <div>
          <div class="point-title">${point.name}</div>
          <div class="point-type">${getFixedPointIcon(point.type)}</div>
        </div>
      </div>
      <div class="point-details">
        <div>Type: ${point.type}</div>
        ${point.address ? `<div>📍 ${point.address}</div>` : ''}
        ${point.phone ? `<div>📱 ${point.phone}</div>` : ''}
        <div>Coordinates: ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}</div>
      </div>
      <div class="point-actions">
        <button class="btn-icon btn-locate" data-action="locate" data-point-id="${point.id}">📍 Locate</button>
        <button class="btn-icon btn-edit" data-action="edit" data-point-id="${point.id}">✏️ Edit</button>
        <button class="btn-icon btn-delete" data-action="delete" data-point-id="${point.id}">🗑️ Delete</button>
      </div>
    </div>
  `).join('');
  
  // Add event listeners for point actions
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action;
      const pointId = e.currentTarget.dataset.pointId;
      
      switch(action) {
        case 'locate':
          zoomToFixedPoint(pointId);
          break;
        case 'edit':
          const point = state.fixedPoints.find(p => p.id === pointId);
          if (point) openPointModal(point);
          break;
        case 'delete':
          confirmDeletePoint(pointId);
          break;
      }
    });
  });
}

function updateTrackingDevicesList() {
  const container = document.getElementById('tracking-devices-list');
  
  const devicesList = Object.values(state.devices);
  
  if (devicesList.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📱</div><p>No devices online</p></div>';
    return;
  }
  
  container.innerHTML = devicesList.map(device => `
    <div class="device-item ${device.sos ? 'sos-active' : ''}" data-device-id="${device.id}">
      <div class="device-name">${device.name || device.id}</div>
      <div class="device-info">
        <div>📱 ${device.phone || 'N/A'}</div>
        <div>📍 ${device.lat.toFixed(5)}, ${device.lng.toFixed(5)}</div>
        <div>Last seen: ${formatTimestamp(device.lastSeen)}</div>
      </div>
      <div class="device-status ${device.sos ? 'sos' : 'online'}">
        ${device.sos ? '🚨 SOS ACTIVE' : '✓ Online'}
      </div>
    </div>
  `).join('');
  
  // Add click handlers
  container.querySelectorAll('.device-item').forEach(item => {
    item.addEventListener('click', () => {
      zoomToDevice(item.dataset.deviceId);
    });
  });
}

function updateLiveTrackingAlerts() {
  const container = document.getElementById('tracking-alerts-list');
  if (!container) return;

  const groups = new Map();

  state.sosEvents.forEach(entry => {
    if (!entry || !entry.event) return;
    const deviceId = entry.event.deviceId;
    if (!deviceId) return;
    if (!groups.has(deviceId)) {
      groups.set(deviceId, []);
    }
    groups.get(deviceId).push(entry);
  });

  const aggregated = [];

  groups.forEach((events, deviceId) => {
    if (!Array.isArray(events) || events.length <= 1) {
      return;
    }

    const extras = events.slice(1);
    const unresolvedExtras = extras.filter(item => item.event && !item.event.resolved);
    const relevantExtras = unresolvedExtras.length > 0 ? unresolvedExtras : extras;

    if (relevantExtras.length === 0) {
      return;
    }

    const latestExtra = relevantExtras[0].event;
    const deviceInfo = events[0].device || state.devices[deviceId] || { name: deviceId };

    aggregated.push({
      deviceId,
      device: deviceInfo,
      latestExtra,
      count: relevantExtras.length
    });
  });

  if (aggregated.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🛰️</div><p>No grouped SOS alerts</p></div>';
    return;
  }

  aggregated.sort((a, b) => {
    const aTime = a.latestExtra?.time || 0;
    const bTime = b.latestExtra?.time || 0;
    return bTime - aTime;
  });

  container.innerHTML = aggregated.map(item => {
    const deviceName = escapeHtml(item.device?.name || item.deviceId);
    const countLabel = item.count === 1 ? '+1 alert' : `+${item.count} alerts`;
    const latNum = Number(item.latestExtra?.lat);
    const lngNum = Number(item.latestExtra?.lng);
    const latDisplay = Number.isFinite(latNum) ? latNum.toFixed(5) : 'N/A';
    const lngDisplay = Number.isFinite(lngNum) ? lngNum.toFixed(5) : 'N/A';
    const latestTime = item.latestExtra?.time ? formatTimestamp(item.latestExtra.time) : 'Unknown';
    
    const dataLat = Number.isFinite(latNum) ? latNum : '';
    const dataLng = Number.isFinite(lngNum) ? lngNum : '';
    
    return `
      <div class="alert-item" data-device-id="${escapeHtml(item.deviceId)}" data-lat="${dataLat}" data-lng="${dataLng}">
        <div class="alert-header">
          <span class="alert-name">${deviceName}</span>
          <span class="alert-count">${countLabel}</span>
        </div>
        <div class="alert-meta">
          <span>Latest follow-up: ${latestTime}</span>
          <span>📍 ${latDisplay}, ${lngDisplay}</span>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.alert-item').forEach(item => {
    item.addEventListener('click', () => {
      const lat = parseFloat(item.dataset.lat);
      const lng = parseFloat(item.dataset.lng);
      switchTab('tracking');
      setTimeout(() => {
        if (!Number.isNaN(lat) && !Number.isNaN(lng) && state.maps.tracking) {
          state.maps.tracking.setView([lat, lng], 16, { animate: true });
        }
      }, 150);
    });
  });
}

// ============ MODAL MANAGEMENT ============
function openPointModal(point = null, latlng = null) {
  const modal = document.getElementById('point-modal');
  const title = document.getElementById('modal-title');
  const form = document.getElementById('point-form');
  
  // Reset form
  form.reset();
  
  if (point) {
    // Edit mode
    title.textContent = 'Edit Fixed Point';
    document.getElementById('point-id').value = point.id;
    document.getElementById('point-type').value = point.type;
    document.getElementById('point-name').value = point.name;
    document.getElementById('point-address').value = point.address || '';
    document.getElementById('point-lat').value = point.lat;
    document.getElementById('point-lng').value = point.lng;
    document.getElementById('point-phone').value = point.phone || '';
    document.getElementById('point-notes').value = point.notes || '';
  } else {
    // Add mode
    title.textContent = 'Add Fixed Point';
    document.getElementById('point-id').value = '';
    
    if (latlng) {
      document.getElementById('point-lat').value = latlng.lat.toFixed(6);
      document.getElementById('point-lng').value = latlng.lng.toFixed(6);
    }
  }
  
  modal.classList.add('active');
}

function closePointModal() {
  document.getElementById('point-modal').classList.remove('active');
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
  // Login form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    
    const success = await login(email, password);
    
    if (success) {
      showDashboard();
      connectWebSocket();
      loadInitialData();
    } else {
      errorEl.textContent = 'Invalid email or password';
    }
  });
  
  // Logout button
  document.getElementById('logout-btn').addEventListener('click', logout);
  
  // Tab navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
  
  // Fixed points
  document.getElementById('add-point-btn').addEventListener('click', () => {
    openPointModal();
  });
  
  document.getElementById('close-modal').addEventListener('click', closePointModal);
  document.getElementById('cancel-point-btn').addEventListener('click', closePointModal);
  
  document.getElementById('point-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const id = document.getElementById('point-id').value;
    const point = {
      type: document.getElementById('point-type').value,
      name: document.getElementById('point-name').value,
      address: document.getElementById('point-address').value,
      lat: parseFloat(document.getElementById('point-lat').value),
      lng: parseFloat(document.getElementById('point-lng').value),
      phone: document.getElementById('point-phone').value,
      notes: document.getElementById('point-notes').value
    };
    
    if (id) {
      updateFixedPoint(id, point);
      showNotification('Fixed point updated successfully', 'success');
    } else {
      addFixedPoint(point);
      showNotification('Fixed point added successfully', 'success');
    }
    
    closePointModal();
  });
  
  // Export CSV
  document.getElementById('export-csv-btn').addEventListener('click', exportCSV);
  
  // Auto-follow toggle
  document.getElementById('auto-follow-toggle').addEventListener('change', (e) => {
    state.autoFollow = e.target.checked;
  });
  
  // Modal close on outside click
  document.getElementById('point-modal').addEventListener('click', (e) => {
    if (e.target.id === 'point-modal') {
      closePointModal();
    }
  });
}

function switchTab(tabName) {
  state.currentTab = tabName;
  
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  // Update tab panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `${tabName}-tab`);
  });
  
  // Invalidate map size when switching tabs
  setTimeout(() => {
    Object.values(state.maps).forEach(map => {
      if (map && map.invalidateSize) {
        map.invalidateSize();
      }
    });
  }, 100);
}

// ============ UTILITY FUNCTIONS ============
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) {
    return 'Just now';
  } else if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}m ago`;
  } else if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}h ago`;
  } else {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }
}

function showNotification(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);
  
  // Create toast notification
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <span class="toast-icon">${getToastIcon(type)}</span>
      <span class="toast-message">${message}</span>
    </div>
  `;
  
  document.body.appendChild(toast);
  
  // Animate in
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Auto remove after 4 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
  
  // Play sound for SOS alerts
  if (type === 'danger') {
    playSOSAlert();
  }
}

function getToastIcon(type) {
  const icons = {
    success: '✓',
    danger: '🚨',
    warning: '⚠️',
    info: 'ℹ️'
  };
  return icons[type] || icons.info;
}

function playSOSAlert() {
  try {
    // Create a simple beep sound using Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (e) {
    console.log('Could not play alert sound:', e);
  }
}

function zoomToLocation(lat, lng) {
  if (state.maps[state.currentTab === 'overview' ? 'main' : state.currentTab]) {
    state.maps[state.currentTab === 'overview' ? 'main' : state.currentTab].setView([lat, lng], 16, { animate: true });
  }
}

function zoomToDevice(deviceId) {
  const device = state.devices[deviceId];
  if (device && state.maps.tracking) {
    state.maps.tracking.setView([device.lat, device.lng], 16, { animate: true });
    
    // Open popup if marker exists
    const marker = state.markers.tracking[deviceId];
    if (marker) {
      marker.openPopup();
    }
  }
}

function zoomToFixedPoint(pointId) {
  const point = state.fixedPoints.find(p => p.id === pointId);
  if (point && state.maps.fixedPoints) {
    state.maps.fixedPoints.setView([point.lat, point.lng], 16, { animate: true });
    
    // Open popup if marker exists
    const marker = state.markers.fixedPoints[pointId];
    if (marker) {
      marker.openPopup();
    }
  }
}

function confirmDeletePoint(pointId) {
  if (confirm('Are you sure you want to delete this fixed point?')) {
    deleteFixedPoint(pointId);
    showNotification('Fixed point deleted successfully', 'success');
  }
}

async function exportCSV() {
  try {
    const response = await fetch(`${CONFIG.API_BASE}/api/export?type=sos`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    
    if (!response.ok) throw new Error('Export failed');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sos_events_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showNotification('CSV exported successfully', 'success');
  } catch (error) {
    console.error('Export error:', error);
    showNotification('Failed to export CSV', 'danger');
  }
}

