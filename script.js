import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

// --- FIREBASE CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyATIMePBMDrIQ7uOGiKrBKfgAhK8IgDJRw",
    authDomain: "dbl-team-builder.firebaseapp.com",
    projectId: "dbl-team-builder",
    storageBucket: "dbl-team-builder.firebasestorage.app",
    messagingSenderId: "649225970942",
    appId: "1:649225970942:web:14f58d3bc9e1c0f266f1af",
    measurementId: "G-5XBM7YY34G"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- STATE ---
let allCharacters = [];
let allEquipments = [];
let selectedTags = new Set();
let selectedEquipEffects = new Set();
let selectedEquipConditions = new Set();

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const btnImportFirebase = document.getElementById('btnImportFirebase');
    const btnImportJson = document.getElementById('btnImportJson');
    const searchInput = document.getElementById('searchInput');
    const btnClearSearch = document.getElementById('btnClearSearch');

    // Tag Filter Elements
    const toggleTagsBtn = document.getElementById('toggleTagsBtn');
    const tagFiltersContainer = document.getElementById('tagFiltersContainer');

    if (fileInput) fileInput.addEventListener('change', handleFileUpload);
    if (toggleTagsBtn) {
        toggleTagsBtn.addEventListener('click', () => {
            tagFiltersContainer.classList.toggle('hidden');
            tagFiltersContainer.classList.toggle('flex'); // Ensure it becomes flex when visible
        });
    }

    if (btnImportFirebase) {
        btnImportFirebase.addEventListener('click', fetchFromFirebase);
    }

    if (btnImportJson) {
        btnImportJson.addEventListener('click', () => {
            if (fileInput) fileInput.click();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            filterAndRenderCharacters();
        });
    }

    if (btnClearSearch) {
        btnClearSearch.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            selectedTags.clear();
            updateTagFilterUI(); // Clear visual selection
            filterAndRenderCharacters();
        });
    }

    // Equipment Listeners
    const equipFileInput = document.getElementById('equipFileInput');
    const btnImportEquipFirebase = document.getElementById('btnImportEquipFirebase');
    const btnImportEquipJson = document.getElementById('btnImportEquipJson');

    // New Collapsible Filter Buttons
    const toggleEquipEffectBtn = document.getElementById('toggleEquipEffectBtn');
    const equipEffectContainer = document.getElementById('equipEffectContainer');
    const toggleEquipConditionBtn = document.getElementById('toggleEquipConditionBtn');
    const equipConditionContainer = document.getElementById('equipConditionContainer');

    if (toggleEquipEffectBtn && equipEffectContainer) {
        toggleEquipEffectBtn.addEventListener('click', () => {
            equipEffectContainer.classList.toggle('hidden');
            equipEffectContainer.classList.toggle('flex');
        });
    }

    if (toggleEquipConditionBtn && equipConditionContainer) {
        toggleEquipConditionBtn.addEventListener('click', () => {
            equipConditionContainer.classList.toggle('hidden');
            equipConditionContainer.classList.toggle('flex');
        });
    }

    if (equipFileInput) equipFileInput.addEventListener('change', handleEquipFileUpload);
    if (btnImportEquipFirebase) btnImportEquipFirebase.addEventListener('click', fetchEquipmentsFromFirebase);
    if (btnImportEquipJson) {
        btnImportEquipJson.addEventListener('click', () => {
            if (equipFileInput) equipFileInput.click();
        });
    }

    // Initial Render of Effect Filters (static)
    renderEquipEffectFilters();
});

// --- FUNCTIONS ---

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            allCharacters = JSON.parse(e.target.result);
            initializeTags();
            filterAndRenderCharacters();
            alert(`Sucesso! ${allCharacters.length} personagens carregados.`);
        } catch (error) {
            alert("Erro ao ler JSON. Verifica o formato.");
            console.error(error);
        }
    };
    reader.readAsText(file);
}

async function fetchFromFirebase() {
    const btn = document.getElementById('btnImportFirebase');

    if (btn) {
        btn.classList.add('animate-pulse');
        // Optional: Change icon to loading, but keeping simple for now
    }

    try {
        const querySnapshot = await getDocs(collection(db, "characters"));
        allCharacters = [];
        querySnapshot.forEach((doc) => {
            allCharacters.push(doc.data());
        });

        if (allCharacters.length === 0) {
            alert("Nenhum personagem encontrado no Firebase.");
        } else {
            initializeTags();
            filterAndRenderCharacters();
            alert(`Sucesso! ${allCharacters.length} personagens carregados do Firebase.`);
        }

    } catch (error) {
        console.error("Erro ao carregar do Firebase:", error);
        alert("Erro ao carregar do Firebase. Verifica a consola.");
    } finally {
        if (btn) btn.classList.remove('animate-pulse');
    }
}

// Global selection state
let currentSelectedCharacter = null; // { image, visual_tags, name }
let selectedEquipments = [null, null, null]; // 3 Slots

function renderGrid(chars) {
    const grid = document.getElementById('charGrid');
    if (!grid) return;

    grid.innerHTML = '';

    chars.forEach(char => {
        // Create card element
        const div = document.createElement('div');
        div.className = "relative aspect-square rounded-lg overflow-hidden bg-[#1e233b] border border-transparent hover:border-primary cursor-pointer transition-all group";
        div.title = char.name;

        // Image or Placeholder
        let imageContent;
        if (char.image) {
            imageContent = `<img src="${char.image}" alt="${char.name}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" loading="lazy">`;
        } else {
            const rarityColor = char.rarity === 'ULTRA' ? 'border-yellow-400 text-yellow-400' : 'border-slate-500 text-slate-500';
            imageContent = `
                <div class="w-full h-full flex items-center justify-center border-2 ${rarityColor} border-dashed m-2 rounded bg-[#151a2d]">
                    <span class="font-bold ${char.rarity === 'ULTRA' ? 'text-yellow-400' : 'text-slate-400'}">${char.rarity === 'ULTRA' ? 'UL' : 'SP'}</span>
                </div>`;
        }

        // Element Badge (Tiny)
        const elColor = getElementColor(char.element);

        div.innerHTML = `
            ${imageContent}
            <div class="absolute bottom-0 left-0 w-full bg-black/80 p-1.5 backdrop-blur-sm transform translate-y-full group-hover:translate-y-0 transition-transform">
                <p class="text-[10px] text-white font-bold truncate leading-tight">${char.name}</p>
            </div>
            <div class="absolute top-1 right-1 size-3 rounded-full border border-white/20 shadow-sm" style="background-color: ${elColor};"></div>
        `;

        // Click Handler
        div.addEventListener('click', () => selectCharacter(char));

        grid.appendChild(div);
    });
}

