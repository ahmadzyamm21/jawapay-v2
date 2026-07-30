// API Base URL Configuration
// For production: Change this to your deployed backend URL
// For development: Use localhost
const API_BASE_URL = window.location.protocol === 'file:' || window.location.protocol === 'capacitor:' 
    ? 'https://jawapay.my.id'  // Backend produksi di VPS
    : ''; // Empty string untuk web (relative path)

// Helper function untuk API calls
function apiUrl(path) {
    return `${API_BASE_URL}${path}`;
}

// Operator prefixes
const PREFIXES = {
    telkomsel: ['0811', '0812', '0813', '0821', '0822', '0852', '0853', '0823'],
    indosat: ['0814', '0815', '0816', '0855', '0856', '0857', '0858'],
    xl: ['0817', '0818', '0819', '0859', '0877', '0878'],
    tri: ['0895', '0896', '0897', '0898', '0899'],
    smartfren: ['0881', '0882', '0883', '0884', '0885', '0886', '0887', '0888', '0889']
};

// Application State
let state = {
    user: null, // Logged in user info
    balance: 0,
    selectedCategory: 'pulsa',
    targetNumber: '',
    detectedOperator: null, 
    selectedProduct: null,
    selectedPaymentMethod: 'balance',
    transactions: [],
    subCategory: '',
    products: null,
    paymentChannels: [],
    appliedVoucherCode: null,
    voucherDiscount: 0
};

// Global reference for active Tripay checkout
let activeTripayInvoice = null;
let qrisTimerInterval = null;

// Format currency
function formatRupiah(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(value);
}

// Detect Operator from Phone Number prefix
function detectOperator(number) {
    if (number.length < 4) return null;
    const prefix = number.substring(0, 4);
    for (const [operator, list] of Object.entries(PREFIXES)) {
        if (list.includes(prefix)) {
            return operator;
        }
    }
    return null;
}

// UI Elements Cache
const DOM = {
    // Auth elements
    authContainer: document.getElementById('auth-container'),
    landingContainer: document.getElementById('landing-container'),
    mainAppContainer: document.getElementById('main-app-container'),
    loginFormBox: document.getElementById('login-form-box'),
    registerFormBox: document.getElementById('register-form-box'),
    linkToRegister: document.getElementById('link-to-register'),
    linkToLogin: document.getElementById('link-to-login'),
    
    // Auth Inputs
    loginUsername: document.getElementById('login-username'),
    loginPassword: document.getElementById('login-password'),
    btnLoginSubmit: document.getElementById('btn-login-submit'),
    
    registerName: document.getElementById('register-name'),
    registerUsername: document.getElementById('register-username'),
    registerEmail: document.getElementById('register-email'),
    registerPassword: document.getElementById('register-password'),
    btnRegisterSubmit: document.getElementById('btn-register-submit'),

    // OTP Elements
    otpFormBox: document.getElementById('otp-form-box'),
    otpEmailTargetText: document.getElementById('otp-email-target-text'),
    otpCodeInput: document.getElementById('otp-code-input'),
    btnOtpSubmit: document.getElementById('btn-otp-submit'),
    linkResendOtp: document.getElementById('link-resend-otp'),
    linkOtpToLogin: document.getElementById('link-otp-to-login'),
    
    // Profile Header
    agentName: document.getElementById('agent-name'),
    balanceValue: document.getElementById('balance-value'),
    btnTopup: document.getElementById('btn-topup'),
    btnLogout: document.getElementById('btn-logout'),
    
    // Core App
    tabBtns: document.querySelectorAll('.tab-btn'),
    targetInput: document.getElementById('target-number'),
    inputLabel: document.getElementById('input-label'),
    operatorBadge: document.getElementById('operator-badge'),
    productsGrid: document.getElementById('products-grid'),
    checkoutBox: document.getElementById('checkout-box'),
    checkoutCardName: document.getElementById('checkout-card-name'),
    checkoutCardTarget: document.getElementById('checkout-card-target'),
    checkoutPriceAgent: document.getElementById('checkout-price-agent'),
    checkoutPriceSell: document.getElementById('checkout-price-sell'),
    checkoutProfit: document.getElementById('checkout-profit'),
    checkoutTotal: document.getElementById('checkout-total'),
    paymentMethodsList: document.getElementById('payment-methods-list'),
    btnPay: document.getElementById('btn-pay'),
    historyList: document.getElementById('history-list'),
    
    // Modals
    topupModal: document.getElementById('topup-modal'),
    btnSaveTopup: document.getElementById('btn-save-topup'),
    topupAmountInput: document.getElementById('topup-amount'),
    
    qrisModal: document.getElementById('qris-modal'),
    qrisTimer: document.getElementById('qris-timer'),
    qrisAmount: document.getElementById('qris-amount'),
    btnSimulatePay: document.getElementById('btn-simulate-pay'),
    
    receiptModal: document.getElementById('receipt-modal'),
    receiptShopName: document.getElementById('receipt-shop-name'),
    receiptTrxId: document.getElementById('receipt-trx-id'),
    receiptTime: document.getElementById('receipt-time'),
    receiptTarget: document.getElementById('receipt-target'),
    receiptProduct: document.getElementById('receipt-product'),
    receiptPrice: document.getElementById('receipt-price'),
    receiptPayment: document.getElementById('receipt-payment'),
    receiptStatus: document.getElementById('receipt-status'),
    btnPrintReceipt: document.getElementById('btn-print-receipt'),
    btnCloseReceipt: document.getElementById('btn-close-receipt'),

    // Receipt customization elements
    receiptHeaderInput: document.getElementById('receipt-header-input'),
    receiptFooterInput: document.getElementById('receipt-footer-input'),
    receiptWidthSelect: document.getElementById('receipt-width-select'),
    receiptShopName: document.getElementById('receipt-shop-name'),
    receiptFooterText: document.getElementById('receipt-footer-text'),

    // Settings modal
    btnSettings: document.getElementById('btn-settings'),
    settingsModal: document.getElementById('settings-modal'),
    settingsMarkupInput: document.getElementById('settings-markup-input'),
    btnSaveSettings: document.getElementById('btn-save-settings'),
    settingsThemeDark: document.getElementById('settings-theme-dark'),
    settingsThemeLight: document.getElementById('settings-theme-light'),
    btnCheckDigiflazzDeposit: document.getElementById('btn-check-digiflazz-deposit'),
    settingsDigiflazzDeposit: document.getElementById('settings-digiflazz-deposit'),
    btnManualSyncTrxs: document.getElementById('btn-manual-sync-trxs'),

    // E-money and Game selection filters
    subCategoryWrapper: document.getElementById('subcategory-wrapper'),
    subCategorySelect: document.getElementById('subcategory-select'),
    subCategoryLabel: document.getElementById('subcategory-label'),

    // Voucher elements
    voucherInput: document.getElementById('checkout-voucher-code'),
    btnApplyVoucher: document.getElementById('btn-apply-voucher'),
    voucherStatusMsg: document.getElementById('voucher-status-msg'),
    discountRow: document.getElementById('checkout-discount-row'),
    discountVal: document.getElementById('checkout-discount-val'),

    // Admin elements
    navAdmin: document.getElementById('nav-admin'),
    viewAdmin: document.getElementById('view-admin'),
};

// ---------------- AUTHENTICATION CLIENT FLOW ----------------

function getToken() {
    return localStorage.getItem('jawapay_token');
}

// Check auth status on load
async function checkAuth() {
    const token = getToken();
    if (token) {
        // Fetch user profile from API
        try {
            const res = await fetch(apiUrl('/api/auth/profile'), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const profile = await res.json();
                state.user = { id: profile.id, name: profile.name, username: profile.username, role: profile.role };
                
                // Show admin button if role is admin
                if (DOM.navAdmin) {
                    if (state.user.role === 'admin') {
                        DOM.navAdmin.style.display = 'flex';
                    } else {
                        DOM.navAdmin.style.display = 'none';
                    }
                }
                state.balance = profile.balance;
                state.transactions = profile.transactions;
                
                // Show dashboard
                DOM.authContainer.style.display = 'none';
                DOM.landingContainer.style.display = 'none';
                DOM.mainAppContainer.style.display = 'block';
                
                DOM.agentName.textContent = state.user.name;
                DOM.balanceValue.textContent = formatRupiah(state.balance);
                
                if (DOM.btnTopup) {
                    if (state.user && state.user.role === 'admin') {
                        DOM.btnTopup.style.display = 'none';
                    } else {
                        DOM.btnTopup.style.display = 'inline-flex';
                    }
                }
                renderTransactions();
                
                // Automatically sync any pending transactions
                syncPendingTransactions();
                
                // Initialize core app components
                await fetchProducts();
                await fetchPaymentChannels();
                renderProducts();
                await loadActiveDeposit();
                startAutoSyncPolling();
            } else {
                // Invalid token
                logout();
            }
        } catch (err) {
            console.error('Koneksi autentikasi gagal:', err);
            logout();
        }
    } else {
        // Go straight to login page by default
        DOM.landingContainer.style.display = 'none';
        DOM.mainAppContainer.style.display = 'none';
        DOM.authContainer.style.display = 'block';
        DOM.loginFormBox.style.display = 'block';
        DOM.registerFormBox.style.display = 'none';
    }
    if (window.lucide) window.lucide.createIcons();
}

// Login
async function handleLogin() {
    const username = DOM.loginUsername.value.trim();
    const password = DOM.loginPassword.value;

    if (!username || !password) {
        alert('Silakan masukkan username dan password Anda.');
        return;
    }

    DOM.btnLoginSubmit.disabled = true;
    DOM.btnLoginSubmit.innerHTML = '⏳ Menghubungkan...';

    try {
        const response = await fetch(apiUrl('/api/auth/login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (response.ok && result.token) {
            localStorage.setItem('jawapay_token', result.token);
            // Clear inputs
            DOM.loginUsername.value = '';
            DOM.loginPassword.value = '';
            // Load app
            await checkAuth();
        } else if (result.requireOtp) {
            state.pendingOtpEmail = result.email;
            alert('Akun Anda belum diverifikasi. Silakan masukkan Kode OTP 6-digit yang dikirimkan ke email Anda.');
            if (DOM.otpEmailTargetText) {
                DOM.otpEmailTargetText.innerHTML = `Kode 6-digit telah dikirimkan ke <strong style="color: #38bdf8;">${state.pendingOtpEmail}</strong>. Sila periksa inbox / spam email Anda.`;
            }
            DOM.loginFormBox.style.display = 'none';
            DOM.registerFormBox.style.display = 'none';
            DOM.otpFormBox.style.display = 'block';
            if (DOM.otpCodeInput) {
                DOM.otpCodeInput.value = '';
                DOM.otpCodeInput.focus();
            }
        } else {
            alert('Gagal Masuk: ' + (result.error || 'Username atau password salah.'));
        }
    } catch (err) {
        console.error(err);
        alert('Gagal menghubungkan ke server.');
    } finally {
        DOM.btnLoginSubmit.disabled = false;
        DOM.btnLoginSubmit.innerHTML = '<i data-lucide="log-in" style="width: 18px; height: 18px;"></i> Masuk Sekarang';
        if (window.lucide) window.lucide.createIcons();
    }
}

// Register
async function handleRegister() {
    const name = DOM.registerName.value.trim();
    const username = DOM.registerUsername.value.trim();
    const email = DOM.registerEmail.value.trim();
    const password = DOM.registerPassword.value;

    if (!name || !username || !email || !password) {
        alert('Silakan isi seluruh formulir pendaftaran.');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert('Format alamat email tidak valid.');
        return;
    }

    DOM.btnRegisterSubmit.disabled = true;
    DOM.btnRegisterSubmit.innerHTML = '⏳ Mendaftarkan...';

    try {
        const response = await fetch(apiUrl('/api/auth/register'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, username, password, email })
        });

        const result = await response.json();

        if (response.ok && result.requireOtp) {
            state.pendingOtpEmail = result.email || email.toLowerCase();
            alert(result.message || 'Registrasi Berhasil! Silakan masukkan Kode OTP 6-digit yang dikirim ke email Anda.');
            
            DOM.registerName.value = '';
            DOM.registerUsername.value = '';
            DOM.registerEmail.value = '';
            DOM.registerPassword.value = '';

            if (DOM.otpEmailTargetText) {
                if (result.debugOtp) {
                    DOM.otpEmailTargetText.innerHTML = `[Mode Uji Coba]: Kode OTP Anda adalah <strong style="color: #38bdf8; font-size: 16px; letter-spacing: 2px;">${result.debugOtp}</strong>`;
                } else {
                    DOM.otpEmailTargetText.innerHTML = `Kode 6-digit telah dikirimkan ke <strong style="color: #38bdf8;">${state.pendingOtpEmail}</strong>. Sila periksa inbox / spam email Anda.`;
                }
            }
            DOM.registerFormBox.style.display = 'none';
            DOM.loginFormBox.style.display = 'none';
            DOM.otpFormBox.style.display = 'block';
            if (DOM.otpCodeInput) {
                DOM.otpCodeInput.value = result.debugOtp || '';
                DOM.otpCodeInput.focus();
            }
        } else {
            alert('Registrasi Gagal: ' + (result.error || 'Username atau email sudah digunakan.'));
        }
    } catch (err) {
        console.error(err);
        alert('Gagal menghubungkan ke server.');
    } finally {
        DOM.btnRegisterSubmit.disabled = false;
        DOM.btnRegisterSubmit.innerHTML = '<i data-lucide="user-plus" style="width: 18px; height: 18px;"></i> Daftar Sekarang';
        if (window.lucide) window.lucide.createIcons();
    }
}

