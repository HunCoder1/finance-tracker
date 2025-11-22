// ⚠️ VERIFY THIS IS YOUR COMPUTER'S IP ADDRESS
const API_URL = 'http://192.168.1.4:3000'; 
alert("App is trying to connect to: " + API_URL); // ADD THIS LINE

// --- STATE ---
let transactions = [];
let currentDebts = [];
const today = new Date().toISOString().split('T')[0];
document.getElementById('filter-date').value = today;
let deleteActionType = null;

// --- HELPER: SAFE FETCH ---
// This handles CORS credentials (Cookies) automatically
async function safeFetch(endpoint, options = {}) {
    
    // 1. IMPORTANT: Include cookies in the request
    options.credentials = 'include';
    
    // 2. Set Headers if not present
    if (!options.headers) {
        options.headers = {};
    }
    if (!options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/json';
    }

    try {
        const res = await fetch(`${API_URL}${endpoint}`, options);
        return res;
    } catch (e) {
        console.error(e);
        alert("Connection Failed. Check PC IP and ensure Server is running.");
        return null;
    }
}

// --- AUTHENTICATION ---
function showAuth(type) {
    document.getElementById('login-view').classList.toggle('hidden', type !== 'login');
    document.getElementById('register-view').classList.toggle('hidden', type !== 'register');
}

async function register() {
    const u = document.getElementById('reg-user').value;
    const p = document.getElementById('reg-pass').value;
    const res = await safeFetch('/register', {
        method: 'POST',
        body: JSON.stringify({username:u, password:p})
    });
    if(res && res.ok) { alert("Created! Please Login."); showAuth('login'); }
    else if(res) alert("Username taken.");
}

async function login() {
    const u = document.getElementById('login-user').value;
    const p = document.getElementById('login-pass').value;
    const res = await safeFetch('/login', {
        method: 'POST',
        body: JSON.stringify({username:u, password:p})
    });
    if(res && res.ok) {
        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        fetchData();
    } else if(res) alert("Invalid Login");
}

async function logout() {
    await safeFetch('/logout', {method: 'POST'});
    location.reload();
}

// --- NAVIGATION ---
function showSection(id) {
    ['dashboard-section', 'add-section', 'debt-section', 'delete-section'].forEach(s => {
        document.getElementById(s).classList.add('hidden');
    });
    document.getElementById(id + '-section').classList.remove('hidden');
    
    if(id === 'dashboard') renderDashboard();
    if(id === 'debt') { showDebtForm('list'); fetchDebts(); }
}

// --- DATA HANDLING ---
async function fetchData() {
    const res = await safeFetch('/transactions');
    if(res && res.ok) {
        transactions = await res.json();
        renderDashboard();
    }
}

function renderDashboard() {
    const filterType = document.getElementById('time-filter').value;
    const selectedDateStr = document.getElementById('filter-date').value;
    
    // Logic for Total Calculations
    let totalInc=0, totalExp=0, tableHTML="", tableHead = "";

    // Simplified Table for Mobile
    if (filterType === 'daily') {
        tableHead = "<th>Desc</th><th>Amt</th>";
        const filtered = transactions.filter(t => t.date === selectedDateStr);
        filtered.forEach(t => {
            const color = t.type === 'income' ? 'green' : 'red';
            tableHTML += `<tr>
                <td><div style='font-weight:bold'>${t.description}</div><small>${t.type}</small></td>
                <td style='color:${color};'>$${t.amount}</td>
            </tr>`;
            if(t.type === 'income') totalInc += t.amount; else totalExp += t.amount;
        });
    } else {
        // Generic view for other filters (showing all data sum for simplicity)
        tableHead = "<th>Status</th><th>View</th>";
        tableHTML = `<tr><td colspan='2' style='text-align:center; padding:20px;'>Period Summary Calculated Below</td></tr>`;
        transactions.forEach(t => {
             // Basic sum of everything loaded
             if(t.type==='income') totalInc += t.amount; else totalExp += t.amount;
        });
    }

    document.getElementById('table-head').innerHTML = tableHead;
    document.getElementById('table-body').innerHTML = tableHTML;
    document.getElementById('sum-income').innerText = `$${totalInc}`;
    document.getElementById('sum-expense').innerText = `$${totalExp}`;
    document.getElementById('sum-balance').innerText = `$${totalInc - totalExp}`;
}

