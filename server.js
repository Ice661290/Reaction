const express = require('express');
const { Pool } = require('pg'); // ใช้ pg แทน sqlite3
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// เชื่อมต่อ Database (Neon) ผ่านตัวแปรสิ่งแวดล้อม (Environment Variable)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// สร้างตาราง (Postgres Syntax)
const createTableQuery = `
    CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        UserID TEXT,
        Name TEXT,
        TotalScore REAL,
        TotalRounds TEXT, 
        AverageTime REAL,
        BestTime REAL,
        LastPlayed TEXT,
        FastReactions INTEGER,
        Status TEXT DEFAULT 'Active'
    )
`;

pool.query(createTableQuery)
    .then(() => console.log("✅ Table created or already exists"))
    .catch(err => console.error("❌ Error creating table", err));

// API: รับข้อมูลจาก ESP32
app.post('/api/save', async (req, res) => {
    const { UserID, Name, TotalScore, TotalRounds, AverageTime, BestTime, LastPlayed, FastReactions } = req.body;
    
    // เวลาไทย
    const timestamp = LastPlayed || new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    const sql = `INSERT INTO players (UserID, Name, TotalScore, TotalRounds, AverageTime, BestTime, LastPlayed, FastReactions) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`;
    
    try {
        const result = await pool.query(sql, [UserID, Name, TotalScore, TotalRounds, AverageTime, BestTime, timestamp, FastReactions]);
        console.log(`New data from: ${Name}`);
        res.json({ message: "Data saved successfully", id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: err.message });
    }
});

// API: ส่งข้อมูลให้หน้าเว็บ
app.get('/api/data', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM players ORDER BY id DESC LIMIT 50");
        res.json(result.rows);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});