function selectCharacter(char) {
    // 1. Update State
    currentSelectedCharacter = {
        image: char.image,
        visual_tags: char.visual_tags,
        name: char.name,
        element: char.element,
        rarity: char.rarity,
        id: char.id,
        code: char.code
    };

    // 1.1 Update Equipment List based on new character
    // Refresh Condition Filters for this new character
    renderEquipConditionFilters(char);
    updateEquipmentList();

    // 2. Update DOM Elements
    const container = document.getElementById('selectedUnitContainer');
    const placeholder = document.getElementById('selectedUnitPlaceholder');
    const imageContainer = document.getElementById('selectedUnitImage');
    const nameInfo = document.getElementById('selectedUnitInfo');
    const nameText = document.getElementById('selectedUnitName');
    const tagText = document.getElementById('selectedUnitTag');

    if (!container || !placeholder || !imageContainer || !nameInfo) return;

    // Hide Placeholder / Show Content
    placeholder.classList.add('hidden');
    imageContainer.classList.remove('hidden');
    nameInfo.classList.remove('hidden');

    // Update Content
    const bgDiv = imageContainer.querySelector('div');
    if (bgDiv) {
        bgDiv.style.backgroundImage = `url("${char.image || ''}")`;
    }

    if (nameText) nameText.textContent = char.name;

    // Optional: Display a relevant tag (e.g., first tag or rarity)
    if (tagText) {
        tagText.textContent = char.rarity || 'Unknown';
    }

    // Add glowing border effect
    container.classList.remove('border-border-dark');
    container.classList.add('border-primary', 'shadow-[0_0_40px_rgba(19,55,236,0.3)]');

    // Recalculate stats as they may depend on the character (e.g. conditional effects)
    calculateStats();
}

function getElementColor(el) {
    const map = {
        'RED': '#ff4d4d',
        'YEL': '#ffd700',
        'PUR': '#bf55ec',
        'GRN': '#2ecc71',
        'BLU': '#3498db',
        'LGT': '#fff',
        'DRK': '#000'
    };
    return map[el] || '#fff';
}

function filterAndRenderCharacters() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    const filtered = allCharacters.filter(char => {
        // 1. Name Filter
        const nameMatch = char.name.toLowerCase().includes(searchTerm);

        // 2. Tag Filter (AND Logic: Must have ALL selected tags)
        let tagsMatch = true;
        if (selectedTags.size > 0) {
            const charTags = new Set(char.visual_tags || []); // Assuming visual_tags array
            for (const tag of selectedTags) {
                if (!charTags.has(tag)) {
                    tagsMatch = false;
                    break;
                }
            }
        }

        return nameMatch && tagsMatch;
    });

    renderGrid(filtered);
}

function initializeTags() {
    const tagCounts = new Map();
    allCharacters.forEach(char => {
        if (Array.isArray(char.visual_tags)) {
            char.visual_tags.forEach(tag => {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            });
        }
    });

    // Sort tags alphabetically but ignore singletons
    const validTags = [];
    tagCounts.forEach((count, tag) => {
        if (count > 1) {
            validTags.push(tag);
        }
    });
    validTags.sort();

    renderTagFilters(validTags);
}

function renderTagFilters(tags) {
    const container = document.getElementById('tagFiltersContainer');
    if (!container) return;

    container.innerHTML = '';

    tags.forEach(tag => {
        const btn = document.createElement('button');
        // Default Style
        btn.className = "px-2 py-0.5 rounded text-[10px] border border-[#2d3455] text-[#929bc9] hover:text-white hover:border-[#566089] transition-all bg-[#1e233b]";
        btn.textContent = tag;

        btn.onclick = () => {
            if (selectedTags.has(tag)) {
                selectedTags.delete(tag);
                btn.classList.remove('bg-primary/20', 'border-primary', 'text-primary');
                btn.classList.add('bg-[#1e233b]', 'border-[#2d3455]', 'text-[#929bc9]');
            } else {
                selectedTags.add(tag);
                btn.classList.remove('bg-[#1e233b]', 'border-[#2d3455]', 'text-[#929bc9]');
                btn.classList.add('bg-primary/20', 'border-primary', 'text-primary');
            }
            updateTagCount();
            filterAndRenderCharacters();
        };

        container.appendChild(btn);
    });
}

function updateTagFilterUI() {
    const container = document.getElementById('tagFiltersContainer');
    if (!container) return;

    const btns = container.querySelectorAll('button');
    btns.forEach(btn => {
        const tag = btn.textContent;
        if (selectedTags.has(tag)) {
            btn.className = "px-2 py-0.5 rounded text-[10px] border border-primary text-primary bg-primary/20 transition-all";
        } else {
            btn.className = "px-2 py-0.5 rounded text-[10px] border border-[#2d3455] text-[#929bc9] hover:text-white hover:border-[#566089] transition-all bg-[#1e233b]";
        }
    });
    updateTagCount();
}

