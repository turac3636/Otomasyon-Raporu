const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const { initializeDatabase, queryAll, queryOne, runSql, saveDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'otopark-gizli-anahtar-2024', resave: false, saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

// ==================== AUTH MIDDLEWARE ====================
function requireAuth(req, res, next) {
    if (req.session && req.session.user) return next();
    res.status(401).json({ error: 'Oturum açmanız gerekiyor' });
}
function requireAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'admin') return next();
    res.status(403).json({ error: 'Admin yetkisi gerekiyor' });
}

// ==================== AUTH ROUTES ====================
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = queryOne('SELECT * FROM users WHERE username = ? AND active = 1', [username]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });
    }
    req.session.user = { id: user.id, username: user.username, full_name: user.full_name, role: user.role };
    res.json({ success: true, user: req.session.user });
});

app.post('/api/auth/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/auth/me', requireAuth, (req, res) => { res.json({ user: req.session.user }); });

// ==================== DASHBOARD ====================
app.get('/api/dashboard', requireAuth, (req, res) => {
    const totalCapacity = parseInt(queryOne("SELECT value FROM settings WHERE key = 'total_capacity'")?.value || '200');
    const insideCount = queryOne("SELECT COUNT(*) as count FROM parking_records WHERE status = 'inside'")?.count || 0;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString();
    const todayEntries = queryOne("SELECT COUNT(*) as count FROM parking_records WHERE entry_time >= ?", [todayStr])?.count || 0;
    const todayExits = queryOne("SELECT COUNT(*) as count FROM parking_records WHERE exit_time >= ? AND status = 'exited'", [todayStr])?.count || 0;
    const todayIncome = queryOne("SELECT COALESCE(SUM(total_paid), 0) as total FROM parking_records WHERE exit_time >= ? AND status = 'exited'", [todayStr])?.total || 0;
    const activeSubscribers = queryOne("SELECT COUNT(*) as count FROM subscribers WHERE active = 1 AND end_date >= date('now')")?.count || 0;
    const blacklistCount = queryOne("SELECT COUNT(*) as count FROM blacklist WHERE active = 1")?.count || 0;
    const recentRecords = queryAll(`SELECT pr.*, u.full_name as staff_name FROM parking_records pr LEFT JOIN users u ON pr.processed_by = u.id ORDER BY pr.entry_time DESC LIMIT 10`);

    res.json({
        totalCapacity, insideCount, availableSpots: totalCapacity - insideCount,
        occupancyRate: Math.round((insideCount / totalCapacity) * 100),
        todayEntries, todayExits, todayIncome, activeSubscribers, blacklistCount,
        recentRecords, isFull: insideCount >= totalCapacity
    });
});

// ==================== ARAÇ GİRİŞ ====================
app.post('/api/vehicle/entry', requireAuth, (req, res) => {
    const { plate, entry_type } = req.body;
    const normalizedPlate = plate.toUpperCase().replace(/\s+/g, '');

    const blacklisted = queryOne('SELECT * FROM blacklist WHERE plate = ? AND active = 1', [normalizedPlate]);
    if (blacklisted) return res.status(403).json({ error: `Bu plaka kara listede: ${blacklisted.reason}`, blacklisted: true });

    const alreadyInside = queryOne("SELECT * FROM parking_records WHERE plate = ? AND status = 'inside'", [normalizedPlate]);
    if (alreadyInside) return res.status(400).json({ error: 'Bu plaka zaten otoparkta kayıtlı' });

    const totalCapacity = parseInt(queryOne("SELECT value FROM settings WHERE key = 'total_capacity'")?.value || '200');
    const insideCount = queryOne("SELECT COUNT(*) as count FROM parking_records WHERE status = 'inside'")?.count || 0;
    if (insideCount >= totalCapacity) return res.status(400).json({ error: 'Otopark dolu!', full: true });

    const subscriber = queryOne("SELECT * FROM subscribers WHERE plate = ? AND active = 1 AND end_date >= date('now')", [normalizedPlate]);
    const customerType = subscriber ? 'abone' : 'gecici';
    const ticketNumber = 'TKT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();

    const result = runSql(`INSERT INTO parking_records (plate, entry_type, customer_type, ticket_number, processed_by) VALUES (?, ?, ?, ?, ?)`,
        [normalizedPlate, entry_type || 'manual', customerType, ticketNumber, req.session.user.id]);

    const record = queryOne('SELECT * FROM parking_records WHERE id = ?', [result.lastInsertRowid]);
    res.json({
        success: true, record, isSubscriber: !!subscriber,
        message: subscriber ? `Abone araç girişi: ${subscriber.owner_name}` : 'Geçici müşteri girişi kaydedildi',
        ticketNumber
    });
});

