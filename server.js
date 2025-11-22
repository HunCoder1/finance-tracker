const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const cors = require('cors'); // Ensure you have run: npm install cors

const app = express();
const db = new sqlite3.Database('./finance.db');

// --- 1. IMPORTANT: CORS CONFIGURATION ---
// This allows the mobile app to talk to the server AND keeps the user logged in
app.use(cors({
    origin: true,       // Reflects the request origin (allows the phone's IP)
    credentials: true,  // Allows cookies/sessions to be sent back and forth
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// --- 2. SERVE DESKTOP WEBSITE ---
app.use(express.json());
app.use(express.static('public')); 

// --- 3. SESSION SETUP ---
app.use(session({
    secret: 'super-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        httpOnly: true, 
        secure: false, // Set to false because we are using HTTP (not HTTPS) on local network
        maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
}));

// --- DB SETUP ---
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY, user_id INTEGER, type TEXT, amount REAL, description TEXT, date TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS debts (id INTEGER PRIMARY KEY, user_id INTEGER, person_name TEXT, amount REAL, direction TEXT, date_borrowed TEXT, date_due TEXT)`);
});

// --- AUTH ROUTES ---
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashed], function(err) {
        if (err) return res.status(400).json({ error: "User exists" });
        res.json({ message: "Success" });
    });
});

app.post('/login', (req, res) => {
    db.get(`SELECT * FROM users WHERE username = ?`, [req.body.username], async (err, user) => {
        if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
            return res.status(400).json({ error: "Invalid credentials" });
        }
        // Save user ID in session
        req.session.userId = user.id;
        req.session.save(); // Force save
        res.json({ message: "Logged in" });
    });
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: "Logged out" });
});

// --- MIDDLEWARE ---
const isAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: "Login required" });
    }
};

// --- DATA ROUTES ---
app.post('/transaction', isAuth, (req, res) => {
    const { type, amount, description, date } = req.body;
    db.run(`INSERT INTO transactions (user_id, type, amount, description, date) VALUES (?,?,?,?,?)`,
        [req.session.userId, type, amount, description, date], () => res.json({ message: "Saved" }));
});

app.get('/transactions', isAuth, (req, res) => {
    db.all(`SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC`, [req.session.userId], (err, rows) => res.json(rows));
});

app.get('/debts', isAuth, (req, res) => {
    db.all(`SELECT * FROM debts WHERE user_id = ?`, [req.session.userId], (err, rows) => res.json(rows));
});

app.post('/debt', isAuth, (req, res) => {
    const { person_name, amount, direction, date_borrowed, date_due } = req.body;
    db.run(`INSERT INTO debts (user_id, person_name, amount, direction, date_borrowed, date_due) VALUES (?,?,?,?,?,?)`,
        [req.session.userId, person_name, amount, direction, date_borrowed, date_due], () => res.json({ message: "Saved" }));
});

app.post('/debt-update', isAuth, (req, res) => {
    const { id, payment_amount } = req.body;
    const userId = req.session.userId;
    db.get(`SELECT * FROM debts WHERE id = ? AND user_id = ?`, [id, userId], (err, debt) => {
        if(err || !debt) return res.status(404).json({error: "Not found"});
        const newAmount = debt.amount - parseFloat(payment_amount);
        if (newAmount <= 0) {
            db.run(`DELETE FROM debts WHERE id = ?`, [id], () => res.json({ message: "Settled" }));
        } else {
            db.run(`UPDATE debts SET amount = ? WHERE id = ?`, [newAmount, id], () => res.json({ message: "Updated" }));
        }
    });
});

app.post('/delete-data', isAuth, (req, res) => {
    const { password } = req.body;
    const userId = req.session.userId;
    db.get('SELECT password FROM users WHERE id = ?', [userId], async (err, row) => {
        if (!row || !(await bcrypt.compare(password, row.password))) return res.status(403).json({ error: "Bad Pass" });
        db.run(`DELETE FROM transactions WHERE user_id = ?`, [userId]);
        db.run(`DELETE FROM debts WHERE user_id = ?`, [userId]);
        res.json({ message: "Wiped" });
    });
});

app.post('/delete-account', isAuth, (req, res) => {
    const { password } = req.body;
    const userId = req.session.userId;
    db.get('SELECT password FROM users WHERE id = ?', [userId], async (err, row) => {
        if (!row || !(await bcrypt.compare(password, row.password))) return res.status(403).json({ error: "Bad Pass" });
        db.run(`DELETE FROM transactions WHERE user_id = ?`, [userId]);
        db.run(`DELETE FROM debts WHERE user_id = ?`, [userId]);
        db.run(`DELETE FROM users WHERE id = ?`, [userId]);
        req.session.destroy();
        res.json({ message: "Deleted" });
    });
});

// Listen on 0.0.0.0 to accept network connections
app.listen(3000, '0.0.0.0', () => console.log("Server running on 0.0.0.0:3000"));