function updateTagCount() {
    const countSpan = document.getElementById('tagCount');
    if (countSpan) {
        if (selectedTags.size > 0) {
            countSpan.textContent = selectedTags.size;
            countSpan.classList.remove('hidden');
        } else {
            countSpan.classList.add('hidden');
        }
    }
}


// --- EQUIPMENT SLOTS FUNCTIONS ---

function renderSlots() {
    const container = document.getElementById('equipmentSlotsContainer');
    if (!container) return;

    container.innerHTML = '';

    selectedEquipments.forEach((equip, index) => {
        const slotDiv = document.createElement('div');
        slotDiv.className = "flex flex-col items-center gap-3 relative";

        const label = document.createElement('p');
        label.className = "text-xs text-[#929bc9] font-bold uppercase tracking-widest";
        label.textContent = `Slot ${index + 1}`;
        slotDiv.appendChild(label);

        if (equip) {
            // Filled Slot
            const card = document.createElement('div');
            card.className = "relative size-24 rounded-xl bg-[#1e233b] border-2 border-primary/50 shadow-[0_0_15px_rgba(19,55,236,0.2)] flex items-center justify-center cursor-pointer hover:bg-[#252b46] transition-all group select-none";

            // Rarity Dot (Mock)
            const dot = document.createElement('div');
            dot.className = "absolute top-1 right-1 size-2 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)]";
            card.appendChild(dot);

            // Image Container
            const imgContainer = document.createElement('div');
            imgContainer.className = "w-[86px] h-[86px] rounded-lg overflow-hidden bg-gradient-to-br from-amber-700 to-yellow-500 p-[2px]";

            const imageUrl = equip.image || 'https://dblegends.net/assets/equips/EqIco_1578.webp';

            imgContainer.innerHTML = `
                <div class="w-full h-full bg-[#101322] flex items-center justify-center bg-cover bg-center"
                     style='background-image: url("${imageUrl}");'>
                </div>
            `;

            // Add Click Listener to Open URL
            if (equip.url) {
                imgContainer.style.cursor = 'pointer';
                imgContainer.title = "Click to open equipment details";
                imgContainer.addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.open(equip.url, '_blank');
                });
            }

            card.appendChild(imgContainer);

            // Remove Button
            const removeBtn = document.createElement('div');
            removeBtn.className = "absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10 hover:scale-110 cursor-pointer";
            removeBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">close</span>';
            removeBtn.title = "Remove equipment";
            card.appendChild(removeBtn);

            // Add Click Listener to Remove
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent bubbling if needed
                removeEquipment(index);
            });

            // --- Multiplier Button Logic ---
            // Check if equip has "per member" or "when ... is a battle member" effects
            let hasPerMemberEffect = false;
            if (equip.slots) {
                const perMemberRegex = /per .* member|for each .* member|when .* is a battle member/i;
                hasPerMemberEffect = equip.slots.some(s => s.effect && perMemberRegex.test(s.effect));
            }

            if (hasPerMemberEffect) {
                const multiplierBtn = document.createElement('div');
                const currentMultiplier = equip.multiplier !== undefined ? equip.multiplier : 0;

                multiplierBtn.className = `equip-multiplier-btn ${currentMultiplier > 0 ? 'active' : ''}`;
                multiplierBtn.title = "Battle Member Count (Click to toggle 0-3)";
                multiplierBtn.innerHTML = `
                    <span class="material-symbols-outlined text-[12px]">group</span>
                    <span>x${currentMultiplier}</span>
                `;

                multiplierBtn.onclick = (e) => {
                    e.stopPropagation();
                    toggleMultiplier(index);
                };

                card.appendChild(multiplierBtn);
            }
            // -------------------------------

            slotDiv.appendChild(card);

            // Connector Line
            const line = document.createElement('div');
            line.className = "h-1 w-16 bg-gradient-to-r from-transparent via-primary to-transparent rounded-full opacity-50";
            slotDiv.appendChild(line);

        } else {
            // Empty Slot
            const card = document.createElement('div');
            card.className = "relative size-24 rounded-xl bg-[#101322] border-2 border-dashed border-[#3e477a] flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-[#1e233b] transition-all group";

            card.innerHTML = `
                <span class="material-symbols-outlined text-[#3e477a] group-hover:text-primary transition-colors text-[32px]">add_circle</span>
                <span class="text-[10px] text-[#566089] group-hover:text-[#929bc9] mt-1 font-medium">Equip</span>
            `;

            slotDiv.appendChild(card);

            // Connector Line (Empty style)
            const line = document.createElement('div');
            line.className = "h-1 w-16 bg-[#232948] rounded-full";
            slotDiv.appendChild(line);
        }

        container.appendChild(slotDiv);
    });
}

function addEquipment(equip) {
    // Check for duplicates in currently selected equipments
    const isDuplicate = selectedEquipments.some(existing => {
        if (!existing) return false;
        // Check ID if available on both (convert to string to ensure safe comparison)
        if (equip.id !== undefined && existing.id !== undefined) {
            return equip.id.toString() === existing.id.toString();
        }
        // Fallback to name comparison
        return equip.name === existing.name;
    });

    if (isDuplicate) {
        alert("Este equipamento já está equipado!");
        return;
    }
    // Find first empty slot
    const emptyIndex = selectedEquipments.indexOf(null);
    if (emptyIndex !== -1) {
        // Init multiplier to 0
        equip.multiplier = 0;
        selectedEquipments[emptyIndex] = equip;
        renderSlots();
        calculateStats();
    } else {
        alert("Todos os slots estão preenchidos! Remova um item primeiro.");
    }
}

function removeEquipment(index) {
    // Remove element at index
    selectedEquipments.splice(index, 1);
    // Push null to end to maintain size 3
    selectedEquipments.push(null);
    renderSlots();
    calculateStats();
}

