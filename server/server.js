// Demo server: JWT auth, devices endpoints, WebSocket real-time updates, CSV export
// Not for production. For demo only.
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { stringify } = require('csv-stringify');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// LOGGING SETUP - write all output to both console and file
const logFile = path.join(__dirname, 'server.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
function log(...args) {
  const msg = args.join(' ');
  console.log(msg);
  logStream.write(`[${new Date().toISOString()}] ${msg}\n`);
}
function logError(...args) {
  const msg = args.join(' ');
  console.error(msg);
  logStream.write(`[${new Date().toISOString()}] ERROR: ${msg}\n`);
}

log('='.repeat(80));
log('SERVER START ATTEMPT');
log('='.repeat(80));
log('Node version:', process.version);
log('Current directory:', __dirname);
log('Environment PORT:', process.env.PORT || 'not set (will use default 3000)');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Capture global errors so we can see why the process might exit unexpectedly
// For debugging: log uncaught errors but KEEP process running so we can inspect behavior
process.on('uncaughtException', (err) => {
  logError('UNCAUGHT EXCEPTION (no exit):', err && err.stack ? err.stack : err);
  // do not exit - helpful while debugging locally
});
process.on('unhandledRejection', (reason) => {
  logError('UNHANDLED REJECTION (no exit):', reason && reason.stack ? reason.stack : reason);
  // do not exit - helpful while debugging locally
});

// Serve the frontend static files (admin UI)
app.use(express.static(path.join(__dirname, '..', 'web')));
log('Static files served from:', path.join(__dirname, '..', 'web'));

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-please-change';

log('Configured PORT:', PORT);
log('JWT_SECRET: (dev default)');

// Demo user (do not store plaintext in production)
const DEMO_USER = { email: 'admin@meghalert.com', password: 'admin123', name: 'MeghAlert Admin' };

// In-memory devices and events
let devices = {}; // Real devices will be added when they send SOS

let sosEvents = []; // {id, deviceId, time, lat, lng, resolved: false}
let sosEventIdCounter = 1; // For unique event IDs

// Utility: verify token middleware for fetch endpoints
function verifyToken(req, res, next){
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({error:'Missing authorization header'});
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({error:'Invalid auth format'});
  try{
    const payload = jwt.verify(parts[1], JWT_SECRET);
    req.user = payload;
    next();
  }catch(err){
    return res.status(401).json({error:'Invalid token'});
  }
}

// POST /api/login {email,password} -> {token}
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({error:'email and password required'});
  if (email === DEMO_USER.email && password === DEMO_USER.password){
    const token = jwt.sign({email: DEMO_USER.email, name: DEMO_USER.name}, JWT_SECRET, {expiresIn: '12h'});
    return res.json({token});
  }
  return res.status(401).json({error:'Invalid credentials'});
});

// GET /api/devices -> list of devices
app.get('/api/devices', verifyToken, (req, res) => {
  return res.json(Object.values(devices));
});

// GET /api/devices/:id/history -> simulated history points
app.get('/api/devices/:id/history', verifyToken, (req, res) => {
  const id = req.params.id;
  const device = devices[id];
  if (!device) return res.status(404).json({error:'device not found'});
  // generate fake path of 30 points around current lat/lng
  const points = [];
  const baseLat = device.lat;
  const baseLng = device.lng;
  for (let i=30;i>=0;i--){
    points.push({lat: baseLat + (Math.random()-0.5)/100 * (i/30), lng: baseLng + (Math.random()-0.5)/100 * (i/30), time: Date.now() - (30-i)*60000});
  }
  return res.json(points);
});

// GET /api/export?type=sos -> CSV of recent SOS events
app.get('/api/export', verifyToken, (req, res) => {
  const type = req.query.type || 'sos';
  if (type !== 'sos') return res.status(400).json({error:'only sos export supported in demo'});
  const rows = sosEvents.map(e=>({deviceId:e.deviceId, name: devices[e.deviceId]?.name || '', phone:devices[e.deviceId]?.phone||'', lat:e.lat, lng:e.lng, time:new Date(e.time).toISOString()}));
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition','attachment; filename="sos_events.csv"');
  const stringifier = stringify({header:true, columns:['deviceId','name','phone','lat','lng','time']});
  rows.forEach(r=>stringifier.write(r));
  stringifier.end();
  stringifier.pipe(res);
});

// POST /api/sos -> accept SOS from clients (demo: no auth required). Body: {deviceId,name,phone,lat,lng}
app.post('/api/sos', (req, res) => {
  const { deviceId, name, phone, lat, lng } = req.body || {};
  if (!deviceId || typeof lat === 'undefined' || typeof lng === 'undefined') return res.status(400).json({error:'deviceId, lat and lng required'});
  // ensure numeric
  const nlat = parseFloat(lat);
  const nlng = parseFloat(lng);
  if (Number.isNaN(nlat) || Number.isNaN(nlng)) return res.status(400).json({error:'lat and lng must be numbers'});

  // create or update device entry
  const d = devices[deviceId] || (devices[deviceId] = { id: deviceId, name: name || deviceId, phone: phone || '', lat: nlat, lng: nlng, sos: true, lastSeen: Date.now() });
  d.lat = nlat; d.lng = nlng; d.sos = true; d.lastSeen = Date.now();
  if (name) d.name = name;
  if (phone) d.phone = phone;

  const ev = { id: sosEventIdCounter++, deviceId: deviceId, time: Date.now(), lat: nlat, lng: nlng, resolved: false };
  sosEvents.unshift(ev);
  if (sosEvents.length > 500) sosEvents.pop();

  // broadcast to websocket clients
  broadcastJSON({ type: 'sos', event: ev, device: d });

  log('Received SOS from', deviceId, '@', nlat, nlng);
  return res.json({ ok: true, event: ev });
});