// ==================== ARAÇ ÇIKIŞ ====================
app.post('/api/vehicle/exit', requireAuth, (req, res) => {
    const { plate, payment_method, lost_ticket, exit_type } = req.body;
    const normalizedPlate = plate.toUpperCase().replace(/\s+/g, '');

    const record = queryOne("SELECT * FROM parking_records WHERE plate = ? AND status = 'inside' ORDER BY entry_time DESC LIMIT 1", [normalizedPlate]);
    if (!record) return res.status(404).json({ error: 'Bu plakaya ait aktif park kaydı bulunamadı' });

    const entryTime = new Date(record.entry_time);
    const exitTime = new Date();
    const durationMinutes = Math.max(Math.ceil((exitTime - entryTime) / (1000 * 60)), 1);
    // Araç girer girmez 1. saatten ücretlendirme başlar (1 dk bile olsa 1 saat ücreti)
    const durationHours = Math.max(Math.ceil(durationMinutes / 60), 1);

    let fee = 0, penalty = 0, discount = 0;

    if (record.customer_type === 'abone') {
        fee = 0; discount = 100;
    } else {
        const dayOfWeek = exitTime.getDay();
        const hour = exitTime.getHours();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        let pricing;
        if (isWeekend) pricing = queryOne("SELECT * FROM pricing WHERE is_weekend_rate = 1 AND active = 1");
        if (!pricing && (hour >= 22 || hour < 6)) pricing = queryOne("SELECT * FROM pricing WHERE is_night_rate = 1 AND active = 1");
        if (!pricing) pricing = queryOne("SELECT * FROM pricing WHERE is_weekend_rate = 0 AND is_night_rate = 0 AND active = 1");
        if (!pricing) pricing = { price_per_hour: 30, max_daily: 200 };

        // Ücret = saat sayısı × saatlik ücret (en az 1 saat)
        fee = durationHours * pricing.price_per_hour;
        if (pricing.max_daily && fee > pricing.max_daily) fee = pricing.max_daily;

        if (lost_ticket) {
            const penaltySettings = queryOne('SELECT * FROM penalty_settings LIMIT 1');
            penalty = penaltySettings ? penaltySettings.lost_ticket_fee : 50;
        }
    }

    const totalPaid = Math.max(fee + penalty - discount, 0);
    const status = lost_ticket ? 'lost_ticket' : 'exited';

    runSql(`UPDATE parking_records SET exit_time = ?, exit_type = ?, duration_minutes = ?, fee = ?,
        discount = ?, penalty = ?, total_paid = ?, payment_method = ?, status = ?, processed_by = ? WHERE id = ?`,
        [exitTime.toISOString(), exit_type || 'manual', durationMinutes, fee, discount, penalty, totalPaid,
        payment_method || 'nakit', status, req.session.user.id, record.id]);

    const receiptNumber = 'RCP-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();
    runSql(`INSERT INTO payments (parking_record_id, amount, payment_method, payment_type, receipt_number, processed_by) VALUES (?, ?, ?, ?, ?, ?)`,
        [record.id, totalPaid, payment_method || 'nakit', lost_ticket ? 'lost_ticket' : 'parking', receiptNumber, req.session.user.id]);

    const activeShift = queryOne("SELECT * FROM shifts WHERE user_id = ? AND status = 'active'", [req.session.user.id]);
    if (activeShift) {
        runSql('UPDATE shifts SET total_income = total_income + ?, total_vehicles = total_vehicles + 1 WHERE id = ?', [totalPaid, activeShift.id]);
    }

    const updatedRecord = queryOne('SELECT * FROM parking_records WHERE id = ?', [record.id]);
    res.json({ success: true, record: updatedRecord, durationMinutes, durationHours, fee, penalty, discount, totalPaid, receiptNumber, paymentMethod: payment_method || 'nakit' });
});

