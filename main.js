require('dotenv').config();

const net = require('net');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
   
const path = require('path');
const https = require('https');
const app = express();
const fs = require('fs');
const cors = require('cors');


const SERVER_PORT = process.env.SERVER_PORT || 5000;
const SERVER_HOST = process.env.SERVER_HOST ;

const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:4200';

const HTTP_HOST = process.env.HOST || '0.0.0.0';
const HTTP_PORT = process.env.HTTP_PORT || 3000;

 //check certs folder load certs in express app if found
 const certDir = path.join(__dirname, 'certs');
 const certPath = path.join(certDir, 'cert.pem');
 const keyPath = path.join(certDir, 'key.pem');

 const hasCert = fs.existsSync(certPath) && fs.existsSync(keyPath);

// Open (or create) the database.
const db = new sqlite3.Database('./attendance.db', (err) => {
    if (err) {
        console.error('Could not open database:', err);
        process.exit(1);
    }
});

var lastData = '';

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
socket.setMaxListeners(1);
// Function to start the TCP server.
function startServer() {

    socket.on('data', (data) => {
        // Convert the incoming data buffer to a hexadecimal string.
        const hexMessage = data.toString('hex');
        // Extract the RFID: remove the last 4 hex digits then take the last 24 characters.
        const processedHex = hexMessage.slice(0, -4).slice(-24);
        console.log('Received hex string:', processedHex);
        lastData = processedHex;

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

    var connectionRetry = 1;
    //handle when server disconnects retry eve 5 seconds
    socket.on('close', () => {
        console.log('Connection closed. Reconnecting in 5 seconds...',connectionRetry++);
        initServerConnection();
        
    });

    function initServerConnection(){
        console.log(`Connecting to TCP server at ${SERVER_HOST}:${SERVER_PORT}...`);
        socket.once('connect', () => {
            console.log(`Connected to TCP server at ${SERVER_HOST}:${SERVER_PORT}.`);
            connectionRetry = 1;
        });
        socket.connect(SERVER_PORT, SERVER_HOST);
    }


    // --- Create Express app for HTTP routes ---
    
    const allowedOrigins = CORS_ORIGIN.split(',');
    allowedOrigins.push(`http://${HTTP_HOST}:${HTTP_PORT}`);
    allowedOrigins.push(`https://${HTTP_HOST}:${HTTP_PORT}`);

    app.use(cors({
      origin: function(origin, callback) {
        // allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'), false);
        }
      },
      credentials: true
    }));
    app.use(express.json()); 

    app.get('/check', (req, res) => {
        console.log(Date.now());
        
        res.json({ message: 'Server is running' });
    });

    app.post('/logs', (req, res) => {
        try {
            
            const { date, datas,name } = req.body;
            const rfids = datas.map((data) => data.rfid);
        
            // log user_id,date and timestamp toa auths a log file
            const log = `${name},${date},${new Date().toISOString()}\n`;
            fs.appendFile('auths.log', log, (err) => {
                if (err) {
                    console.error('Error writing to log file:', err.message);
                }
            });
          
        
            const sql = `SELECT rfid, intime, outtime FROM attendance WHERE date = '${date}' AND rfid IN (${rfids.map((rfid) => `'${rfid}'`).join(',')})`;
            console.log(sql);
            
            const params = [];
            
            db.all(sql, params, (err, rows) => {
                if (err) {
                res.status(500).json({ error: err.message });
                } else {
                    const responseDatas=[]; //id,start,end
                    rows.forEach(row => {
                        const data = datas.find((data) => data.rfid === row.rfid);                
                        responseDatas.push({ id: data.id, check_in: row.intime, check_out: row.outtime });
                    });
        
                    
                    // datas.forEach((data) => {
                    //     const start = new Date(data.timestamps[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                    //     let end = new Date(data.timestamps[data.timestamps.length - 1]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                    //     if(start === end) {
                    //         end = null;
                    //     }
                    //     responseDatas.push({ student_id: data.id, check_in:start, check_out:end });
                    // });
                    res.json(responseDatas);
                }
            });
        } catch (error) {
            //return 500 error
            res.status(500).json({ error: error.message });
        }
        
    });

    app.post('/latest', (_, res) => {
        //return latest data
        res.json({ data: lastData });
    });

    app.get('/latest', (_, res) => {
        //return latest data
        res.json({ data: lastData });
    });

    app.get('/qr',(_,res)=>{
        res.sendFile(path.join(__dirname, 'qr.html'));
    });
    app.get('/read',(_,res)=>{
        res.sendFile(path.join(__dirname, 'read.html'));
    });

    app.post('/qr',(_,res)=>{
        res.json({
            scheme: hasCert ? 'https' : 'http',
            host : HTTP_HOST,
            port : HTTP_PORT
        });
    });

   
    let httpsServer;

    if (hasCert) {
        const cert = fs.readFileSync(certPath);
        const key = fs.readFileSync(keyPath);
        httpsServer = https.createServer({ cert, key }, app);
        httpsServer.listen(HTTP_PORT, () => {
            console.log(`HTTPS Server serving on port https://${HTTP_HOST}:${HTTP_PORT}`);
            initServerConnection();
        });
    }else{

        httpsServer=app.listen(HTTP_PORT, HTTP_HOST, () => {
            //load last data from file if file exists
            if(fs.existsSync('lastData.txt')){
                lastData = fs.readFileSync('lastData.txt').toString();
            }
            
            console.log(`HTTP Server serving on port http://${HTTP_HOST}:${HTTP_PORT}`);
            initServerConnection();
        });
    }



    // Handle graceful shutdown.
    process.on('SIGINT', () => {
        //save last data to a file 
        fs.writeFileSync('lastData.txt', lastData);
        console.log('\nShutting down...');
        flushCache();
        insertStmt.finalize();
        updateStmt.finalize();
        db.close();
        socket.destroy();
        if(httpsServer){
            httpsServer.close(() => {
                console.log('HTTPS Server closed.');
            });
        }else{
            httpsServer.close(() => {
                console.log('HTTP Server closed.');
            });
        }
        //close express server gracefully
        // app.close(() => {
        //     console.log('HTTP Server closed.');
        // });

        app.

        process.exit(0);
    });
}