function toggleMultiplier(index) {
    const equip = selectedEquipments[index];
    if (equip) {
        if (equip.multiplier === undefined) equip.multiplier = 0;
        equip.multiplier = (equip.multiplier + 1) % 4; // Cycle 0 -> 1 -> 2 -> 3 -> 0
        renderSlots();
        calculateStats();
    }
}

// --- EQUIPMENT FUNCTIONS ---

function handleEquipFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            allEquipments = JSON.parse(e.target.result);
            updateEquipmentList(); // Use update function to handle filtering
            alert(`Sucesso! ${allEquipments.length} equipamentos carregados.`);
        } catch (error) {
            alert("Erro ao ler JSON de equipamentos.");
            console.error(error);
        }
    };
    reader.readAsText(file);
}

async function fetchEquipmentsFromFirebase() {
    const btn = document.getElementById('btnImportEquipFirebase');
    if (btn) btn.classList.add('animate-pulse');

    try {
        const querySnapshot = await getDocs(collection(db, "equipments"));
        allEquipments = [];
        querySnapshot.forEach((doc) => {
            allEquipments.push(doc.data());
        });

        if (allEquipments.length === 0) {
            alert("Nenhum equipamento encontrado no Firebase.");
        } else {
            updateEquipmentList(); // Use update function to handle filtering
            alert(`Sucesso! ${allEquipments.length} equipamentos carregados do Firebase.`);
        }
    } catch (error) {
        console.error("Erro ao carregar equipamentos:", error);
        alert("Erro ao carregar equipamentos do Firebase.");
    } finally {
        if (btn) btn.classList.remove('animate-pulse');
    }
}

async function uploadEquipmentsToFirebase() {
    if (allEquipments.length === 0) {
        alert("Carrega primeiro os equipamentos do JSON para poderes enviar para o Firebase.");
        return;
    }

    if (!confirm(`Tens a certeza que queres enviar ${allEquipments.length} equipamentos para o Firebase? Isto vai subscrever os dados existentes.`)) {
        return;
    }

    const btn = document.getElementById('btnUploadEquipFirebase');
    if (btn) btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[16px]">refresh</span>';

    try {
        const batchSize = 400; // Limit is 500
        let currentBatch = writeBatch(db);
        let count = 0;
        let batchCount = 0;

        for (const equip of allEquipments) {
            // Firestore doesn't support nested arrays (e.g., conditions_data: [[tag1], [tag2]]).
            // We must convert them to objects: conditions_data: [{ tags: [tag1] }, { tags: [tag2] }]

            const equipToUpload = { ...equip }; // Clone to avoid modifying local state

            if (Array.isArray(equipToUpload.conditions_data)) {
                // Check if it's a nested array
                if (equipToUpload.conditions_data.length > 0 && Array.isArray(equipToUpload.conditions_data[0])) {
                    equipToUpload.conditions_data = equipToUpload.conditions_data.map(group => {
                        return { tags: group };
                    });
                }
            }

            // Use ID as document ID if available, else auto-id
            const ref = equipToUpload.id ? doc(db, "equipments", equipToUpload.id.toString()) : doc(collection(db, "equipments"));
            currentBatch.set(ref, equipToUpload);
            count++;

            if (count >= batchSize) {
                await currentBatch.commit();
                batchCount++;
                console.log(`Batch ${batchCount} written.`);
                currentBatch = writeBatch(db);
                count = 0;
            }
        }

        if (count > 0) {
            await currentBatch.commit();
        }

        alert("Sucesso! Todos os equipamentos foram enviados para o Firebase.");

    } catch (error) {
        console.error("Erro ao enviar para Firebase:", error);
        alert("Erro ao enviar para Firebase: " + error.message);
    } finally {
        if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">cloud_upload</span>';
    }
}

function renderEquipList(equips) {
    const list = document.getElementById('equipList');
    if (!list) return;

    list.innerHTML = '';

    equips.forEach(equip => {
        // Create equipment card
        const div = document.createElement('div');
        div.className = "group flex gap-3 p-3 rounded-lg bg-[#1e233b] border border-transparent hover:border-primary/50 hover:bg-[#252b46] cursor-grab active:cursor-grabbing transition-all shadow-sm";

        // Image
        const imageUrl = equip.image || 'https://dblegends.net/assets/equips/EqIco_1578.webp'; // Fallback

        div.innerHTML = `
          <div class="relative size-14 shrink-0 rounded bg-gradient-to-br from-gray-700 to-gray-500 p-0.5 shadow-md">
            <div class="w-full h-full bg-[#101322] rounded-[2px] flex items-center justify-center overflow-hidden">
              <div class="w-full h-full bg-cover bg-center opacity-90"
                style='background-image: url("${imageUrl}");'>
              </div>
            </div>
          </div>
          <div class="flex flex-col flex-1 min-w-0 justify-center">
            <h4 class="text-sm font-bold text-white truncate group-hover:text-primary transition-colors">${equip.name || 'Unknown Equipment'}</h4>
          </div>
          <div class="flex items-center">
            <span class="material-symbols-outlined text-[#566089] group-hover:text-white"
              style="font-size: 20px;">add_circle</span>
          </div>
        `;

        // Add click listener
        div.addEventListener('click', () => addEquipment(equip));

        list.appendChild(div);
    });
}

// Initial Slot Render
renderSlots();

// --- FILTERING LOGIC ---