// Verify 6-Digit OTP
async function handleVerifyOtp() {
    const otpCode = DOM.otpCodeInput ? DOM.otpCodeInput.value.trim() : '';
    const email = state.pendingOtpEmail;

    if (!otpCode || otpCode.length < 6) {
        alert('Silakan masukkan Kode OTP 6-digit secara lengkap.');
        return;
    }

    DOM.btnOtpSubmit.disabled = true;
    DOM.btnOtpSubmit.innerHTML = '⏳ Memverifikasi OTP...';

    try {
        const response = await fetch(apiUrl('/api/auth/verify-otp'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otpCode })
        });

        const result = await response.json();

        if (response.ok && result.token) {
            alert(result.message || 'Verifikasi Berhasil! Selamat datang di Jawa Pay.');
            localStorage.setItem('jawapay_token', result.token);
            DOM.otpFormBox.style.display = 'none';
            await checkAuth();
        } else {
            alert('Verifikasi Gagal: ' + (result.error || 'Kode OTP 6-digit salah atau kedaluwarsa.'));
        }
    } catch (err) {
        console.error(err);
        alert('Gagal memverifikasi Kode OTP ke server.');
    } finally {
        DOM.btnOtpSubmit.disabled = false;
        DOM.btnOtpSubmit.innerHTML = '<i data-lucide="check-circle" style="width: 18px; height: 18px;"></i> Verifikasi & Masuk Akun';
        if (window.lucide) window.lucide.createIcons();
    }
}

