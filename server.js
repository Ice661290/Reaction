// API: บันทึกการกดแต่ละครั้ง (เรียกจาก ESP32) -- เปลี่ยนจาก app.post เป็น app.get
app.get('/api/record_reaction', async (req, res) => {
    // รับค่าจาก Query String (?switch=1&time=1.234)
    const switchID = req.query.switch;
    const reactionTime = parseFloat(req.query.time);

    if (!activeUser) {
        return res.status(400).json({ error: "No active session. Please login to dashboard first." });
    }

    try {
        // แปลงเลข Switch เป็นชื่อโหมด
        let reactionMode = 'light';
        if (switchID == '1') reactionMode = 'red';
        else if (switchID == '2') reactionMode = 'yellow';
        else if (switchID == '3') reactionMode = 'green';
        else if (switchID == '4') reactionMode = 'sound';

        const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
        const score = calcScore(reactionTime);

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