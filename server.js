// API: บันทึกการกดแต่ละครั้ง (เรียกจาก ESP32)
app.get('/api/record_reaction', async (req, res) => {
    // รับค่าจาก Query String และเช็คความถูกต้อง
    const switchID = req.query.switch;
    const reactionTime = parseFloat(req.query.time);

    // ป้องกันกรณี ESP32 ส่งค่ามาไม่ครบหรือผิดพลาด
    if (!switchID || isNaN(reactionTime)) {
        return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน (ต้องการ switch และ time)" });
    }

    try {
        // 💡 แก้ปัญหา Vercel Serverless รีเซ็ตความจำ
        // ถ้า activeUser หายไป ให้ใช้ชื่อ Guest เล่นแทน ข้อมูลจะได้ถูกบันทึกเข้า Database เสมอ
        let currentUserID = activeUser ? activeUser.UserID : 'GUEST_01';
        let currentUserName = activeUser ? activeUser.Name : 'Guest Player';

        // แปลงเลข Switch เป็นชื่อโหมด
        let reactionMode = 'light';
        if (switchID == '1') reactionMode = 'red';
        else if (switchID == '2') reactionMode = 'yellow';
        else if (switchID == '3') reactionMode = 'green';
        else if (switchID == '4') reactionMode = 'sound';

        const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

        // คำนวณคะแนน
        let score = 1;
        if (reactionTime < 3) score = 10;
        else if (reactionTime < 6) score = 9;
        else if (reactionTime < 9) score = 8;
        else if (reactionTime < 12) score = 7;
        else if (reactionTime < 15) score = 6;
        else if (reactionTime < 18) score = 5;
        else if (reactionTime < 22) score = 4;
        else if (reactionTime < 26) score = 3;
        else if (reactionTime < 30) score = 2;

        // บันทึกลงฐานข้อมูล Supabase
        await pool.query(
            `INSERT INTO players (UserID, Name, AverageTime, BestTime, TotalScore, TotalRounds, Mode, LastPlayed, FastReactions)
             VALUES ($1, $2, $3, $3, $4, '1', $5, $6, 0)`,
            [currentUserID, currentUserName, reactionTime, score, reactionMode, timestamp]
        );

        res.status(200).json({ message: "Reaction recorded", user: currentUserName, score: score });
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: err.message });
    }
});