// Resend OTP Code
async function handleResendOtp() {
    const email = state.pendingOtpEmail;
    if (!email) {
        alert('Alamat email tidak ditemukan. Silakan lakukan pendaftaran ulang.');
        return;
    }

    try {
        const response = await fetch(apiUrl('/api/auth/resend-otp'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const result = await response.json();
        if (response.ok) {
            if (result.debugOtp && DOM.otpCodeInput) {
                DOM.otpCodeInput.value = result.debugOtp;
            }
            alert(result.message || 'Kode OTP 6-digit baru telah dikirimkan ke email Anda.');
        } else {
            alert('Gagal Mengirim OTP: ' + (result.error || 'Terjadi kesalahan.'));
        }
    } catch (err) {
        console.error(err);
        alert('Gagal menghubungi server.');
    }
}

function logout() {
    localStorage.removeItem('jawapay_token');
    state.user = null;
    state.balance = 0;
    state.transactions = [];
    DOM.landingContainer.style.display = 'none';
    DOM.mainAppContainer.style.display = 'none';
    DOM.authContainer.style.display = 'block';
    DOM.loginFormBox.style.display = 'block';
    DOM.registerFormBox.style.display = 'none';
    if (window.lucide) window.lucide.createIcons();
}

// ---------------- CORE UTILITIES & API SYNC ----------------

function getMarkupFlat() {
    if (!state.user || state.user.markupFlat === null || state.user.markupFlat === undefined) {
        return 1500;
    }
    return state.user.markupFlat;
}

async function syncPendingTransactions() {
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch(apiUrl('/api/transactions/sync'), {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.updated > 0) {
                const profRes = await fetch(apiUrl('/api/auth/profile'), {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (profRes.ok) {
                    const profile = await profRes.json();
                    state.balance = profile.balance;
                    state.transactions = profile.transactions;
                    if (DOM.balanceValue) DOM.balanceValue.textContent = formatRupiah(state.balance);
                }
            }
        }
    } catch (err) {
        console.warn('Sync pending status failed:', err);
    }
}

async function fetchDigiflazzDepositBalance() {
    const token = getToken();
    if (!token || !DOM.settingsDigiflazzDeposit) return;
    DOM.settingsDigiflazzDeposit.textContent = 'Memuat...';
    try {
        const res = await fetch(apiUrl('/api/digiflazz/deposit-balance'), {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            DOM.settingsDigiflazzDeposit.textContent = formatRupiah(data.deposit || 0);
        } else {
            DOM.settingsDigiflazzDeposit.textContent = 'Gagal memuat';
        }
    } catch (err) {
        console.warn('Fetch Digiflazz deposit balance error:', err);
        DOM.settingsDigiflazzDeposit.textContent = 'Error';
    }
}

async function fetchBalance() {
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch(apiUrl('/api/balance'), {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        state.balance = data.balance;
        DOM.balanceValue.textContent = formatRupiah(state.balance);
    } catch (err) {
        console.error(err);
    }
}

async function fetchProducts() {
    try {
        const res = await fetch(apiUrl('/api/products'));
        state.products = await res.json();
    } catch (err) {
        console.error(err);
    }
}

async function fetchPaymentChannels() {
    try {
        const res = await fetch(apiUrl('/api/payment-channels'));
        state.paymentChannels = await res.json();
        renderPaymentChannels();
    } catch (err) {
        console.error(err);
    }
}

// Render payment methods dynamically
function renderPaymentChannels() {
    DOM.paymentMethodsList.innerHTML = '';
    
    // 1. Add Agent Wallet
    const balCard = document.createElement('div');
    balCard.className = `payment-method-card ${state.selectedPaymentMethod === 'balance' ? 'selected' : ''}`;
    balCard.dataset.method = 'balance';
    balCard.innerHTML = `
        <i data-lucide="wallet" style="width: 16px; height: 16px; margin-bottom: 2px;"></i>
        <span class="payment-name">Saldo Agen</span>
    `;
    balCard.addEventListener('click', () => selectPaymentMethod('balance', balCard));
    DOM.paymentMethodsList.appendChild(balCard);

    // 2. Add Midtrans Snap Gate
    const midCard = document.createElement('div');
    midCard.className = `payment-method-card ${state.selectedPaymentMethod === 'midtrans' ? 'selected' : ''}`;
    midCard.dataset.method = 'midtrans';
    midCard.innerHTML = `
        <i data-lucide="credit-card" style="width: 16px; height: 16px; margin-bottom: 2px;"></i>
        <span class="payment-name">Midtrans Snap</span>
    `;
    midCard.addEventListener('click', () => selectPaymentMethod('midtrans', midCard));
    DOM.paymentMethodsList.appendChild(midCard);

    if (window.lucide) window.lucide.createIcons();
}

function selectPaymentMethod(method, cardElement) {
    document.querySelectorAll('.payment-method-card').forEach(c => c.classList.remove('selected'));
    cardElement.classList.add('selected');
    state.selectedPaymentMethod = method;
    
    updateCheckoutTotalDisplay();
}

function renderProducts() {
    DOM.productsGrid.innerHTML = '';
    
    if (!state.products) {
        DOM.productsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; color: #ef4444;">
                <div>⚠️</div>
                <p>Gagal memuat produk. Pastikan server backend Anda berjalan.</p>
            </div>
        `;
        return;
    }

    let productsToShow = [];
    const cat = state.selectedCategory;

    if (cat === 'pulsa' || cat === 'data' || cat === 'aktif') {
        if (state.detectedOperator) {
            productsToShow = state.products[cat][state.detectedOperator] || [];
        }
    } else if (cat === 'pln') {
        productsToShow = state.products.pln.global || [];
    } else if (cat === 'emoney' || cat === 'game' || cat === 'tv') {
        const sub = state.subCategory;
        if (sub && state.products[cat] && state.products[cat][sub]) {
            productsToShow = state.products[cat][sub];
        }
    }

    if (productsToShow.length === 0) {
        let msg = 'Silakan masukkan nomor HP tujuan terlebih dahulu';
        const hasInput = state.targetNumber && state.targetNumber.length >= 4;
        
        if (hasInput) {
            msg = 'Produk tidak tersedia untuk operator ini saat ini.';
        }
        
        if (cat === 'pln') {
            msg = hasInput ? 'Produk Token PLN tidak tersedia atau sedang gangguan.' : 'Silakan masukkan No. Meteran / ID Pelanggan';
        } else if (cat === 'emoney') {
            msg = state.subCategory ? 'Produk E-Wallet tidak tersedia untuk provider ini.' : 'Pilih jenis E-Wallet terlebih dahulu';
        } else if (cat === 'game') {
            msg = state.subCategory ? 'Produk Game tidak tersedia untuk jenis ini.' : 'Pilih jenis Game terlebih dahulu';
        } else if (cat === 'tv') {
            msg = state.subCategory ? 'Produk TV tidak tersedia untuk provider ini.' : 'Pilih jenis TV terlebih dahulu';
        }

        DOM.productsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-icon">${hasInput || state.subCategory ? '⚠️' : '📱'}</div>
                <p>${msg}</p>
            </div>
        `;
        DOM.checkoutBox.style.display = 'none';
        state.selectedProduct = null;
        updatePayButtonState();
        return;
    }

    productsToShow.forEach(prod => {
        const card = document.createElement('div');
        card.className = `product-card ${state.selectedProduct?.buyer_sku_code === prod.buyer_sku_code ? 'selected' : ''}`;
        card.innerHTML = `
            <div>
                <div class="product-title">${prod.name}</div>
                <div class="product-desc">${prod.desc}</div>
            </div>
            <div class="price-container">
                <div>
                    <div style="font-size: 9px; color: var(--text-muted);">HARGA AGEN</div>
                    <div class="price-agent">${formatRupiah(prod.priceAgent)}</div>
                </div>
                <div>
                    <div style="font-size: 9px; color: var(--text-secondary); text-align: right;">HARGA JUAL</div>
                    <div class="price-sell">${formatRupiah(prod.priceAgent + getMarkupFlat())}</div>
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
            document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectProduct(prod);
        });

        DOM.productsGrid.appendChild(card);
    });
}

function selectProduct(product) {
    state.selectedProduct = product;
    DOM.checkoutBox.style.display = 'flex';
    DOM.checkoutCardName.textContent = product.name;
    DOM.checkoutCardTarget.textContent = state.targetNumber || '-';
    DOM.checkoutPriceAgent.textContent = formatRupiah(product.priceAgent);
    
    const markup = getMarkupFlat();
    const calculatedSell = product.priceAgent + markup;
    DOM.checkoutPriceSell.textContent = formatRupiah(calculatedSell);
    DOM.checkoutProfit.textContent = formatRupiah(markup);
    
    // Clear voucher input and state when new product is selected
    state.appliedVoucherCode = null;
    state.voucherDiscount = 0;
    if (DOM.voucherInput) DOM.voucherInput.value = '';
    if (DOM.discountRow) DOM.discountRow.style.display = 'none';
    if (DOM.voucherStatusMsg) DOM.voucherStatusMsg.style.display = 'none';

    updateCheckoutTotalDisplay();
    updatePayButtonState();
}

function updatePayButtonState() {
    const hasTarget = state.targetNumber.length >= (state.selectedCategory === 'pln' ? 11 : 10);
    const hasProduct = state.selectedProduct !== null;
    DOM.btnPay.disabled = !(hasTarget && hasProduct);
}

// Setup Event Listeners
function setupListeners() {
    // Login and register switches
    DOM.linkToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        DOM.loginFormBox.style.display = 'none';
        DOM.registerFormBox.style.display = 'block';
    });
    DOM.linkToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        DOM.registerFormBox.style.display = 'none';
        DOM.loginFormBox.style.display = 'block';
    });

    // Back to landing page action
    document.querySelectorAll('.link-back-to-landing-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            DOM.authContainer.style.display = 'none';
            DOM.landingContainer.style.display = 'block';
            fetchLandingPrices();
        });
    });

    // Auth actions
    DOM.btnLoginSubmit.addEventListener('click', handleLogin);
    DOM.btnRegisterSubmit.addEventListener('click', handleRegister);
    DOM.btnLogout.addEventListener('click', logout);

    if (DOM.btnOtpSubmit) {
        DOM.btnOtpSubmit.addEventListener('click', handleVerifyOtp);
    }
    if (DOM.linkResendOtp) {
        DOM.linkResendOtp.addEventListener('click', (e) => {
            e.preventDefault();
            handleResendOtp();
        });
    }
    if (DOM.linkOtpToLogin) {
        DOM.linkOtpToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            if (DOM.otpFormBox) DOM.otpFormBox.style.display = 'none';
            if (DOM.loginFormBox) DOM.loginFormBox.style.display = 'block';
        });
    }

    // Terms & Privacy modals
    const linkTerms = document.getElementById('link-terms');
    const linkPrivacy = document.getElementById('link-privacy');
    const linkFaq = document.getElementById('link-faq');
    const linkRefund = document.getElementById('link-refund');
    const linkContact = document.getElementById('link-contact');

    const termsModal = document.getElementById('terms-modal');
    const privacyModal = document.getElementById('privacy-modal');
    const faqModal = document.getElementById('faq-modal');
    const refundModal = document.getElementById('refund-modal');
    const contactModal = document.getElementById('contact-modal');

    const btnCloseTerms = document.getElementById('btn-close-terms');
    const btnClosePrivacy = document.getElementById('btn-close-privacy');
    const btnCloseFaq = document.getElementById('btn-close-faq');
    const btnCloseRefund = document.getElementById('btn-close-refund');
    const btnCloseContact = document.getElementById('btn-close-contact');

    if (linkTerms && termsModal) {
        linkTerms.addEventListener('click', (e) => {
            e.preventDefault();
            termsModal.classList.add('show');
        });
    }
    if (linkPrivacy && privacyModal) {
        linkPrivacy.addEventListener('click', (e) => {
            e.preventDefault();
            privacyModal.classList.add('show');
        });
    }
    if (linkFaq && faqModal) {
        linkFaq.addEventListener('click', (e) => {
            e.preventDefault();
            faqModal.classList.add('show');
        });
    }
    if (linkRefund && refundModal) {
        linkRefund.addEventListener('click', (e) => {
            e.preventDefault();
            refundModal.classList.add('show');
        });
    }
    if (linkContact && contactModal) {
        linkContact.addEventListener('click', (e) => {
            e.preventDefault();
            contactModal.classList.add('show');
        });
    }

    const linkFaqSettings = document.getElementById('link-faq-settings');
    const linkTermsSettings = document.getElementById('link-terms-settings');
    const linkRefundSettings = document.getElementById('link-refund-settings');
    const linkPrivacySettings = document.getElementById('link-privacy-settings');

    if (linkFaqSettings && faqModal) {
        linkFaqSettings.addEventListener('click', (e) => {
            e.preventDefault();
            faqModal.classList.add('show');
        });
    }
    if (linkTermsSettings && termsModal) {
        linkTermsSettings.addEventListener('click', (e) => {
            e.preventDefault();
            termsModal.classList.add('show');
        });
    }
    if (linkRefundSettings && refundModal) {
        linkRefundSettings.addEventListener('click', (e) => {
            e.preventDefault();
            refundModal.classList.add('show');
        });
    }
    if (linkPrivacySettings && privacyModal) {
        linkPrivacySettings.addEventListener('click', (e) => {
            e.preventDefault();
            privacyModal.classList.add('show');
        });
    }

    if (btnCloseTerms) {
        btnCloseTerms.addEventListener('click', () => {
            termsModal.classList.remove('show');
        });
    }
    if (btnClosePrivacy) {
        btnClosePrivacy.addEventListener('click', () => {
            privacyModal.classList.remove('show');
        });
    }
    if (btnCloseFaq) {
        btnCloseFaq.addEventListener('click', () => {
            faqModal.classList.remove('show');
        });
    }
    if (btnCloseRefund) {
        btnCloseRefund.addEventListener('click', () => {
            refundModal.classList.remove('show');
        });
    }
    if (btnCloseContact) {
        btnCloseContact.addEventListener('click', () => {
            contactModal.classList.remove('show');
        });
    }

    [termsModal, privacyModal, faqModal, refundModal, contactModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });
        }
    });

    // Categories tab click
    DOM.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            DOM.tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const category = btn.dataset.category;
            state.selectedCategory = category;
            state.selectedProduct = null;
            state.detectedOperator = null;
            DOM.operatorBadge.className = 'operator-badge';
            DOM.operatorBadge.textContent = '';
            
            DOM.subCategoryWrapper.style.display = 'none';
            if (category === 'pulsa' || category === 'data' || category === 'aktif') {
                DOM.inputLabel.textContent = 'Nomor Handphone Tujuan';
                DOM.targetInput.placeholder = 'Contoh: 081234567890';
                DOM.targetInput.type = 'tel';
                handleNumberInput(DOM.targetInput.value);
            } else if (category === 'pln') {
                DOM.inputLabel.textContent = 'No. Meter / ID Pelanggan';
                DOM.targetInput.placeholder = 'Contoh: 14038294719';
                DOM.targetInput.type = 'number';
                state.detectedOperator = 'pln';
                DOM.operatorBadge.className = 'operator-badge show badge-pln';
                DOM.operatorBadge.textContent = 'PLN';
            } else if (category === 'emoney') {
                DOM.inputLabel.textContent = 'Nomor HP / ID Akun E-Wallet';
                DOM.targetInput.placeholder = 'Contoh: 081234567890';
                DOM.targetInput.type = 'tel';
                setupSubCategorySelect('emoney');
            } else if (category === 'game') {
                DOM.inputLabel.textContent = 'User ID / Zone ID Game';
                DOM.targetInput.placeholder = 'Contoh: 12345678 (2045)';
                DOM.targetInput.type = 'text';
                setupSubCategorySelect('game');
            } else if (category === 'tv') {
                DOM.inputLabel.textContent = 'Nomor Pelanggan / ID TV';
                DOM.targetInput.placeholder = 'Contoh: 80041234567';
                DOM.targetInput.type = 'number';
                setupSubCategorySelect('tv');
            }

            renderProducts();
        });
    });

    DOM.subCategorySelect.addEventListener('change', (e) => {
        state.subCategory = e.target.value;
        state.selectedProduct = null;
        renderProducts();
    });

    DOM.targetInput.addEventListener('input', (e) => {
        handleNumberInput(e.target.value);
    });

    if (DOM.btnTopup) {
        DOM.btnTopup.addEventListener('click', () => {
            if (state.activeDeposit) {
                checkAndShowActiveDepositModal();
            } else {
                document.getElementById('topup-form-content').style.display = 'block';
                document.getElementById('topup-instruction-box').style.display = 'none';
                if (DOM.topupAmountInput) DOM.topupAmountInput.value = '';
                if (DOM.topupModal) {
                    DOM.topupModal.classList.add('show');
                    DOM.topupModal.style.opacity = '1';
                    DOM.topupModal.style.pointerEvents = 'auto';
                }
            }
        });
    } else {
        console.error('[DEBUG] DOM.btnTopup is NULL! Cannot attach listener.');
    }

    document.querySelectorAll('.topup-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            DOM.topupAmountInput.value = btn.dataset.amount;
        });
    });

    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            closeAllModals();
        });
    });

    DOM.btnSaveTopup.addEventListener('click', async () => {
        const amount = parseInt(DOM.topupAmountInput.value);
        const bankName = document.getElementById('topup-bank-select').value;
        if (!amount || isNaN(amount) || amount < 2000) {
            alert('Minimal pengisian deposit adalah Rp 2.000');
            return;
        }

        const token = getToken();
        if (bankName === 'MIDTRANS') {
            try {
                DOM.btnSaveTopup.textContent = 'Membuat transaksi...';
                DOM.btnSaveTopup.disabled = true;

                const res = await fetch(apiUrl('/api/deposits/request-midtrans'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ amount })
                });
                const data = await res.json();
                
                DOM.btnSaveTopup.textContent = 'Dapatkan Tiket Transfer';
                DOM.btnSaveTopup.disabled = false;

                if (res.ok && data.success) {
                    closeAllModals();
                    
                    if (window.snap) {
                        window.snap.pay(data.token, {
                            onSuccess: async function(result) {
                                alert('Pembayaran Berhasil! Saldo Anda akan segera bertambah.');
                                await loadActiveDeposit();
                            },
                            onPending: async function(result) {
                                alert('Transaksi Pending! Silakan selesaikan pembayaran Anda.');
                                await loadActiveDeposit();
                            },
                            onError: function(result) {
                                alert('Pembayaran Gagal!');
                                console.error(result);
                            },
                            onClose: function() {
                                alert('Anda menutup halaman pembayaran.');
                            }
                        });
                    } else {
                        alert('Gagal memuat sistem pembayaran Midtrans. Mengarahkan ke halaman pembayaran...');
                        window.open(data.redirect_url, '_blank');
                    }
                    await loadActiveDeposit();
                } else {
                    alert('Gagal: ' + (data.error || 'Terjadi kesalahan'));
                }
            } catch (err) {
                console.error('Request Midtrans deposit error:', err);
                alert('Gagal menghubungi server.');
                DOM.btnSaveTopup.textContent = 'Dapatkan Tiket Transfer';
                DOM.btnSaveTopup.disabled = false;
            }
            return;
        }

        if (bankName === 'QRIS') {
            try {
                const res = await fetch(apiUrl('/api/deposits/request-qris'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ amount })
                });
                const data = await res.json();
                
                if (res.ok && data.success) {
                    closeAllModals();
                    document.getElementById('qris-barcode-img').src = data.deposit.qrUrl;
                    document.getElementById('qris-amount').textContent = formatRupiah(data.deposit.totalAmount);
                    
                    const btnSimSandbox = document.getElementById('btn-simulate-qris-sandbox');
                    if (btnSimSandbox) {
                        if (state.user && state.user.role === 'admin') {
                            btnSimSandbox.style.display = 'flex';
                            btnSimSandbox.setAttribute('data-id', data.deposit.id);
                            btnSimSandbox.onclick = () => {
                                simulateQrisDepositSuccess(data.deposit.id);
                            };
                        } else {
                            btnSimSandbox.style.display = 'none';
                        }
                    }
                    
                    document.getElementById('qris-modal').classList.add('show');
                    await loadActiveDeposit(); // Refresh widget
                } else {
                    alert('Gagal: ' + (data.error || 'Terjadi kesalahan'));
                }
            } catch (err) {
                console.error('Request QRIS error:', err);
                alert('Gagal menghubungi server.');
            }
            return;
        }

        try {
            const res = await fetch(apiUrl('/api/deposits/request'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ amount, bankName })
            });
            const data = await res.json();
            
            if (res.ok && data.success) {
                showTopupInstructions(data.deposit, data.bankAccounts);
                await loadActiveDeposit(); // Refresh widget
            } else {
                alert('Gagal: ' + (data.error || 'Terjadi kesalahan'));
            }
        } catch (err) {
            console.error('Request deposit error:', err);
            alert('Gagal menghubungi server.');
        }
    });

    const btnTopupDone = document.getElementById('btn-topup-done');
    if (btnTopupDone) {
        btnTopupDone.addEventListener('click', async () => {
            closeAllModals();
            showToast('Sistem sedang memverifikasi pembayaran otomatis Anda... ⏳', 'info');
            await syncUserProfile();
            await loadActiveDeposit();
        });
    }

    const btnTopupCancel = document.getElementById('btn-topup-cancel');
    if (btnTopupCancel) {
        btnTopupCancel.addEventListener('click', async () => {
            if (confirm('Apakah Anda yakin ingin membatalkan tiket deposit ini?')) {
                const depositId = btnTopupCancel.getAttribute('data-id');
                await cancelDeposit(depositId);
            }
        });
    }

    const btnWidgetDepDetail = document.getElementById('btn-widget-dep-detail');
    if (btnWidgetDepDetail) {
        btnWidgetDepDetail.addEventListener('click', () => {
            checkAndShowActiveDepositModal();
        });
    }

    const btnWidgetDepCancel = document.getElementById('btn-widget-dep-cancel');
    if (btnWidgetDepCancel) {
        btnWidgetDepCancel.addEventListener('click', async () => {
            if (confirm('Apakah Anda yakin ingin membatalkan tiket deposit ini?')) {
                const depositId = btnWidgetDepCancel.getAttribute('data-id');
                await cancelDeposit(depositId);
            }
        });
    }

    DOM.btnPay.addEventListener('click', () => {
        processPayment();
    });

    if (DOM.btnSimulatePay) {
        DOM.btnSimulatePay.addEventListener('click', () => {
            const depositId = DOM.btnSimulatePay.getAttribute('data-id');
            simulateQrisDepositSuccess(depositId);
        });
    }

    DOM.btnCloseReceipt.addEventListener('click', () => {
        DOM.receiptModal.classList.remove('show');
    });

    DOM.btnPrintReceipt.addEventListener('click', () => {
        window.print();
    });

    // Navigation Tabs & Analitik & Admin
    const navTransaction = document.getElementById('nav-transaction');
    const navAnalytics = document.getElementById('nav-analytics');
    const navDownlines = document.getElementById('nav-downlines');
    const navAdmin = document.getElementById('nav-admin');
    const viewTransaction = document.getElementById('view-transaction');
    const viewAnalytics = document.getElementById('view-analytics');
    const viewDownlines = document.getElementById('view-downlines');
    const viewAdmin = document.getElementById('view-admin');
    const btnExportCSV = document.getElementById('btn-export-csv');
 
    if (navTransaction && navAnalytics) {
        navTransaction.addEventListener('click', () => {
            navTransaction.classList.add('active');
            navAnalytics.classList.remove('active');
            if (navDownlines) navDownlines.classList.remove('active');
            if (navAdmin) navAdmin.classList.remove('active');
            viewTransaction.style.display = 'block';
            viewAnalytics.style.display = 'none';
            if (viewDownlines) viewDownlines.style.display = 'none';
            if (viewAdmin) viewAdmin.style.display = 'none';
        });
 
        navAnalytics.addEventListener('click', () => {
            navAnalytics.classList.add('active');
            navTransaction.classList.remove('active');
            if (navDownlines) navDownlines.classList.remove('active');
            if (navAdmin) navAdmin.classList.remove('active');
            viewTransaction.style.display = 'none';
            viewAnalytics.style.display = 'flex';
            if (viewDownlines) viewDownlines.style.display = 'none';
            if (viewAdmin) viewAdmin.style.display = 'none';
            
            updateAnalyticsDashboard();
        });

        if (navDownlines) {
            navDownlines.addEventListener('click', () => {
                navDownlines.classList.add('active');
                navTransaction.classList.remove('active');
                navAnalytics.classList.remove('active');
                if (navAdmin) navAdmin.classList.remove('active');
                viewTransaction.style.display = 'none';
                viewAnalytics.style.display = 'none';
                if (viewDownlines) viewDownlines.style.display = 'flex';
                if (viewAdmin) viewAdmin.style.display = 'none';
                
                loadDownlinesDashboard();
            });
        }

        if (navAdmin) {
            navAdmin.addEventListener('click', () => {
                navAdmin.classList.add('active');
                navTransaction.classList.remove('active');
                navAnalytics.classList.remove('active');
                if (navDownlines) navDownlines.classList.remove('active');
                viewTransaction.style.display = 'none';
                viewAnalytics.style.display = 'none';
                if (viewDownlines) viewDownlines.style.display = 'none';
                if (viewAdmin) viewAdmin.style.display = 'flex';
                
                loadAdminDashboard();
            });
        }
    }

    // Downline Registration Form Submit
    const downlineForm = document.getElementById('downline-register-form');
    if (downlineForm) {
        downlineForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('downline-name').value;
            const username = document.getElementById('downline-username').value;
            const email = document.getElementById('downline-email').value;
            const password = document.getElementById('downline-password').value;
            const referralMarkup = document.getElementById('downline-markup').value;
            
            const token = getToken();
            if (!token) return;
            
            try {
                const res = await fetch(apiUrl('/api/downlines/register'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ name, username, email, password, referralMarkup })
                });
                
                const data = await res.json();
                if (res.ok && data.success) {
                    alert('Downline berhasil didaftarkan!');
                    downlineForm.reset();
                    loadDownlinesDashboard();
                } else {
                    alert('Gagal mendaftarkan downline: ' + (data.error || 'Terjadi kesalahan'));
                }
            } catch (err) {
                console.error('Error registering downline:', err);
                alert('Terjadi kesalahan sistem saat mendaftarkan downline.');
            }
        });
    }
 
    if (btnExportCSV) {
        btnExportCSV.addEventListener('click', exportToCSV);
    }

    // Settings actions
    if (DOM.btnSettings) {
        DOM.btnSettings.addEventListener('click', () => {
            if (state.user) {
                DOM.settingsMarkupInput.value = getMarkupFlat();
                
                // Show current settings in modal UI
                const currentTheme = localStorage.getItem('jawapay_theme') || 'dark';
                updateThemeSelectionUI(currentTheme);

                const currentAccent = localStorage.getItem('jawapay_accent') || 'indigo';
                updateAccentSelectionUI(currentAccent);

                // Fetch Digiflazz Deposit balance ONLY for Admin accounts
                const digiflazzContainer = document.getElementById('settings-digiflazz-container');
                if (digiflazzContainer) {
                    if (state.user && state.user.role === 'admin') {
                        digiflazzContainer.style.display = 'block';
                        fetchDigiflazzDepositBalance();
                    } else {
                        digiflazzContainer.style.display = 'none';
                    }
                }

                DOM.settingsModal.classList.add('show');
            } else {
                alert('Silakan masuk terlebih dahulu.');
            }
        });
    }

    if (DOM.btnCheckDigiflazzDeposit) {
        DOM.btnCheckDigiflazzDeposit.addEventListener('click', fetchDigiflazzDepositBalance);
    }

    if (DOM.btnManualSyncTrxs) {
        DOM.btnManualSyncTrxs.addEventListener('click', async () => {
            DOM.btnManualSyncTrxs.disabled = true;
            DOM.btnManualSyncTrxs.innerHTML = '<i data-lucide="loader" class="pulse-loader" style="width: 15px; height: 15px;"></i> Menyinkronkan...';
            await syncPendingTransactions();
            DOM.btnManualSyncTrxs.disabled = false;
            DOM.btnManualSyncTrxs.innerHTML = '<i data-lucide="check" style="width: 15px; height: 15px;"></i> Berhasil Disinkronkan!';
            if (window.lucide) window.lucide.createIcons();
            setTimeout(() => {
                DOM.btnManualSyncTrxs.innerHTML = '<i data-lucide="rotate-cw" style="width: 15px; height: 15px;"></i> Sinkronkan Status Riwayat Transaksi';
                if (window.lucide) window.lucide.createIcons();
            }, 3000);
        });
    }

    if (DOM.btnSaveSettings) {
        DOM.btnSaveSettings.addEventListener('click', handleSaveSettings);
    }

    const btnChangePassword = document.getElementById('btn-settings-change-password');
    if (btnChangePassword) {
        btnChangePassword.addEventListener('click', handleSettingsChangePassword);
    }

    if (DOM.settingsThemeDark) {
        DOM.settingsThemeDark.addEventListener('click', () => {
            localStorage.setItem('jawapay_theme', 'dark');
            updateThemeSelectionUI('dark');
            applyThemeAndAccent();
        });
    }

    if (DOM.settingsThemeLight) {
        DOM.settingsThemeLight.addEventListener('click', () => {
            localStorage.setItem('jawapay_theme', 'light');
            updateThemeSelectionUI('light');
            applyThemeAndAccent();
        });
    }

    document.querySelectorAll('.accent-dot-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const selectedAccent = e.target.getAttribute('data-accent');
            localStorage.setItem('jawapay_accent', selectedAccent);
            updateAccentSelectionUI(selectedAccent);
            applyThemeAndAccent();
        });
    });

    // Receipt customization inputs
    if (DOM.receiptHeaderInput) {
        DOM.receiptHeaderInput.addEventListener('input', (e) => {
            DOM.receiptShopName.textContent = e.target.value || 'JAWA PAY DIGITAL';
        });
    }

    if (DOM.receiptFooterInput) {
        DOM.receiptFooterInput.addEventListener('input', (e) => {
            DOM.receiptFooterText.textContent = e.target.value || 'Terima Kasih Telah Bertransaksi';
        });
    }

    if (DOM.receiptWidthSelect) {
        DOM.receiptWidthSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            DOM.receiptPaper.className = `receipt-paper width-${val}`;
        });
    }

    // Landing page action handlers
    const btnGoToLogin = document.getElementById('btn-go-to-login');
    const btnHeroRegister = document.getElementById('btn-hero-register');
    const btnBottomRegister = document.getElementById('btn-bottom-register');
    const linkTermsLand = document.getElementById('link-terms-land');
    const linkPrivacyLand = document.getElementById('link-privacy-land');

    if (btnGoToLogin) {
        btnGoToLogin.addEventListener('click', () => {
            DOM.landingContainer.style.display = 'none';
            DOM.authContainer.style.display = 'block';
            DOM.loginFormBox.style.display = 'block';
            DOM.registerFormBox.style.display = 'none';
        });
    }

    [btnHeroRegister, btnBottomRegister].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                DOM.landingContainer.style.display = 'none';
                DOM.authContainer.style.display = 'block';
                DOM.loginFormBox.style.display = 'none';
                DOM.registerFormBox.style.display = 'block';
            });
        }
    });

    const linkFaqLand = document.getElementById('link-faq-land');
    const linkRefundLand = document.getElementById('link-refund-land');
    const linkContactLand = document.getElementById('link-contact-land');

    if (linkTermsLand) {
        linkTermsLand.addEventListener('click', (e) => {
            e.preventDefault();
            const termsM = document.getElementById('terms-modal');
            if (termsM) termsM.classList.add('show');
        });
    }

    if (linkPrivacyLand) {
        linkPrivacyLand.addEventListener('click', (e) => {
            e.preventDefault();
            const privacyM = document.getElementById('privacy-modal');
            if (privacyM) privacyM.classList.add('show');
        });
    }

    if (linkFaqLand) {
        linkFaqLand.addEventListener('click', (e) => {
            e.preventDefault();
            const faqM = document.getElementById('faq-modal');
            if (faqM) faqM.classList.add('show');
        });
    }

    if (linkRefundLand) {
        linkRefundLand.addEventListener('click', (e) => {
            e.preventDefault();
            const refundM = document.getElementById('refund-modal');
            if (refundM) refundM.classList.add('show');
        });
    }

    if (linkContactLand) {
        linkContactLand.addEventListener('click', (e) => {
            e.preventDefault();
            const contactM = document.getElementById('contact-modal');
            if (contactM) contactM.classList.add('show');
        });
    }

    if (DOM.btnApplyVoucher) {
        DOM.btnApplyVoucher.addEventListener('click', handleApplyVoucher);
    }
}

function setupSubCategorySelect(type) {
    DOM.subCategorySelect.innerHTML = '<option value="">-- Pilih --</option>';
    
    if (type === 'emoney') {
        DOM.subCategoryLabel.textContent = 'Jenis E-Wallet';
        DOM.subCategorySelect.innerHTML += `
            <option value="gopay">GoPay</option>
            <option value="ovo">OVO</option>
            <option value="dana">DANA</option>
            <option value="shopeepay">ShopeePay</option>
        `;
    } else if (type === 'game') {
        DOM.subCategoryLabel.textContent = 'Pilih Game';
        DOM.subCategorySelect.innerHTML += `
            <option value="mlbb">Mobile Legends</option>
            <option value="ff">Free Fire</option>
            <option value="pubg">PUBG Mobile</option>
        `;
    } else if (type === 'tv') {
        DOM.subCategoryLabel.textContent = 'Pilih Provider TV';
        DOM.subCategorySelect.innerHTML += `
            <option value="kvision">K-Vision</option>
            <option value="nexparabola">Nex Parabola</option>
        `;
    }
    DOM.subCategoryWrapper.style.display = 'block';
    state.subCategory = '';
}

function handleNumberInput(val) {
    state.targetNumber = val;
    if (state.selectedProduct) {
        DOM.checkoutCardTarget.textContent = val || '-';
    }

    if (state.selectedCategory === 'pulsa' || state.selectedCategory === 'data' || state.selectedCategory === 'aktif') {
        const op = detectOperator(val);
        if (op !== state.detectedOperator) {
            state.detectedOperator = op;
            state.selectedProduct = null;
            if (op) {
                DOM.operatorBadge.className = `operator-badge show badge-${op}`;
                DOM.operatorBadge.textContent = op;
            } else {
                DOM.operatorBadge.className = 'operator-badge';
                DOM.operatorBadge.textContent = '';
            }
            renderProducts();
        }
    }
    updatePayButtonState();
}

function closeAllModals() {
    if (DOM.topupModal) {
        DOM.topupModal.classList.remove('show');
        DOM.topupModal.style.opacity = '';
        DOM.topupModal.style.pointerEvents = '';
    }
    if (DOM.qrisModal) DOM.qrisModal.classList.remove('show');
    if (DOM.receiptModal) DOM.receiptModal.classList.remove('show');
    if (DOM.settingsModal) DOM.settingsModal.classList.remove('show');
    const termsM = document.getElementById('terms-modal');
    const privacyM = document.getElementById('privacy-modal');
    if (termsM) termsM.classList.remove('show');
    if (privacyM) privacyM.classList.remove('show');
    clearInterval(qrisTimerInterval);
}

// Payment Flow Execution
async function processPayment() {
    const cost = state.selectedProduct.priceAgent;
    const finalCost = cost - state.voucherDiscount;
    const method = state.selectedPaymentMethod;

    if (method === 'balance') {
        if (state.balance < finalCost) {
            alert('Saldo Agen Anda tidak mencukupi. Silakan lakukan Top Up terlebih dahulu.');
            return;
        }
        
        DOM.btnPay.disabled = true;
        DOM.btnPay.innerHTML = '⚡ Memotong saldo agen...';
        
        await executeDirectTransaction();
    } else {
        DOM.btnPay.disabled = true;
        DOM.btnPay.innerHTML = '💳 Membuat token Midtrans...';
        
        await executeMidtransPaymentRequest();
    }
}

// 1. Direct payment using Agent Balance (Protected API call)
async function executeDirectTransaction() {
    const ref_id = 'REF' + Date.now();
    const token = getToken();
    try {
        const response = await fetch(apiUrl('/api/transaction'), {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({
                buyer_sku_code: state.selectedProduct.buyer_sku_code,
                customer_no: state.targetNumber,
                ref_id: ref_id,
                voucherCode: state.appliedVoucherCode
            })
        });

        const result = await response.json();
        
        if (response.ok && result.data) {
            const data = result.data;
            
            // Sync updated balance and transaction history from DB profile
            await syncUserProfile();

            const profit = state.selectedProduct.priceSell - state.selectedProduct.priceAgent;
            const trx = {
                id: data.trx_id,
                time: new Date().toLocaleString('id-ID'),
                category: state.selectedCategory,
                productName: state.selectedProduct.name,
                target: state.targetNumber,
                priceAgent: state.selectedProduct.priceAgent,
                priceSell: state.selectedProduct.priceSell - state.voucherDiscount, // Adjusted by discount
                profit: profit,
                paymentMethod: 'Saldo Agen',
                status: data.status,
                sn: data.sn,
                voucherCode: state.appliedVoucherCode,
                discountApplied: state.voucherDiscount
            };

            showReceipt(trx);
            resetForm();
            
            // Auto sync pending status after 5s and 12s when operator finishes processing
            setTimeout(syncPendingTransactions, 4000);
            setTimeout(syncPendingTransactions, 10000);
        } else {
            alert('Transaksi Gagal: ' + (result.error || 'Terjadi kesalahan.') + (result.details ? '\nDetail: ' + result.details : ''));
        }
    } catch (err) {
        console.error(err);
        alert('Gagal memproses transaksi.');
    } finally {
        DOM.btnPay.disabled = false;
        DOM.btnPay.innerHTML = '<i data-lucide="send" style="width: 18px; height: 18px;"></i> Proses Pembayaran';
        if (window.lucide) window.lucide.createIcons();
    }
}

// 2. Request Midtrans Payment Invoice (Protected API call)
async function executeMidtransPaymentRequest() {
    const token = getToken();
    const markup = getMarkupFlat();
    const calculatedSell = state.selectedProduct.priceAgent + markup;
    
    // Total gross amount including dynamic Flat Rp 2.000 fee and deducting discount
    const totalAmount = Math.max(0, state.selectedProduct.priceAgent - state.voucherDiscount) + 2000;

    DOM.qrisAmount.textContent = formatRupiah(totalAmount);
    DOM.qrisModal.classList.add('show');

    try {
        const response = await fetch(apiUrl('/api/payment/request'), {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({
                method: 'midtrans',
                amount: state.selectedProduct.priceAgent,
                customer_phone: state.targetNumber,
                buyer_sku_code: state.selectedProduct.buyer_sku_code,
                voucherCode: state.appliedVoucherCode
            })
        });

        const result = await response.json();

        if (response.ok && result.token) {
            activeTripayInvoice = {
                merchant_ref: result.merchant_ref,
                buyer_sku_code: state.selectedProduct.buyer_sku_code,
                customer_no: state.targetNumber,
                paymentName: 'Midtrans Snap',
                totalAmount: totalAmount,
                productName: state.selectedProduct.name,
                priceSell: calculatedSell - state.voucherDiscount, // Adjusted by discount
                priceAgent: state.selectedProduct.priceAgent,
                voucherCode: state.appliedVoucherCode,
                discountApplied: state.voucherDiscount
            };

            // Trigger Midtrans Snap Popup
            if (window.snap) {
                window.snap.pay(result.token, {
                    onSuccess: async function(midtransResult) {
                        closeAllModals();
                        alert('Pembayaran Midtrans Berhasil! Memproses pengisian pulsa...');
                        await triggerSimulateSuccess(result.merchant_ref);
                    },
                    onPending: function(midtransResult) {
                        console.log('Payment pending:', midtransResult);
                    },
                    onError: function(midtransResult) {
                        alert('Pembayaran gagal dilakukan.');
                        closeAllModals();
                    },
                    onClose: function() {
                        console.log('Jendela Snap ditutup.');
                    }
                });
            } else {
                console.warn('Midtrans Snap SDK not loaded. Gunakan tombol simulasi di layar.');
            }
        } else {
            alert('Gagal memproses pembayaran: ' + (result.error || 'Terjadi kesalahan.'));
            closeAllModals();
        }
    } catch (err) {
        console.error('Error Midtrans payment:', err);
        alert('Gagal terhubung ke server pembayaran.');
        closeAllModals();
    } finally {
        DOM.btnPay.disabled = false;
        DOM.btnPay.innerHTML = '<i data-lucide="send" style="width: 18px; height: 18px;"></i> Proses Pembayaran';
        if (window.lucide) window.lucide.createIcons();
    }
}

// Helper to auto trigger success locally
async function triggerSimulateSuccess(merchantRef) {
    try {
        await fetch(apiUrl('/api/payment/simulate-callback'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                merchant_ref: merchantRef,
                buyer_sku_code: activeTripayInvoice.buyer_sku_code,
                customer_no: activeTripayInvoice.customer_no
            })
        });
        await syncUserProfile();
        renderTransactions();
    } catch (err) {
        console.error('Auto success trigger failed:', err);
    }
}

// 3. Webhook simulation (Unprotected post as webhook acts outside jwt, verified via invoice mapping)
async function simulateWebhookCallback() {
    if (!activeTripayInvoice) return;
    
    DOM.btnSimulatePay.disabled = true;
    DOM.btnSimulatePay.innerHTML = '⏳ Memproses Callback...';

    try {
        const response = await fetch(apiUrl('/api/payment/simulate-callback'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                merchant_ref: activeTripayInvoice.merchant_ref,
                buyer_sku_code: activeTripayInvoice.buyer_sku_code,
                customer_no: activeTripayInvoice.customer_no
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            const data = result.data;
            closeAllModals();

            // Sync updated profile transactions and balance
            await syncUserProfile();

            const trx = {
                id: data.trx_id,
                time: new Date().toLocaleString('id-ID'),
                category: state.selectedCategory,
                productName: activeTripayInvoice.productName,
                target: activeTripayInvoice.customer_no,
                priceAgent: activeTripayInvoice.priceAgent,
                priceSell: activeTripayInvoice.priceSell,
                profit: activeTripayInvoice.priceSell - activeTripayInvoice.priceAgent,
                paymentMethod: activeTripayInvoice.paymentName,
                status: data.status,
                sn: data.sn,
                voucherCode: activeTripayInvoice.voucherCode,
                discountApplied: activeTripayInvoice.discountApplied
            };

            showReceipt(trx);
            resetForm();
        } else {
            alert('Gagal memproses callback: ' + (result.error || 'Server error.'));
        }
    } catch (err) {
        console.error(err);
    } finally {
        DOM.btnSimulatePay.disabled = false;
        DOM.btnSimulatePay.innerHTML = '<i data-lucide="check-circle" style="width: 14px; height: 14px;"></i> Simulasikan Pembayaran Sukses';
        if (window.lucide) window.lucide.createIcons();
    }
}

// Helper to pull profile updates (balance & transactions list)
async function syncUserProfile() {
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch(apiUrl('/api/auth/profile'), {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const profile = await res.json();
            state.balance = profile.balance;
            state.transactions = profile.transactions;
            DOM.balanceValue.textContent = formatRupiah(state.balance);
            renderTransactions();
        }
    } catch (err) {
        console.error(err);
    }
}

// Non-blocking Toast Notification Helper
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 99999; display: flex; flex-direction: column; gap: 10px; pointer-events: none;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.style.cssText = `padding: 12px 18px; border-radius: 12px; font-size: 13px; font-weight: 700; color: white; background: ${type === 'success' ? '#10b981' : '#3b82f6'}; box-shadow: 0 8px 24px rgba(0,0,0,0.3); transition: all 0.3s ease; pointer-events: auto; opacity: 0; transform: translateY(-10px);`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 10);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Start background auto-sync polling every 4 seconds when user is logged in
let autoSyncInterval = null;
function startAutoSyncPolling() {
    if (autoSyncInterval) return;
    autoSyncInterval = setInterval(async () => {
        const token = getToken();
        if (!token) return;
        
        const previousActiveDeposit = state.activeDeposit;
        await syncUserProfile();
        await loadActiveDeposit();
        
        if (previousActiveDeposit && !state.activeDeposit) {
            closeAllModals();
            showToast('🎉 Pembayaran Berhasil! Saldo Anda telah otomatis masuk.', 'success');
        }
    }, 4000);
}

function resetForm() {
    DOM.targetInput.value = '';
    state.targetNumber = '';
    state.selectedProduct = null;
    if (state.selectedCategory !== 'pln') {
        state.detectedOperator = null;
        DOM.operatorBadge.className = 'operator-badge';
    }
    renderProducts();
    DOM.checkoutBox.style.display = 'none';
    document.getElementById('checkout-empty-state').style.display = 'flex';
    activeTripayInvoice = null;
}

function renderTransactions() {
    DOM.historyList.innerHTML = '';
    if (!state.transactions || state.transactions.length === 0) {
        DOM.historyList.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    Belum ada riwayat transaksi
                </td>
            </tr>
        `;
        return;
    }

    state.transactions.forEach(trx => {
        const tr = document.createElement('tr');
        const displayTime = trx.time || (trx.createdAt ? new Date(trx.createdAt).toLocaleString('id-ID') : '-');
        tr.innerHTML = `
            <td style="font-weight: 600;">${trx.id}</td>
            <td style="font-size: 12px; color: var(--text-secondary);">${displayTime}</td>
            <td>
                <div style="font-weight: 500;">${trx.productName}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${trx.target}</div>
            </td>
            <td>${formatRupiah(trx.priceSell)}</td>
            <td class="text-success" style="font-weight: 600;">+${formatRupiah(trx.profit)}</td>
            <td>
                <span class="status-badge status-${trx.status.toLowerCase() === 'sukses' ? 'success' : (trx.status.toLowerCase() === 'pending' ? 'pending' : 'failed')}">
                    ${trx.status}
                </span>
            </td>
        `;

        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => {
            showReceipt(trx);
        });

        DOM.historyList.appendChild(tr);
    });
}

function showReceipt(trx) {
    DOM.receiptTrxId.textContent = trx.id;
    DOM.receiptTime.textContent = trx.time || (trx.createdAt ? new Date(trx.createdAt).toLocaleString('id-ID') : '-');
    DOM.receiptTarget.textContent = trx.target;
    DOM.receiptProduct.textContent = trx.productName;
    DOM.receiptPrice.textContent = formatRupiah(trx.priceSell);
    DOM.receiptPayment.textContent = trx.paymentMethod;
    DOM.receiptStatus.textContent = trx.status;
    
    // Initialize customization preview inputs with defaults
    if (DOM.receiptHeaderInput) DOM.receiptHeaderInput.value = 'JAWA PAY DIGITAL';
    if (DOM.receiptFooterInput) DOM.receiptFooterInput.value = 'Terima Kasih Telah Bertransaksi';
    if (DOM.receiptWidthSelect) DOM.receiptWidthSelect.value = '58mm';
    if (DOM.receiptShopName) DOM.receiptShopName.textContent = 'JAWA PAY DIGITAL';
    if (DOM.receiptFooterText) DOM.receiptFooterText.textContent = 'Terima Kasih Telah Bertransaksi';
    if (DOM.receiptPaper) DOM.receiptPaper.className = 'receipt-paper width-58mm';

    const snRowId = 'receipt-sn-row';
    let snRow = document.getElementById(snRowId);
    if (snRow) snRow.remove();

    if (trx.sn && trx.sn !== '-') {
        snRow = document.createElement('div');
        snRow.id = snRowId;
        snRow.className = 'receipt-row';
        snRow.innerHTML = `<span>SN / Keterangan:</span><span class="receipt-val" style="font-size: 10px;">${trx.sn}</span>`;
        
        const statusRow = DOM.receiptStatus.closest('.receipt-row');
        statusRow.parentNode.insertBefore(snRow, statusRow);
    }

    // Dynamic voucher discount display on receipt
    const discountRowId = 'receipt-discount-row';
    let discountRow = document.getElementById(discountRowId);
    if (discountRow) discountRow.remove();

    if (trx.discountApplied && trx.discountApplied > 0) {
        discountRow = document.createElement('div');
        discountRow.id = discountRowId;
        discountRow.className = 'receipt-row';
        discountRow.style.fontSize = '12px';
        discountRow.style.color = '#059669';
        discountRow.innerHTML = `<span>Diskon Voucher (${trx.voucherCode}):</span><span class="receipt-val">-${formatRupiah(trx.discountApplied)}</span>`;
        
        const totalBox = DOM.receiptPrice.closest('.receipt-total-box');
        totalBox.parentNode.insertBefore(discountRow, totalBox);
    }

    DOM.receiptModal.classList.add('show');
}

// Global Chart.js Instance
let myChartInstance = null;

// Update Stats summary and Chart
async function updateAnalyticsDashboard() {
    // 1. Calculate basic count stats locally from state.transactions
    const successTrxs = state.transactions.filter(t => t.status === 'Sukses');
    document.getElementById('stats-total-trx').textContent = successTrxs.length;

    // 2. Fetch server-aggregated earnings analytics
    const token = getToken();
    if (!token) return;

    try {
        const res = await fetch(apiUrl('/api/analytics/earnings'), {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
            // Update Stats Cards
            document.getElementById('stats-profit-today').textContent = formatRupiah(data.summary.today);
            document.getElementById('stats-profit-month').textContent = formatRupiah(data.summary.month);
            document.getElementById('stats-total-profit').textContent = formatRupiah(data.summary.total);
            
            // Render Neon Chart
            const ctx = document.getElementById('profitChart');
            if (ctx) {
                if (myChartInstance) {
                    myChartInstance.destroy();
                }
                
                myChartInstance = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: data.chart.labels,
                        datasets: [{
                            label: 'Laba Bersih (Rp)',
                            data: data.chart.data,
                            borderColor: '#a855f7',
                            backgroundColor: 'rgba(168, 85, 247, 0.15)',
                            borderWidth: 3,
                            fill: true,
                            tension: 0.4,
                            pointBackgroundColor: '#818cf8',
                            pointBorderColor: '#ffffff',
                            pointHoverRadius: 7
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: false
                            }
                        },
                        scales: {
                            y: {
                                grid: {
                                    color: 'rgba(255, 255, 255, 0.05)'
                                },
                                ticks: {
                                    color: '#94a3b8',
                                    font: {
                                        family: 'Outfit'
                                    }
                                }
                            },
                            x: {
                                grid: {
                                    display: false
                                },
                                ticks: {
                                    color: '#94a3b8',
                                    font: {
                                        family: 'Outfit'
                                    }
                                }
                            }
                        }
                    }
                });
            }
        }
    } catch (err) {
        console.error('Error updating analytics dashboard:', err);
    }
}

function exportToCSV() {
    if (state.transactions.length === 0) {
        alert('Belum ada transaksi untuk diekspor.');
        return;
    }

    // Build CSV Content
    let csvContent = 'ID Transaksi,Waktu,Kategori,Nama Produk,Tujuan,Harga Agen,Harga Jual,Profit,Metode Pembayaran,Status,SN\n';
    
    state.transactions.forEach(trx => {
        const row = [
            trx.id,
            `"${trx.time}"`,
            trx.category || 'N/A',
            `"${trx.productName}"`,
            `"${trx.target}"`,
            trx.priceAgent,
            trx.priceSell,
            trx.profit,
            trx.paymentMethod || '-',
            trx.status,
            `"${trx.sn || '-'}"`
        ];
        csvContent += row.join(',') + '\n';
    });

    // Download Trigger
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Laporan_Penjualan_${state.user ? state.user.username : 'Agen'}_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function handleSaveSettings() {
    const markupFlat = parseInt(DOM.settingsMarkupInput.value);
    if (isNaN(markupFlat) || markupFlat < 0) {
        alert('Masukkan nominal markup yang valid (lebih dari atau sama dengan 0).');
        return;
    }

    DOM.btnSaveSettings.disabled = true;
    DOM.btnSaveSettings.innerHTML = '⏳ Menyimpan...';

    try {
        const response = await fetch(apiUrl('/api/auth/profile/update-markup'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ markupFlat })
        });

        const result = await response.json();

        if (response.ok) {
            state.user.markupFlat = result.markupFlat;
            alert('Setelan harga jual berhasil disimpan! Seluruh harga produk disesuaikan.');
            closeAllModals();
            renderProducts();
            
            // If there's an active selected product, update the checkout box as well
            if (state.selectedProduct) {
                selectProduct(state.selectedProduct);
            }
        } else {
            alert('Gagal menyimpan: ' + (result.error || 'Terjadi kesalahan.'));
        }
    } catch (err) {
        console.error(err);
        alert('Gagal menghubungi server.');
    } finally {
        DOM.btnSaveSettings.disabled = false;
        DOM.btnSaveSettings.innerHTML = '<i data-lucide="save" style="width: 18px; height: 18px;"></i> Simpan Setelan';
        if (window.lucide) window.lucide.createIcons();
    }
}

function applyThemeAndAccent() {
    const currentTheme = localStorage.getItem('jawapay_theme') || 'dark';
    const currentAccent = localStorage.getItem('jawapay_accent') || 'indigo';

    // Apply Theme
    if (currentTheme === 'light') {
        document.documentElement.classList.add('light-theme');
    } else {
        document.documentElement.classList.remove('light-theme');
    }

    // Apply Accent
    document.documentElement.classList.remove('accent-indigo', 'accent-emerald', 'accent-sunset', 'accent-ocean');
    document.documentElement.classList.add(`accent-${currentAccent}`);
}

function updateThemeSelectionUI(theme) {
    if (DOM.settingsThemeLight && DOM.settingsThemeDark) {
        if (theme === 'light') {
            DOM.settingsThemeLight.classList.add('active');
            DOM.settingsThemeDark.classList.remove('active');
        } else {
            DOM.settingsThemeDark.classList.add('active');
            DOM.settingsThemeLight.classList.remove('active');
        }
    }
}

function updateAccentSelectionUI(accent) {
    document.querySelectorAll('.accent-dot-btn').forEach(btn => {
        if (btn.getAttribute('data-accent') === accent) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

async function loadMidtransScript() {
    try {
        const res = await fetch(apiUrl('/api/config/payment'));
        const config = await res.json();
        
        // Sembunyikan info akun uji coba secara otomatis di mode produksi
        if (config.isProduction) {
            const credentialsBox = document.getElementById('reviewer-credentials-box');
            if (credentialsBox) {
                credentialsBox.style.display = 'none';
            }
        }

        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = config.isProduction 
            ? 'https://app.midtrans.com/snap/snap.js' 
            : 'https://app.sandbox.midtrans.com/snap/snap.js';
        script.setAttribute('data-client-key', config.clientKey);
        document.head.appendChild(script);
        console.log(`[Midtrans] Loaded dynamically in ${config.isProduction ? 'PRODUCTION' : 'SANDBOX'} mode.`);
    } catch (err) {
        console.error('Failed to load Midtrans script:', err);
    }
}

// ---------------- LANDING PAGE PRICING LOADER ----------------

let landingProducts = null;
let currentLandingCategory = 'pulsa';
let currentLandingOperator = null;

async function fetchLandingPrices() {
    try {
        const res = await fetch(apiUrl('/api/products'));
        if (res.ok) {
            landingProducts = await res.json();
            renderLandingCategoryTabs();
            renderLandingPrices();
        } else {
            console.error('Gagal mengambil harga produk untuk landing page.');
        }
    } catch (err) {
        console.error('Koneksi katalog landing page gagal:', err);
    }
}

function renderLandingCategoryTabs() {
    // Add event listeners to category tabs
    document.querySelectorAll('#landing-tabs button').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#landing-tabs button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLandingCategory = btn.getAttribute('data-landcat');
            currentLandingOperator = null; // Reset operator choice
            renderLandingPrices();
        };
    });
}

function renderLandingPrices() {
    const operatorContainer = document.getElementById('landing-operators');
    const rowsContainer = document.getElementById('landing-price-rows');
    if (!rowsContainer || !landingProducts) return;
    
    // Get products for the selected category
    const categoryData = landingProducts[currentLandingCategory];
    if (!categoryData) {
        rowsContainer.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-secondary);">Produk tidak tersedia</td></tr>';
        operatorContainer.innerHTML = '';
        return;
    }
    
    // For categories that have brands/operators
    let operators = [];
    let productsToRender = [];
    
    if (currentLandingCategory === 'pln') {
        operatorContainer.innerHTML = ''; // PLN doesn't need operator dots
        productsToRender = categoryData.global || [];
    } else {
        operators = Object.keys(categoryData);
        
        // Render operator dots/pills selector
        operatorContainer.innerHTML = '';
        if (operators.length > 0) {
            if (!currentLandingOperator || !operators.includes(currentLandingOperator)) {
                currentLandingOperator = operators[0];
            }
            
            const friendlyNames = {
                telkomsel: 'TELKOMSEL',
                indosat: 'INDOSAT OOREDOO',
                xl: 'XL AXIATA',
                axis: 'AXIS',
                tri: 'TRI (3)',
                smartfren: 'SMARTFREN',
                gopay: 'GOPAY',
                ovo: 'OVO',
                dana: 'DANA',
                shopeepay: 'SHOPEEPAY'
            };
            
            operators.forEach(op => {
                const btn = document.createElement('button');
                btn.className = `operator-pill-btn ${op === currentLandingOperator ? 'active' : ''}`;
                btn.textContent = friendlyNames[op] || op.toUpperCase();
                btn.onclick = () => {
                    currentLandingOperator = op;
                    renderLandingPrices();
                };
                operatorContainer.appendChild(btn);
            });
            
            productsToRender = categoryData[currentLandingOperator] || [];
        }
    }
    
    // Render rows
    rowsContainer.innerHTML = '';
    if (productsToRender.length === 0) {
        rowsContainer.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-secondary);">Tidak ada produk aktif</td></tr>';
        return;
    }
    
    productsToRender.forEach(prod => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--card-border)';
        
        tr.innerHTML = `
            <td style="padding: 14px 12px; font-weight: 600; color: var(--text-primary); text-align: left;">${prod.name}</td>
            <td style="padding: 14px 12px; font-family: monospace; color: var(--text-muted); text-align: left;">${prod.sku}</td>
            <td style="padding: 14px 12px; font-weight: 700; color: var(--primary); text-align: left;">${formatRupiah(prod.priceAgent)}</td>
            <td style="padding: 14px 12px; text-align: right;">
                <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;">AKTIF</span>
            </td>
        `;
        rowsContainer.appendChild(tr);
    });
}

