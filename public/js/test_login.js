require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function testLoginUser() {
    try {
        const UserID = '661234';
        const Password = '123'; // Guessing password
        
        const userResult = await pool.query("SELECT * FROM users WHERE UserID = $1", [UserID]);
        if (userResult.rows.length === 0) {
            console.log("UserID not found");
            return;
        }

        const user = userResult.rows[0];
        console.log("Found User:", user);

        const validPassword = await bcrypt.compare(Password, user.passwordhash);
        console.log("Password is valid:", validPassword);
    } catch (err) {
        console.error("DB Error:", err);
    } finally {
        pool.end();
    }
}

testLoginUser();
