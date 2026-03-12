// PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL HERE
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbytnpdjTGS5p0YQgwCA1_BOHOTahW8M9lZrFp_tcjSazQwZ2NlyS8qhuXn4RcTW5qk/exec';

let myDatabase = [];
let fuse;

const searchInput = document.getElementById('medSearch');
const searchResults = document.getElementById('searchResults');
const medicationList = document.getElementById('medicationList');
const printBtn = document.getElementById('printBtn');
const listHeader = document.getElementById('listHeader');

async function init() {
    try {
        // THE CACHE BUSTER: Adds a unique timestamp to force a fresh download
        const cacheBuster = `?t=${new Date().getTime()}`;
        const response = await fetch(SHEET_URL + cacheBuster);
        
        myDatabase = await response.json();
        
 fuse = new Fuse(myDatabase, {
            keys: [
                "name", 
                "category"
            ],
            threshold: 0.3, 
            ignoreLocation: true 
        });

        searchInput.disabled = false;
        searchInput.placeholder = "Search (e.g., Lisinopril)...";
        document.getElementById('status').innerHTML = "✓ Database Online";
    } catch (error) {
        document.getElementById('status').innerHTML = "✖ Error connecting to Sheets.";
        console.error("Fetch error:", error);
    }
}

searchInput.addEventListener('input', () => {
    const query = searchInput.value;
    if (query.length < 2) { searchResults.innerHTML = ''; return; }

    const results = fuse.search(query);
    if (results.length > 0) {
        let html = '';
        results.forEach(res => {
            const item = res.item;
            
            // THE EMPTY CELL FIX: Defaults to an empty string if the cell is blank
            const safeInstructions = item.instructions || 'No instructions provided.';
            
            html += `
                <div class="card search-result-card">
                    <h3 class="med-name">${item.name}</h3>
                    <span class="category-badge">${item.category || 'General'}</span>
                    <p class="instruction-text">${safeInstructions.substring(0, 80)}...</p>
                    <button class="add-btn" onclick="addToList('${btoa(JSON.stringify(item))}')">Add to Request +</button>
                </div>
            `;
        });
        searchResults.innerHTML = html;
    } else {
        searchResults.innerHTML = '<p>No matches found.</p>';
    }
});

function addToList(encodedData) {
    const item = JSON.parse(atob(encodedData));
    const safeInstructions = item.instructions || 'No instructions provided.'; // Safety check here too
    
    const card = document.createElement('div');
    card.className = 'card pinned-card';
    card.innerHTML = `
        <button class="remove-btn" onclick="this.parentElement.remove(); updateUI();">×</button>
        <h3 class="med-name">${item.name}</h3>
        <span class="category-badge">${item.category || 'General'}</span>
        <p class="instruction-text">${safeInstructions}</p>
    `;
    medicationList.appendChild(card);
    
    // Clear search
    searchInput.value = '';
    searchResults.innerHTML = '';
    updateUI();
}

function updateUI() {
    const hasItems = medicationList.children.length > 0;
    printBtn.style.display = hasItems ? 'block' : 'none';
    listHeader.style.display = hasItems ? 'block' : 'none';
}

init();

// --- DARK MODE LOGIC ---
const themeToggle = document.getElementById('themeToggle');

// 1. Check if the user already chose dark mode in a previous visit
if (localStorage.getItem('pacpal_theme') === 'dark') {
    document.body.classList.add('dark-theme');
    themeToggle.innerText = '☀️ Light Mode';
}

// 2. Listen for clicks on the toggle button
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    
    // 3. Save their preference and swap the icon
    if (document.body.classList.contains('dark-theme')) {
        localStorage.setItem('pacpal_theme', 'dark');
        themeToggle.innerText = '☀️ Light Mode';
    } else {
        localStorage.setItem('pacpal_theme', 'light');
        themeToggle.innerText = '🌙 Dark Mode';
    }
});