// ---------------- VOUCHER FUNCTIONALITY ----------------

async function handleApplyVoucher() {
    if (!state.selectedProduct) {
        alert('Silakan pilih produk terlebih dahulu sebelum menerapkan kupon.');
        return;
    }
    const code = DOM.voucherInput.value.trim();
    if (!code) {
        alert('Masukkan kode voucher terlebih dahulu.');
        return;
    }

    DOM.btnApplyVoucher.disabled = true;
    DOM.btnApplyVoucher.textContent = '⏳ ...';
    
    try {
        const token = getToken();
        const res = await fetch(apiUrl('/api/vouchers/validate'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                code: code,
                priceAgent: state.selectedProduct.priceAgent
            })
        });

        const result = await res.json();
        if (res.ok && result.success) {
            state.appliedVoucherCode = result.code;
            state.voucherDiscount = result.discount;

            // Show discount row in checkout box
            DOM.discountVal.textContent = `-${formatRupiah(result.discount)}`;
            DOM.discountRow.style.display = 'flex';

            // Show success message
            DOM.voucherStatusMsg.style.display = 'block';
            DOM.voucherStatusMsg.style.color = '#34d399'; // Success green
            DOM.voucherStatusMsg.textContent = `Kupon ${result.code} berhasil diterapkan! Diskon ${formatRupiah(result.discount)}`;
            
            // Recalculate total bayar
            updateCheckoutTotalDisplay();
        } else {
            // Failed
            resetVoucherState();
            DOM.voucherStatusMsg.style.display = 'block';
            DOM.voucherStatusMsg.style.color = '#f87171'; // Error red
            DOM.voucherStatusMsg.textContent = result.error || 'Voucher tidak dapat digunakan.';
        }
    } catch (err) {
        console.error('Apply voucher error:', err);
        alert('Gagal memvalidasi kupon.');
        resetVoucherState();
    } finally {
        DOM.btnApplyVoucher.disabled = false;
        DOM.btnApplyVoucher.textContent = 'Pakai';
    }
}

