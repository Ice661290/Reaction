require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function addModeColumn() {
    try {
        await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS Mode VARCHAR(10) DEFAULT 'light'`);
        console.log("✅ Added 'Mode' column to players table successfully!");
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        pool.end();
    }
}

addModeColumn();
