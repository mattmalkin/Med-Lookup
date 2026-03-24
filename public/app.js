// 1. FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyA5uz0RFyrCkxJocq8kZwFg_pcO2P6WTUg",
    authDomain: "pacpal-9f9bf.firebaseapp.com",
    projectId: "pacpal-9f9bf",
    storageBucket: "pacpal-9f9bf.firebasestorage.app",
    messagingSenderId: "993977477357",
    appId: "1:993977477357:web:72a2c5dee83d40e4b7c4e4",
    measurementId: "G-QMLLEV67R5"
};

// --- 1. DARK MODE (Top Priority - Unified with Admin) ---
const body = document.body;
const themeBtn = document.getElementById('themeToggle'); // Matches your HTML ID

// Apply saved preference immediately
if (localStorage.getItem('pacpal_theme') === 'dark') {
    body.classList.add('dark-theme');
    if (themeBtn) themeBtn.innerText = '☀️ Light Mode';
}

if (themeBtn) {
    themeBtn.onclick = () => {
        body.classList.toggle('dark-theme');
        const isDark = body.classList.contains('dark-theme');
        localStorage.setItem('pacpal_theme', isDark ? 'dark' : 'light');
        themeBtn.innerText = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
    };
}

// --- 2. FIREBASE & SEARCH INIT ---
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
let myDatabase = [];
let fuse = null;

const searchInput = document.getElementById('medSearch');
const searchResults = document.getElementById('searchResults');
const medicationList = document.getElementById('medicationList');
const printBtn = document.getElementById('printBtn');
const listHeader = document.getElementById('listHeader');

async function init() {
    try {
        const statusEl = document.getElementById('status');
        if (statusEl) statusEl.innerHTML = "↻ Connecting to Database...";

        const snapshot = await db.collection('medications').get();
        myDatabase = snapshot.docs.map(doc => doc.data());
        
        fuse = new Fuse(myDatabase, { 
            keys: ["name", "category"], 
            threshold: 0.3 
        });

        if (statusEl) statusEl.innerHTML = "✓ Database Online";
        
        if (searchInput) {
            searchInput.disabled = false;
            searchInput.placeholder = "Search (e.g., Lisinopril)...";
        }
    } catch (error) {
        console.error("Init Error:", error);
        if (document.getElementById('status')) {
            document.getElementById('status').innerHTML = "✖ Error connecting to database.";
        }
    }
}

// --- 3. SEARCH LOGIC ---
if (searchInput) {
    searchInput.addEventListener('input', () => {
        const query = searchInput.value;
        if (!fuse || query.length < 2) { 
            if (searchResults) searchResults.innerHTML = ''; 
            return; 
        }

        const results = fuse.search(query);
        if (searchResults) {
            if (results.length > 0) {
                searchResults.innerHTML = results.map(res => {
                    const item = res.item;
                    // Encode data to handle special characters in instructions
                    const safeData = btoa(JSON.stringify(item));
                    return `
                        <div class="card search-result-card">
                            <h3 class="med-name">${item.name}</h3>
                            <span class="category-badge">${item.category || 'General'}</span>
                            <p class="instruction-text">${(item.instructions || '').substring(0, 80)}...</p>
                            <button class="add-btn" onclick="addToList('${safeData}')">Add to List +</button>
                        </div>
                    `;
                }).join('');
            } else {
                searchResults.innerHTML = '<p>No matches found.</p>';
            }
        }
    });
}

// --- 4. LIST LOGIC (Global scope for button access) ---
window.addToList = function(encodedData) {
    try {
        const item = JSON.parse(atob(encodedData));
        if (!medicationList) return;

        const card = document.createElement('div');
        card.className = 'card pinned-card';
        card.innerHTML = `
            <button class="remove-btn" onclick="this.parentElement.remove(); updateUI();">×</button>
            <h3 class="med-name">${item.name}</h3>
            <span class="category-badge">${item.category || 'General'}</span>
            <p class="instruction-text">${item.instructions || 'No instructions.'}</p>
        `;
        medicationList.appendChild(card);
        
        // Clear search UI
        if (searchInput) searchInput.value = '';
        if (searchResults) searchResults.innerHTML = '';
        
        updateUI();
    } catch (e) {
        console.error("Error adding to list:", e);
    }
};

function updateUI() {
    const hasItems = medicationList && medicationList.children.length > 0;
    if (printBtn) printBtn.style.display = hasItems ? 'block' : 'none';
    if (listHeader) listHeader.style.display = hasItems ? 'block' : 'none';
}

// Start the app
init();
// Initial UI check to hide buttons/headers
updateUI();
