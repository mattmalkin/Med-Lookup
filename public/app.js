// --- 1. FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyA5uz0RFyrCkxJocq8kZwFg_pcO2P6WTUg",
    authDomain: "pacpal-9f9bf.firebaseapp.com",
    projectId: "pacpal-9f9bf",
    storageBucket: "pacpal-9f9bf.firebasestorage.app",
    messagingSenderId: "993977477357",
    appId: "1:993977477357:web:72a2c5dee83d40e4b7c4e4",
    measurementId: "G-QMLLEV67R5"
};

// --- 2. DARK MODE (Unified with Admin) ---
const themeToggle = document.getElementById('themeToggle');
const body = document.body;

// Apply saved preference immediately
if (localStorage.getItem('pacpal_theme') === 'dark') {
    body.classList.add('dark-theme');
    if (themeToggle) themeToggle.innerText = '☀️ Light Mode';
}

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-theme');
        const isDark = body.classList.contains('dark-theme');
        localStorage.setItem('pacpal_theme', isDark ? 'dark' : 'light');
        themeToggle.innerText = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
    });
}

// --- 3. FIREBASE & SEARCH INIT ---
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let myDatabase = [];
let fuse = null;
window.currentSearchResults = []; // Safe array to prevent button crashes

const searchInput = document.getElementById('medSearch');
const searchResults = document.getElementById('searchResults');
const medicationList = document.getElementById('medicationList');
const printBtn = document.getElementById('printBtn');
const listHeader = document.getElementById('listHeader');

async function init() {
    try {
        const statusEl = document.getElementById('status');
        if (statusEl) statusEl.innerHTML = "↻ Connecting to Database...";

        // 1. PING: Fetch the metadata first (Cost: 1 Read)
        const metaDoc = await db.collection('system').doc('metadata').get();
        const serverDate = metaDoc.exists ? metaDoc.data().lastUpdated : null;
        
        if (serverDate) {
            const dateDisplay = document.getElementById('updateDateDisplay');
            if (dateDisplay) {
                dateDisplay.innerHTML = `<strong>Database Update ${serverDate}</strong>`;
            }
        }

        // --- NEW: Time-Based Expiration Logic ---
        const CACHE_LIFETIME_HOURS = 12; // Change this to force a refresh sooner or later
        const CACHE_LIFETIME_MS = CACHE_LIFETIME_HOURS * 60 * 60 * 1000;
        const now = Date.now();

        // 2. CACHE CHECK: Look inside the browser's memory
        const cachedMeds = localStorage.getItem('pacpal_meds');
        const cachedDate = localStorage.getItem('pacpal_date');
        const cachedTime = localStorage.getItem('pacpal_cache_time');

        let useCache = false;

        if (cachedMeds && cachedDate === serverDate && cachedTime) {
            const timeSinceLastDownload = now - parseInt(cachedTime, 10);
            
            if (timeSinceLastDownload < CACHE_LIFETIME_MS) {
                useCache = true; // The cache is fresh enough, use it!
            } else {
                console.log("⏱️ Cache expired! Forcing a fresh download.");
            }
        }

        if (useCache) {
            // CACHE HIT! Load from memory (Cost: 0 Reads)
            console.log("⚡ Loaded database from local cache.");
            myDatabase = JSON.parse(cachedMeds);
        } else {
            // CACHE MISS! The database is new, updated, OR the timer expired.
            console.log("☁️ Downloading fresh database from Firebase...");
            const snapshot = await db.collection('medications').get();
            myDatabase = snapshot.docs.map(doc => doc.data());
            
            // Save this fresh data AND the exact timestamp into memory for next time
            localStorage.setItem('pacpal_meds', JSON.stringify(myDatabase));
            localStorage.setItem('pacpal_cache_time', now.toString());
            
            if (serverDate) {
                localStorage.setItem('pacpal_date', serverDate);
            }
        }

        // 3. Initialize the Search Engine
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

// --- 4. SEARCH LOGIC ---
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
                // Save items to our safe global array
                window.currentSearchResults = results.map(res => res.item);
                
                // Build HTML using just the array index numbers (0, 1, 2...)
                searchResults.innerHTML = window.currentSearchResults.map((item, index) => {
                    return `
                        <div class="card search-result-card">
                            <h3 class="med-name">${item.name}</h3>
                            <span class="category-badge">${item.category || 'General'}</span>
                            <p class="instruction-text">${(item.instructions || '').substring(0, 80)}...</p>
                            <button class="add-btn" onclick="addToList(${index})">Add to List +</button>
                        </div>
                    `;
                }).join('');
            } else {
                searchResults.innerHTML = '<p>No matches found.</p>';
            }
        }
    });
}

// --- 5. LIST LOGIC ---
window.addToList = function(index) {
    try {
        // Grab the exact item from memory using the index
        const item = window.currentSearchResults[index];
        if (!item || !medicationList) return;

        // Create a new card using the new "med-item" CSS class so it looks beautiful
        const card = document.createElement('div');
        card.className = 'card med-item'; 
        card.innerHTML = `
            <div class="med-info" style="width: 80%;">
                <strong>${item.name}</strong>
                <span class="category-badge">${item.category || 'General'}</span>
                <p style="font-size: 0.9em; margin-top: 10px; line-height: 1.4; color: var(--text);">${item.instructions || 'No instructions provided.'}</p>
            </div>
            <div class="med-actions">
                <button class="remove-btn" onclick="this.closest('.card').remove(); updateUI();">Remove ×</button>
            </div>
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
    // Show/hide the Print button and header based on if the list is empty
    if (printBtn) printBtn.style.display = hasItems ? 'inline-flex' : 'none';
    if (listHeader) listHeader.style.display = hasItems ? 'block' : 'none';
}

// Start the app
init();
updateUI();
