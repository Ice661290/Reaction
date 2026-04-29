require('dotenv').config();
const express = require('express');
const { Pool } = require('pg'); 
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// เชื่อมต่อ Database (Supabase)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// เก็บสถานะคนเล่นปัจจุบัน
let activeSessionId = null;
let activeUser = null;

// API: เริ่ม Session การเล่นใหม่ (เรียกตอนโหลดหน้า Dashboard)
app.post('/api/start_session', async (req, res) => {
    const { UserID, Name } = req.body;
    try {
        const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
        const sql = `INSERT INTO players (UserID, Name, TotalScore, TotalRounds, AverageTime, BestTime, LastPlayed, FastReactions) 
                     VALUES ($1, $2, 0, '0', 0, 0, $3, 0) RETURNING id`;
        const result = await pool.query(sql, [UserID, Name, timestamp]);
        
        activeSessionId = result.rows[0].id;
        activeUser = { UserID, Name };
        res.status(200).json({ message: "Session started", sessionId: activeSessionId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// API: บันทึก Reaction Time ทีละครั้ง (เรียกจาก ESP32)
app.post('/api/record_reaction', async (req, res) => {
    const { reactionTime } = req.body; // เวลาที่ ESP32 ส่งมาเป็นวินาที เช่น 0.52
    
    if (!activeSessionId) {
        return res.status(400).json({ error: "No active session. Please login to dashboard first." });
    }

    try {
        // ดึงข้อมูลเดิมมาคำนวณ
        const playerResult = await pool.query("SELECT * FROM players WHERE id = $1", [activeSessionId]);
        if (playerResult.rows.length === 0) return res.status(404).json({ error: "Session not found" });
        
        let player = playerResult.rows[0];
        
        // คำนวณค่าใหม่
        let rounds = parseInt(player.totalrounds || "0") + 1;
        let best = player.besttime == 0 ? reactionTime : Math.min(player.besttime, reactionTime);
        let avg = ((parseFloat(player.averagetime) || 0) * (rounds - 1) + reactionTime) / rounds;
        
        // คิดคะแนนง่ายๆ (ยิ่งเร็วยิ่งได้เยอะ)
        let scoreAdd = Math.max(0, 1000 - Math.floor(reactionTime * 500));
        let score = (parseFloat(player.totalscore) || 0) + scoreAdd;
        
        let fast = (parseInt(player.fastreactions) || 0) + (reactionTime < 0.5 ? 1 : 0);
        let timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

        // อัปเดตลง Database
        const updateSql = `UPDATE players SET TotalScore = $1, TotalRounds = $2, AverageTime = $3, BestTime = $4, FastReactions = $5, LastPlayed = $6 WHERE id = $7`;
        await pool.query(updateSql, [score, rounds.toString(), avg, best, fast, timestamp, activeSessionId]);

        res.status(200).json({ message: "Reaction recorded", newScore: score, newAvg: avg });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// API: รับข้อมูลจาก ESP32 (โค้ดเก่า)
app.post('/api/save', async (req, res) => {
    const { UserID, Name, TotalScore, TotalRounds, AverageTime, BestTime, LastPlayed, FastReactions } = req.body;
    const timestamp = LastPlayed || new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    const sql = `INSERT INTO players (UserID, Name, TotalScore, TotalRounds, AverageTime, BestTime, LastPlayed, FastReactions) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`;
    
    try {
        const result = await pool.query(sql, [UserID, Name, TotalScore, TotalRounds, AverageTime, BestTime, timestamp, FastReactions]);
        res.status(200).json({ message: "Data saved successfully", id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: err.message });
    }
});

// API: ส่งข้อมูลให้หน้าเว็บ
app.get('/api/data', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM players ORDER BY id DESC LIMIT 50");
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// API: สมัครสมาชิก (Register)
app.post('/api/register', async (req, res) => {
    const { FirstName, LastName, UserID, Password } = req.body;
    try {
        // เช็คว่า UserID นี้มีในระบบหรือยัง
        const userCheck = await pool.query("SELECT * FROM users WHERE UserID = $1", [UserID]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: "UserID นี้ถูกใช้งานแล้ว" });
        }

        // เข้ารหัสรหัสผ่าน
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(Password, salt);

        // บันทึกลงฐานข้อมูล
        await pool.query(
            "INSERT INTO users (UserID, FirstName, LastName, PasswordHash) VALUES ($1, $2, $3, $4)",
            [UserID, FirstName, LastName, hashedPassword]
        );

        res.status(201).json({ message: "สมัครสมาชิกสำเร็จ" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการสมัครสมาชิก" });
    }
});

// API: เข้าสู่ระบบ (Login)
app.post('/api/login', async (req, res) => {
    const { UserID, Password } = req.body;
    try {
        // ค้นหา UserID
        const userResult = await pool.query("SELECT * FROM users WHERE UserID = $1", [UserID]);
        if (userResult.rows.length === 0) {
            return res.status(400).json({ error: "ไม่พบ UserID นี้ในระบบ" });
        }

        const user = userResult.rows[0];

        // ตรวจสอบรหัสผ่าน
        const validPassword = await bcrypt.compare(Password, user.passwordhash); // postgres makes columns lowercase typically
        if (!validPassword) {
            return res.status(400).json({ error: "รหัสผ่านไม่ถูกต้อง" });
        }

        res.status(200).json({ message: "เข้าสู่ระบบสำเร็จ", user: { UserID: user.userid, FirstName: user.firstname, LastName: user.lastname } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการเข้าสู่ระบบ" });
    }
});

// จุดที่แก้ไขสำหรับ Vercel: แยกการ Listen Port
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// สิ่งสำคัญสำหรับ Vercel Serverless Function
module.exports = app;