// ==================== GLOBAL STATE ====================
let currentUser = null;
let currentPage = 'dashboard';

// ==================== API HELPER ====================
async function api(url, options = {}) {
    try {
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Bir hata oluştu');
        return data;
    } catch (e) {
        showToast(e.message, 'error');
        throw e;
    }
}

// ==================== TOAST ====================
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    toast.onclick = () => toast.remove();
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ==================== AUTH ====================
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const data = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                username: document.getElementById('loginUsername').value,
                password: document.getElementById('loginPassword').value
            })
        });
        currentUser = data.user;
        showApp();
        showToast(`Hoş geldiniz, ${currentUser.full_name}!`, 'success');
    } catch (e) { }
});

async function checkAuth() {
    try {
        const data = await api('/api/auth/me');
        currentUser = data.user;
        showApp();
    } catch (e) {
        showLogin();
    }
}

async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    showLogin();
}

function showLogin() {
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('appLayout').classList.add('hidden');
}

function showApp() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('appLayout').classList.remove('hidden');
    document.getElementById('userName').textContent = currentUser.full_name;
    document.getElementById('userRole').textContent = currentUser.role === 'admin' ? 'Yönetici' : 'Kasiyer';
    document.getElementById('userAvatar').textContent = currentUser.full_name.charAt(0).toUpperCase();
    // Hide admin-only items for cashiers
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = currentUser.role === 'admin' ? '' : 'none';
    });
    navigateTo('dashboard');
}

// ==================== NAVIGATION ====================
document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
});

function navigateTo(page) {
    currentPage = page;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
    const mc = document.getElementById('mainContent');
    const renderers = {
        dashboard: renderDashboard, entry: renderEntry, exit: renderExit,
        vehicles: renderVehicles, subscribers: renderSubscribers, blacklist: renderBlacklist,
        pricing: renderPricing, shifts: renderShifts, records: renderRecords,
        reports: renderReports, statistics: renderStatistics, users: renderUsers,
        settings: renderSettings
    };
    (renderers[page] || renderDashboard)(mc);
}