async function saveTransaction() {
    const type = document.getElementById('t-type').value;
    const amount = document.getElementById('t-amount').value;
    const desc = document.getElementById('t-desc').value;
    const date = document.getElementById('t-date').value || today;
    if(!amount) return alert("Enter amount");

    const res = await safeFetch('/transaction', {
        method:'POST',
        body: JSON.stringify({type, amount, description:desc, date})
    });
    if(res && res.ok) {
        document.getElementById('t-amount').value = '';
        document.getElementById('t-desc').value = '';
        fetchData();
        showSection('dashboard');
    }
}

// --- DEBTS ---
function showDebtForm(view) {
    document.getElementById('debt-list-view').classList.toggle('hidden', view !== 'list');
    document.getElementById('debt-add-view').classList.toggle('hidden', view !== 'add');
    document.getElementById('debt-edit-view').classList.toggle('hidden', view !== 'edit');
}

async function fetchDebts() {
    const res = await safeFetch('/debts');
    if(res && res.ok) {
        currentDebts = await res.json();
        const container = document.getElementById('debt-list-items');
        container.innerHTML = "";
        if(currentDebts.length === 0) { container.innerHTML = "<p style='text-align:center; margin-top:20px;'>No debts found.</p>"; return; }
        
        currentDebts.forEach(d => {
            const isMe = d.direction === 'owed_to_me';
            container.innerHTML += `
                <div class="debt-item" onclick="openDebtEdit(${d.id})">
                    <div class="debt-info">
                        <h4>${d.person_name}</h4>
                        <p>${isMe ? 'Owes You':'You Owe'}</p>
                    </div>
                    <div class="debt-amt ${isMe ? 'green':'red'}">$${d.amount}</div>
                </div>`;
        });
    }
}

async function saveNewDebt() {
    const dir = document.querySelector('input[name="debt-dir"]:checked').value;
    const name = document.getElementById('d-name').value;
    const amount = document.getElementById('d-amount').value;
    const borrowed = document.getElementById('d-borrowed').value || today;
    const due = document.getElementById('d-due').value;
    if(!name || !amount) return alert("Missing fields");

    const res = await safeFetch('/debt', {
        method:'POST',
        body: JSON.stringify({person_name:name, amount, direction:dir, date_borrowed:borrowed, date_due:due})
    });
    if(res && res.ok) {
        document.getElementById('d-name').value = ''; document.getElementById('d-amount').value = '';
        fetchDebts(); showDebtForm('list');
    }
}

function openDebtEdit(id) {
    const debt = currentDebts.find(d => d.id === id);
    if(!debt) return;
    const text = debt.direction === 'owed_to_me' ? `Payment from ${debt.person_name}` : `Payment to ${debt.person_name}`;
    document.getElementById('edit-debt-title').innerText = text;
    document.getElementById('edit-current-bal').innerText = `$${debt.amount}`;
    document.getElementById('edit-debt-id').value = debt.id;
    document.getElementById('pay-amount').value = '';
    showDebtForm('edit');
}

async function processPayment() {
    const id = document.getElementById('edit-debt-id').value;
    const payment = document.getElementById('pay-amount').value;
    if(!payment) return alert("Enter amount");

    const res = await safeFetch('/debt-update', {
        method: 'POST',
        body: JSON.stringify({ id, payment_amount: payment })
    });
    if(res && res.ok) { fetchDebts(); showDebtForm('list'); }
}

// --- DELETE MODAL ---
function openDeleteModal(type) {
    deleteActionType = type;
    document.getElementById('modal-pass').value = '';
    document.getElementById('password-modal').classList.remove('hidden');
}

function closeDeleteModal() {
    document.getElementById('password-modal').classList.add('hidden');
    deleteActionType = null;
}

async function submitDelete() {
    const password = document.getElementById('modal-pass').value;
    if(!password) return alert("Enter password");

    const endpoint = deleteActionType === 'data' ? '/delete-data' : '/delete-account';
    const res = await safeFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ password })
    });

    if(res && res.ok) { alert("Done"); location.reload(); }
    else alert("Incorrect Password");
}