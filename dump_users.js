require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function dumpUsers() {
    try {
        const result = await pool.query("SELECT * FROM users");
        console.log(result.rows);
    } catch (err) {
        console.error("DB Error:", err);
    } finally {
        pool.end();
    }
}

dumpUsers();