// ==================== FORMAT HELPERS ====================
function formatDate(d) { return d ? new Date(d).toLocaleString('tr-TR') : '-'; }
function formatMoney(n) { return (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺'; }
function formatDuration(m) {
    if (!m) return '-';
    const h = Math.floor(m / 60), min = m % 60;
    return h > 0 ? `${h}s ${min}dk` : `${min}dk`;
}
function plateHtml(p) { return `<span class="plate-display">${p}</span>`; }
function statusBadge(s) {
    const map = { inside: ['badge-blue', '🔵 İçeride'], exited: ['badge-green', '✅ Çıkış'], lost_ticket: ['badge-red', '🎫 Kayıp Bilet'] };
    const [cls, txt] = map[s] || ['badge-yellow', s];
    return `<span class="badge ${cls}">${txt}</span>`;
}
function typeBadge(t) {
    return t === 'abone' ? '<span class="badge badge-purple">⭐ Abone</span>' : '<span class="badge badge-cyan">🎫 Geçici</span>';
}

// ==================== DASHBOARD ====================
async function renderDashboard(mc) {
    mc.innerHTML = '<div class="text-center mt-3"><p>Yükleniyor...</p></div>';
    try {
        const d = await api('/api/dashboard');
        document.getElementById('insideCountBadge').textContent = d.insideCount;
        const occClass = d.occupancyRate < 60 ? 'low' : d.occupancyRate < 85 ? 'medium' : 'high';
        const occStatus = d.occupancyRate < 60 ? 'available' : d.occupancyRate < 85 ? 'busy' : 'full';
        const occLabel = d.occupancyRate < 60 ? 'BOŞ YER VAR' : d.occupancyRate < 85 ? 'YOĞUN' : 'DOLU';
        mc.innerHTML = `
            <div class="page-header">
                <div><h1>📊 Dashboard</h1><p class="subtitle">Otopark genel durumu - ${new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p></div>
                <button class="btn btn-secondary btn-sm" onclick="navigateTo('dashboard')">🔄 Yenile</button>
            </div>
            <div class="stats-grid">
                <div class="stat-card blue"><div class="stat-icon">🚗</div><div class="stat-value">${d.insideCount}</div><div class="stat-label">İçerideki Araç</div></div>
                <div class="stat-card green"><div class="stat-icon">🅿️</div><div class="stat-value">${d.availableSpots}</div><div class="stat-label">Boş Alan</div></div>
                <div class="stat-card purple"><div class="stat-icon">📥</div><div class="stat-value">${d.todayEntries}</div><div class="stat-label">Bugünkü Giriş</div></div>
                <div class="stat-card cyan"><div class="stat-icon">📤</div><div class="stat-value">${d.todayExits}</div><div class="stat-label">Bugünkü Çıkış</div></div>
                <div class="stat-card orange"><div class="stat-icon">💰</div><div class="stat-value">${formatMoney(d.todayIncome)}</div><div class="stat-label">Bugünkü Gelir</div></div>
                <div class="stat-card red"><div class="stat-icon">⭐</div><div class="stat-value">${d.activeSubscribers}</div><div class="stat-label">Aktif Abone</div></div>
            </div>
            <div class="occupancy-section">
                <div class="occupancy-header">
                    <h3>🏢 Doluluk Oranı</h3>
                    <div class="flex items-center gap-2">
                        <span class="occupancy-status ${occStatus}"><span class="pulse-dot ${occClass === 'low' ? 'green' : occClass === 'medium' ? 'yellow' : 'red'}"></span> ${occLabel}</span>
                        <div class="parking-sign ${d.isFull ? 'full' : 'open'}" style="width:120px;padding:10px">
                            <div class="sign-text" style="font-size:0.9rem">${d.isFull ? 'DOLU' : 'BOŞ'}</div>
                            <div class="sign-count" style="font-size:1.5rem">${d.availableSpots}</div>
                            <div class="sign-label">Boş Yer</div>
                        </div>
                    </div>
                </div>
                <div class="occupancy-bar-container">
                    <div class="occupancy-bar-fill ${occClass}" style="width:${d.occupancyRate}%"></div>
                </div>
                <div class="occupancy-info">
                    <span>Dolu: ${d.insideCount} / ${d.totalCapacity}</span>
                    <span>%${d.occupancyRate} Doluluk</span>
                </div>
            </div>
            <div class="grid-2">
                <div class="card">
                    <div class="card-header"><h3>🚦 Bariyer Durumu</h3></div>
                    <div class="card-body">
                        <div class="barrier-container">
                            <div class="barrier"><div class="barrier-post"><div class="barrier-arm" id="entryBarrier"></div></div><div class="barrier-label">GİRİŞ</div></div>
                            <div class="barrier"><div class="barrier-post"><div class="barrier-arm" id="exitBarrier"></div></div><div class="barrier-label">ÇIKIŞ</div></div>
                        </div>
                        <div class="flex justify-between mt-2">
                            <button class="btn btn-success btn-sm" onclick="toggleBarrier('entry')">Giriş Bariyeri</button>
                            <button class="btn btn-primary btn-sm" onclick="toggleBarrier('exit')">Çıkış Bariyeri</button>
                        </div>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header"><h3>📋 Son İşlemler</h3></div>
                    <div class="card-body" style="max-height:280px;overflow-y:auto">
                        <table><thead><tr><th>Plaka</th><th>Giriş</th><th>Durum</th></tr></thead>
                        <tbody>${d.recentRecords.map(r => `<tr><td>${plateHtml(r.plate)}</td><td class="text-sm">${formatDate(r.entry_time)}</td><td>${statusBadge(r.status)}</td></tr>`).join('')}
                        ${d.recentRecords.length === 0 ? '<tr><td colspan="3" class="text-center text-muted">Kayıt yok</td></tr>' : ''}
                        </tbody></table>
                    </div>
                </div>
            </div>`;
    } catch (e) { mc.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><p>Dashboard yüklenemedi</p></div>'; }
}

function toggleBarrier(type) {
    const el = document.getElementById(type === 'entry' ? 'entryBarrier' : 'exitBarrier');
    el.classList.toggle('open');
    showToast(`${type === 'entry' ? 'Giriş' : 'Çıkış'} bariyeri ${el.classList.contains('open') ? 'açıldı' : 'kapandı'}`, 'info');
}

// ==================== ARAÇ GİRİŞ ====================
function renderEntry(mc) {
    mc.innerHTML = `
        <div class="page-header"><div><h1>🚗 Araç Giriş</h1><p class="subtitle">Yeni araç girişi kaydet</p></div></div>
        <div class="grid-2">
            <div class="card">
                <div class="card-header"><h3>📝 Manuel Giriş</h3></div>
                <div class="card-body">
                    <div class="form-group"><label>Plaka</label><input type="text" id="entryPlate" placeholder="34 ABC 123" style="text-transform:uppercase;font-size:1.2rem;font-weight:700;letter-spacing:2px"></div>
                    <button class="btn btn-success btn-block btn-lg" onclick="vehicleEntry('manual')">🚗 Girişi Kaydet</button>
                </div>
            </div>
            <div class="card">
                <div class="card-header"><h3>📷 PTS ile Giriş (Simülasyon)</h3></div>
                <div class="card-body">
                    <div class="text-center mb-2">
                        <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:30px;margin-bottom:16px">
                            <div style="font-size:3rem">📷</div>
                            <p class="text-muted text-sm mt-1">Kamera görüntüsü simülasyonu</p>
                            <div id="ptsResult" class="mt-2" style="font-size:1.3rem;font-weight:700;min-height:30px"></div>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-block" onclick="ptsRecognize('entry')">📸 Plaka Tanıma Başlat</button>
                    <button class="btn btn-success btn-block mt-1" id="ptsEntryBtn" style="display:none" onclick="vehicleEntry('pts')">✅ Bu Plaka ile Giriş Yap</button>
                </div>
            </div>
        </div>
        <div class="card mt-2" id="entryResult" style="display:none">
            <div class="card-header"><h3>✅ Giriş Bilgisi</h3></div>
            <div class="card-body" id="entryResultBody"></div>
        </div>`;
}

async function ptsRecognize(mode) {
    try {
        const data = await api('/api/pts/recognize', { method: 'POST' });
        const el = document.getElementById('ptsResult');
        el.innerHTML = `${plateHtml(data.plate)} <span class="badge badge-green">%${data.confidence} güven</span>`;
        document.getElementById('entryPlate').value = data.plate;
        if (mode === 'entry') document.getElementById('ptsEntryBtn').style.display = '';
        showToast(`Plaka tanındı: ${data.plate}`, 'success');
    } catch (e) { }
}

async function vehicleEntry(type) {
    const plate = document.getElementById('entryPlate').value.trim();
    if (!plate) return showToast('Plaka girin', 'warning');
    try {
        const data = await api('/api/vehicle/entry', {
            method: 'POST', body: JSON.stringify({ plate, entry_type: type })
        });
        const r = data.record;
        document.getElementById('entryResult').style.display = '';
        document.getElementById('entryResultBody').innerHTML = `
            <div class="grid-2">
                <div><strong>Plaka:</strong> ${plateHtml(r.plate)}</div>
                <div><strong>Bilet No:</strong> <span class="badge badge-blue">${r.ticket_number}</span></div>
                <div><strong>Giriş Zamanı:</strong> ${formatDate(r.entry_time)}</div>
                <div><strong>Müşteri Tipi:</strong> ${typeBadge(r.customer_type)}</div>
                <div><strong>Giriş Tipi:</strong> ${type === 'pts' ? '📷 PTS' : '✏️ Manuel'}</div>
            </div>
            <div class="mt-2"><button class="btn btn-primary btn-sm" onclick="printTicket('${r.ticket_number}','${r.plate}','${r.entry_time}')">🖨️ Bilet Yazdır</button></div>`;
        document.getElementById('entryPlate').value = '';
        showToast(data.message, 'success');
        // Animate barrier
        const eb = document.getElementById('entryBarrier');
        if (eb) { eb.classList.add('open'); setTimeout(() => eb.classList.remove('open'), 3000); }
    } catch (e) { }
}

function printTicket(ticket, plate, time) {
    const w = window.open('', '_blank', 'width=400,height=500');
    w.document.write(`<html><head><title>Park Bileti</title><style>body{font-family:'Courier New',monospace;padding:20px;text-align:center}h2{margin:0}hr{border:1px dashed #ccc}.row{display:flex;justify-content:space-between;padding:4px 0;font-size:14px}</style></head><body>
        <h2>🅿️ AkıllıPark</h2><p style="font-size:12px;color:#666">Otopark Giriş Bileti</p><hr>
        <div class="row"><span>Bilet No:</span><span><strong>${ticket}</strong></span></div>
        <div class="row"><span>Plaka:</span><span><strong>${plate}</strong></span></div>
        <div class="row"><span>Giriş:</span><span>${new Date(time).toLocaleString('tr-TR')}</span></div>
        <hr><p style="font-size:11px;color:#999">Bu bileti kaybetmeyiniz. Kayıp bilet cezaya tabidir.</p>
        <script>window.print();<\/script></body></html>`);
}

// ==================== ARAÇ ÇIKIŞ ====================
function renderExit(mc) {
    mc.innerHTML = `
        <div class="page-header"><div><h1>🚙 Araç Çıkış</h1><p class="subtitle">Araç çıkışı ve ödeme</p></div></div>
        <div class="grid-2">
            <div class="card">
                <div class="card-header"><h3>🔍 Araç Bul</h3></div>
                <div class="card-body">
                    <div class="form-group"><label>Plaka</label><input type="text" id="exitPlate" placeholder="34 ABC 123" style="text-transform:uppercase;font-size:1.2rem;font-weight:700;letter-spacing:2px"></div>
                    <div class="form-group"><label>Ödeme Yöntemi</label>
                        <select id="paymentMethod"><option value="nakit">💵 Nakit</option><option value="kredi_karti">💳 Kredi Kartı</option><option value="temassiz">📱 Temassız</option></select>
                    </div>
                    <div class="form-group"><label><input type="checkbox" id="lostTicket"> 🎫 Kayıp Bilet (Ceza uygulanır)</label></div>
                    <button class="btn btn-primary btn-block btn-lg" onclick="vehicleExit()">🚙 Çıkışı Tamamla</button>
                    <button class="btn btn-secondary btn-block mt-1" onclick="ptsRecognizeExit()">📷 PTS ile Plaka Tanıma</button>
                </div>
            </div>
            <div class="card" id="exitResult" style="display:none">
                <div class="card-header"><h3>🧾 Ödeme Fişi</h3></div>
                <div class="card-body" id="exitResultBody"></div>
            </div>
        </div>`;
}

async function ptsRecognizeExit() {
    try {
        const data = await api('/api/pts/recognize', { method: 'POST' });
        document.getElementById('exitPlate').value = data.plate;
        showToast(`Plaka tanındı: ${data.plate}`, 'success');
    } catch (e) { }
}

async function vehicleExit() {
    const plate = document.getElementById('exitPlate').value.trim();
    if (!plate) return showToast('Plaka girin', 'warning');
    try {
        const data = await api('/api/vehicle/exit', {
            method: 'POST', body: JSON.stringify({
                plate, payment_method: document.getElementById('paymentMethod').value,
                lost_ticket: document.getElementById('lostTicket').checked, exit_type: 'manual'
            })
        });
        document.getElementById('exitResult').style.display = '';
        document.getElementById('exitResultBody').innerHTML = `
            <div class="receipt">
                <h3>🅿️ AkıllıPark</h3><p class="receipt-subtitle">Otopark Ödeme Fişi</p><hr class="receipt-divider">
                <div class="receipt-row"><span>Fiş No:</span><span>${data.receiptNumber}</span></div>
                <div class="receipt-row"><span>Plaka:</span><span><strong>${data.record.plate}</strong></span></div>
                <div class="receipt-row"><span>Giriş:</span><span>${formatDate(data.record.entry_time)}</span></div>
                <div class="receipt-row"><span>Çıkış:</span><span>${formatDate(data.record.exit_time)}</span></div>
                <div class="receipt-row"><span>Süre:</span><span>${formatDuration(data.durationMinutes)}</span></div>
                <hr class="receipt-divider">
                <div class="receipt-row"><span>Park Ücreti:</span><span>${formatMoney(data.fee)}</span></div>
                ${data.penalty > 0 ? `<div class="receipt-row"><span>Ceza:</span><span class="text-red">${formatMoney(data.penalty)}</span></div>` : ''}
                ${data.discount > 0 ? `<div class="receipt-row"><span>İndirim:</span><span class="text-green">-${formatMoney(data.discount)}</span></div>` : ''}
                <div class="receipt-row total"><span>TOPLAM:</span><span>${formatMoney(data.totalPaid)}</span></div>
                <hr class="receipt-divider">
                <div class="receipt-row"><span>Ödeme:</span><span>${data.paymentMethod === 'nakit' ? '💵 Nakit' : data.paymentMethod === 'kredi_karti' ? '💳 Kredi Kartı' : '📱 Temassız'}</span></div>
                <p class="receipt-footer">Bizi tercih ettiğiniz için teşekkür ederiz!</p>
            </div>
            <div class="mt-2 text-center"><button class="btn btn-primary btn-sm" onclick="window.print()">🖨️ Fişi Yazdır</button></div>`;
        showToast('Çıkış işlemi tamamlandı', 'success');
    } catch (e) { }
}

// ==================== İÇERİDEKİ ARAÇLAR ====================
async function renderVehicles(mc) {
    mc.innerHTML = '<div class="page-header"><div><h1>🏎️ İçerideki Araçlar</h1></div><button class="btn btn-secondary btn-sm" onclick="navigateTo(\'vehicles\')">🔄 Yenile</button></div><div class="card"><div class="card-body">Yükleniyor...</div></div>';
    try {
        const data = await api('/api/vehicles/inside');
        document.getElementById('insideCountBadge').textContent = data.vehicles.length;
        mc.querySelector('.card-body').innerHTML = data.vehicles.length === 0
            ? '<div class="empty-state"><div class="icon">🅿️</div><p>Otoparkta araç yok</p></div>'
            : `<div class="table-container"><table><thead><tr><th>Plaka</th><th>Tip</th><th>Giriş Zamanı</th><th>Süre</th><th>Bilet No</th></tr></thead>
            <tbody>${data.vehicles.map(v => {
                const dur = Math.ceil((new Date() - new Date(v.entry_time)) / 60000);
                return `<tr><td>${plateHtml(v.plate)}</td><td>${typeBadge(v.customer_type)}</td><td>${formatDate(v.entry_time)}</td><td>${formatDuration(dur)}</td><td class="text-sm">${v.ticket_number || '-'}</td></tr>`;
            }).join('')}</tbody></table></div>`;
    } catch (e) { mc.querySelector('.card-body').innerHTML = '<p class="text-muted">Yüklenemedi</p>'; }
}

// ==================== ABONELER ====================
async function renderSubscribers(mc) {
    mc.innerHTML = '<div class="page-header"><div><h1>⭐ Aboneler</h1></div><button class="btn btn-success btn-sm" onclick="showAddSubscriber()">➕ Yeni Abone</button></div><div class="card"><div class="card-body">Yükleniyor...</div></div>';
    try {
        const data = await api('/api/subscribers');
        mc.querySelector('.card-body').innerHTML = data.subscribers.length === 0
            ? '<div class="empty-state"><div class="icon">⭐</div><p>Henüz abone yok</p></div>'
            : `<div class="table-container"><table><thead><tr><th>Plaka</th><th>İsim</th><th>Tip</th><th>Başlangıç</th><th>Bitiş</th><th>Durum</th><th>İşlem</th></tr></thead>
            <tbody>${data.subscribers.map(s => {
                const expired = new Date(s.end_date) < new Date();
                return `<tr><td>${plateHtml(s.plate)}</td><td>${s.owner_name}</td><td><span class="badge badge-purple">${s.subscription_type}</span></td>
                <td class="text-sm">${s.start_date}</td><td class="text-sm">${s.end_date}</td>
                <td>${expired ? '<span class="badge badge-red">Süresi Dolmuş</span>' : s.active ? '<span class="badge badge-green">Aktif</span>' : '<span class="badge badge-yellow">Pasif</span>'}</td>
                <td><button class="btn btn-danger btn-sm" onclick="deleteSubscriber(${s.id})">🗑️</button></td></tr>`;
            }).join('')}</tbody></table></div>`;
    } catch (e) { }
}

function showAddSubscriber() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal"><div class="modal-header"><h3>➕ Yeni Abone Ekle</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button></div>
        <div class="modal-body">
            <div class="form-group"><label>Plaka</label><input type="text" id="subPlate" placeholder="34 ABC 123" style="text-transform:uppercase"></div>
            <div class="form-group"><label>İsim Soyisim</label><input type="text" id="subName" placeholder="Ad Soyad"></div>
            <div class="form-group"><label>Telefon</label><input type="text" id="subPhone" placeholder="05XX XXX XX XX"></div>
            <div class="form-group"><label>E-posta</label><input type="email" id="subEmail" placeholder="email@ornek.com"></div>
            <div class="form-group"><label>Abonelik Tipi</label><select id="subType"><option value="aylik">Aylık</option><option value="6aylik">6 Aylık</option><option value="yillik">Yıllık</option></select></div>
        </div>
        <div class="modal-footer"><button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">İptal</button><button class="btn btn-success" onclick="addSubscriber()">Ekle</button></div></div>`;
    document.body.appendChild(overlay);
}

async function addSubscriber() {
    try {
        await api('/api/subscribers', {
            method: 'POST', body: JSON.stringify({
                plate: document.getElementById('subPlate').value, owner_name: document.getElementById('subName').value,
                phone: document.getElementById('subPhone').value, email: document.getElementById('subEmail').value,
                subscription_type: document.getElementById('subType').value
            })
        });
        document.querySelector('.modal-overlay')?.remove();
        showToast('Abone eklendi', 'success');
        navigateTo('subscribers');
    } catch (e) { }
}

async function deleteSubscriber(id) {
    if (!confirm('Bu aboneyi silmek istiyor musunuz?')) return;
    try { await api(`/api/subscribers/${id}`, { method: 'DELETE' }); showToast('Abone silindi', 'success'); navigateTo('subscribers'); } catch (e) { }
}

// ==================== KARA LİSTE ====================
async function renderBlacklist(mc) {
    mc.innerHTML = '<div class="page-header"><div><h1>🚫 Kara Liste</h1></div><button class="btn btn-danger btn-sm" onclick="showAddBlacklist()">➕ Ekle</button></div><div class="card"><div class="card-body">Yükleniyor...</div></div>';
    try {
        const data = await api('/api/blacklist');
        mc.querySelector('.card-body').innerHTML = data.list.length === 0
            ? '<div class="empty-state"><div class="icon">🚫</div><p>Kara liste boş</p></div>'
            : `<div class="table-container"><table><thead><tr><th>Plaka</th><th>Sebep</th><th>Ekleyen</th><th>Tarih</th><th>İşlem</th></tr></thead>
            <tbody>${data.list.map(b => `<tr><td>${plateHtml(b.plate)}</td><td>${b.reason}</td><td>${b.added_by}</td><td class="text-sm">${formatDate(b.added_at)}</td>
            <td><button class="btn btn-secondary btn-sm" onclick="removeBlacklist(${b.id})">🗑️ Kaldır</button></td></tr>`).join('')}</tbody></table></div>`;
    } catch (e) { }
}

function showAddBlacklist() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal"><div class="modal-header"><h3>🚫 Kara Listeye Ekle</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button></div>
        <div class="modal-body">
            <div class="form-group"><label>Plaka</label><input type="text" id="blPlate" placeholder="34 ABC 123" style="text-transform:uppercase"></div>
            <div class="form-group"><label>Sebep</label><textarea id="blReason" rows="3" placeholder="Engelleme sebebi"></textarea></div>
        </div>
        <div class="modal-footer"><button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">İptal</button><button class="btn btn-danger" onclick="addBlacklist()">Ekle</button></div></div>`;
    document.body.appendChild(overlay);
}

async function addBlacklist() {
    try {
        await api('/api/blacklist', { method: 'POST', body: JSON.stringify({ plate: document.getElementById('blPlate').value, reason: document.getElementById('blReason').value }) });
        document.querySelector('.modal-overlay')?.remove();
        showToast('Kara listeye eklendi', 'success'); navigateTo('blacklist');
    } catch (e) { }
}

async function removeBlacklist(id) {
    if (!confirm('Kara listeden kaldırmak istiyor musunuz?')) return;
    try { await api(`/api/blacklist/${id}`, { method: 'DELETE' }); showToast('Kaldırıldı', 'success'); navigateTo('blacklist'); } catch (e) { }
}

// ==================== FİYATLANDIRMA ====================
async function renderPricing(mc) {
    mc.innerHTML = '<div class="page-header"><div><h1>💰 Fiyatlandırma</h1><p class="subtitle">Dinamik tarife yönetimi</p></div></div><div id="pricingContent">Yükleniyor...</div>';
    try {
        const data = await api('/api/pricing');
        const isAdmin = currentUser.role === 'admin';
        document.getElementById('pricingContent').innerHTML = `
            <div class="grid-auto">
                ${data.pricing.map(p => `<div class="card">
                    <div class="card-header"><h3>${p.is_weekend_rate ? '🌅 ' : p.is_night_rate ? '🌙 ' : '☀️ '}${p.name}</h3></div>
                    <div class="card-body">
                        <div class="form-group"><label>Saatlik Ücret (₺)</label><input type="number" value="${p.price_per_hour}" id="ph_${p.id}" ${!isAdmin ? 'disabled' : ''}></div>
                        <div class="form-group"><label>Minimum Ücret (₺)</label><input type="number" value="${p.min_charge}" id="mc_${p.id}" ${!isAdmin ? 'disabled' : ''}></div>
                        <div class="form-group"><label>Günlük Maksimum (₺)</label><input type="number" value="${p.max_daily || ''}" id="md_${p.id}" ${!isAdmin ? 'disabled' : ''}></div>
                        ${isAdmin ? `<button class="btn btn-primary btn-sm btn-block" onclick="updatePricing(${p.id},'${p.name}')">💾 Kaydet</button>` : ''}
                    </div>
                </div>`).join('')}
            </div>
            <h3 class="mt-3 mb-2">⭐ Abonelik Fiyatları</h3>
            <div class="grid-3">
                ${data.subscriptionPricing.map(sp => `<div class="card"><div class="card-body text-center">
                    <div style="font-size:1.5rem;font-weight:800">${sp.type === 'aylik' ? '📅 Aylık' : sp.type === '6aylik' ? '📆 6 Aylık' : '📋 Yıllık'}</div>
                    <div class="form-group mt-2"><input type="number" value="${sp.price}" id="sp_${sp.id}" style="text-align:center;font-size:1.2rem;font-weight:700" ${!isAdmin ? 'disabled' : ''}></div>
                    ${isAdmin ? `<button class="btn btn-primary btn-sm" onclick="updateSubPricing(${sp.id})">💾 Kaydet</button>` : ''}
                </div></div>`).join('')}
            </div>
            ${data.penalties ? `<h3 class="mt-3 mb-2">⚠️ Ceza Tarifeleri</h3>
            <div class="grid-2"><div class="card"><div class="card-body">
                <div class="form-group"><label>Kayıp Bilet Cezası (₺)</label><input type="number" value="${data.penalties.lost_ticket_fee}" id="penLost" ${!isAdmin ? 'disabled' : ''}></div>
                <div class="form-group"><label>Tanınmayan Plaka Cezası (₺)</label><input type="number" value="${data.penalties.unrecognized_plate_fee}" id="penPlate" ${!isAdmin ? 'disabled' : ''}></div>
                ${isAdmin ? `<button class="btn btn-warning btn-sm btn-block" onclick="updatePenalties()">💾 Cezaları Kaydet</button>` : ''}
            </div></div></div>` : ''}`;
    } catch (e) { }
}

async function updatePricing(id, name) {
    try {
        await api(`/api/pricing/${id}`, {
            method: 'PUT', body: JSON.stringify({
                name, price_per_hour: parseFloat(document.getElementById(`ph_${id}`).value),
                min_charge: parseFloat(document.getElementById(`mc_${id}`).value),
                max_daily: parseFloat(document.getElementById(`md_${id}`).value) || null
            })
        });
        showToast('Tarife güncellendi', 'success');
    } catch (e) { }
}

async function updateSubPricing(id) {
    try {
        await api(`/api/pricing/subscription/${id}`, { method: 'PUT', body: JSON.stringify({ price: parseFloat(document.getElementById(`sp_${id}`).value) }) });
        showToast('Abonelik fiyatı güncellendi', 'success');
    } catch (e) { }
}

async function updatePenalties() {
    try {
        await api('/api/pricing/penalties', {
            method: 'PUT', body: JSON.stringify({
                lost_ticket_fee: parseFloat(document.getElementById('penLost').value),
                unrecognized_plate_fee: parseFloat(document.getElementById('penPlate').value)
            })
        });
        showToast('Ceza tarifeleri güncellendi', 'success');
    } catch (e) { }
}

// ==================== VARDİYA ====================
async function renderShifts(mc) {
    mc.innerHTML = '<div class="page-header"><div><h1>⏰ Vardiya Yönetimi</h1></div></div><div id="shiftContent">Yükleniyor...</div>';
    try {
        const data = await api('/api/shifts');
        document.getElementById('shiftContent').innerHTML = `
            <div class="grid-2 mb-2">
                <div class="card"><div class="card-header"><h3>${data.activeShift ? '🟢 Aktif Vardiya' : '🔴 Vardiya Kapalı'}</h3></div>
                <div class="card-body">
                    ${data.activeShift ? `
                        <p><strong>Başlangıç:</strong> ${formatDate(data.activeShift.start_time)}</p>
                        <p><strong>Açılış Kasa:</strong> ${formatMoney(data.activeShift.opening_cash)}</p>
                        <p><strong>Toplam Gelir:</strong> ${formatMoney(data.activeShift.total_income)}</p>
                        <p><strong>İşlem Sayısı:</strong> ${data.activeShift.total_vehicles}</p>
                        <div class="form-group mt-2"><label>Kapanış Kasa (₺)</label><input type="number" id="closingCash" placeholder="0.00"></div>
                        <div class="form-group"><label>Not</label><textarea id="shiftNotes" rows="2" placeholder="Vardiya notu"></textarea></div>
                        <button class="btn btn-danger btn-block" onclick="endShift()">🔒 Vardiyayı Kapat</button>
                    ` : `
                        <div class="form-group"><label>Açılış Kasa (₺)</label><input type="number" id="openingCash" value="0" placeholder="0.00"></div>
                        <button class="btn btn-success btn-block btn-lg" onclick="startShift()">🟢 Vardiya Başlat</button>
                    `}
                </div></div>
                <div class="card"><div class="card-header"><h3>📋 Vardiya Geçmişi</h3></div>
                <div class="card-body" style="max-height:350px;overflow-y:auto">
                    <table><thead><tr><th>Personel</th><th>Başlangıç</th><th>Bitiş</th><th>Gelir</th><th>Durum</th></tr></thead>
                    <tbody>${data.shifts.map(s => `<tr><td>${s.full_name}</td><td class="text-sm">${formatDate(s.start_time)}</td><td class="text-sm">${formatDate(s.end_time)}</td>
                    <td>${formatMoney(s.total_income)}</td><td>${s.status === 'active' ? '<span class="badge badge-green">Aktif</span>' : '<span class="badge badge-blue">Kapandı</span>'}</td></tr>`).join('')}
                    </tbody></table>
                </div></div>
            </div>`;
    } catch (e) { }
}

async function startShift() {
    try { await api('/api/shifts/start', { method: 'POST', body: JSON.stringify({ opening_cash: parseFloat(document.getElementById('openingCash').value) || 0 }) }); showToast('Vardiya başlatıldı', 'success'); navigateTo('shifts'); } catch (e) { }
}

async function endShift() {
    try { await api('/api/shifts/end', { method: 'POST', body: JSON.stringify({ closing_cash: parseFloat(document.getElementById('closingCash').value) || 0, notes: document.getElementById('shiftNotes').value }) }); showToast('Vardiya kapatıldı', 'success'); navigateTo('shifts'); } catch (e) { }
}

// ==================== KAYITLAR ====================
async function renderRecords(mc) {
    mc.innerHTML = `<div class="page-header"><div><h1>📋 Park Kayıtları</h1></div></div>
        <div class="toolbar"><input type="text" class="search-input" id="recPlate" placeholder="🔍 Plaka ara...">
        <input type="date" class="search-input" id="recStart"><input type="date" class="search-input" id="recEnd">
        <select id="recStatus"><option value="">Tüm Durumlar</option><option value="inside">İçeride</option><option value="exited">Çıkış</option><option value="lost_ticket">Kayıp Bilet</option></select>
        <button class="btn btn-primary btn-sm" onclick="searchRecords()">🔍 Ara</button></div>
        <div class="card"><div class="card-body" id="recordsBody">Yükleniyor...</div></div>`;
    searchRecords();
}

async function searchRecords() {
    const params = new URLSearchParams();
    const plate = document.getElementById('recPlate')?.value; if (plate) params.set('plate', plate);
    const start = document.getElementById('recStart')?.value; if (start) params.set('start_date', start);
    const end = document.getElementById('recEnd')?.value; if (end) params.set('end_date', end);
    const status = document.getElementById('recStatus')?.value; if (status) params.set('status', status);
    try {
        const data = await api(`/api/records?${params}`);
        document.getElementById('recordsBody').innerHTML = data.records.length === 0
            ? '<div class="empty-state"><div class="icon">📋</div><p>Kayıt bulunamadı</p></div>'
            : `<div class="table-container"><table><thead><tr><th>Plaka</th><th>Tip</th><th>Giriş</th><th>Çıkış</th><th>Süre</th><th>Ücret</th><th>Durum</th></tr></thead>
            <tbody>${data.records.map(r => `<tr><td>${plateHtml(r.plate)}</td><td>${typeBadge(r.customer_type)}</td><td class="text-sm">${formatDate(r.entry_time)}</td>
            <td class="text-sm">${formatDate(r.exit_time)}</td><td>${formatDuration(r.duration_minutes)}</td><td>${formatMoney(r.total_paid)}</td><td>${statusBadge(r.status)}</td></tr>`).join('')}</tbody></table></div>`;
    } catch (e) { }
}

// ==================== RAPORLAR ====================
async function renderReports(mc) {
    const today = new Date().toISOString().split('T')[0];
    mc.innerHTML = `<div class="page-header"><div><h1>📈 Raporlar</h1></div></div>
        <div class="toolbar"><input type="date" class="search-input" id="reportDate" value="${today}"><button class="btn btn-primary btn-sm" onclick="loadReport()">📊 Günlük Rapor</button></div>
        <div id="reportContent"></div>`;
    loadReport();
}

async function loadReport() {
    const date = document.getElementById('reportDate').value;
    try {
        const data = await api(`/api/reports/daily?date=${date}`);
        document.getElementById('reportContent').innerHTML = `
            <div class="stats-grid">
                <div class="stat-card blue"><div class="stat-icon">📥</div><div class="stat-value">${data.totalEntries}</div><div class="stat-label">Toplam Giriş</div></div>
                <div class="stat-card green"><div class="stat-icon">📤</div><div class="stat-value">${data.totalExits}</div><div class="stat-label">Toplam Çıkış</div></div>
                <div class="stat-card orange"><div class="stat-icon">💰</div><div class="stat-value">${formatMoney(data.totalIncome)}</div><div class="stat-label">Toplam Gelir</div></div>
                <div class="stat-card purple"><div class="stat-icon">⏱️</div><div class="stat-value">${formatDuration(data.avgDuration)}</div><div class="stat-label">Ort. Kalış Süresi</div></div>
            </div>
            <div class="grid-2 mt-2">
                <div class="card"><div class="card-header"><h3>💳 Ödeme Yöntemleri</h3></div><div class="card-body">
                    ${data.byPaymentMethod.length === 0 ? '<p class="text-muted text-center">Veri yok</p>' :
                `<table><thead><tr><th>Yöntem</th><th>İşlem</th><th>Tutar</th></tr></thead><tbody>
                    ${data.byPaymentMethod.map(p => `<tr><td>${p.payment_method === 'nakit' ? '💵 Nakit' : p.payment_method === 'kredi_karti' ? '💳 Kredi Kartı' : '📱 Temassız'}</td><td>${p.count}</td><td>${formatMoney(p.total)}</td></tr>`).join('')}
                    </tbody></table>`}
                </div></div>
                <div class="card"><div class="card-header"><h3>📊 Müşteri Dağılımı</h3></div><div class="card-body">
                    ${data.byCustomerType.length === 0 ? '<p class="text-muted text-center">Veri yok</p>' :
                `<table><thead><tr><th>Tip</th><th>Adet</th></tr></thead><tbody>
                    ${data.byCustomerType.map(c => `<tr><td>${typeBadge(c.customer_type)}</td><td>${c.count}</td></tr>`).join('')}
                    </tbody></table>`}
                </div></div>
            </div>
            <div class="card mt-2"><div class="card-header"><h3>📊 Saatlik Giriş Dağılımı</h3></div><div class="card-body">
                ${data.hourlyEntries.length === 0 ? '<p class="text-muted text-center">Veri yok</p>' : (() => {
                const max = Math.max(...data.hourlyEntries.map(h => h.count), 1);
                return `<div class="chart-bars">${data.hourlyEntries.map(h => `<div class="chart-bar" style="height:${(h.count / max) * 100}%"><div class="chart-tooltip">${h.hour}:00 - ${h.count} araç</div></div>`).join('')}</div>
                    <div class="chart-labels">${data.hourlyEntries.map(h => `<span>${h.hour}</span>`).join('')}</div>`;
            })()}
            </div></div>
            <div class="mt-2 text-center"><button class="btn btn-primary" onclick="window.print()">🖨️ Raporu Yazdır</button></div>`;
    } catch (e) { }
}

// ==================== İSTATİSTİKLER ====================
async function renderStatistics(mc) {
    mc.innerHTML = '<div class="page-header"><div><h1>📉 İstatistikler</h1></div></div><div id="statsContent">Yükleniyor...</div>';
    try {
        const data = await api('/api/statistics');
        const maxEntries = Math.max(...data.last7days.map(d => d.entries), 1);
        const maxIncome = Math.max(...data.last7days.map(d => d.income), 1);
        document.getElementById('statsContent').innerHTML = `
            <div class="stats-grid">
                <div class="stat-card blue"><div class="stat-icon">🚗</div><div class="stat-value">${data.totalVehicles}</div><div class="stat-label">Toplam Araç (Tüm Zamanlar)</div></div>
                <div class="stat-card green"><div class="stat-icon">💰</div><div class="stat-value">${formatMoney(data.totalRevenue)}</div><div class="stat-label">Toplam Gelir</div></div>
                <div class="stat-card purple"><div class="stat-icon">⏱️</div><div class="stat-value">${formatDuration(data.avgStayMinutes)}</div><div class="stat-label">Ort. Kalış Süresi</div></div>
            </div>
            <div class="grid-2 mt-2">
                <div class="card"><div class="card-header"><h3>📊 Son 7 Gün - Araç Sayısı</h3></div><div class="card-body">
                    <div class="chart-bars">${data.last7days.map(d => `<div class="chart-bar" style="height:${(d.entries / maxEntries) * 100}%"><div class="chart-tooltip">${d.date}: ${d.entries} araç</div></div>`).join('')}</div>
                    <div class="chart-labels">${data.last7days.map(d => `<span>${d.day}</span>`).join('')}</div>
                </div></div>
                <div class="card"><div class="card-header"><h3>💰 Son 7 Gün - Gelir</h3></div><div class="card-body">
                    <div class="chart-bars">${data.last7days.map(d => `<div class="chart-bar" style="height:${(d.income / maxIncome) * 100}%;background:var(--gradient-green)"><div class="chart-tooltip">${d.date}: ${formatMoney(d.income)}</div></div>`).join('')}</div>
                    <div class="chart-labels">${data.last7days.map(d => `<span>${d.day}</span>`).join('')}</div>
                </div></div>
            </div>
            <div class="card mt-2"><div class="card-header"><h3>🕐 En Yoğun Saatler</h3></div><div class="card-body">
                ${data.peakHours.length === 0 ? '<p class="text-muted text-center">Henüz veri yok</p>' :
                `<table><thead><tr><th>Saat</th><th>Giriş Sayısı</th></tr></thead><tbody>
                ${data.peakHours.map(h => `<tr><td>${h.hour}:00</td><td>${h.count}</td></tr>`).join('')}</tbody></table>`}
            </div></div>`;
    } catch (e) { }
}

// ==================== KULLANICILAR ====================
async function renderUsers(mc) {
    if (currentUser.role !== 'admin') { mc.innerHTML = '<div class="empty-state"><div class="icon">🔒</div><p>Bu sayfa için admin yetkisi gerekiyor</p></div>'; return; }
    mc.innerHTML = '<div class="page-header"><div><h1>👥 Kullanıcılar</h1></div><button class="btn btn-success btn-sm" onclick="showAddUser()">➕ Yeni Kullanıcı</button></div><div class="card"><div class="card-body" id="usersBody">Yükleniyor...</div></div>';
    try {
        const data = await api('/api/users');
        document.getElementById('usersBody').innerHTML = `<div class="table-container"><table><thead><tr><th>Kullanıcı Adı</th><th>İsim</th><th>Rol</th><th>Durum</th><th>Kayıt Tarihi</th></tr></thead>
            <tbody>${data.users.map(u => `<tr><td>${u.username}</td><td>${u.full_name}</td>
            <td><span class="badge ${u.role === 'admin' ? 'badge-purple' : 'badge-blue'}">${u.role === 'admin' ? '👑 Admin' : '💼 Kasiyer'}</span></td>
            <td>${u.active ? '<span class="badge badge-green">Aktif</span>' : '<span class="badge badge-red">Pasif</span>'}</td>
            <td class="text-sm">${formatDate(u.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
    } catch (e) { }
}

function showAddUser() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal"><div class="modal-header"><h3>➕ Yeni Kullanıcı</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button></div>
        <div class="modal-body">
            <div class="form-group"><label>Kullanıcı Adı</label><input type="text" id="newUsername"></div>
            <div class="form-group"><label>Şifre</label><input type="password" id="newPassword"></div>
            <div class="form-group"><label>İsim Soyisim</label><input type="text" id="newFullname"></div>
            <div class="form-group"><label>Rol</label><select id="newRole"><option value="kasiyer">Kasiyer</option><option value="admin">Admin</option></select></div>
        </div>
        <div class="modal-footer"><button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">İptal</button><button class="btn btn-success" onclick="addUser()">Ekle</button></div></div>`;
    document.body.appendChild(overlay);
}

async function addUser() {
    try {
        await api('/api/users', {
            method: 'POST', body: JSON.stringify({
                username: document.getElementById('newUsername').value, password: document.getElementById('newPassword').value,
                full_name: document.getElementById('newFullname').value, role: document.getElementById('newRole').value
            })
        });
        document.querySelector('.modal-overlay')?.remove();
        showToast('Kullanıcı eklendi', 'success'); navigateTo('users');
    } catch (e) { }
}

// ==================== AYARLAR ====================
async function renderSettings(mc) {
    if (currentUser.role !== 'admin') { mc.innerHTML = '<div class="empty-state"><div class="icon">🔒</div><p>Admin yetkisi gerekiyor</p></div>'; return; }
    mc.innerHTML = '<div class="page-header"><div><h1>⚙️ Ayarlar</h1></div></div><div class="card"><div class="card-body" id="settingsBody">Yükleniyor...</div></div>';
    try {
        const data = await api('/api/settings');
        const s = data.settings;
        document.getElementById('settingsBody').innerHTML = `
            <div class="grid-2">
                <div class="form-group"><label>Otopark Adı</label><input type="text" id="setParkName" value="${s.parking_name || ''}"></div>
                <div class="form-group"><label>Toplam Kapasite</label><input type="number" id="setCapacity" value="${s.total_capacity || 200}"></div>
                <div class="form-group"><label>Adres</label><input type="text" id="setAddress" value="${s.address || ''}"></div>
                <div class="form-group"><label>Telefon</label><input type="text" id="setPhone" value="${s.phone || ''}"></div>
                <div class="form-group"><label>Vergi No</label><input type="text" id="setTaxId" value="${s.tax_id || ''}"></div>
                <div class="form-group"><label>Fiş Alt Notu</label><input type="text" id="setFooter" value="${s.receipt_footer || ''}"></div>
            </div>
            <button class="btn btn-primary btn-lg mt-2" onclick="saveSettings()">💾 Ayarları Kaydet</button>`;
    } catch (e) { }
}

async function saveSettings() {
    try {
        await api('/api/settings', {
            method: 'PUT', body: JSON.stringify({
                parking_name: document.getElementById('setParkName').value,
                total_capacity: document.getElementById('setCapacity').value,
                address: document.getElementById('setAddress').value,
                phone: document.getElementById('setPhone').value,
                tax_id: document.getElementById('setTaxId').value,
                receipt_footer: document.getElementById('setFooter').value
            })
        });
        showToast('Ayarlar kaydedildi', 'success');
    } catch (e) { }
}

// ==================== MOBILE MENU ====================
document.addEventListener('click', (e) => {
    if (e.target.closest('.mobile-menu-btn')) {
        document.getElementById('sidebar').classList.toggle('open');
    }
});

// ==================== INIT ====================
checkAuth();