// Helper to render filter buttons
function renderGenericFilterButtons(containerId, items, selectedSet, updateCallback, countId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    items.forEach(item => {
        const btn = document.createElement('button');
        const isSelected = selectedSet.has(item);

        btn.className = isSelected
            ? "px-2 py-0.5 rounded text-[10px] border border-primary text-primary bg-primary/20 transition-all font-medium"
            : "px-2 py-0.5 rounded text-[10px] border border-[#2d3455] text-[#929bc9] hover:text-white hover:border-[#566089] transition-all bg-[#1e233b]";

        btn.textContent = item;

        btn.onclick = () => {
            if (selectedSet.has(item)) {
                selectedSet.delete(item);
                btn.className = "px-2 py-0.5 rounded text-[10px] border border-[#2d3455] text-[#929bc9] hover:text-white hover:border-[#566089] transition-all bg-[#1e233b]";
            } else {
                selectedSet.add(item);
                btn.className = "px-2 py-0.5 rounded text-[10px] border border-primary text-primary bg-primary/20 transition-all font-medium";
            }
            if (countId) {
                const countSpan = document.getElementById(countId);
                if (countSpan) {
                    countSpan.textContent = selectedSet.size;
                    countSpan.classList.toggle('hidden', selectedSet.size === 0);
                }
            }
            updateCallback();
        };

        container.appendChild(btn);
    });
}

function renderEquipEffectFilters() {
    // Populate from STAT_MAPPING keys
    const effects = Object.keys(STAT_MAPPING).sort();
    renderGenericFilterButtons('equipEffectContainer', effects, selectedEquipEffects, updateEquipmentList, 'equipEffectCount');
}

function renderEquipConditionFilters(char) {
    if (!char) {
        const container = document.getElementById('equipConditionContainer');
        if (container) container.innerHTML = '<span class="text-[10px] text-gray-500 italic p-1">Select a unit...</span>';
        return;
    }

    // Collect tags from the character
    const tags = new Set();
    if (char.name) tags.add(char.name);
    // Add other relevant single properties if they are used in conditions often?
    // Usually only Tags (Arrays) are useful for "filters".
    // "Saiyan" is a tag. "Goku" is a name (sometimes used).

    if (Array.isArray(char.visual_tags)) {
        char.visual_tags.forEach(t => tags.add(t));
    }

    // Sort
    const sortedTags = Array.from(tags).sort();

    // Clear selections that are no longer valid for this character
    const newSelection = new Set();
    selectedEquipConditions.forEach(sel => {
        if (tags.has(sel)) newSelection.add(sel);
    });
    selectedEquipConditions = newSelection;

    // Update count UI immediatelly
    const countSpan = document.getElementById('equipConditionCount');
    if (countSpan) {
        countSpan.textContent = selectedEquipConditions.size;
        countSpan.classList.toggle('hidden', selectedEquipConditions.size === 0);
    }

    renderGenericFilterButtons('equipConditionContainer', sortedTags, selectedEquipConditions, updateEquipmentList, 'equipConditionCount');
}

function filterEquipments(char, equips) {
    if (!char) return equips;

    const charAttributes = new Set();
    if (char.name) charAttributes.add(char.name);
    if (char.element) charAttributes.add(char.element);
    if (char.rarity) charAttributes.add(char.rarity);
    if (char.id) charAttributes.add(char.id);
    if (char.code) charAttributes.add(char.code);
    if (Array.isArray(char.visual_tags)) {
        char.visual_tags.forEach(tag => charAttributes.add(tag));
    }

    return equips.filter(equip => {
        // 1. Character Applicability
        let charMatch = true;
        if (equip.conditions_data && equip.conditions_data.length > 0) {
            const groups = equip.conditions_data;
            const logic = equip.condition_logic || "AND";
            const matchesGroup = (group) => {
                let requirements = [];

                // DATA NORMALIZATION: Handle various formats of "Group"
                if (Array.isArray(group)) {
                    requirements = group;
                } else if (group && typeof group === 'object') {
                    if (Array.isArray(group.tags)) {
                        requirements = group.tags;
                    } else if (group.value) {
                        // Format: { value: "Saiyan", category: "Tag", ... }
                        requirements = [group.value];
                    } else if (group.original_text) {
                        requirements = [group.original_text];
                    }
                } else if (typeof group === 'string') {
                    requirements = [group];
                }

                if (!Array.isArray(requirements) || requirements.length === 0) return true;

                // Check if ALL requirements in this group are met by the character
                return requirements.every(req => {
                    if (typeof req !== 'string') return false;

                    // 1. Exact Match
                    if (charAttributes.has(req)) return true;

                    // 2. Prefix Match (e.g. "Tag: Saiyan" vs "Saiyan")
                    // Relaxed Regex: Optional space after colon
                    const cleanReq = req.replace(/^(Tag:|Episode:|Element:|Character:|Rarity:)\s*/, "");
                    if (charAttributes.has(cleanReq)) return true;

                    // 3. Name Match Fallback (e.g. "Goku" in name)
                    if (char.name.includes(cleanReq)) return true;

                    return false;
                });
            };

            if (logic === "OR") charMatch = groups.some(matchesGroup);
            else charMatch = groups.every(matchesGroup);
        }

        if (!charMatch) return false;

        // 2. Effect Filter
        if (selectedEquipEffects.size > 0) {
            const hasSelectedEffect = equip.slots && equip.slots.some(slot => {
                if (!slot.effect) return false;
                for (const effectKey of selectedEquipEffects) {
                    const text = slot.effect;
                    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                    if (effectKey.startsWith("Base ")) {
                        if (text.includes(effectKey)) return true;
                        if (effectKey === "Base Strike Attack" && text.includes("Base Strike & Blast Attack")) return true;
                        if (effectKey === "Base Blast Attack" && text.includes("Base Strike & Blast Attack")) return true;
                        if (effectKey === "Base Strike Defense" && text.includes("Base Strike & Blast Defense")) return true;
                        if (effectKey === "Base Blast Defense" && text.includes("Base Strike & Blast Defense")) return true;
                    } else {
                        try {
                            const strictRegex = new RegExp(`(?<!Base\\s+)${escape(effectKey)}`);
                            if (strictRegex.test(text)) return true;
                        } catch (e) {
                            if (text.includes(effectKey)) {
                                const idx = text.indexOf(effectKey);
                                const start = Math.max(0, idx - 5);
                                const prefix = text.substring(start, idx);
                                if (!prefix.includes("Base ")) return true;
                            }
                        }

                        let compoundKey = "";
                        if (effectKey === "Strike Attack" || effectKey === "Blast Attack") compoundKey = "Strike & Blast Attack";
                        if (effectKey === "Strike Defense" || effectKey === "Blast Defense") compoundKey = "Strike & Blast Defense";

                        if (compoundKey) {
                            try {
                                const strictCompoundRegex = new RegExp(`(?<!Base\\s+)${escape(compoundKey)}`);
                                if (strictCompoundRegex.test(text)) return true;
                            } catch (e) {
                                if (text.includes(compoundKey)) {
                                    const idx = text.indexOf(compoundKey);
                                    const start = Math.max(0, idx - 5);
                                    const prefix = text.substring(start, idx);
                                    if (!prefix.includes("Base ")) return true;
                                }
                            }
                        }
                    }
                }
                return false;
            });
            if (!hasSelectedEffect) return false;
        }

        // 3. Condition Filter
        if (selectedEquipConditions.size > 0) {
            if (!equip.conditions_data || equip.conditions_data.length === 0) return false;

            const allEquipTags = new Set();
            equip.conditions_data.forEach(group => {
                let tags = [];
                // DATA NORMALIZATION (Same as above)
                if (Array.isArray(group)) {
                    tags = group;
                } else if (group && typeof group === 'object') {
                    if (Array.isArray(group.tags)) {
                        tags = group.tags;
                    } else if (group.value) {
                        tags = [group.value];
                    } else if (group.original_text) {
                        tags = [group.original_text];
                    }
                } else if (typeof group === 'string') {
                    tags = [group];
                }

                if (Array.isArray(tags)) {
                    tags.forEach(t => {
                        if (typeof t === 'string') {
                            allEquipTags.add(t);
                            const cleanT = t.replace(/^(Tag:|Episode:|Element:|Character:|Rarity:)\s*/, "");
                            allEquipTags.add(cleanT);
                        }
                    });
                }
            });

            for (const sel of selectedEquipConditions) {
                if (!allEquipTags.has(sel)) return false;
            }
        }

        return true;
    });
}


