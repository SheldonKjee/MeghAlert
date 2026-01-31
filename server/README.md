Demo server for MeghAlert admin UI

Quick start (Windows / PowerShell):
1. cd server
2. npm install
3. npm start

Server features (demo):
- POST /api/login {email,password} -> {token}
- GET /api/devices (requires Bearer token)
- GET /api/devices/:id/history (requires token)
- GET /api/export?type=sos (CSV export, requires token)
- WebSocket server at ws://localhost:3000/?token=<JWT> supports messages:
  - server -> client: {type:'devices', devices:[...]}, {type:'device_update', device}, {type:'sos', event, device}
  - client -> server: {type:'history', deviceId}

Notes:
- This is a local demo server. Do not use in production.
- Change JWT_SECRET in env for improved security.

Serve the admin UI from the server:
- After starting the server, open: http://localhost:3000/admin.html

Demo login credentials:
- Email: admin@meghalert.com
- Password: admin123

Sample devices are positioned around Meghalaya (Shillong area) and use Indian phone numbers (+91) in this demo.

Important: Open the admin UI via the served URL above (http://localhost:3000/admin.html). Opening `web/admin.html` directly with `file://` can break WebSocket connections and prevent real-time updates.
