const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkTable() {
    try {
        const result = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'users'
            );
        `);
        console.log("Users table exists:", result.rows[0].exists);
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        pool.end();
    }
}

checkTable();
