// --- STATE & UTILS ---
const API_URL = ''; // Empty because Desktop runs on the server
let transactions = [];
let currentDebts = [];
const today = new Date().toISOString().split('T')[0];
document.getElementById('filter-date').value = today;
let deleteActionType = null; // 'data' or 'account'

// --- AUTHENTICATION ---
function showAuth(type) {
    document.getElementById('login-view').classList.toggle('hidden', type !== 'login');
    document.getElementById('register-view').classList.toggle('hidden', type !== 'register');
}

async function register() {
    const u = document.getElementById('reg-user').value;
    const p = document.getElementById('reg-pass').value;
    const res = await fetch('/register', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({username:u, password:p})
    });
    if(res.ok) { alert("Created! Please Login."); showAuth('login'); }
    else alert("Username likely taken.");
}

async function login() {
    const u = document.getElementById('login-user').value;
    const p = document.getElementById('login-pass').value;
    const res = await fetch('/login', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({username:u, password:p})
    });
    if(res.ok) {
        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        fetchData();
    } else alert("Invalid Login");
}

async function logout() {
    await fetch('/logout', {method: 'POST'});
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

// --- DATA & DASHBOARD ---
async function fetchData() {
    const res = await fetch('/transactions');
    transactions = await res.json();
    renderDashboard();
}

// FIXED DASHBOARD LOGIC (Using Strings matches, not Timezone Dates)
function renderDashboard() {
    const filterType = document.getElementById('time-filter').value;
    const selectedDateStr = document.getElementById('filter-date').value; // "YYYY-MM-DD"
    
    // Parse the selected date safely as numbers
    const [selY, selM, selD] = selectedDateStr.split('-').map(Number); 
    // selM is 1-12 here.

    let totalInc=0, totalExp=0, tableHTML="";
    let tableHead = "";

    // 1. DAILY: Match exact string
    if (filterType === 'daily') {
        tableHead = "<th>Type</th><th>Desc</th><th>Amount</th>";
        const filtered = transactions.filter(t => t.date === selectedDateStr);
        
        filtered.forEach(t => {
            const color = t.type === 'income' ? 'green' : 'red';
            tableHTML += `<tr><td style='color:${color};font-weight:bold'>${t.type.toUpperCase()}</td><td>${t.description}</td><td>$${t.amount}</td></tr>`;
            if(t.type === 'income') totalInc += t.amount; else totalExp += t.amount;
        });

    } else if (filterType === 'weekly') {
        tableHead = "<th>Date</th><th>Income</th><th>Expense</th><th>Revenue</th>";
        // Logic: Last 7 days from selected date
        // We calculate the 7 specific date strings we want to see
        let targetDates = [];
        for(let i=0; i<7; i++) {
            let d = new Date(selY, selM-1, selD); // JS Month is 0-11
            d.setDate(d.getDate() - i); 
            targetDates.push(d.toISOString().split('T')[0]);
        }

        targetDates.forEach(dateStr => {
            let dayInc=0, dayExp=0;
            transactions.filter(t => t.date === dateStr).forEach(t => {
                if(t.type==='income') dayInc+=t.amount; else dayExp+=t.amount;
            });
            tableHTML += `<tr><td>${dateStr}</td><td>$${dayInc}</td><td>$${dayExp}</td><td>$${dayInc-dayExp}</td></tr>`;
            totalInc += dayInc; totalExp += dayExp;
        });

    } else if (filterType === 'monthly') {
        tableHead = "<th>Week</th><th>Income</th><th>Expense</th><th>Revenue</th>";
        // Filter for specific Year and Month string
        // "2025-11-21" -> check if starts with "2025-11"
        const targetPrefix = `${selY}-${String(selM).padStart(2,'0')}`;
        
        const monthData = transactions.filter(t => t.date.startsWith(targetPrefix));

        // Group into 4 weeks (1-7, 8-14, 15-21, 22+)
        for(let w=1; w<=4; w++) {
            let wInc=0, wExp=0;
            monthData.forEach(t => {
                const day = parseInt(t.date.split('-')[2]);
                let weekNum = Math.ceil(day/7);
                if(weekNum > 4) weekNum = 4;
                if(weekNum === w) {
                    if(t.type==='income') wInc+=t.amount; else wExp+=t.amount;
                }
            });
            tableHTML += `<tr><td>Week ${w}</td><td>$${wInc}</td><td>$${wExp}</td><td>$${wInc-wExp}</td></tr>`;
            totalInc += wInc; totalExp += wExp;
        }

    } else if (filterType === 'yearly') {
        tableHead = "<th>Month</th><th>Income</th><th>Expense</th><th>Revenue</th>";
        const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        
        // Filter strictly by Year String
        const yearStr = String(selY); // "2025"
        const yearData = transactions.filter(t => t.date.startsWith(yearStr));

        for(let m=0; m<12; m++) {
            let mInc=0, mExp=0;
            // Check if transaction month matches m+1
            yearData.forEach(t => {
                const tMonth = parseInt(t.date.split('-')[1]); // 1-12
                if(tMonth === m + 1) {
                    if(t.type==='income') mInc+=t.amount; else mExp+=t.amount;
                }
            });
            tableHTML += `<tr><td>${months[m]}</td><td>$${mInc}</td><td>$${mExp}</td><td>$${mInc-mExp}</td></tr>`;
            totalInc += mInc; totalExp += mExp;
        }
    }

    document.getElementById('table-head').innerHTML = tableHead;
    document.getElementById('table-body').innerHTML = tableHTML;
    document.getElementById('sum-income').innerText = `$${totalInc}`;
    document.getElementById('sum-expense').innerText = `$${totalExp}`;
    document.getElementById('sum-balance').innerText = `$${totalInc - totalExp}`;
}

// --- TRANSACTION SAVE ---
async function saveTransaction() {
    const type = document.getElementById('t-type').value;
    const amount = document.getElementById('t-amount').value;
    const desc = document.getElementById('t-desc').value;
    const date = document.getElementById('t-date').value || today;
    if(!amount) return alert("Enter amount");
    await fetch('/transaction', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({type, amount, description:desc, date})
    });
    document.getElementById('t-amount').value = '';
    document.getElementById('t-desc').value = '';
    fetchData(); showSection('dashboard');
}

