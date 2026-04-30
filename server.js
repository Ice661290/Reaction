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
let activeUser = null;

// คำนวณคะแนน 1-10 จากเวลากด (ยิ่งเร็วยิ่งดี) ช่วงเวลาที่ใช้ในเกมนี้: ~2-40 วินาที
function calcScore(t) {
    if (t < 3)  return 10;
    if (t < 6)  return 9;
    if (t < 9)  return 8;
    if (t < 12) return 7;
    if (t < 15) return 6;
    if (t < 18) return 5;
    if (t < 22) return 4;
    if (t < 26) return 3;
    if (t < 30) return 2;
    return 1;
}

// API: เซ็ตตัวตนคนเล่น (เรียกตอนโหลดหน้า Dashboard)
app.post('/api/start_session', async (req, res) => {
    const { UserID, Name } = req.body;
    activeUser = { UserID, Name };
    res.status(200).json({ message: "Session ready. Waiting for first reaction." });
});

// API: บันทึกการกดแต่ละครั้ง (เรียกจาก ESP32) -- 1 กด = 1 แถวใน DB
app.post('/api/record_reaction', async (req, res) => {
    const { reactionTime, mode } = req.body;
    
    if (!activeUser) {
        return res.status(400).json({ error: "No active session. Please login to dashboard first." });
    }

    try {
        const reactionMode = mode || 'light';
        const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
        const score = calcScore(reactionTime);

        // แต่ละการกด = 1 แถวใหม่เสมอ (BestTime คำนวณไว้ที่นี่เป็น reactionTime เหมือนกันก่อน, คำนวณจริงจาก Window Function ใน /api/data)
        await pool.query(
            `INSERT INTO players (UserID, Name, AverageTime, BestTime, TotalScore, TotalRounds, Mode, LastPlayed, FastReactions)
             VALUES ($1, $2, $3, $3, $4, '1', $5, $6, 0)`,
            [activeUser.UserID, activeUser.Name, reactionTime, score, reactionMode, timestamp]
        );

        res.status(200).json({ message: "Reaction recorded", score });
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

// API: ส่งข้อมูลให้หน้าเว็บ (กรองเฉพาะ UserID, คำนวณ BestTime ตาม Mode ด้วย Window Function)
app.get('/api/data', async (req, res) => {
    const { userID } = req.query;
    try {
        const baseSelect = `
            SELECT id, userid, name, averagetime, mode, totalscore,
                MIN(CASE WHEN averagetime > 0 THEN averagetime ELSE NULL END)
                    OVER (PARTITION BY userid, mode) AS besttime,
                lastplayed
            FROM players
            WHERE averagetime > 0
        `;
        let result;
        if (userID) {
            result = await pool.query(
                `SELECT * FROM (${baseSelect}) sub WHERE userid = $1 ORDER BY id DESC LIMIT 50`,
                [userID]
            );
        } else {
            result = await pool.query(`${baseSelect} ORDER BY id DESC LIMIT 50`);
        }
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