function resetVoucherState() {
    state.appliedVoucherCode = null;
    state.voucherDiscount = 0;
    if (DOM.voucherInput) DOM.voucherInput.value = '';
    if (DOM.discountRow) DOM.discountRow.style.display = 'none';
    if (DOM.discountVal) DOM.discountVal.textContent = '-Rp 0';
    if (DOM.voucherStatusMsg) DOM.voucherStatusMsg.style.display = 'none';
    if (DOM.voucherStatusMsg) DOM.voucherStatusMsg.textContent = '';
    updateCheckoutTotalDisplay();
}

function updateCheckoutTotalDisplay() {
    if (!state.selectedProduct) return;
    
    let total = state.selectedProduct.priceAgent - state.voucherDiscount;
    if (total < 0) total = 0;

    if (state.selectedPaymentMethod !== 'balance') {
        total += 2000; // Flat Rp 2.000 fee for Midtrans sandbox gateway simulation
    }
    
    DOM.checkoutTotal.textContent = formatRupiah(total);
}

// ==========================================
//             ADMIN DASHBOARD FLOW
// ==========================================

// Global state variables for admin
state.adminUsers = [];
state.adminTransactions = [];
state.adminVouchers = [];
state.selectedAdminUserId = null;

let adminListenersInitialized = false;
let currentAdminTab = 'summary';