// --- DEBT LOGIC ---
function showDebtForm(view) {
    document.getElementById('debt-list-view').classList.toggle('hidden', view !== 'list');
    document.getElementById('debt-add-view').classList.toggle('hidden', view !== 'add');
    document.getElementById('debt-edit-view').classList.toggle('hidden', view !== 'edit');
}

async function fetchDebts() {
    const res = await fetch('/debts');
    currentDebts = await res.json();
    const container = document.getElementById('debt-list-items');
    if(currentDebts.length === 0) { container.innerHTML = "<p style='text-align:center'>No active debts.</p>"; return; }
    
    container.innerHTML = "";
    currentDebts.forEach(d => {
        const isMe = d.direction === 'owed_to_me';
        container.innerHTML += `
            <div class="debt-item" onclick="openDebtEdit(${d.id})">
                <div class="debt-info">
                    <h4 style="color:${isMe ? '#28a745':'#dc3545'}">${d.person_name}</h4>
                    <p>${isMe ? 'Owes You':'You Owe'}</p>
                    <p>Due: ${d.date_due || 'N/A'}</p>
                </div>
                <div class="debt-amt ${isMe ? 'green':'red'}">$${d.amount}</div>
            </div>`;
    });
}

async function saveNewDebt() {
    const dir = document.querySelector('input[name="debt-dir"]:checked').value;
    const name = document.getElementById('d-name').value;
    const amount = document.getElementById('d-amount').value;
    const borrowed = document.getElementById('d-borrowed').value || today;
    const due = document.getElementById('d-due').value;
    if(!name || !amount) return alert("Missing fields");

    await fetch('/debt', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({person_name:name, amount, direction:dir, date_borrowed:borrowed, date_due:due})
    });
    document.getElementById('d-name').value = ''; document.getElementById('d-amount').value = '';
    fetchDebts(); showDebtForm('list');
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
    if(!payment || payment <= 0) return alert("Invalid Amount");

    const res = await fetch('/debt-update', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ id, payment_amount: payment })
    });
    if(res.ok) { fetchDebts(); showDebtForm('list'); } 
    else alert("Error updating");
}

// --- POPUP DELETE LOGIC ---
function openDeleteModal(type) {
    deleteActionType = type; // remember which button was clicked
    document.getElementById('modal-pass').value = '';
    document.getElementById('password-modal').classList.remove('hidden');
}

function closeDeleteModal() {
    document.getElementById('password-modal').classList.add('hidden');
    deleteActionType = null;
}

async function submitDelete() {
    const password = document.getElementById('modal-pass').value;
    if(!password) return alert("Please enter password");
    if(!confirm("Are you sure? This cannot be undone.")) return;

    const endpoint = deleteActionType === 'data' ? '/delete-data' : '/delete-account';
    
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ password })
    });

    if(res.ok) {
        alert("Success!");
        location.reload();
    } else {
        alert("Incorrect Password or Error");
    }
}