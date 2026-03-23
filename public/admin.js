// --- CONFIGURATION & INITIALIZATION ---
console.log("PACPal Engine Started!");

const firebaseConfig = {
    apiKey: "AIzaSyA5uz0RFyrCkxJocq8kZwFg_pcO2P6WTUg",
    authDomain: "pacpal-9f9bf.firebaseapp.com",
    projectId: "pacpal-9f9bf",
    storageBucket: "pacpal-9f9bf.firebasestorage.app",
    messagingSenderId: "993977477357",
    appId: "1:993977477357:web:72a2c5dee83d40e4b7c4e4"
};

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
    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (error) {
        document.getElementById('loginError').innerText = "Incorrect email or password.";
        document.getElementById('loginError').style.display = 'block';
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

// --- MEDICATION LOGIC ---
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
    buildAlphabet();
    const list = document.getElementById('databaseList');
    list.innerHTML = "<li>Loading...</li>";
    try {
        const snapshot = await db.collection('medications')
            .where('name', '>=', letter)
            .where('name', '<=', letter + '\uf8ff')
            .orderBy('name').get();
        currentResults = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderList();
    } catch (e) { list.innerHTML = "<li class='error'>Error fetching data.</li>"; }
}

function renderList() {
    const list = document.getElementById('databaseList');
    document.getElementById('emptyState').style.display = currentResults.length ? 'none' : 'block';
    list.innerHTML = currentResults.map(med => `
        <li class="med-item">
            <div class="med-info"><strong>${med.name}</strong><span>${med.category}</span></div>
            <div class="med-actions">
                <button class="edit-btn" onclick="startEdit('${med.id}')">Edit</button>
                <button class="delete-btn" onclick="deleteMed('${med.id}', '${med.name}')">Delete</button>
            </div>
        </li>`).join('');
}

// --- SAVE / UPDATE LOGIC ---
document.getElementById('addMedForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const rawName = document.getElementById('medName').value.trim();
    const sanitizedName = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();

    const medData = {
        name: sanitizedName, 
        category: document.getElementById('medCategory').value.trim(),
        instructions: document.getElementById('medInstructions').value.trim()
    };

    try {
        if (editingId) {
            // UPDATE EXISTING
            await db.collection('medications').doc(editingId).update(medData);
            alert(`${sanitizedName} updated!`);
            cancelEdit(); // Reset form
        } else {
            // ADD NEW
            await db.collection('medications').add(medData);
            alert(`${sanitizedName} added!`);
            document.getElementById('addMedForm').reset();
        }
        fetchByLetter(sanitizedName.charAt(0)); 
    } catch (error) {
        alert("Error saving to database.");
    }
});

function startEdit(id) {
    const med = currentResults.find(m => m.id === id);
    document.getElementById('medName').value = med.name;
    document.getElementById('medCategory').value = med.category;
    document.getElementById('medInstructions').value = med.instructions;
    editingId = id;
    document.getElementById('formTitle').innerText = "Edit: " + med.name;
    document.getElementById('submitBtn').innerText = "Update Database";
    document.getElementById('cancelBtn').style.display = "block";
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
    editingId = null;
    document.getElementById('addMedForm').reset();
    document.getElementById('formTitle').innerText = "Add New Medication";
    document.getElementById('submitBtn').innerText = "Save to Database";
    document.getElementById('cancelBtn').style.display = "none";
}

async function deleteMed(id, medName) {
    if (confirm(`⚠️ WARNING: Are you sure you want to permanently delete "${medName}"?`)) {
        try {
            await db.collection('medications').doc(id).delete();
            fetchByLetter(currentLetter);
        } catch (error) {
            alert("Error: Could not delete.");
        }
    }
}