async function loadAdminDashboard() {
    initAdminListeners();
    await switchAdminTab(currentAdminTab);
}

function initAdminListeners() {
    if (adminListenersInitialized) return;
    adminListenersInitialized = true;

    // Subtabs click listener
    const subtabsNav = document.getElementById('admin-subtabs-nav');
    if (subtabsNav) {
        subtabsNav.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-admin-tab]');
            if (!btn) return;
            const tabName = btn.getAttribute('data-admin-tab');
            
            // Toggle active classes in subtab buttons
            subtabsNav.querySelectorAll('[data-admin-tab]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Switch subviews
            document.querySelectorAll('.admin-subview').forEach(view => view.style.display = 'none');
            const targetView = document.getElementById(`admin-view-${tabName}`);
            if (targetView) targetView.style.display = 'block';

            currentAdminTab = tabName;
            switchAdminTab(tabName);
        });
    }

    // Save adjusted balance
    const btnAdminSaveBalance = document.getElementById('btn-admin-save-balance');
    if (btnAdminSaveBalance) {
        btnAdminSaveBalance.addEventListener('click', handleAdminAdjustBalance);
    }

    // Save custom markup
    const btnAdminSaveMarkup = document.getElementById('btn-admin-save-markup');
    if (btnAdminSaveMarkup) {
        btnAdminSaveMarkup.addEventListener('click', handleAdminSaveMarkup);
    }

    // Create new voucher
    const btnAdminCreateVoucher = document.getElementById('btn-admin-create-voucher');
    if (btnAdminCreateVoucher) {
        btnAdminCreateVoucher.addEventListener('click', handleAdminCreateVoucher);
    }

    // Global transactions search & filter
    const trxSearch = document.getElementById('admin-trx-search');
    if (trxSearch) {
        trxSearch.addEventListener('input', renderAdminTransactions);
    }

    const trxFilter = document.getElementById('admin-trx-filter-status');
    if (trxFilter) {
        trxFilter.addEventListener('change', renderAdminTransactions);
    }

    // Save system announcement
    const btnAdminSaveAnnouncement = document.getElementById('btn-admin-save-announcement');
    if (btnAdminSaveAnnouncement) {
        btnAdminSaveAnnouncement.addEventListener('click', handleAdminSaveAnnouncement);
    }
}

async function switchAdminTab(tab) {
    if (tab === 'summary') {
        await loadAdminSummary();
    } else if (tab === 'users') {
        await loadAdminUsers();
    } else if (tab === 'transactions') {
        await loadAdminTransactions();
    } else if (tab === 'vouchers') {
        await loadAdminVouchers();
    } else if (tab === 'deposits') {
        await loadAdminDeposits();
    }
    if (window.lucide) window.lucide.createIcons();
}

