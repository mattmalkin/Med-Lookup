// --- CONFIGURATION & INITIALIZATION ---
console.log("PACPal Admin Engine Started!");

const firebaseConfig = {
    apiKey: "AIzaSyA5uz0RFyrCkxJocq8kZwFg_pcO2P6WTUg",
    authDomain: "pacpal-9f9bf.firebaseapp.com",
    projectId: "pacpal-9f9bf",
    storageBucket: "pacpal-9f9bf.firebasestorage.app",
    messagingSenderId: "993977477357",
    appId: "1:993977477357:web:72a2c5dee83d40e4b7c4e4"
};

// --- UNIFIED DARK MODE LOGIC ---
const themeToggle = document.getElementById('themeToggle');
const body = document.body;

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

// --- FIREBASE SETUP ---
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let currentLetter = 'A';
let currentResults = [];
let editingId = null;

// --- AUTHENTICATION ---
auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('dataFormSection').style.display = 'block';
        buildAlphabet(); 
        fetchByLetter('A');
        displayAdmins();
    } else {
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('dataFormSection').style.display = 'none';
    }
});

async function login() {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;
    const btn = document.querySelector('#loginSection button');
    
    btn.innerText = "Authenticating...";
    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (error) {
        document.getElementById('loginError').innerText = "Incorrect email or password.";
        document.getElementById('loginError').style.display = 'block';
        btn.innerText = "Login to PACPal";
    }
}

function logout() { auth.signOut(); }

// --- ADMIN LIST ---
async function displayAdmins() {
    const listElement = document.getElementById('admin-list');
    try {
        const snapshot = await db.collection("admins").get();
        listElement.innerHTML = "";
        snapshot.forEach(doc => {
            const data = doc.data();
            const adminName = data.name || "Unnamed Admin"; 
            const li = document.createElement("li");
            li.className = "admin-item";
            li.innerHTML = `<div><strong>${adminName}</strong><br><span style="font-size: 10px; color: #b2bec3;">ID: ${doc.id}</span></div>`;
            listElement.appendChild(li);
        });
    } catch (error) {
        listElement.innerHTML = "<li class='error'>Access Denied: Could not load admins.</li>";
    }
}

// --- MEDICATION ROLODEX LOGIC ---
function buildAlphabet() {
    const container = document.getElementById('alphabetContainer');
    container.innerHTML = '';
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(letter => {
        const btn = document.createElement('button');
        btn.innerText = letter;
        btn.className = letter === currentLetter ? 'alpha-btn active' : 'alpha-btn';
        btn.onclick = () => fetchByLetter(letter);
        container.appendChild(btn);
    });
}

async function fetchByLetter(letter) {
    currentLetter = letter;
    buildAlphabet(); // Updates active button color
    
    const list = document.getElementById('databaseList');
    document.getElementById('emptyState').style.display = 'none';

    const now = Date.now();
    const CACHE_LIFETIME_MS = 12 * 60 * 60 * 1000; // 12 hours
    const cacheKey = `pacpal_admin_meds_${letter}`; // Unique cache for each letter
    
    const cachedMeds = localStorage.getItem(cacheKey);
    const cachedTime = localStorage.getItem('pacpal_admin_cache_time');

    // CACHE CHECK
    if (cachedMeds && cachedTime && (now - parseInt(cachedTime, 10) < CACHE_LIFETIME_MS)) {
        console.log(`⚡ Admin loaded letter ${letter} from local cache.`);
        currentResults = JSON.parse(cachedMeds);
        renderList();
        return; // Stop here! Don't run the Firebase code below.
    }

    // CACHE MISS: Fetch from Firebase
    list.innerHTML = "<div style='padding: 20px; text-align: center;'>↻ Fetching secure database...</div>"; 

    try {
        console.log(`☁️ Admin downloading letter ${letter} from Firebase...`);
        const snapshot = await db.collection('medications')
            .where('name', '>=', letter)
            .where('name', '<=', letter + '\uf8ff')
            .orderBy('name').get();
            
        currentResults = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Save the fresh results and the timestamp to memory
        localStorage.setItem(cacheKey, JSON.stringify(currentResults));
        localStorage.setItem('pacpal_admin_cache_time', now.toString());
        
        renderList();
    } catch (e) { 
        console.error(e);
        list.innerHTML = "<li class='error'>Error fetching data from Firestore.</li>"; 
    }
}

function renderList() {
    const list = document.getElementById('databaseList');
    
    if (currentResults.length === 0) {
        list.innerHTML = "";
        document.getElementById('emptyState').style.display = 'block';
        return;
    }
    
    document.getElementById('emptyState').style.display = 'none';
    list.innerHTML = currentResults.map(med => `
        <li class="med-item">
            <div class="med-info" style="width: 70%;">
                <strong>${med.name}</strong>
                <span class="category-badge">${med.category || 'General'}</span>
                
                <p style="font-size: 0.85em; color: var(--text-muted); margin-top: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${med.instructions || 'No instructions provided.'}
                </p>
                
            </div>
            <div class="med-actions">
                <button class="edit-btn" onclick="startEdit('${med.id}')">Edit</button>
                <button class="delete-btn" onclick="deleteMed('${med.id}', '${med.name}')">Delete</button>
            </div>
        </li>`).join('');
}

// --- NEW: CACHE CLEARING HELPER ---
function refreshLetterCache(medicationName) {
    if (!medicationName) return;
    const targetLetter = medicationName.charAt(0).toUpperCase();

    // Wipe specific letter from memory
    localStorage.removeItem(`pacpal_admin_meds_${targetLetter}`);

    // If we changed the name so drastically it moved letters, wipe the old letter too
    if (currentLetter !== targetLetter) {
        localStorage.removeItem(`pacpal_admin_meds_${currentLetter}`);
    }

    // Re-fetch the letter we just edited
    fetchByLetter(targetLetter);
}

// --- SAVE / UPDATE LOGIC ---
document.getElementById('addMedForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const rawName = document.getElementById('medName').value.trim();
    const sanitizedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

    const medData = {
        name: sanitizedName, 
        category: document.getElementById('medCategory').value.trim(),
        instructions: document.getElementById('medInstructions').value.trim()
    };

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.innerText = "Syncing..."; 
    submitBtn.disabled = true;

    try {
        if (editingId) {
            await db.collection('medications').doc(editingId).update(medData);
        } else {
            await db.collection('medications').add(medData);
        }

        // Wipe the cache and instantly fetch the fresh data
        refreshLetterCache(medData.name);
        
        cancelEdit(); 
        
    } catch (error) {
        console.error("Save Error:", error);
        alert("System Error: Could not save to database.");
    } finally {
        submitBtn.disabled = false;
        if (!editingId) submitBtn.innerText = "Save to Database";
    }
});

function startEdit(id) {
    const med = currentResults.find(m => m.id === id);
    if (!med) return;
    
    document.getElementById('medName').value = med.name;
    document.getElementById('medCategory').value = med.category;
    document.getElementById('medInstructions').value = med
