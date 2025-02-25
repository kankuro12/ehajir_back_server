require('dotenv').config();

const net = require('net');
const sqlite3 = require('sqlite3').verbose();

SERVER_PORT = process.env.SERVER_PORT || 5000;
SERVER_HOST = process.env.SERVER_HOST ;
// Open (or create) the database.
const db = new sqlite3.Database('./attendance.db', (err) => {
    if (err) {
        console.error('Could not open database:', err);
        process.exit(1);
    }
});

// Configure SQLite for better write concurrency.
db.run('PRAGMA journal_mode = WAL;');

// Use serialize to ensure sequential execution.
db.serialize(() => {
    // Create the table if it doesn't exist.
    db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,         -- Format: 'YYYY-MM-DD'
      rfid TEXT NOT NULL CHECK (length(rfid) = 24),
      intime TEXT NOT NULL,       -- First time the RFID is read
      outtime TEXT,               -- Last time the RFID is read
      UNIQUE(date, rfid)
    )
  `, (err) => {
        if (err) {
            console.error('Table creation error:', err);
            process.exit(1);
        }

        // Start the TCP server only after the table is created.
        startServer();
    });
});

// In-memory cache for attendance records for the current day.
// Keyed by RFID; each value is an object:
// { date, intime, outtime, isNew, updated }
const attendanceCache = new Map();

// Batch flush interval (in milliseconds)
const BATCH_INTERVAL_MS = 1000;

// Prepare statements for insertion and update.
const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO attendance (date, rfid, intime, outtime)
  VALUES (?, ?, ?, ?)
`);
const updateStmt = db.prepare(`
  UPDATE attendance SET outtime = ?
  WHERE date = ? AND rfid = ?
`);

// Function to flush cached records to the database in a transaction.
function flushCache() {
    if (attendanceCache.size === 0) return;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        attendanceCache.forEach((record, rfid) => {
            if (record.isNew) {
                // Insert new record. Using INSERT OR IGNORE in case a record was concurrently inserted.
                insertStmt.run(record.date, rfid, record.intime, record.outtime, (err) => {
                    if (err) console.error(`Insert error for ${rfid}:`, err);
                });
            } else if (record.updated) {
                // Update outtime.
                updateStmt.run(record.outtime, record.date, rfid, (err) => {
                    if (err) console.error(`Update error for ${rfid}:`, err);
                });
            }
            // Reset flags after flushing.
            record.isNew = false;
            record.updated = false;
        });
        db.run('COMMIT');
    });
}

// Periodically flush the cache.
setInterval(flushCache, BATCH_INTERVAL_MS);

const socket = new net.Socket();
// Function to start the TCP server.
function startServer() {

    socket.on('data', (data) => {
        // Convert the incoming data buffer to a hexadecimal string.
        const hexMessage = data.toString('hex');
        // Extract the RFID: remove the last 4 hex digits then take the last 24 characters.
        const processedHex = hexMessage.slice(0, -4).slice(-24);
        console.log('Received hex string:', processedHex);

        // Get the current date and time.
        const now = new Date();
        const currentDate = now.toISOString().slice(0, 10); // 'YYYY-MM-DD'
        const currentTime = now.toISOString().slice(11, 19); // 'HH:MM:SS'

        // If the cache already has an entry for this RFID, update the outtime.
        if (attendanceCache.has(processedHex)) {
            const record = attendanceCache.get(processedHex);
            // If the date has changed (i.e. new day), clear the cache.
            if (record.date !== currentDate) {
                attendanceCache.clear();
            } else {
                record.outtime = currentTime;
                record.updated = true;
                return;
            }
        }

        // For a new RFID for the day, add a new record to the cache.
        attendanceCache.set(processedHex, {
            date: currentDate,
            intime: currentTime,
            outtime: currentTime,
            isNew: true,
            updated: false
        });
    });

    socket.on('end', () => {
        console.log('Client disconnected.');
    });

    socket.on('error', (err) => {
        console.error('Socket error:', err);
    });

    socket.connect(SERVER_PORT, SERVER_HOST, () => {
        console.log(`Connected to TCP server at ${SERVER_HOST}:${SERVER_PORT}.`);
    });


    // Handle graceful shutdown.
    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        flushCache();
        insertStmt.finalize();
        updateStmt.finalize();
        db.close();
        server.close(() => {
            process.exit(0);
        });
    });
}