function updateEquipmentList() {
    // Re-render the equipment list based on current selection
    if (allEquipments.length === 0) return;

    const filtered = filterEquipments(currentSelectedCharacter, allEquipments);
    renderEquipList(filtered);
}

// --- STATS ANALYSIS LOGIC ---

const STAT_MAPPING = {
    "Base Strike Attack": "stat-base-strike-attack",
    "Base Blast Attack": "stat-base-blast-attack",
    "Strike Attack": "stat-strike-attack",
    "Blast Attack": "stat-blast-attack",
    "Inflicted Damage": "stat-inflicted-damage",
    "Special Move Damage": "stat-special-move-damage",
    "Ultimate Damage": "stat-ultimate-damage",
    "Base Strike Defense": "stat-base-strike-defense",
    "Base Blast Defense": "stat-base-blast-defense",
    "Strike Defense": "stat-strike-defense",
    "Blast Defense": "stat-blast-defense",
    "Health Restoration": "stat-health-restoration",
    "Base Health": "stat-base-health",
    "Damage Guard": "stat-damage-guard",
    "Base Ki Recovery": "stat-base-ki-recovery",
    "Base Critical": "stat-base-critical",
    "Critical": "stat-critical"
};

function calculateStats() {
    // Initialize stats with 0
    const stats = {};
    const conditionalStats = {}; // Track which stats are conditional (from OR)

    for (const key in STAT_MAPPING) {
        stats[key] = 0;
        conditionalStats[key] = false;
    }

    const otherEffects = [];

    selectedEquipments.forEach((equip, equipIndex) => {
        if (!equip || !equip.slots) return;

        equip.slots.forEach((slot, slotIndex) => {
            const effectText = slot.effect;
            if (!effectText) return;

            // --- 0. Handle "OR" Logic ---
            const parts = effectText.split(/- OR -/i);
            const isConditional = parts.length > 1;
            let partsToProcess = parts;

            if (isConditional) {
                // Initialize selection state if not present
                if (!equip.selections) equip.selections = {};
                if (equip.selections[slotIndex] === undefined) equip.selections[slotIndex] = 0; // Default to first option

                const selectedIndex = equip.selections[slotIndex];

                // Track for UI
                otherEffects.push({
                    type: 'selector',
                    options: parts.map(p => p.trim()),
                    selectedIndex: selectedIndex,
                    equipIndex: equipIndex,
                    slotIndex: slotIndex
                });

                partsToProcess = [parts[selectedIndex]];
            }

            partsToProcess.forEach(part => {
                let remainingText = part;

                // 1. Helper to Process Matches
                const processMatch = (regex, keys) => {
                    remainingText = remainingText.replace(regex, (match, val1, val2) => {
                        let value = parseFloat(val1);
                        if (val2 && !isNaN(parseFloat(val2))) {
                            value = parseFloat(val2);
                        }

                        keys.forEach(k => {
                            if (stats[k] !== undefined) {
                                stats[k] += value;
                            }
                        });

                        return "";
                    });
                };


                // --- NEW: Handle "Per Member" / "When ... is member" Logic with Multiplier ---
                // We check this BEFORE standard processing to consume the text.
                const multiplier = equip.multiplier !== undefined ? equip.multiplier : 0;

                // --- NEW: Handle "if this character is" Logic ---
                const ifRegex = /([+]?\d+(?:\.\d+)?)(?:\s*~\s*([+]?\d+(?:\.\d+)?))?\s*%\s*to\s*([^.]+?)\s*if\s*this character is\s*"([^"]+)"/gi;

                remainingText = remainingText.replace(ifRegex, (match, val1, val2, statName, conditionTag) => {
                    let value = parseFloat(val1);
                    if (val2 && !isNaN(parseFloat(val2))) value = parseFloat(val2);

                    const cleanCondition = conditionTag.replace(/^(Tag: |Episode: |Element: |Character: )/, "");

                    // Check if current character matches the condition
                    // We need `currentSelectedCharacter` which is global
                    let hasTag = false;
                    if (currentSelectedCharacter && currentSelectedCharacter.visual_tags) {
                        hasTag = currentSelectedCharacter.visual_tags.includes(cleanCondition);
                        // Fallback for Name match if not in tags (sometimes names are used like "Broly")
                        if (!hasTag && currentSelectedCharacter.name.includes(cleanCondition)) hasTag = true;
                    }

                    if (hasTag) {
                        const textIsBase = statName.includes("Base ");
                        const keywords = ["Strike", "Blast", "Attack", "Defense", "Health", "Ki", "Damage", "Critical", "Restoration", "Inflicted", "Special", "Ultimate", "Move"];

                        for (const key in STAT_MAPPING) {
                            if (key.includes("Base ") !== textIsBase) continue;

                            let matchKey = true;
                            for (const word of keywords) {
                                if (key.includes(word) && !statName.includes(word)) {
                                    matchKey = false;
                                    break;
                                }
                            }
                            if (matchKey) {
                                stats[key] += value;
                            }
                        }
                        return ""; // Consume text
                    } else {
                        return match; // Keep text for Other Effects
                    }
                });

                // Regex for "scaling" effects (Per Member)
                // e.g. "8.00 ~ 12.50 % to Strike & Blast Defense per 'Tag: Son Family' battle member."
                // e.g. "for each 'Tag: Son Family' battle member"
                const scalingRegex = /([+]?\d+(?:\.\d+)?)(?:\s*~\s*([+]?\d+(?:\.\d+)?))?\s*%\s*to\s*([^.]+?)\s*(?:per|for each)\s*(?:.*?)\s*member/gi;

                remainingText = remainingText.replace(scalingRegex, (match, val1, val2, statName) => {
                    let value = parseFloat(val1);
                    if (val2 && !isNaN(parseFloat(val2))) value = parseFloat(val2);

                    const boostedValue = value * multiplier;

                    // Map stat name to keys
                    // Logic from existing stats mapping needed here, but statName might be "Strike & Blast Defense"
                    // We can reuse the key mapping logic

                    for (const key in STAT_MAPPING) {
                        // Check if key is inside the statName text (e.g. "Strike Defense" in "Strike & Blast Defense")
                        // Standardize check
                        const cleanKey = key.replace("Base ", ""); // stats usually say "to Strike Attack", not "to Base Strike Attack" in these sentences?
                        // Let's check both

                        if (statName.includes(key) || statName.includes(cleanKey)) {
                            // Correct mapping check:
                            // If statName is "Strike & Blast Defense", it matches "Strike Defense" and "Blast Defense".
                            if (stats[key] !== undefined) {
                                // Basic duplicate check for "Strike" matching "Strike Defense" and "Strike Attack"
                                // unique identifiers: "Defense", "Attack"
                                if (key.includes("Defense") && !statName.includes("Defense")) continue;
                                if (key.includes("Attack") && !statName.includes("Attack")) continue;

                                stats[key] += boostedValue;
                            }
                        }
                    }
                    return ""; // Consume
                });

                // Regex for "threshold" effects (When ... is a battle member)
                // e.g. "8.00 ~ 20.00 % to Blast Defense when 'Tag: Saiyan' and 'Tag: Potara' is a battle member."
                const thresholdRegex = /([+]?\d+(?:\.\d+)?)(?:\s*~\s*([+]?\d+(?:\.\d+)?))?\s*%\s*to\s*([^.]+?)\s*when\s*(?:.*?)\s*is a battle member/gi;

                remainingText = remainingText.replace(thresholdRegex, (match, val1, val2, statName) => {
                    let value = parseFloat(val1);
                    if (val2 && !isNaN(parseFloat(val2))) value = parseFloat(val2);

                    // Threshold logic: Max if multiplier > 0
                    const boostedValue = (multiplier > 0) ? value : 0;

                    for (const key in STAT_MAPPING) {
                        const cleanKey = key.replace("Base ", "");
                        if (statName.includes(key) || statName.includes(cleanKey)) {
                            if (key.includes("Defense") && !statName.includes("Defense")) continue;
                            if (key.includes("Attack") && !statName.includes("Attack")) continue;
                            stats[key] += boostedValue;
                        }
                    }
                    return ""; // Consume
                });


                // 2. Handle Compounds
                processMatch(/Base Strike & Blast Attack\s*([+]?\d+(?:\.\d+)?)(?:\s*~\s*([+]?\d+(?:\.\d+)?))?\s*%/gi, ["Base Strike Attack", "Base Blast Attack"]);
                processMatch(/Base Strike & Blast Defense\s*([+]?\d+(?:\.\d+)?)(?:\s*~\s*([+]?\d+(?:\.\d+)?))?\s*%/gi, ["Base Strike Defense", "Base Blast Defense"]);
                processMatch(/(?<!Base\s+)Strike & Blast Attack\s*([+]?\d+(?:\.\d+)?)(?:\s*~\s*([+]?\d+(?:\.\d+)?))?\s*%/gi, ["Strike Attack", "Blast Attack"]);
                processMatch(/(?<!Base\s+)Strike & Blast Defense\s*([+]?\d+(?:\.\d+)?)(?:\s*~\s*([+]?\d+(?:\.\d+)?))?\s*%/gi, ["Strike Defense", "Blast Defense"]);

                // 3. Handle Single Stats
                for (const key in STAT_MAPPING) {
                    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`${escapedKey}\\s*([+]?\\d+(?:\\.\\d+)?)(?:\\s*~\\s*([+]?\\d+(?:\\.\\d+)?))?\\s*%`, 'gi');
                    processMatch(regex, [key]);
                }

                // Clean up remaining text
                remainingText = remainingText.replace(/\s+/g, ' ').trim();
                remainingText = remainingText.replace(/^[-+]\s*/, '').trim();

                if (remainingText.length > 2) {
                    if (!/^[-.]+$/.test(remainingText)) {
                        // Only add to otherEffects if NOT conditional (because conditional ones added 'selector' object above)
                        // OR if it's the selected part residue?
                        // The prompt says: "o efeito aparece no 'Other Effects' com um botão... e se posivel por o effeito selecionado em 'Stats Analysis'"
                        // So we want the selector UI in Other Effects.
                        // But if there is residue text (e.g. non-stat text) in the selected part, we should probably display it too?
                        // Currently 'selector' object contains the full raw text options.
                        // So we probably don't need to push residue for the conditional case, 
                        // because the selector UI will show the full text of the option.
                        if (!isConditional) {
                            otherEffects.push(remainingText);
                        }
                    }
                }
            });
        });
    });

    updateStatsUI(stats, conditionalStats, otherEffects);
}

