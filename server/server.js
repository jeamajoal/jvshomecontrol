const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const LAYOUT_FILE = path.join(DATA_DIR, 'layout.json');
const HABITAT_API_URL = "http://192.168.102.174/apps/api/30/devices/all?access_token=2c459973-2cf2-4157-aeb8-e13d8789ba6a";

app.use(cors());
app.use(bodyParser.json());

// State
let layout = { rooms: {}, sensors: {} }; // Stores x,y,w,h
let config = { rooms: [], sensors: [] }; // The merged view sent to client
let sensorStatuses = {};

// --- PERSISTENCE ---

function loadLayout() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
        if (fs.existsSync(LAYOUT_FILE)) {
            layout = JSON.parse(fs.readFileSync(LAYOUT_FILE, 'utf8'));
            console.log('Layout loaded');
        }
    } catch (err) {
        console.error('Error loading layout:', err);
    }
}

function saveLayout() {
    try {
        fs.writeFileSync(LAYOUT_FILE, JSON.stringify(layout, null, 2));
        // After saving, re-sync to apply changes immediately
        syncHabitatData();
    } catch (err) {
        console.error('Error saving layout:', err);
    }
}

loadLayout();

// --- HABITAT MAPPER ---

function mapDeviceType(capabilities, typeName) {
    if (capabilities.includes("SmokeDetector")) return "smoke";
    if (capabilities.includes("CarbonMonoxideDetector")) return "co";
    if (capabilities.includes("MotionSensor")) return "motion";
    if (capabilities.includes("ContactSensor")) return "entry";
    return "unknown";
}

function mapState(device, appType) {
    const attrs = device.attributes;
    if (appType === 'smoke') return attrs.smoke === 'detected' ? 'alarm' : 'closed';
    if (appType === 'co') return attrs.carbonMonoxide === 'detected' ? 'alarm' : 'closed';
    if (appType === 'motion') return attrs.motion === 'active' ? 'open' : 'closed';
    return attrs.contact === 'open' ? 'open' : 'closed';
}

async function syncHabitatData() {
    try {
        // In real usage use fetch. 
        const res = await fetch(HABITAT_API_URL);
        if (!res.ok) throw new Error(`Habitat API Error: ${res.status}`);
        const devices = await res.json();

        const newRooms = new Map();
        const newSensors = [];
        const newStatuses = {};
        const roomSensorCounts = {};

        devices.forEach(dev => {
            const startCaps = ["ContactSensor", "MotionSensor", "SmokeDetector", "CarbonMonoxideDetector"];
            const isRelevant = dev.capabilities.some(c => startCaps.includes(c));
            if (!isRelevant) return;

            // ROOMS
            let roomName = dev.room || "Unassigned";
            if (!newRooms.has(roomName)) {
                // Check for saved layout
                const savedRoom = layout.rooms[roomName] || {};

                newRooms.set(roomName, {
                    id: roomName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                    name: roomName,
                    // Default grid layout if not saved:
                    layout: {
                        x: savedRoom.x ?? 0,
                        y: savedRoom.y ?? Infinity, // Put at bottom if new
                        w: savedRoom.w ?? 2,
                        h: savedRoom.h ?? 3
                    },
                    floor: 1 // Deprecated somewhat by custom layout, but kept for grouping logic if needed
                });
            }
            const roomId = newRooms.get(roomName).id;

            // TYPE & STATE
            const type = mapDeviceType(dev.capabilities, dev.type);
            const state = mapState(dev, type);

            // SENSOR
            const savedSensor = layout.sensors[dev.id];
            let position;

            if (savedSensor) {
                position = { x: savedSensor.x, y: savedSensor.y };
            } else {
                // Auto-layout: Distribute new sensors so they don't stack
                const count = (roomSensorCounts[roomId] || 0);
                roomSensorCounts[roomId] = count + 1;

                // Grid layout: 3 columns using percentages
                // Map columns to ~10%, 40%, 70% width
                // Map rows to ~20%, 50%, 80% height
                const col = count % 3;
                const row = Math.floor(count / 3);

                position = {
                    x: 0.10 + (col * 0.30),
                    y: 0.12 + (row * 0.30)
                };
            }

            newSensors.push({
                id: dev.id,
                roomId: roomId,
                label: dev.label,
                type: type,
                metadata: { battery: dev.attributes.battery },
                position
            });

            newStatuses[dev.id] = { id: dev.id, state, type, lastUpdated: new Date() };
        });

        config = {
            rooms: Array.from(newRooms.values()),
            sensors: newSensors
        };
        sensorStatuses = newStatuses;

        io.emit('config_update', config);
        io.emit('device_refresh', sensorStatuses);

    } catch (err) {
        // console.error("Polling Error:", err.message);
    }
}

setInterval(syncHabitatData, 2000);
syncHabitatData();

// --- API ---

app.get('/', (req, res) => res.send('Home Automation Server - Layout Enabled'));
app.get('/api/config', (req, res) => res.json(config));
app.get('/api/status', (req, res) => res.json(sensorStatuses));

app.post('/api/layout', (req, res) => {
    const { rooms, sensors } = req.body;
    if (rooms) {
        // Merge room updates
        Object.keys(rooms).forEach(key => {
            layout.rooms[key] = { ...layout.rooms[key], ...rooms[key] };
        });
    }
    if (sensors) {
        Object.keys(sensors).forEach(key => {
            layout.sensors[key] = { ...layout.sensors[key], ...sensors[key] };
        });
    }
    saveLayout();
    res.json({ success: true });
});

app.delete('/api/layout', (req, res) => {
    layout = { rooms: {}, sensors: {} };
    saveLayout();
    res.json({ success: true });
});

io.on('connection', (socket) => {
    console.log('Client connected');
    socket.emit('config_update', config);
    socket.emit('device_refresh', sensorStatuses);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
