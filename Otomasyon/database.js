const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'otopark.db');
let db = null;

async function getDb() {
    if (db) return db;
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
        const buf = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buf);
    } else {
        db = new SQL.Database();
    }
    db.run('PRAGMA foreign_keys = ON');
    return db;
}

function saveDb() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}

// Auto-save every 30 seconds
setInterval(saveDb, 30000);

async function initializeDatabase() {
    const d = await getDb();

    d.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL, full_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'kasiyer')),
        active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    d.run(`CREATE TABLE IF NOT EXISTS subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT, plate TEXT UNIQUE NOT NULL,
        owner_name TEXT NOT NULL, phone TEXT, email TEXT,
        subscription_type TEXT NOT NULL CHECK(subscription_type IN ('aylik', 'yillik', '6aylik')),
        start_date DATE NOT NULL, end_date DATE NOT NULL,
        active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    d.run(`CREATE TABLE IF NOT EXISTS blacklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT, plate TEXT UNIQUE NOT NULL,
        reason TEXT NOT NULL, added_by TEXT NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP, active INTEGER DEFAULT 1
    )`);

    d.run(`CREATE TABLE IF NOT EXISTS parking_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT, plate TEXT NOT NULL,
        entry_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        exit_time DATETIME, entry_type TEXT NOT NULL CHECK(entry_type IN ('manual', 'pts')),
        exit_type TEXT CHECK(exit_type IN ('manual', 'pts')),
        customer_type TEXT NOT NULL CHECK(customer_type IN ('abone', 'gecici')),
        ticket_number TEXT UNIQUE, status TEXT DEFAULT 'inside' CHECK(status IN ('inside', 'exited', 'lost_ticket')),
        duration_minutes INTEGER, fee REAL DEFAULT 0, discount REAL DEFAULT 0,
        penalty REAL DEFAULT 0, total_paid REAL DEFAULT 0,
        payment_method TEXT CHECK(payment_method IN ('nakit', 'kredi_karti', 'temassiz', 'abone')),
        processed_by INTEGER, notes TEXT,
        FOREIGN KEY (processed_by) REFERENCES users(id)
    )`);

    d.run(`CREATE TABLE IF NOT EXISTS pricing (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        price_per_hour REAL NOT NULL, min_charge REAL NOT NULL DEFAULT 0,
        max_daily REAL, is_weekend_rate INTEGER DEFAULT 0,
        is_night_rate INTEGER DEFAULT 0, night_start_hour INTEGER DEFAULT 22,
        night_end_hour INTEGER DEFAULT 6, active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    d.run(`CREATE TABLE IF NOT EXISTS subscription_pricing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT UNIQUE NOT NULL CHECK(type IN ('aylik', '6aylik', 'yillik')),
        price REAL NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    d.run(`CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, parking_record_id INTEGER,
        amount REAL NOT NULL, payment_method TEXT NOT NULL,
        payment_type TEXT NOT NULL CHECK(payment_type IN ('parking', 'subscription', 'penalty', 'lost_ticket')),
        receipt_number TEXT UNIQUE, processed_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parking_record_id) REFERENCES parking_records(id),
        FOREIGN KEY (processed_by) REFERENCES users(id)
    )`);

    d.run(`CREATE TABLE IF NOT EXISTS shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
        start_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        end_time DATETIME, opening_cash REAL DEFAULT 0,
        closing_cash REAL, total_income REAL DEFAULT 0,
        total_vehicles INTEGER DEFAULT 0, notes TEXT,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'closed')),
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    d.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    d.run(`CREATE TABLE IF NOT EXISTS penalty_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lost_ticket_fee REAL DEFAULT 50.0,
        unrecognized_plate_fee REAL DEFAULT 100.0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // ========== Varsayılan veriler ==========
    const adminCheck = d.exec('SELECT COUNT(*) as count FROM users WHERE role = ?', ['admin']);
    if (adminCheck[0] && adminCheck[0].values[0][0] === 0) {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        d.run('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)',
            ['admin', hashedPassword, 'Sistem Yöneticisi', 'admin']);
        console.log('✅ Varsayılan admin: admin / admin123');
    }

    const kasiyerCheck = d.exec('SELECT COUNT(*) as count FROM users WHERE role = ?', ['kasiyer']);
    if (kasiyerCheck[0] && kasiyerCheck[0].values[0][0] === 0) {
        const hashedPassword = bcrypt.hashSync('kasiyer123', 10);
        d.run('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)',
            ['kasiyer', hashedPassword, 'Personel 1', 'kasiyer']);
        console.log('✅ Varsayılan kasiyer: kasiyer / kasiyer123');
    }

    const pricingCheck = d.exec('SELECT COUNT(*) as count FROM pricing');
    if (pricingCheck[0] && pricingCheck[0].values[0][0] === 0) {
        d.run('INSERT INTO pricing (name, price_per_hour, min_charge, max_daily, is_weekend_rate, is_night_rate) VALUES (?, ?, ?, ?, ?, ?)',
            ['Standart Tarife', 30.0, 15.0, 200.0, 0, 0]);
        d.run('INSERT INTO pricing (name, price_per_hour, min_charge, max_daily, is_weekend_rate, is_night_rate) VALUES (?, ?, ?, ?, ?, ?)',
            ['Hafta Sonu Tarife', 40.0, 20.0, 250.0, 1, 0]);
        d.run('INSERT INTO pricing (name, price_per_hour, min_charge, max_daily, is_weekend_rate, is_night_rate) VALUES (?, ?, ?, ?, ?, ?)',
            ['Gece Tarife', 20.0, 10.0, 150.0, 0, 1]);
    }

    const subPricingCheck = d.exec('SELECT COUNT(*) as count FROM subscription_pricing');
    if (subPricingCheck[0] && subPricingCheck[0].values[0][0] === 0) {
        d.run('INSERT INTO subscription_pricing (type, price) VALUES (?, ?)', ['aylik', 1500.0]);
        d.run('INSERT INTO subscription_pricing (type, price) VALUES (?, ?)', ['6aylik', 7500.0]);
        d.run('INSERT INTO subscription_pricing (type, price) VALUES (?, ?)', ['yillik', 13000.0]);
    }

    const settingsCheck = d.exec('SELECT COUNT(*) as count FROM settings');
    if (settingsCheck[0] && settingsCheck[0].values[0][0] === 0) {
        const defaults = [
            ['total_capacity', '200'], ['parking_name', 'AkıllıPark Otopark Yönetim Sistemi'],
            ['address', 'İstanbul, Türkiye'], ['phone', '+90 212 555 00 00'],
            ['tax_id', '1234567890'], ['receipt_footer', 'Bizi tercih ettiğiniz için teşekkür ederiz!']
        ];
        defaults.forEach(([key, value]) => d.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]));
    }

    const penaltyCheck = d.exec('SELECT COUNT(*) as count FROM penalty_settings');
    if (penaltyCheck[0] && penaltyCheck[0].values[0][0] === 0) {
        d.run('INSERT INTO penalty_settings (lost_ticket_fee, unrecognized_plate_fee) VALUES (?, ?)', [50.0, 100.0]);
    }

    saveDb();
    console.log('✅ Veritabanı başarıyla başlatıldı');
    return d;
}

// Helper: convert sql.js result to object array
function queryAll(sql, params = []) {
    const result = db.exec(sql, params);
    if (!result.length) return [];
    const cols = result[0].columns;
    return result[0].values.map(row => {
        const obj = {};
        cols.forEach((c, i) => obj[c] = row[i]);
        return obj;
    });
}

function queryOne(sql, params = []) {
    const rows = queryAll(sql, params);
    return rows.length > 0 ? rows[0] : null;
}

function runSql(sql, params = []) {
    db.run(sql, params);
    saveDb();
    return { lastInsertRowid: queryOne('SELECT last_insert_rowid() as id')?.id, changes: db.getRowsModified() };
}

module.exports = { getDb, initializeDatabase, queryAll, queryOne, runSql, saveDb };