function getGradientColor(percentage, isConditional) {
    if (isConditional) return '#f97316'; // Orange-500

    // Red (0%) -> Yellow (50%) -> Green (100%)
    if (percentage <= 0) return '#ef4444'; // Red-500
    if (percentage >= 100) return '#22c55e'; // Green-500

    // Interpolate
    if (percentage < 50) {
        // Red to Yellow
        const p = percentage / 50;
        return `rgb(${239 + (234 - 239) * p}, ${68 + (179 - 68) * p}, ${68 + (8 - 68) * p})`;
    } else {
        // Yellow to Green
        const p = (percentage - 50) / 50;
        return `rgb(${234 + (34 - 234) * p}, ${179 + (197 - 179) * p}, ${8 + (94 - 8) * p})`;
    }
}

function updateStatsUI(stats, conditionalStats, otherEffects) {
    // 1. Update Stat Rows
    for (const [key, value] of Object.entries(stats)) {
        const idBase = STAT_MAPPING[key];
        const valueEl = document.getElementById(`${idBase}-value`);
        const barEl = document.getElementById(`${idBase}-bar`);
        const isConditional = conditionalStats[key];

        if (valueEl && barEl) {
            // Text
            const displayValue = value > 0 ? `+${value.toFixed(1)}%` : '0%';
            valueEl.innerText = displayValue;
            valueEl.className = "font-bold transition-colors";

            // Conditional Styling
            if (isConditional) {
                valueEl.style.color = '#f97316'; // Orange
                valueEl.title = "This stat depends on a choice (OR condition).";
            } else if (value > 0) {
                valueEl.style.color = '#22c55e'; // Greenish
                valueEl.removeAttribute('title');
            } else {
                valueEl.style.color = 'white';
                valueEl.removeAttribute('title');
            }

            // Bar Width and Color
            const maxScale = 100;
            const widthPct = Math.min((value / maxScale) * 100, 100);

            barEl.style.width = `${widthPct}%`;
            barEl.style.backgroundColor = getGradientColor(widthPct, isConditional);

            if (isConditional) {
                barEl.title = "Conditional Stat (OR)";
                barEl.parentElement.title = "Conditional Stat (OR)";
            } else {
                barEl.removeAttribute('title');
                barEl.parentElement.removeAttribute('title');
            }
        }
    }

    // 2. Update Other Effects
    const container = document.getElementById('other-effects-container');
    if (container) {
        container.innerHTML = '';
        const uniqueEffects = [...new Set(otherEffects)]; // Dedup

        uniqueEffects.forEach(item => {
            const div = document.createElement('div');
            div.className = "bg-[#151a2d] p-3 rounded border border-border-dark/50 text-sm text-[#929bc9] leading-relaxed mb-2";

            if (typeof item === 'object' && item.type === 'selector') {
                // Render Selector
                div.className += " flex flex-col gap-2";

                const title = document.createElement('div');
                title.className = "text-xs font-bold text-gray-500 uppercase tracking-wider";
                title.innerText = "Select Effect:";
                div.appendChild(title);

                const optionText = document.createElement('p');
                optionText.className = "text-white";
                optionText.innerText = item.options[item.selectedIndex];
                div.appendChild(optionText);

                // Toggle Button
                const btn = document.createElement('button');
                btn.className = "self-start flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold bg-[#1e233b] border border-[#3e477a] text-[#929bc9] hover:text-white hover:border-primary transition-all";

                // Icon
                btn.innerHTML = `
                    <span class="material-symbols-outlined text-[14px]">swap_horiz</span>
                    <span>Switch Option</span>
                `;

                btn.onclick = () => {
                    toggleEquipEffectSelection(item.equipIndex, item.slotIndex);
                };

                div.appendChild(btn);

            } else {
                // String / Regular Effect
                div.innerText = item;
            }
            container.appendChild(div);
        });

        if (uniqueEffects.length === 0) {
            container.innerHTML = '<span class="text-xs text-gray-600 italic">No complex effects.</span>';
        }
    }
}


function toggleEquipEffectSelection(equipIndex, slotIndex) {
    const equip = selectedEquipments[equipIndex];
    if (equip && equip.selections && equip.selections[slotIndex] !== undefined) {
        // Cycle between 0 and 1 (assuming max 2 options for now, but split gives array)
        // We need to know how many options there are. 
        // But here we don't have the options array easily.
        // However, standard OR is 2 parts.
        // Let's assume 2 for simplicity or check effect string again?
        // Checking effect string is safer.

        const slot = equip.slots[slotIndex];
        if (slot && slot.effect) {
            const parts = slot.effect.split(/- OR -/i);
            const numOptions = parts.length;
            if (numOptions > 1) {
                equip.selections[slotIndex] = (equip.selections[slotIndex] + 1) % numOptions;
                calculateStats();
            }
        }
    }
}