async function loadAdminSummary() {
    try {
        const token = getToken();
        const res = await fetch(apiUrl('/api/admin/summary'), {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Forbidden');
        const data = await res.json();
        
        if (data.success) {
            document.getElementById('admin-stat-users').textContent = data.summary.totalUsers;
            document.getElementById('admin-stat-balance').textContent = formatRupiah(data.summary.totalBalance);
            document.getElementById('admin-stat-digiflazz').textContent = formatRupiah(data.summary.digiflazzBalance);
            
            document.getElementById('admin-stat-success').textContent = data.summary.successTrxs;
            document.getElementById('admin-stat-pending').textContent = data.summary.pendingTrxs;
            document.getElementById('admin-stat-failed').textContent = data.summary.failedTrxs;

            // Sync current announcement in admin panel
            await fetchAnnouncement();
        }
    } catch (err) {
        console.error('[Admin] Gagal memuat ringkasan:', err);
        alert('Gagal memuat ringkasan data admin.');
    }
}

async function loadAdminUsers() {
    try {
        const token = getToken();
        const res = await fetch(apiUrl('/api/admin/users'), {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Forbidden');
        const data = await res.json();
        
        if (data.success) {
            state.adminUsers = data.users;
            document.getElementById('admin-users-count').textContent = `${data.users.length} Agen`;
            renderAdminUsers();
        }
    } catch (err) {
        console.error('[Admin] Gagal memuat daftar agen:', err);
    }
}

function renderAdminUsers() {
    const tbody = document.getElementById('admin-users-table-body');
    if (!tbody) return;

    if (state.adminUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada agen terdaftar.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    state.adminUsers.forEach(u => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';
        row.innerHTML = `
            <td style="padding: 12px 6px;">
                <div style="font-weight: 700; color: white;">${u.name}</div>
                <div style="font-size: 10px; color: var(--text-muted);">${u.id}</div>
            </td>
            <td style="padding: 12px 6px;">
                <div>@${u.username}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${u.email}</div>
            </td>
            <td style="padding: 12px 6px; text-align: right; font-weight: 700; color: #10b981;">
                ${formatRupiah(u.balance)}
            </td>
            <td style="padding: 12px 6px; text-align: right;">
                +${formatRupiah(u.markupFlat)}
            </td>
            <td style="padding: 12px 6px; text-align: center;">
                <span style="font-size: 10px; padding: 2px 6px; border-radius: 6px; font-weight: 700; background: ${u.isVerified ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}; color: ${u.isVerified ? '#10b981' : '#ef4444'};">
                    ${u.isVerified ? 'Aktif' : 'Nonaktif'}
                </span>
            </td>
            <td style="padding: 12px 6px; text-align: center;">
                <div style="display: flex; gap: 6px; justify-content: center;">
                    <button class="tab-btn btn-adj-balance" data-id="${u.id}" data-name="${u.name}" style="padding: 4px 8px; font-size: 10px; border-radius: 6px;" title="Sesuaikan Saldo">
                        <i data-lucide="plus-circle" style="width: 12px; height: 12px; vertical-align: middle;"></i> Saldo
                    </button>
                    <button class="tab-btn btn-adj-markup" data-id="${u.id}" data-name="${u.name}" data-markup="${u.markupFlat}" style="padding: 4px 8px; font-size: 10px; border-radius: 6px;" title="Edit Markup">
                        <i data-lucide="edit" style="width: 12px; height: 12px; vertical-align: middle;"></i> Profit
                    </button>
                    <button class="tab-btn btn-delete-user" data-id="${u.id}" data-name="${u.name}" style="padding: 4px 8px; font-size: 10px; border-radius: 6px; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); color: #ef4444;" title="Hapus Agen">
                        <i data-lucide="trash-2" style="width: 12px; height: 12px; vertical-align: middle;"></i> Hapus
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Attach actions
    tbody.querySelectorAll('.btn-adj-balance').forEach(btn => {
        btn.addEventListener('click', () => {
            state.selectedAdminUserId = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            document.getElementById('admin-balance-modal-desc').innerHTML = `Sesuaikan saldo untuk agen: <strong style="color:#38bdf8;">${name}</strong>`;
            document.getElementById('admin-balance-amount-input').value = '';
            document.getElementById('admin-balance-modal').classList.add('show');
        });
    });

    tbody.querySelectorAll('.btn-adj-markup').forEach(btn => {
        btn.addEventListener('click', () => {
            state.selectedAdminUserId = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            const markup = btn.getAttribute('data-markup');
            document.getElementById('admin-markup-modal-desc').innerHTML = `Markup flat agen: <strong style="color:#38bdf8;">${name}</strong>`;
            document.getElementById('admin-markup-amount-input').value = markup;
            document.getElementById('admin-markup-modal').classList.add('show');
        });
    });

    tbody.querySelectorAll('.btn-delete-user').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            if (confirm(`Apakah Anda yakin ingin menghapus akun agen "${name}" (${id}) secara permanen?\nTindakan ini tidak bisa dibatalkan.`)) {
                try {
                    const token = getToken();
                    const res = await fetch(apiUrl(`/api/admin/users/${id}`), {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const data = await res.json();
                    if (res.ok && data.success) {
                        alert(data.message || 'Agen berhasil dihapus.');
                        await loadAdminUsers(); // Refresh the list
                    } else {
                        alert('Gagal: ' + (data.error || 'Terjadi kesalahan'));
                    }
                } catch (err) {
                    console.error('Delete user error:', err);
                    alert('Gagal menghubungi server.');
                }
            }
        });
    });
}

async function handleAdminAdjustBalance() {
    const id = state.selectedAdminUserId;
    const action = document.getElementById('admin-balance-action-select').value;
    const amount = parseInt(document.getElementById('admin-balance-amount-input').value);

    if (isNaN(amount) || amount < 0) {
        alert('Masukkan jumlah nominal saldo yang valid.');
        return;
    }

    try {
        const token = getToken();
        const res = await fetch(apiUrl(`/api/admin/users/${id}/balance`), {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ amount, action })
        });
        const result = await res.json();
        
        if (res.ok) {
            alert(result.message || 'Saldo berhasil disesuaikan.');
            document.getElementById('admin-balance-modal').classList.remove('show');
            await loadAdminUsers();
        } else {
            alert('Gagal: ' + result.error);
        }
    } catch (err) {
        console.error(err);
        alert('Gagal menyesuaikan saldo agen.');
    }
}

async function handleAdminSaveMarkup() {
    const id = state.selectedAdminUserId;
    const markupFlat = parseInt(document.getElementById('admin-markup-amount-input').value);

    if (isNaN(markupFlat) || markupFlat < 0) {
        alert('Masukkan nominal markup flat keuntungan yang valid.');
        return;
    }

    try {
        const token = getToken();
        const res = await fetch(apiUrl(`/api/admin/users/${id}/markup`), {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ markupFlat })
        });
        const result = await res.json();

        if (res.ok) {
            alert(result.message || 'Markup flat keuntungan berhasil disimpan.');
            document.getElementById('admin-markup-modal').classList.remove('show');
            await loadAdminUsers();
        } else {
            alert('Gagal: ' + result.error);
        }
    } catch (err) {
        console.error(err);
        alert('Gagal mengubah markup agen.');
    }
}

async function loadAdminTransactions() {
    try {
        const token = getToken();
        const res = await fetch(apiUrl('/api/admin/transactions'), {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Forbidden');
        const data = await res.json();
        
        if (data.success) {
            state.adminTransactions = data.transactions;
            renderAdminTransactions();
        }
    } catch (err) {
        console.error('[Admin] Gagal memuat transaksi global:', err);
    }
}

function renderAdminTransactions() {
    const tbody = document.getElementById('admin-trxs-table-body');
    if (!tbody) return;

    const query = document.getElementById('admin-trx-search').value.toLowerCase().trim();
    const filter = document.getElementById('admin-trx-filter-status').value;

    const filtered = state.adminTransactions.filter(t => {
        const matchesQuery = t.id.toLowerCase().includes(query) || 
                             t.customerNo.toLowerCase().includes(query) || 
                             (t.user && t.user.name.toLowerCase().includes(query));
        const matchesFilter = filter === 'ALL' || t.status === filter;
        return matchesQuery && matchesFilter;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada riwayat transaksi yang cocok.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach(t => {
        const dateStr = new Date(t.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
        
        let statusBadge = '';
        if (t.status === 'Sukses') statusBadge = '<span style="color:#10b981; font-weight:700;">SUKSES</span>';
        else if (t.status === 'Pending') statusBadge = '<span style="color:#f59e0b; font-weight:700;">PENDING</span>';
        else statusBadge = '<span style="color:#ef4444; font-weight:700;">GAGAL</span>';

        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';
        row.innerHTML = `
            <td style="padding: 10px 4px;">
                <div style="font-weight: 700; color: white;">${t.id}</div>
                <div style="font-size: 9px; color: var(--text-muted);">${dateStr}</div>
            </td>
            <td style="padding: 10px 4px;">
                <div style="font-weight:600;">${t.user ? t.user.name : 'Unknown'}</div>
                <div style="font-size:10px; color:var(--text-muted);">@${t.user ? t.user.username : ''}</div>
            </td>
            <td style="padding: 10px 4px;">
                <div style="font-weight:600; color:white;">${t.productName}</div>
                <div style="font-size:10px; color:#38bdf8;">${t.customerNo}</div>
            </td>
            <td style="padding: 10px 4px; text-align: right; font-weight: 700;">
                ${formatRupiah(t.priceAgent)}
            </td>
            <td style="padding: 10px 4px; font-family: monospace; font-size: 11px;">
                ${t.sn || '-'}
            </td>
            <td style="padding: 10px 4px; text-align: center;">
                ${statusBadge}
            </td>
            <td style="padding: 10px 4px; text-align: center;">
                <select class="admin-set-status-select" data-id="${t.id}" style="padding: 4px 6px; font-size: 10px; border-radius: 6px; border: 1px solid var(--card-border); background: #0a0814; color: white; cursor: pointer;">
                    <option value="" disabled selected>Ubah...</option>
                    <option value="Sukses">Set Sukses</option>
                    <option value="Pending">Set Pending</option>
                    <option value="Gagal">Set Gagal (Refund)</option>
                </select>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Attach set status actions
    tbody.querySelectorAll('.admin-set-status-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const id = select.getAttribute('data-id');
            const status = e.target.value;
            if (!confirm(`Apakah Anda yakin ingin mengubah status transaksi ${id} menjadi "${status}"?`)) {
                select.value = '';
                return;
            }

            try {
                const token = getToken();
                const res = await fetch(apiUrl(`/api/admin/transactions/${id}/status`), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ status })
                });
                const result = await res.json();
                
                if (res.ok) {
                    alert(result.message || 'Status transaksi berhasil diubah.');
                    await loadAdminTransactions();
                } else {
                    alert('Gagal: ' + result.error);
                }
            } catch (err) {
                console.error(err);
                alert('Gagal mengubah status transaksi.');
            }
        });
    });
}

async function loadAdminVouchers() {
    try {
        const token = getToken();
        const res = await fetch(apiUrl('/api/admin/vouchers'), {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Forbidden');
        const data = await res.json();

        if (data.success) {
            state.adminVouchers = data.vouchers;
            renderAdminVouchers();
        }
    } catch (err) {
        console.error('[Admin] Gagal memuat daftar voucher:', err);
    }
}

function renderAdminVouchers() {
    const tbody = document.getElementById('admin-vouchers-table-body');
    if (!tbody) return;

    if (state.adminVouchers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada voucher dibuat.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    state.adminVouchers.forEach(v => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';
        row.innerHTML = `
            <td style="padding: 12px 6px; font-weight: 800; color: #c084fc;">${v.code}</td>
            <td style="padding: 12px 6px;">${v.type === 'percent' ? v.discount + '%' : formatRupiah(v.discount)}</td>
            <td style="padding: 12px 6px;">${v.type === 'percent' ? 'Persentase' : 'Flat Rupiah'}</td>
            <td style="padding: 12px 6px; text-align: center;">${v.usedCount} kali</td>
            <td style="padding: 12px 6px; text-align: center;">${v.maxUse} kali</td>
            <td style="padding: 12px 6px; text-align: center;">
                <span style="font-size: 10px; padding: 2px 6px; border-radius: 6px; font-weight: 700; background: ${v.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}; color: ${v.isActive ? '#10b981' : '#ef4444'};">
                    ${v.isActive ? 'Aktif' : 'Nonaktif'}
                </span>
            </td>
            <td style="padding: 12px 6px; text-align: center;">
                <div style="display: flex; gap: 6px; justify-content: center;">
                    <button class="tab-btn btn-toggle-voucher" data-code="${v.code}" data-active="${v.isActive}" style="padding: 4px 8px; font-size: 10px; border-radius: 6px;">
                        ${v.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button class="tab-btn btn-delete-voucher" data-code="${v.code}" style="padding: 4px 8px; font-size: 10px; border-radius: 6px; background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.15); color: #ef4444;">
                        Hapus
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Attach voucher action listeners
    tbody.querySelectorAll('.btn-toggle-voucher').forEach(btn => {
        btn.addEventListener('click', async () => {
            const code = btn.getAttribute('data-code');
            const currentActive = btn.getAttribute('data-active') === 'true';
            
            try {
                const token = getToken();
                const res = await fetch(apiUrl(`/api/admin/vouchers/${code}`), {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ isActive: !currentActive })
                });

                if (res.ok) {
                    await loadAdminVouchers();
                } else {
                    alert('Gagal merubah status voucher.');
                }
            } catch (err) {
                console.error(err);
            }
        });
    });

    tbody.querySelectorAll('.btn-delete-voucher').forEach(btn => {
        btn.addEventListener('click', async () => {
            const code = btn.getAttribute('data-code');
            if (!confirm(`Apakah Anda yakin ingin menghapus kode voucher "${code}"?`)) return;

            try {
                const token = getToken();
                const res = await fetch(apiUrl(`/api/admin/vouchers/${code}`), {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (res.ok) {
                    alert('Voucher berhasil dihapus.');
                    await loadAdminVouchers();
                } else {
                    alert('Gagal menghapus voucher.');
                }
            } catch (err) {
                console.error(err);
            }
        });
    });
}

async function handleAdminCreateVoucher() {
    const code = document.getElementById('admin-voucher-code').value.toUpperCase().trim();
    const discount = parseInt(document.getElementById('admin-voucher-discount').value);
    const type = document.getElementById('admin-voucher-type').value;
    const maxUse = parseInt(document.getElementById('admin-voucher-max-use').value || '100');

    if (!code || isNaN(discount) || discount <= 0) {
        alert('Silakan isi kode voucher dan potongan diskon yang valid.');
        return;
    }

    try {
        const token = getToken();
        const res = await fetch(apiUrl('/api/admin/vouchers'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ code, discount, type, maxUse, isActive: true })
        });
        const result = await res.json();

        if (res.ok) {
            alert(result.message || 'Voucher baru berhasil dibuat.');
            document.getElementById('admin-voucher-code').value = '';
            document.getElementById('admin-voucher-discount').value = '';
            await loadAdminVouchers();
        } else {
            alert('Gagal: ' + result.error);
        }
    } catch (err) {
        console.error(err);
        alert('Gagal membuat voucher baru.');
    }
}

async function handleAdminSaveAnnouncement() {
    const announcement = document.getElementById('admin-announcement-input').value.trim();
    
    try {
        const token = getToken();
        const res = await fetch(apiUrl('/api/admin/announcement'), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ announcement })
        });
        const result = await res.json();

        if (res.ok) {
            alert(result.message || 'Teks pengumuman berjalan berhasil diperbarui.');
            const screenText = document.getElementById('announcement-text');
            if (screenText) screenText.textContent = announcement;
        } else {
            alert('Gagal: ' + result.error);
        }
    } catch (err) {
        console.error(err);
        alert('Gagal memperbarui pengumuman.');
    }
}

async function handleSettingsChangePassword() {
    const oldPassword = document.getElementById('settings-old-password').value;
    const newPassword = document.getElementById('settings-new-password').value;
    const confirmPassword = document.getElementById('settings-confirm-password').value;

    if (!oldPassword || !newPassword || !confirmPassword) {
        alert('Semua kolom password wajib diisi.');
        return;
    }
    if (newPassword !== confirmPassword) {
        alert('Konfirmasi password baru tidak cocok.');
        return;
    }
    if (newPassword.length < 6) {
        alert('Password baru minimal harus 6 karakter.');
        return;
    }

    const btn = document.getElementById('btn-settings-change-password');
    btn.disabled = true;
    btn.textContent = 'Memproses...';

    try {
        const token = getToken();
        const res = await fetch(apiUrl('/api/auth/change-password'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ oldPassword, newPassword })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            alert('Password keamanan Anda berhasil diperbarui!');
            document.getElementById('settings-old-password').value = '';
            document.getElementById('settings-new-password').value = '';
            document.getElementById('settings-confirm-password').value = '';
        } else {
            alert('Gagal: ' + (data.error || 'Terjadi kesalahan'));
        }
    } catch (err) {
        console.error('Error changing password:', err);
        alert('Gagal menghubungi server.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="key" style="width: 14px; height: 14px;"></i> Update Password';
        if (window.lucide) window.lucide.createIcons();
    }
}

async function simulateQrisDepositSuccess(depositId) {
    if (!depositId && state.activeDeposit) {
        depositId = state.activeDeposit.id;
    }
    if (!depositId) {
        alert('ID Tiket deposit tidak ditemukan.');
        return;
    }
    
    const btn = document.getElementById('btn-simulate-qris-sandbox') || document.getElementById('btn-simulate-pay');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Memproses Callback...';
    }

    try {
        const res = await fetch(apiUrl('/api/payment/mock-callback'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ depositId })
        });

        const data = await res.json();

        if (res.ok && data.success) {
            alert('⚡ Mode Sandbox: Simulasi Pembayaran QRIS Berhasil!\nSaldo Anda telah bertambah 100% secara otomatis.');
            closeAllModals();
            await syncUserProfile();
            await loadActiveDeposit();
        } else {
            alert('Gagal simulasi: ' + (data.error || 'Terjadi kesalahan'));
        }
    } catch (err) {
        console.error('Error simulating QRIS success:', err);
        alert('Gagal mensimulasikan pembayaran.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '⚡ Simulasikan Bayar (Mode Sandbox / Uji Coba)';
        }
    }
}

async function fetchAnnouncement() {
    const announcementText = document.getElementById('announcement-text');
    if (!announcementText) return;

    try {
        const res = await fetch(apiUrl('/api/config/announcement'));
        if (res.ok) {
            const data = await res.json();
            if (data.success && data.announcement) {
                announcementText.textContent = data.announcement;
                const adminInput = document.getElementById('admin-announcement-input');
                if (adminInput) {
                    adminInput.value = data.announcement;
                }
                const waLink = document.getElementById('whatsapp-cs-link');
                if (waLink && data.contactWhatsapp) {
                    waLink.href = `https://wa.me/${data.contactWhatsapp.replace(/\+/g, '').replace(/\s+/g, '')}`;
                }
                const waLinkModal = document.getElementById('contact-wa-link-modal');
                if (waLinkModal && data.contactWhatsapp) {
                    waLinkModal.href = `https://wa.me/${data.contactWhatsapp.replace(/\+/g, '').replace(/\s+/g, '')}`;
                    waLinkModal.textContent = `+${data.contactWhatsapp.replace(/\+/g, '').replace(/\s+/g, '')}`;
                }
            }
        }
    } catch (err) {
        console.error('Gagal mengambil data pengumuman:', err);
    }
}

