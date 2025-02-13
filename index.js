// server.js
require('dotenv').config();

const net = require('net');
const sqlite3 = require('sqlite3').verbose();

const PORT = process.env.PORT;
const HOST = process.env.HOST;

// Open (or create) the SQLite database.
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

const socket = new net.Socket();

socket.on('data', (data) => {
    // Convert the data to a string and trim whitespace.
    const message = data.toString().trim();
    //console.log('Received:', message);

    // Helper function to insert a single RFID value.
    function processPiece(rfid) {
        const sql = 'INSERT INTO rfid_logs (rfid) VALUES (?)';
        db.run(sql, [rfid], function (err) {
            if (err) {
                //console.error(`Error inserting RFID ${rfid}:`, err.message);
                socket.write(`error`);
            } else {
                //console.log(`RFID ${rfid} saved with row id ${this.lastID}`);
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
                    //console.log(`Ignoring invalid chunk: ${chunk}`);
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
            //console.log('Invalid RFID format. Expecting at least one 10-digit number.');
            socket.write('invalid\n');
        }
    }
});

  // Handle client disconnects.
  socket.on('close', () => {
    //console.log('Client disconnected.');
  });

  // Handle errors with the socket.
  socket.on('error', (err) => {
    //console.error('Socket error:', err.message);
  });

// Handle server errors.
server.on('error', (err) => {
  //console.error('Server error:', err.message);
});

client.connect(PORT, HOST, () => {
  console.log(`Connected to server at ${HOST}:${PORT}`);
});

// Start listening on the specified port on all available interfaces.
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT} on all interfaces`);
});




