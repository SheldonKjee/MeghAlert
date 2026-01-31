# 🚨 MeghAlert - Emergency SOS System

A comprehensive cross-platform emergency alert system with real-time location tracking, admin dashboard, and instant notifications.

## 📋 Overview

**MeghAlert** is a modern emergency response application that combines a Flutter mobile app with a web-based admin dashboard. Users can send SOS alerts with a single button click, and administrators can monitor and respond to emergencies in real-time with live location tracking and event management.

### Key Features

#### 📱 Mobile App (Flutter)
- **One-Click SOS**: Send emergency alerts instantly
- **GPS Location Tracking**: Real-time location sharing with emergency contacts
- **Contact Management**: Register emergency contacts and trusted recipients
- **Geolocation Integration**: Reverse geocoding for address-based alerts
- **Cross-Platform**: Works on iOS, Android, Web, Windows, Linux, macOS
- **Offline Support**: Uses local storage for critical data
- **User Registration**: Quick registration with personal information

#### 🎛️ Admin Dashboard (Web)
- **Real-Time Monitoring**: WebSocket-based live updates
- **SOS Event Management**: View and manage all emergency reports
- **Live Tracking Map**: Interactive map with Leaflet.js integration
- **Device Management**: Track active devices and their status
- **Fixed Points**: Monitor and manage emergency hotspots
- **Analytics**: Overview stats and activity tracking
- **User Authentication**: JWT-based secure login
- **CSV Export**: Export data for further analysis
- **Responsive Design**: Works on desktop and tablet

#### 🔧 Backend Server
- **Express.js API**: RESTful endpoints for app communication
- **JWT Authentication**: Secure user verification
- **WebSocket Support**: Real-time notifications to dashboard
- **Database Operations**: Device and SOS event management
- **CORS Enabled**: Cross-origin requests handled
- **Production-Ready**: Error handling and logging

## 🚀 Quick Start

### Prerequisites
- Flutter SDK (>=2.12.0)
- Node.js 14+
- Android Studio / Xcode (for mobile builds)
- Chrome/Modern Web Browser

### Installation

#### 1. Clone Repository
```bash
git clone https://github.com/SheldonKjee/MeghAlert.git
cd MeghAlert
```

#### 2. Setup Flutter App
```bash
flutter pub get
flutter run -d chrome  # Run on web
# or
flutter run -d android # Run on Android emulator
# or
flutter run -d windows # Run on Windows
```

#### 3. Setup Backend Server
```bash
cd server
npm install
node server.js
```

The server will start on `http://localhost:3000`

#### 4. Access Admin Dashboard
- **URL**: `http://localhost:3000/admin.html`
- **Email**: `admin@meghalert.com`
- **Password**: `admin123`

## 📁 Project Structure

```
MeghAlert/
├── lib/                    # Flutter app source code
│   └── main.dart          # Main app entry point
├── server/                # Node.js backend server
│   ├── server.js          # Express server with WebSocket
│   ├── package.json       # Node dependencies
│   └── server.log         # Server logs
├── web/                   # Web admin dashboard
│   ├── admin.html         # Admin dashboard UI
│   ├── admin.css          # Dashboard styling
│   ├── index.html         # Mobile web app
│   ├── js/                # JavaScript utilities
│   └── css/               # Web styling
├── android/               # Android native code
├── ios/                   # iOS native code
├── windows/               # Windows native code
├── linux/                 # Linux native code
├── macos/                 # macOS native code
├── pubspec.yaml           # Flutter dependencies
└── README.md              # This file
```

## 🔑 Key Technologies

### Frontend
- **Flutter**: Cross-platform mobile development
- **flutter_map**: Interactive mapping (Leaflet.js integration)
- **geolocator**: GPS location services
- **geocoding**: Address reverse-geocoding
- **shared_preferences**: Local data persistence

### Backend
- **Express.js**: Web server framework
- **WebSocket (ws)**: Real-time bidirectional communication
- **JWT**: User authentication
- **CORS**: Cross-origin resource sharing

### Dashboard
- **Leaflet.js**: Interactive maps
- **Chart.js**: Data visualization
- **Vanilla JavaScript**: Frontend logic
- **CSS Grid**: Responsive layout

## 📡 API Endpoints

### Authentication
- `POST /api/login` - User login with JWT token

### Devices
- `GET /api/devices` - List all devices
- `GET /api/devices/:id` - Get device details
- `POST /api/devices` - Register new device

### SOS Events
- `GET /api/sos-events` - List all SOS events
- `POST /api/sos-events` - Create new SOS event
- `GET /api/sos-events/:id` - Get event details

### Data Export
- `GET /api/export/csv` - Export events as CSV

## 🎨 UI/UX Features

### Mobile App
- Clean, intuitive interface
- Large, prominent SOS button for emergency access
- Real-time status indicators
- Location-based emergency features
- Dark/Light theme support

### Admin Dashboard
- Professional, organized layout
- Real-time WebSocket updates
- Interactive maps with zoom and pan
- Responsive design for all screen sizes
- Multi-tab interface for different views

## 🔐 Security Features

- JWT token-based authentication
- Secure password storage
- CORS protection
- Input validation
- Error logging without exposing sensitive data
- Secure WebSocket connections

## 📊 Demo Account

**Admin Dashboard Login:**
- Email: `admin@meghalert.com`
- Password: `admin123`

**Note**: This is a demo account for testing. Change credentials before production deployment.

## 🛠️ Development

### Build for Web
```bash
flutter build web
```

### Build for Android
```bash
flutter build apk
```

### Build for iOS
```bash
flutter build ios
```

### Run Tests
```bash
flutter test
```

## 📝 Configuration

### Server Configuration
Edit `server/server.js` to change:
- Port (default: 3000)
- JWT secret key
- CORS origins

### App Configuration
Edit `lib/main.dart` to change:
- Server API endpoint
- Map provider settings
- Theme colors

## 🐛 Troubleshooting

### Flutter App Won't Run
```bash
flutter clean
flutter pub get
flutter run -d chrome
```

### Server Connection Issues
1. Ensure server is running: `node server/server.js`
2. Check port 3000 is not in use
3. Verify CORS settings in server.js

### Map Not Displaying
- Check internet connection
- Verify Leaflet.js CDN is accessible
- Clear browser cache

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👨‍💻 Author

**SheldonKjee**
- GitHub: [@SheldonKjee](https://github.com/SheldonKjee)

## 📞 Support

For support, questions, or bug reports, please open an issue on GitHub.

## 🎯 Roadmap

- [ ] SMS/Push notifications
- [ ] Multiple language support
- [ ] Advanced analytics dashboard
- [ ] Mobile app push notifications
- [ ] Integration with emergency services
- [ ] Video call support
- [ ] Machine learning for threat detection

---

**Last Updated**: February 2026  
**Version**: 1.0.0
