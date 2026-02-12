# 🔧 MeghAlert Quick Start & Command Reference

## ⚡ Quick Start (30 seconds)

```powershell
# 1. Navigate to project
cd as so one

# 2. Start server
cd server
npm start

# 3. Open browser
Start-Process "http://localhost:3000/admin.html"

# 4. Login with demo credentials
# Email: admin@meghalert.com
# Password: admin123
```

---

## 🔴 Server Won't Start? Use This Checklist

### 1. Check if Node is installed
```powershell
node --version    # Should show v24.11.1 or higher
npm --version     # Should show 11.6.2 or higher
```

### 2. Check port 3000 is free
```powershell
netstat -ano | findstr :3000
# If nothing shows, port is free. If output, that process is using it.
```

### 3. Kill existing Node processes (if needed)
```powershell
taskkill /IM node.exe /F
```

### 4. Reinstall dependencies
```powershell
cd server
rm -Force -Recurse node_modules, package-lock.json
npm install
```

### 5. Check firewall (Windows Defender)
```powershell
# Add Node.js to firewall whitelist
$nodeExe = (Get-Command node).Source
New-NetFirewallRule -DisplayName "Node.js Server" -Program $nodeExe -Action Allow -Direction Inbound -ErrorAction SilentlyContinue
```

### 6. Start server with full logging
```powershell
cd server
node server.js    # Keep this open; watch for error messages
```

---

## 🧪 Testing Individual Components

### Test API Authentication
```powershell
# Login and get token
$loginResponse = Invoke-WebRequest -Uri "http://localhost:3000/api/login" `
  -Method Post -ContentType "application/json" `
  -Body '{"email":"admin@meghalert.com","password":"admin123"}' `
  -UseBasicParsing

$token = ($loginResponse.Content | ConvertFrom-Json).token
Write-Host "Token received: $($token.Substring(0,50))..."
```

### Test Device Endpoint
```powershell
$devices = Invoke-WebRequest -Uri "http://localhost:3000/api/devices" `
  -Headers @{"Authorization"="Bearer $token"} -UseBasicParsing
  
Write-Host ($devices.Content | ConvertFrom-Json | ConvertTo-Json)
```

### Test History Endpoint
```powershell
$history = Invoke-WebRequest -Uri "http://localhost:3000/api/devices/d1/history" `
  -Headers @{"Authorization"="Bearer $token"} -UseBasicParsing
  
Write-Host "Device d1 has $(@($history.Content | ConvertFrom-Json).Count) history points"
```

### Test CSV Export
```powershell
$csvData = Invoke-WebRequest -Uri "http://localhost:3000/api/export?type=sos" `
  -Headers @{"Authorization"="Bearer $token"} -UseBasicParsing
  
$csvData.Content | Out-File "sos_events.csv"
Write-Host "CSV exported to sos_events.csv"
```

---

## 📊 Real-Time Monitoring

### Watch Server Logs
```powershell
Get-Content A:\Users\.....\SOS-Buzzer-master\server\server.log -Wait
```

### Monitor Running Processes
```powershell
Get-Process node | Select-Object ProcessName, Id, WorkingSet, Handles
```

### Check Network Connections
```powershell
netstat -ano | findstr :3000
# Output shows: LISTENING on port 3000
```

---

## 🔧 Environment Variables

You can customize server behavior with environment variables:

```powershell
# Custom port (instead of 3000)
$env:PORT = "8000"
npm start

# Custom JWT secret
$env:JWT_SECRET = "my-super-secret-key"
npm start

# Both
$env:PORT = "8000"
$env:JWT_SECRET = "my-secret"
npm start
```

---

## 🌐 Browser Access

### Admin UI
- **URL:** http://localhost:3000/admin.html
- **Credentials:** admin@meghalert.com / admin123
- **Features:** Login, Dashboard, Device List (placeholder)

