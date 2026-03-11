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
                const response = await fetch(SHEET_URL);
                myDatabase = await response.json();
                
                fuse = new Fuse(myDatabase, {
                    keys: ["name"],
                    threshold: 0.4
                });

                searchInput.disabled = false;
                searchInput.placeholder = "Search (e.g., Lisinopril)...";
                document.getElementById('status').innerHTML = "✓ Database Online";
            } catch (error) {
                document.getElementById('status').innerHTML = "✖ Error connecting to Sheets.";
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
                    html += `
                        <div class="card search-result-card">
                            <h3 class="med-name">${item.name}</h3>
                            <span class="category-badge">${item.category}</span>
                            <p class="instruction-text">${item.instructions.substring(0, 80)}...</p>
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
            const card = document.createElement('div');
            card.className = 'card pinned-card';
            card.innerHTML = `
                <button class="remove-btn" onclick="this.parentElement.remove(); updateUI();">×</button>
                <h3 class="med-name">${item.name}</h3>
                <span class="category-badge">${item.category}</span>
                <p class="instruction-text">${item.instructions}</p>
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