function initPromoCarousel() {
    const track = document.getElementById('carousel-track');
    const dotsContainer = document.getElementById('carousel-dots');
    if (!track || !dotsContainer) return;

    const slidesCount = 3;
    let currentSlide = 0;
    let autoSlideInterval;

    function goToSlide(index) {
        currentSlide = index;
        track.style.transform = `translateX(-${index * 33.333}%)`;
        
        const dots = dotsContainer.querySelectorAll('.carousel-dot');
        dots.forEach((dot, idx) => {
            if (idx === index) {
                dot.classList.add('active');
                dot.style.opacity = '1';
            } else {
                dot.classList.remove('active');
                dot.style.opacity = '0.4';
            }
        });
    }

    dotsContainer.addEventListener('click', (e) => {
        const dot = e.target.closest('.carousel-dot');
        if (!dot) return;
        const slideIndex = parseInt(dot.getAttribute('data-slide'));
        goToSlide(slideIndex);
        resetAutoSlide();
    });

    function startAutoSlide() {
        autoSlideInterval = setInterval(() => {
            let nextSlide = (currentSlide + 1) % slidesCount;
            goToSlide(nextSlide);
        }, 5000);
    }

    function resetAutoSlide() {
        clearInterval(autoSlideInterval);
        startAutoSlide();
    }

    startAutoSlide();
}

// Check authorization on load
document.addEventListener('DOMContentLoaded', () => {
    applyThemeAndAccent();
    loadMidtransScript();
    setupListeners();
    checkAuth();
    initPromoCarousel();
    fetchAnnouncement();
});

// Helper functions for Deposit Tiket Manual
function showTopupInstructions(deposit, bankAccounts) {
    document.getElementById('topup-form-content').style.display = 'none';
    document.getElementById('topup-instruction-box').style.display = 'flex';
    document.getElementById('topup-ins-total').textContent = formatRupiah(deposit.totalAmount);
    document.getElementById('topup-ins-bank').textContent = deposit.bankName;
    
    const acc = bankAccounts[deposit.bankName];
    document.getElementById('topup-ins-acc').textContent = acc ? acc.number : '-';
    document.getElementById('topup-ins-name').textContent = acc ? acc.owner : '-';
    
    const btnCancel = document.getElementById('btn-topup-cancel');
    if (btnCancel) btnCancel.setAttribute('data-id', deposit.id);
}

function updateBankSelectOptions(bankAccounts) {
    const select = document.getElementById('topup-bank-select');
    if (!select) return;

    select.innerHTML = `
        <option value="QRIS" selected>⚡ QRIS (Otomatis - Scan & Saldo Masuk Instan)</option>
    `;

    if (bankAccounts) {
        if (bankAccounts.BCA && bankAccounts.BCA.number) {
            select.innerHTML += `<option value="BCA">Bank BCA (${bankAccounts.BCA.number})</option>`;
        }
        if (bankAccounts.MANDIRI && bankAccounts.MANDIRI.number) {
            select.innerHTML += `<option value="MANDIRI">Bank Mandiri (${bankAccounts.MANDIRI.number})</option>`;
        }
        if (bankAccounts.BRI && bankAccounts.BRI.number) {
            select.innerHTML += `<option value="BRI">Bank BRI (${bankAccounts.BRI.number})</option>`;
        }
    }
}

async function loadActiveDeposit() {
    try {
        const token = getToken();
        if (!token) return;
        
        const res = await fetch(apiUrl('/api/deposits/my-requests'), {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        
        const data = await res.json();
        if (data.success) {
            state.bankAccounts = data.bankAccounts;
            updateBankSelectOptions(data.bankAccounts);
            const pending = data.deposits.find(d => d.status === 'Pending');
            
            const widget = document.getElementById('active-deposit-widget');
            if (pending) {
                state.activeDeposit = pending;
                
                if (widget) {
                    document.getElementById('widget-dep-amount').textContent = formatRupiah(pending.totalAmount);
                    document.getElementById('widget-dep-bank').textContent = pending.bankName;
                    
                    const btnWidgetCancel = document.getElementById('btn-widget-dep-cancel');
                    if (btnWidgetCancel) btnWidgetCancel.setAttribute('data-id', pending.id);
                    
                    widget.style.display = 'block';
                }
            } else {
                state.activeDeposit = null;
                if (widget) widget.style.display = 'none';
            }
        }
    } catch (err) {
        console.error('Error loading active deposit:', err);
    }
}

async function cancelDeposit(id) {
    try {
        const token = getToken();
        const res = await fetch(apiUrl(`/api/deposits/${id}/cancel`), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
            alert('Tiket deposit berhasil dibatalkan.');
            closeAllModals();
            await loadActiveDeposit();
        } else {
            alert('Gagal: ' + (data.error || 'Terjadi kesalahan'));
        }
    } catch (err) {
        console.error('Cancel deposit error:', err);
        alert('Gagal membatalkan tiket deposit.');
    }
}

function checkAndShowActiveDepositModal() {
    if (state.activeDeposit) {
        if (state.activeDeposit.bankName === 'QRIS') {
            document.getElementById('qris-barcode-img').src = state.activeDeposit.qrUrl;
            document.getElementById('qris-amount').textContent = formatRupiah(state.activeDeposit.totalAmount);
            
            const btnSimSandbox = document.getElementById('btn-simulate-qris-sandbox');
            if (btnSimSandbox) {
                if (state.user && state.user.role === 'admin') {
                    btnSimSandbox.style.display = 'flex';
                    btnSimSandbox.setAttribute('data-id', state.activeDeposit.id);
                    btnSimSandbox.onclick = () => {
                        simulateQrisDepositSuccess(state.activeDeposit.id);
                    };
                } else {
                    btnSimSandbox.style.display = 'none';
                }
            }
            
            const qMod = document.getElementById('qris-modal');
            if (qMod) qMod.classList.add('show');
        } else if (state.bankAccounts) {
            showTopupInstructions(state.activeDeposit, state.bankAccounts);
            DOM.topupModal.classList.add('show');
        }
    }
}

// Admin Panel Deposit Approvals
async function loadAdminDeposits() {
    try {
        const token = getToken();
        const res = await fetch(apiUrl('/api/admin/deposits'), {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Forbidden');
        
        const data = await res.json();
        if (data.success) {
            const countSpan = document.getElementById('admin-deposits-count');
            if (countSpan) countSpan.textContent = `${data.deposits.length} Pengajuan`;
            
            const tbody = document.getElementById('admin-deposits-table-body');
            if (!tbody) return;
            
            if (data.deposits.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">Tidak ada riwayat pengajuan deposit.</td></tr>`;
                return;
            }
            
            tbody.innerHTML = data.deposits.map(d => {
                const dateStr = new Date(d.createdAt).toLocaleString('id-ID', {
                    dateStyle: 'short', timeStyle: 'short'
                });
                
                let statusBadge = '';
                if (d.status === 'Pending') {
                    statusBadge = `<span style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 11px;">PENDING</span>`;
                } else if (d.status === 'Sukses') {
                    statusBadge = `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 11px;">SUKSES</span>`;
                } else {
                    statusBadge = `<span style="background: rgba(239, 68, 68, 0.15); color: #ef4444; padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 11px;">BATAL</span>`;
                }
                
                let actionBtns = '';
                if (d.status === 'Pending') {
                    actionBtns = `
                        <div style="display: flex; gap: 6px; justify-content: center;">
                            <button onclick="handleAdminApproveDeposit('${d.id}')" style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #10b981; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 4px;"><i data-lucide="check" style="width: 12px; height: 12px;"></i> Setujui</button>
                            <button onclick="handleAdminRejectDeposit('${d.id}')" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 4px;"><i data-lucide="x" style="width: 12px; height: 12px;"></i> Tolak</button>
                        </div>
                    `;
                } else {
                    actionBtns = `<span style="color: var(--text-muted); font-size: 11px;">Selesai</span>`;
                }
                
                return `
                    <tr style="border-bottom: 1px solid var(--card-border);">
                        <td style="padding: 12px 8px;">
                            <span style="font-weight: 600;">${d.id}</span><br>
                            <span style="font-size: 11px; color: var(--text-muted);">${dateStr}</span>
                        </td>
                        <td style="padding: 12px 8px;">
                            <span style="font-weight: 600; color: white;">${d.user ? d.user.name : 'Unknown'}</span><br>
                            <span style="font-size: 11px; color: var(--text-muted);">@${d.user ? d.user.username : ''}</span>
                        </td>
                        <td style="padding: 12px 8px; font-weight: 700; color: #38bdf8;">${d.bankName}</td>
                        <td style="padding: 12px 8px; text-align: right; font-weight: 800; color: white;">${formatRupiah(d.totalAmount)}</td>
                        <td style="padding: 12px 8px; text-align: center;">${statusBadge}</td>
                        <td style="padding: 12px 8px; text-align: center;">${actionBtns}</td>
                    </tr>
                `;
            }).join('');
            
            if (window.lucide) window.lucide.createIcons();
        }
    } catch (err) {
        console.error('[Admin] Gagal memuat daftar deposit:', err);
    }
}

async function handleAdminApproveDeposit(id) {
    try {
        const token = getToken();
        const res = await fetch(apiUrl(`/api/admin/deposits/${id}/approve`), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
            showToast(data.message || 'Deposit berhasil disetujui.', 'success');
            await loadAdminDeposits();
        } else {
            showToast('Gagal: ' + (data.error || 'Terjadi kesalahan'), 'error');
        }
    } catch (err) {
        console.error('Approve deposit error:', err);
        showToast('Gagal memproses persetujuan deposit.', 'error');
    }
}

async function handleAdminRejectDeposit(id) {
    try {
        const token = getToken();
        const res = await fetch(apiUrl(`/api/admin/deposits/${id}/reject`), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
            showToast(data.message || 'Deposit berhasil ditolak.', 'info');
            await loadAdminDeposits();
        } else {
            showToast('Gagal: ' + (data.error || 'Terjadi kesalahan'), 'error');
        }
    } catch (err) {
        console.error('Reject deposit error:', err);
        showToast('Gagal memproses penolakan deposit.', 'error');
    }
}

async function handleAdminSimulateCallback(id, amount) {
    try {
        const res = await fetch(apiUrl('/api/payment/callback/qrisify'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                merchant_ref: id,
                amount: amount,
                status: 'paid'
            })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            alert('⚡ Mode Tes: Sinyal Webhook Qrisify Berhasil Disimulasikan!\nSaldo agen telah bertambah 100% secara otomatis.');
            await loadAdminDeposits();
        } else {
            alert('Gagal simulasi: ' + (data.error || 'Terjadi kesalahan'));
        }
    } catch (err) {
        console.error('Simulate callback error:', err);
        alert('Gagal mengirim sinyal tes callback.');
    }
}
window.handleAdminSimulateCallback = handleAdminSimulateCallback;

// Expose admin actions to global window scope for inline onclick templates
window.handleAdminApproveDeposit = handleAdminApproveDeposit;
window.handleAdminRejectDeposit = handleAdminRejectDeposit;

async function loadDownlinesDashboard() {
    const tableBody = document.getElementById('downline-list-table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = `
        <tr>
            <td colspan="8" style="text-align: center; padding: 20px; color: var(--text-secondary);">
                Memuat data downline...
            </td>
        </tr>
    `;
    
    try {
        const token = getToken();
        if (!token) return;
        
        const res = await fetch(apiUrl('/api/downlines/list'), {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await res.json();
        if (res.ok && data.success) {
            tableBody.innerHTML = '';
            
            if (data.downlines.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align: center; padding: 30px; color: var(--text-muted);">
                            Belum ada downline terdaftar. Silakan daftarkan agen baru menggunakan form di atas!
                        </td>
                    </tr>
                `;
                return;
            }
            
            data.downlines.forEach(dl => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid var(--card-border)';
                tr.style.color = 'var(--text-secondary)';
                
                const joinDate = new Date(dl.createdAt).toLocaleDateString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                });
                
                tr.innerHTML = `
                    <td style="padding: 12px 6px;">
                        <div style="font-size: 11px; color: var(--text-muted);">${dl.id}</div>
                        <div style="font-weight: 500;">${joinDate}</div>
                    </td>
                    <td style="padding: 12px 6px; font-weight: 600; color: var(--text-primary);">${dl.name}</td>
                    <td style="padding: 12px 6px;">@${dl.username}</td>
                    <td style="padding: 12px 6px; font-size: 12px;">${dl.email}</td>
                    <td style="padding: 12px 6px; text-align: right; font-weight: 700; color: var(--success);">${formatRupiah(dl.balance)}</td>
                    <td style="padding: 12px 6px; text-align: center; font-weight: 600;">+Rp ${dl.referralMarkup}</td>
                    <td style="padding: 12px 6px; text-align: center; color: var(--text-primary); font-weight: 600;">${dl.transactionCount}</td>
                    <td style="padding: 12px 6px; text-align: right; font-weight: 700; color: var(--primary);">${formatRupiah(dl.totalCommission)}</td>
                `;
                tableBody.appendChild(tr);
            });
        } else {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 20px; color: var(--danger);">
                        Gagal memuat downline: ${data.error || 'Terjadi kesalahan'}
                    </td>
                </tr>
            `;
        }
    } catch (err) {
        console.error('loadDownlinesDashboard error:', err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 20px; color: var(--danger);">
                    Kesalahan koneksi ke server.
                </td>
            </tr>
        `;
    }
}
