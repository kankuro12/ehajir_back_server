// server.js
require('dotenv').config();

const net = require('net');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');

// --- Configuration ---
const SERVER_PORT = process.env.SERVER_PORT || 4000;         // TCP server port
const HTTP_PORT = process.env.HTTP_PORT || 3000; // Express server port

const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:4200';

const SERVER_HOST = process.env.SERVER_HOST || '0.0.0.0';
const HTTP_HOST = process.env.HTTP_HOST || '0.0.0.0';
let reconnectInterval = null;

// --- Initialize SQLite ---
const db = new sqlite3.Database('./rfid.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');

    // Create the table if it doesn't exist.
    db.run(
      `CREATE TABLE IF NOT EXISTS rfid_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rfid TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => {
        if (err) {
          console.error('Error creating table:', err.message);
        } else {
          console.log('Table "rfid_logs" is ready.');
        }
      }
    );
  }
});

// --- Create TCP Client (existing logic) ---
const socket = new net.Socket();
// Listen for data from the client.
socket.on('data', (data) => {
  const message = data.toString().trim();

  // Helper function to insert a single RFID value.
  function processPiece(rfid) {
    const sql = 'INSERT INTO rfid_logs (rfid) VALUES (?)';
    db.run(sql, [rfid], function (err) {
      if (err) {
        socket.write(`error`);
      } else {
        socket.write(`saved\n`);
      }
    });
  }

  // If the message consists only of digits.
  if (/^\d+$/.test(message)) {
    if (message.length === 10) {
      // Exactly a 10-digit RFID.
      processPiece(message);
    } else if (message.length > 10) {
      // Split the string into 10-digit chunks.
      for (let i = 0; i < message.length; i += 10) {
        const chunk = message.substring(i, i + 10);
        if (chunk.length === 10) {
          processPiece(chunk);
        } else {
          socket.write('ignored\n');
        }
      }
    }
  } else {
    // If the message contains other characters, try extracting all 10-digit sequences.
    const matches = message.match(/\d{10}/g);
    if (matches && matches.length > 0) {
      matches.forEach(processPiece);
    } else {
      socket.write('invalid\n');
    }
  }
});

socket.on('close', () => {
  if (!reconnectInterval) {
    reconnectInterval = setInterval(() => {
      console.log('Attempting to reconnect...');
      createConnection();
    }, 10000);
  }
});

socket.on('error', (err) => {
  //console.error('Socket error:', err.message);
});

function createConnection() {
  console.log(`Connecting to TCP server at ${SERVER_HOST}:${SERVER_PORT}...`);
  socket.connect(SERVER_PORT, SERVER_HOST, () => {
    
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
    console.log(`TCP Server listening on port ${SERVER_PORT}`);
  });
}


// --- Create Express app for HTTP routes ---
const app = express();
const fs = require('fs');
const cors = require('cors');
const { Console } = require('console');
const allowedOrigins = CORS_ORIGIN.split(',');

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
app.use(express.json()); // to parse JSON request bodies


app.get('/check', (req, res) => {
    console.log(Date.now());
    
    res.json({ message: 'Server is running' });
});

//post request where date and rfids and date are fetched for matchig date and  rfids
app.post('/logs', (req, res) => {
    const { date, students,name } = req.body;
    const rfids = students.map((student) => student.rfid);

    // log user_id,date and timestamp toa auths a log file
    const log = `${name},${date},${new Date().toISOString()}\n`;
    fs.appendFile('auths.log', log, (err) => {
        if (err) {
            console.error('Error writing to log file:', err.message);
        }
    });
  

    const sql = `SELECT rfid, timestamp FROM rfid_logs WHERE date(timestamp) = ? AND rfid IN (${rfids.map(() => '?').join(',')})`;
    const params = [date, ...rfids];
    
    db.all(sql, params, (err, rows) => {
        if (err) {
        res.status(500).json({ error: err.message });
        } else {
            const datas=[];
            rows.forEach(row => {
                const student = students.find((student) => student.rfid === row.rfid);                
                const dataIndex = datas.findIndex((data) => data.id === student.id);
                if (dataIndex === -1) {
                    datas.push({ id: student.id, timestamps: [row.timestamp] });
                } else {
                    datas[dataIndex].timestamps.push(row.timestamp);
                    datas[dataIndex].timestamps.sort();
                } 
            });

            
            const responseDatas=[]; //id,start,end
            datas.forEach((data) => {
                const start = new Date(data.timestamps[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                let end = new Date(data.timestamps[data.timestamps.length - 1]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                if(start === end) {
                    end = null;
                }
                responseDatas.push({ student_id: data.id, check_in:start, check_out:end });
            });
            res.json(responseDatas);
        }
    });
    
});

// Start the Express server on a separate port
app.listen(HTTP_PORT, HTTP_HOST, () => {
    console.log(`HTTP Server serving on port http://${HTTP_HOST}:${HTTP_PORT}`);
});

createConnection();