// ==================== ARAÇLAR ====================
app.get('/api/vehicles/inside', requireAuth, (req, res) => {
    const vehicles = queryAll(`SELECT pr.*, s.owner_name as subscriber_name FROM parking_records pr LEFT JOIN subscribers s ON pr.plate = s.plate AND s.active = 1 WHERE pr.status = 'inside' ORDER BY pr.entry_time DESC`);
    res.json({ vehicles });
});

// ==================== KAYITLAR ====================
app.get('/api/records', requireAuth, (req, res) => {
    const { start_date, end_date, plate, status } = req.query;
    let query = `SELECT pr.*, u.full_name as staff_name FROM parking_records pr LEFT JOIN users u ON pr.processed_by = u.id WHERE 1=1`;
    const params = [];
    if (start_date) { query += ' AND pr.entry_time >= ?'; params.push(start_date); }
    if (end_date) { query += ' AND pr.entry_time <= ?'; params.push(end_date + 'T23:59:59'); }
    if (plate) { query += ' AND pr.plate LIKE ?'; params.push('%' + plate.toUpperCase() + '%'); }
    if (status) { query += ' AND pr.status = ?'; params.push(status); }
    query += ' ORDER BY pr.entry_time DESC LIMIT 500';
    res.json({ records: queryAll(query, params) });
});

// ==================== ABONELER ====================
app.get('/api/subscribers', requireAuth, (req, res) => {
    res.json({ subscribers: queryAll('SELECT * FROM subscribers ORDER BY created_at DESC'), pricing: queryAll('SELECT * FROM subscription_pricing') });
});

