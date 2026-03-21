// 1. YOUR FIREBASE CONNECTION KEYS
// ---> REPLACE THIS BLOCK WITH YOUR ACTUAL CONFIG FROM THE FIREBASE DASHBOARD <---
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA5uz0RFyrCkxJocq8kZwFg_pcO2P6WTUg",
  authDomain: "pacpal-9f9bf.firebaseapp.com",
  projectId: "pacpal-9f9bf",
  storageBucket: "pacpal-9f9bf.firebasestorage.app",
  messagingSenderId: "993977477357",
  appId: "1:993977477357:web:72a2c5dee83d40e4b7c4e4",
  measurementId: "G-QMLLEV67R5"
};

// 2. INITIALIZE FIREBASE
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let myDatabase = [];
let fuse;

const searchInput = document.getElementById('medSearch');
const searchResults = document.getElementById('searchResults');
const medicationList = document.getElementById('medicationList');
const printBtn = document.getElementById('printBtn');
const listHeader = document.getElementById('listHeader');

async function init() {
    try {
        document.getElementById('status').innerHTML = "↻ Connecting to Database...";
        
        // 3. FETCH DATA FROM FIRESTORE INSTEAD OF A FILE
        const snapshot = await db.collection('medications').get();
        
        // Convert the Firebase documents into a clean array that Fuse can read
        myDatabase = snapshot.docs.map(doc => doc.data());
        
        fuse = new Fuse(myDatabase, {
            keys: ["name", "category"],
            threshold: 0.3,
            ignoreLocation: true
        });

        searchInput.disabled = false;
        searchInput.placeholder = "Search (e.g., Lisinopril)...";
        document.getElementById('status').innerHTML = "✓ Database Online";
    } catch (error) {
        document.getElementById('status').innerHTML = "✖ Error connecting to database.";
        console.error("Firebase error:", error);
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
                    <button class="add-btn" onclick="addToList('${btoa(JSON.stringify(item))}')">Add to List +</button>
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
