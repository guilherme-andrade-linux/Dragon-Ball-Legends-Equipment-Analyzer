import { selectedEquipments } from './state.js';
import { calculateStats } from './stats-calculator.js';

// Helper function to get rarity border image
export function getRarityBorder(rarity) {
    if (!rarity) return null;

    // Map rarity class to image filename based on assets/rarity.md
    // Keys are normalized (lowercase, no spaces) to handle both:
    // - JSON format: "rarity event" (with space)
    // - Firebase format: "rarityevent" (without space)
    const rarityMap = {
        'rarityawakenedbronze': 'Awakened_Bronze.png',
        'rarityawakenedgold': 'Awakened_Gold.png',
        'rarityawakenedsilver': 'Awakened_Silver.png',
        'rarityawakenedunique': 'Awakened_Unique.png',
        'raritybronze': 'Bronze.png',
        'rarityevent': 'Event.png',
        'raritygold': 'Gold.png',
        'rarityiron': 'Iron.png',
        'rarityplatinum': 'Platinum.png',
        'raritysilver': 'Silver.png',
        'rarityunique': 'Unique.png'
    };

    // Normalize: lowercase, trim, and remove all spaces
    const normalizedRarity = rarity.toLowerCase().trim().replace(/\s+/g, '');
    const imageName = rarityMap[normalizedRarity];

    return imageName ? `assets/${imageName}` : null;
}

export function renderSlots() {
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

            // Image Container with Rarity Border
            const imgContainer = document.createElement('div');
            const borderImage = getRarityBorder(equip.rarity);

            const imageUrl = equip.image || 'https://dblegends.net/assets/equips/EqIco_1578.webp';

            // Structure: Container with equipment image as background, border PNG on top
            if (borderImage) {
                imgContainer.className = "w-[86px] h-[86px] rounded-lg overflow-hidden relative";
                imgContainer.innerHTML = `
                    <div class="absolute inset-0 bg-cover bg-center" 
                         style='background-image: url("${imageUrl}"); background-color: #101322;'>
                    </div>
                    <div class="absolute inset-0 pointer-events-none"
                         style='background-image: url("${borderImage}"); background-size: 110%; background-position: center; background-repeat: no-repeat;'>
                    </div>
                `;
            } else {
                imgContainer.className = "w-[86px] h-[86px] rounded-lg overflow-hidden bg-gradient-to-br from-amber-700 to-yellow-500 p-[2px]";
                imgContainer.innerHTML = `
                    <div class="w-full h-full bg-[#101322] flex items-center justify-center bg-cover bg-center"
                         style='background-image: url("${imageUrl}");'>
                    </div>
                `;
            }

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

export function addEquipment(equip) {
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

export function removeEquipment(index) {
    // Remove element at index
    selectedEquipments.splice(index, 1);
    // Push null to end to maintain size 3
    selectedEquipments.push(null);
    renderSlots();
    calculateStats();
}

export function toggleMultiplier(index) {
    const equip = selectedEquipments[index];
    if (equip) {
        if (equip.multiplier === undefined) equip.multiplier = 0;
        equip.multiplier = (equip.multiplier + 1) % 4; // Cycle 0 -> 1 -> 2 -> 3 -> 0
        renderSlots();
        calculateStats();
    }
}
