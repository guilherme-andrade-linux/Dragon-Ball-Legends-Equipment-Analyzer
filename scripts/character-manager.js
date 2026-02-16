import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { allCharacters, setAllCharacters, setCurrentSelectedCharacter } from './state.js';
import { initializeTags } from './character-tags.js';
import { renderEquipConditionFilters } from './equipment-filters.js';
import { calculateStats } from './stats-calculator.js';

export function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const characters = JSON.parse(e.target.result);
            setAllCharacters(characters);
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

export async function fetchFromFirebase() {
    const btn = document.getElementById('btnImportFirebase');

    if (btn) {
        btn.classList.add('animate-pulse');
    }

    try {
        const querySnapshot = await getDocs(collection(db, "characters"));
        const characters = [];
        querySnapshot.forEach((doc) => {
            characters.push(doc.data());
        });

        if (characters.length === 0) {
            alert("Nenhum personagem encontrado no Firebase.");
        } else {
            setAllCharacters(characters);
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

export function renderGrid(chars) {
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

export function selectCharacter(char) {
    // 1. Update State
    setCurrentSelectedCharacter({
        image: char.image,
        visual_tags: char.visual_tags,
        name: char.name,
        element: char.element,
        rarity: char.rarity,
        id: char.id,
        code: char.code
    });

    // 1.1 Update Equipment List based on new character
    // Refresh Condition Filters for this new character
    renderEquipConditionFilters(char);

    // Import updateEquipmentList dynamically to avoid circular dependency
    import('./equipment-filters.js').then(module => {
        module.updateEquipmentList();
    });

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

export function getElementColor(el) {
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

export function filterAndRenderCharacters() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    // Import selectedTags from state
    import('./state.js').then(module => {
        const { selectedTags } = module;

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
    });
}