// GET /api/sos/latest -> returns the most recent SOS (demo)
app.get('/api/sos/latest', (req, res) => {
  if (!sosEvents || sosEvents.length === 0) return res.status(404).json({ error: 'no events' });
  const ev = sosEvents[0];
  const device = devices[ev.deviceId] || null;
  return res.json({ event: ev, device });
});

// GET /api/sos/history/:deviceId?limit=N -> recent events for device (newest first)
app.get('/api/sos/history/:deviceId', (req, res) => {
  const id = req.params.deviceId;
  const limit = parseInt(req.query.limit || '50');
  if (!id) return res.status(400).json({ error: 'deviceId required' });
  const events = sosEvents.filter(e => e.deviceId === id).slice(0, limit);
  // return in chronological order (oldest first) for polyline drawing
  const chronological = events.slice().reverse();
  return res.json({ device: devices[id] || null, points: chronological });
});

// GET /api/sos/list?limit=N -> list recent sos events (newest first)
app.get('/api/sos/list', (req, res) => {
  const limit = parseInt(req.query.limit || '50');
  const rows = sosEvents.slice(0, limit).map(e => ({ event: e, device: devices[e.deviceId] || null }));
  return res.json({ rows });
});

// POST /api/sos/:eventId/resolve -> mark SOS event as resolved
app.post('/api/sos/:eventId/resolve', verifyToken, (req, res) => {
  const eventId = parseInt(req.params.eventId);
  const event = sosEvents.find(e => e.id === eventId);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  
  event.resolved = true;
  event.resolvedAt = Date.now();
  event.resolvedBy = req.user.email;
  
  // Update device SOS status if no other unresolved events
  const device = devices[event.deviceId];
  if (device) {
    const hasUnresolvedSOS = sosEvents.some(e => e.deviceId === event.deviceId && !e.resolved);
    if (!hasUnresolvedSOS) {
      device.sos = false;
    }
  }
  
  // Broadcast update
  broadcastJSON({ type: 'sos_resolved', eventId: eventId, event, device });
  
  log(`Event ${eventId} marked as resolved by ${req.user.email}`);
  return res.json({ ok: true, event });
});

// POST /api/sos/:eventId/unresolve -> mark SOS event as unresolved
app.post('/api/sos/:eventId/unresolve', verifyToken, (req, res) => {
  const eventId = parseInt(req.params.eventId);
  const event = sosEvents.find(e => e.id === eventId);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  
  event.resolved = false;
  delete event.resolvedAt;
  delete event.resolvedBy;
  
  // Update device SOS status
  const device = devices[event.deviceId];
  if (device) {
    device.sos = true;
  }
  
  // Broadcast update
  broadcastJSON({ type: 'sos_unresolved', eventId: eventId, event, device });
  
  log(`Event ${eventId} marked as unresolved by ${req.user.email}`);
  return res.json({ ok: true, event });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({server});

function broadcastJSON(obj){
  const s = JSON.stringify(obj);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(s); });
}

wss.on('connection', function connection(ws, req){
  // token auth is optional for the demo: accept anonymous (guest) viewers
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  let user = null;
  if (token){
    try{ user = jwt.verify(token, JWT_SECRET); }
    catch(err){
      // token invalid - continue as guest so admin can still view live events in demo
      log('WS connection: invalid token provided, continuing as guest');
      user = { email: 'guest' };
    }
  } else {
    user = { email: 'guest' };
  }

  // send welcome + device list
  ws.send(JSON.stringify({type:'welcome', user}));
  ws.send(JSON.stringify({type:'devices', devices: Object.values(devices)}));

  // allow client to ask for history via websocket message {type:'history', deviceId}
  ws.on('message', (msg) => {
    try{
      const obj = JSON.parse(msg.toString());
      if (obj.type === 'history' && obj.deviceId){
        const device = devices[obj.deviceId];
        if (!device) return ws.send(JSON.stringify({type:'error', error:'device not found'}));
        const points = [];
        const baseLat = device.lat;
        const baseLng = device.lng;
        for (let i=30;i>=0;i--){
          points.push({lat: baseLat + (Math.random()-0.5)/100 * (i/30), lng: baseLng + (Math.random()-0.5)/100 * (i/30), time: Date.now() - (30-i)*60000});
        }
        ws.send(JSON.stringify({type:'history', deviceId: device.id, points}));
      }
    }catch(e){/* ignore parse errors */}
  });
});

// No dummy simulation - only real device data
log('Server ready to receive real SOS alerts from Flutter app');

// Listen explicitly on 0.0.0.0 and log errors
const serverInstance = server.listen(PORT, '::', () => {
  log(`\n${'='.repeat(80)}`);
  log(`✓ MeghAlert demo server SUCCESSFULLY RUNNING`);
  log(`✓ URL: http://localhost:${PORT}`);
  log(`✓ Admin UI: http://localhost:${PORT}/admin.html`);
  log(`✓ Demo credentials: admin@meghalert.com / admin123`);
  log(`${'='.repeat(80)}\n`);
});

serverInstance.on('error', (err) => {
  logError('SERVER BINDING ERROR:', err.code, '-', err.message);
  if (err.code === 'EADDRINUSE') {
    logError(`Port ${PORT} is already in use. Try another port or kill the process using it.`);
  }
  process.exit(1);
});

serverInstance.on('clientError', (err, socket) => {
  logError('CLIENT ERROR:', err.message);
});

log('Server attempting to bind to [::] (IPv6/IPv4 dual stack) on port ' + PORT);