app.post('/api/subscribers', requireAuth, (req, res) => {
    const { plate, owner_name, phone, email, subscription_type } = req.body;
    const normalizedPlate = plate.toUpperCase().replace(/\s+/g, '');
    if (queryOne('SELECT * FROM subscribers WHERE plate = ?', [normalizedPlate])) return res.status(400).json({ error: 'Bu plaka ile zaten bir abonelik var' });
    const startDate = new Date().toISOString().split('T')[0];
    const months = subscription_type === 'aylik' ? 1 : subscription_type === '6aylik' ? 6 : 12;
    const end = new Date(); end.setMonth(end.getMonth() + months);
    runSql('INSERT INTO subscribers (plate, owner_name, phone, email, subscription_type, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [normalizedPlate, owner_name, phone || '', email || '', subscription_type, startDate, end.toISOString().split('T')[0]]);
    res.json({ success: true, message: 'Abonelik oluşturuldu' });
});

app.put('/api/subscribers/:id', requireAuth, (req, res) => {
    const { owner_name, phone, email, subscription_type, active } = req.body;
    if (active !== undefined) { runSql('UPDATE subscribers SET active = ? WHERE id = ?', [active ? 1 : 0, req.params.id]); }
    else {
        const months = subscription_type === 'aylik' ? 1 : subscription_type === '6aylik' ? 6 : 12;
        const end = new Date(); end.setMonth(end.getMonth() + months);
        runSql('UPDATE subscribers SET owner_name=?, phone=?, email=?, subscription_type=?, end_date=? WHERE id=?',
            [owner_name, phone, email, subscription_type, end.toISOString().split('T')[0], req.params.id]);
    }
    res.json({ success: true });
});

app.delete('/api/subscribers/:id', requireAdmin, (req, res) => { runSql('DELETE FROM subscribers WHERE id = ?', [req.params.id]); res.json({ success: true }); });

// ==================== KARA LİSTE ====================
app.get('/api/blacklist', requireAuth, (req, res) => { res.json({ list: queryAll('SELECT * FROM blacklist ORDER BY added_at DESC') }); });

app.post('/api/blacklist', requireAuth, (req, res) => {
    const { plate, reason } = req.body;
    const np = plate.toUpperCase().replace(/\s+/g, '');
    if (queryOne('SELECT * FROM blacklist WHERE plate = ?', [np])) return res.status(400).json({ error: 'Bu plaka zaten kara listede' });
    runSql('INSERT INTO blacklist (plate, reason, added_by) VALUES (?, ?, ?)', [np, reason, req.session.user.full_name]);
    res.json({ success: true });
});

app.delete('/api/blacklist/:id', requireAuth, (req, res) => { runSql('DELETE FROM blacklist WHERE id = ?', [req.params.id]); res.json({ success: true }); });

// ==================== FİYATLANDIRMA ====================
app.get('/api/pricing', requireAuth, (req, res) => {
    res.json({ pricing: queryAll('SELECT * FROM pricing ORDER BY id'), subscriptionPricing: queryAll('SELECT * FROM subscription_pricing ORDER BY id'), penalties: queryOne('SELECT * FROM penalty_settings LIMIT 1') });
});

app.put('/api/pricing/:id', requireAdmin, (req, res) => {
    const { name, price_per_hour, min_charge, max_daily } = req.body;
    runSql('UPDATE pricing SET name=?, price_per_hour=?, min_charge=?, max_daily=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [name, price_per_hour, min_charge, max_daily, req.params.id]);
    res.json({ success: true });
});

app.put('/api/pricing/subscription/:id', requireAdmin, (req, res) => {
    runSql('UPDATE subscription_pricing SET price=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [req.body.price, req.params.id]);
    res.json({ success: true });
});

app.put('/api/pricing/penalties', requireAdmin, (req, res) => {
    runSql('UPDATE penalty_settings SET lost_ticket_fee=?, unrecognized_plate_fee=?, updated_at=CURRENT_TIMESTAMP', [req.body.lost_ticket_fee, req.body.unrecognized_plate_fee]);
    res.json({ success: true });
});

// ==================== VARDİYA ====================
app.get('/api/shifts', requireAuth, (req, res) => {
    let shifts;
    if (req.session.user.role === 'admin') {
        shifts = queryAll('SELECT s.*, u.full_name, u.username FROM shifts s JOIN users u ON s.user_id = u.id ORDER BY s.start_time DESC LIMIT 50');
    } else {
        shifts = queryAll('SELECT s.*, u.full_name, u.username FROM shifts s JOIN users u ON s.user_id = u.id WHERE s.user_id = ? ORDER BY s.start_time DESC LIMIT 50', [req.session.user.id]);
    }
    const activeShift = queryOne("SELECT * FROM shifts WHERE user_id = ? AND status = 'active'", [req.session.user.id]);
    res.json({ shifts, activeShift });
});

app.post('/api/shifts/start', requireAuth, (req, res) => {
    if (queryOne("SELECT * FROM shifts WHERE user_id = ? AND status = 'active'", [req.session.user.id])) return res.status(400).json({ error: 'Zaten aktif vardiya var' });
    runSql('INSERT INTO shifts (user_id, opening_cash) VALUES (?, ?)', [req.session.user.id, req.body.opening_cash || 0]);
    res.json({ success: true, message: 'Vardiya başlatıldı' });
});

app.post('/api/shifts/end', requireAuth, (req, res) => {
    const shift = queryOne("SELECT * FROM shifts WHERE user_id = ? AND status = 'active'", [req.session.user.id]);
    if (!shift) return res.status(400).json({ error: 'Aktif vardiya bulunamadı' });
    runSql("UPDATE shifts SET end_time=CURRENT_TIMESTAMP, closing_cash=?, notes=?, status='closed' WHERE id=?", [req.body.closing_cash || 0, req.body.notes || '', shift.id]);
    res.json({ success: true, shift: queryOne('SELECT s.*, u.full_name FROM shifts s JOIN users u ON s.user_id = u.id WHERE s.id = ?', [shift.id]) });
});

// ==================== KULLANICILAR ====================
app.get('/api/users', requireAdmin, (req, res) => { res.json({ users: queryAll('SELECT id, username, full_name, role, active, created_at FROM users ORDER BY id') }); });

app.post('/api/users', requireAdmin, (req, res) => {
    const { username, password, full_name, role } = req.body;
    if (queryOne('SELECT * FROM users WHERE username = ?', [username])) return res.status(400).json({ error: 'Bu kullanıcı adı mevcut' });
    runSql('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)', [username, bcrypt.hashSync(password, 10), full_name, role]);
    res.json({ success: true });
});

app.put('/api/users/:id', requireAdmin, (req, res) => {
    const { full_name, role, active, password } = req.body;
    if (password) runSql('UPDATE users SET full_name=?, role=?, active=?, password=? WHERE id=?', [full_name, role, active ? 1 : 0, bcrypt.hashSync(password, 10), req.params.id]);
    else runSql('UPDATE users SET full_name=?, role=?, active=? WHERE id=?', [full_name, role, active ? 1 : 0, req.params.id]);
    res.json({ success: true });
});

// ==================== RAPORLAR ====================
app.get('/api/reports/daily', requireAuth, (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const nextDate = new Date(date); nextDate.setDate(nextDate.getDate() + 1);
    const nd = nextDate.toISOString().split('T')[0];
    res.json({
        date,
        totalEntries: queryOne("SELECT COUNT(*) as c FROM parking_records WHERE entry_time >= ? AND entry_time < ?", [date, nd])?.c || 0,
        totalExits: queryOne("SELECT COUNT(*) as c FROM parking_records WHERE exit_time >= ? AND exit_time < ? AND status IN ('exited','lost_ticket')", [date, nd])?.c || 0,
        totalIncome: queryOne("SELECT COALESCE(SUM(total_paid),0) as t FROM parking_records WHERE exit_time >= ? AND exit_time < ? AND status IN ('exited','lost_ticket')", [date, nd])?.t || 0,
        avgDuration: Math.round(queryOne("SELECT COALESCE(AVG(duration_minutes),0) as a FROM parking_records WHERE exit_time >= ? AND exit_time < ? AND status IN ('exited','lost_ticket')", [date, nd])?.a || 0),
        byPaymentMethod: queryAll("SELECT payment_method, COUNT(*) as count, SUM(total_paid) as total FROM parking_records WHERE exit_time >= ? AND exit_time < ? AND status IN ('exited','lost_ticket') GROUP BY payment_method", [date, nd]),
        byCustomerType: queryAll("SELECT customer_type, COUNT(*) as count FROM parking_records WHERE entry_time >= ? AND entry_time < ? GROUP BY customer_type", [date, nd]),
        hourlyEntries: queryAll("SELECT strftime('%H', entry_time) as hour, COUNT(*) as count FROM parking_records WHERE entry_time >= ? AND entry_time < ? GROUP BY strftime('%H', entry_time) ORDER BY hour", [date, nd])
    });
});

app.get('/api/reports/monthly', requireAuth, (req, res) => {
    const targetYear = req.query.year || new Date().getFullYear();
    const targetMonth = req.query.month || (new Date().getMonth() + 1);
    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const endMonth = parseInt(targetMonth) === 12 ? 1 : parseInt(targetMonth) + 1;
    const endYear = parseInt(targetMonth) === 12 ? parseInt(targetYear) + 1 : parseInt(targetYear);
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
    res.json({
        year: targetYear, month: targetMonth,
        dailyStats: queryAll("SELECT date(entry_time) as day, COUNT(*) as entries, COALESCE(SUM(CASE WHEN status IN ('exited','lost_ticket') THEN total_paid ELSE 0 END),0) as income FROM parking_records WHERE entry_time >= ? AND entry_time < ? GROUP BY date(entry_time) ORDER BY day", [startDate, endDate]),
        totalIncome: queryOne("SELECT COALESCE(SUM(total_paid),0) as t FROM parking_records WHERE exit_time >= ? AND exit_time < ? AND status IN ('exited','lost_ticket')", [startDate, endDate])?.t || 0,
        totalVehicles: queryOne("SELECT COUNT(*) as c FROM parking_records WHERE entry_time >= ? AND entry_time < ?", [startDate, endDate])?.c || 0
    });
});

// ==================== AYARLAR ====================
app.get('/api/settings', requireAuth, (req, res) => {
    const settings = queryAll('SELECT * FROM settings');
    const obj = {}; settings.forEach(s => obj[s.key] = s.value);
    res.json({ settings: obj });
});

app.put('/api/settings', requireAdmin, (req, res) => {
    Object.entries(req.body).forEach(([key, value]) => runSql('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [key, value]));
    res.json({ success: true });
});

// ==================== PTS ====================
app.post('/api/pts/recognize', requireAuth, (req, res) => {
    const plates = ['34ABC123', '06DEF456', '35GHI789', '16JKL012', '41MNO345', '07PQR678'];
    res.json({ plate: plates[Math.floor(Math.random() * plates.length)], confidence: parseFloat((85 + Math.random() * 15).toFixed(1)), timestamp: new Date().toISOString() });
});

// ==================== İSTATİSTİKLER ====================
app.get('/api/statistics', requireAuth, (req, res) => {
    const last7days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const ds = d.toISOString().split('T')[0];
        const nd = new Date(d); nd.setDate(nd.getDate() + 1);
        const nds = nd.toISOString().split('T')[0];
        last7days.push({
            date: ds, day: d.toLocaleDateString('tr-TR', { weekday: 'short' }),
            entries: queryOne("SELECT COUNT(*) as c FROM parking_records WHERE entry_time >= ? AND entry_time < ?", [ds, nds])?.c || 0,
            income: queryOne("SELECT COALESCE(SUM(total_paid),0) as t FROM parking_records WHERE exit_time >= ? AND exit_time < ? AND status IN ('exited','lost_ticket')", [ds, nds])?.t || 0
        });
    }
    res.json({
        last7days,
        peakHours: queryAll("SELECT strftime('%H', entry_time) as hour, COUNT(*) as count FROM parking_records GROUP BY strftime('%H', entry_time) ORDER BY count DESC LIMIT 5"),
        avgStayMinutes: Math.round(queryOne("SELECT COALESCE(AVG(duration_minutes),0) as a FROM parking_records WHERE status IN ('exited','lost_ticket')")?.a || 0),
        totalRevenue: queryOne("SELECT COALESCE(SUM(total_paid),0) as t FROM parking_records WHERE status IN ('exited','lost_ticket')")?.t || 0,
        totalVehicles: queryOne("SELECT COUNT(*) as c FROM parking_records")?.c || 0
    });
});

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

// ==================== START ====================
async function start() {
    await initializeDatabase();
    app.listen(PORT, () => {
        console.log(`\n🅿️  Otopark Otomasyon Sistemi`);
        console.log(`   http://localhost:${PORT}`);
        console.log(`\n   Admin: admin / admin123`);
        console.log(`   Kasiyer: kasiyer / kasiyer123\n`);
    });
}
start();

process.on('SIGINT', () => { saveDb(); process.exit(); });
process.on('SIGTERM', () => { saveDb(); process.exit(); });
