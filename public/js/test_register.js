require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function testQuery() {
    try {
        await pool.query(
            "INSERT INTO users (UserID, FirstName, LastName, PasswordHash) VALUES ($1, $2, $3, $4)",
            ['test01', 'Test', 'User', 'hashedpass']
        );
        console.log("Success");
    } catch (err) {
        console.error("DB Error:", err);
    } finally {
        pool.end();
    }
}

testQuery();
