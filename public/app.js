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
