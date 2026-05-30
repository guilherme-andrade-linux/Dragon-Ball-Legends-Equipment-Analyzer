// --- STATE ---
export let allCharacters = [];
export let allEquipments = [];
export let selectedTags = new Set();
export let selectedEquipEffects = new Set();
export let selectedEquipConditions = new Set();
export let selectedEquipRarities = new Set();

// Global selection state
export let currentSelectedCharacter = null; // { image, visual_tags, name }
export let selectedEquipments = [null, null, null]; // 3 Slots

// --- STATE SETTERS ---
export function setAllCharacters(chars) {
    allCharacters = chars;
}

export function correctHandicapEquipment(equips) {
    if (!Array.isArray(equips)) return equips;
    return equips.map(eq => {
        if (eq && eq.name === "I'll give you a handicap") {
            const slots = eq.slots.map(slot => {
                if (slot.slot_index === 2) {
                    return {
                        ...slot,
                        effect: "Base Blast Defense 15.00 ~ 33.00 % - OR - Base Strike Defense 15.00 ~ 33.00 % Base Blast Attack -5.00 ~ -5.00 % - OR - Base Strike Attack -5.00 ~ -5.00 %"
                    };
                }
                if (slot.slot_index === 3) {
                    return {
                        ...slot,
                        effect: "Base Blast Attack 15.00 ~ 33.00 % - OR - Base Strike Attack 15.00 ~ 33.00 % Base Blast Defense -5.00 ~ -5.00 % - OR - Base Strike Defense -5.00 ~ -5.00 %"
                    };
                }
                return slot;
            });
            return { ...eq, slots };
        }
        return eq;
    });
}

export function setAllEquipments(equips) {
    if (!Array.isArray(equips)) {
        allEquipments = [];
        return;
    }
    // Filter out "I'll give you a handicap" completely from the database
    allEquipments = equips.filter(eq => eq && eq.name !== "I'll give you a handicap");
}

export function setCurrentSelectedCharacter(char) {
    currentSelectedCharacter = char;
}

export function setSelectedEquipment(index, equip) {
    if (index >= 0 && index < selectedEquipments.length) {
        selectedEquipments[index] = equip;
    }
}

export function clearSelectedTags() {
    selectedTags.clear();
}