### Direct API Access
You can test APIs directly in PowerShell or tools like Postman:
- Login: `POST http://localhost:3000/api/login`
- Devices: `GET http://localhost:3000/api/devices`
- History: `GET http://localhost:3000/api/devices/{id}/history`
- Export: `GET http://localhost:3000/api/export?type=sos`

---

## 🔒 Security Configuration

### For Development (Current)
- ✅ CORS enabled (any origin)
- ✅ No HTTPS required
- ✅ Demo credentials hardcoded
- ⚠️ **NOT suitable for production**

### For Production
```javascript
// Implement these in server.js before production:
1. Use HTTPS with SSL certificates
2. Implement proper authentication (database users)
3. Add rate limiting
4. Enable CORS only for known origins
5. Store secrets in environment variables
6. Add input validation and sanitization
7. Use secure database (PostgreSQL/MongoDB)
8. Add request logging and monitoring
9. Implement proper error handling
10. Use WSS (WebSocket Secure) instead of WS
```

---

## 📝 Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| **Port already in use** | `taskkill /IM node.exe /F` then restart |
| **Module not found** | `cd server && npm install` |
| **Connection refused** | Check if server is running: `Get-Process node` |
| **Firewall blocks connection** | Add Node.js to Windows Defender whitelist |
| **CORS errors** | Server already configured - likely browser issue |
| **Token expired** | Login again to get new token |
| **WebSocket won't connect** | Ensure server is on same port as HTTP |

---

## 💾 Backing Up Your Work

```powershell
# Create backup of project
$timestamp = (Get-Date -Format "yyyy-MM-dd_HHmmss")
Copy-Item -Path "D:Projects\SOS-Buzzer-master" `
  -Destination "D:Projects\SOS-Buzzer-backup-$timestamp" -Recurse

Write-Host "Backup created: SOS-Buzzer-backup-$timestamp"
```

---

## 🚀 Deployment Preview

### Local Development
✅ Currently running at http://localhost:3000

### Future: Deploy to Cloud
```bash
# Example: Deploy to Heroku
heroku login
heroku create meghalert-demo
git push heroku main
# App will be at https://meghalert-demo.herokuapp.com
```

---

## 📞 Configuration Summary

| Component | Status | Details |
|-----------|--------|---------|
| **Node.js** | ✅ v24.11.1 | Latest LTS version |
| **npm** | ✅ v11.6.2 | Package manager ready |
| **Dependencies** | ✅ Installed | 6 npm packages |
| **Server** | ✅ Running | Port 3000, HTTP |
| **Database** | ✅ In-Memory | 3 sample devices |
| **Authentication** | ✅ JWT | 12-hour tokens |
| **WebSocket** | ✅ Enabled | Real-time updates |
| **Logging** | ✅ Active | server.log file |
| **Firewall** | ✅ Configured | Node.js whitelisted |

---

## 📚 File Locations

```
Project Root:
c:\Users\khong\OneDrive\Desktop\Projects\SOS-Buzzer-master\

Server:
├── server/server.js              Main application
├── server/package.json           Dependencies
├── server/node_modules/          Installed packages
├── server/server.log             Runtime logs

Frontend:
├── web/admin.html                Login page
├── web/css/admin.css             Styling
├── web/js/admin.js               Client logic

Documentation:
├── SETUP_COMPLETE.md             Full setup guide
├── QUICK_START.md                This file
└── README.md                      Project overview
```

---

## ✅ Verification Commands

Run these to verify everything is working:

```powershell
# 1. Check server is running
Get-Process node

# 2. Check port is listening
Test-NetConnection localhost -Port 3000

# 3. Check API is responding
Invoke-WebRequest http://localhost:3000/api/login -Method Options

# 4. Check files are in place
Test-Path D:Projects\SOS-Buzzer-master\server\server.js
Test-Path D:Projects\SOS-Buzzer-master\web\admin.html

# 5. Check logs exist
Test-Path D:Projects\SOS-Buzzer-master\server\server.log
```

All should return `True` or show running processes.

---

**Last Updated: December 22, 2025**  
**Status: ✅ Ready to Use**
