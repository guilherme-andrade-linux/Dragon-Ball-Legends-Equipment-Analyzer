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

export function setAllEquipments(equips) {
    allEquipments = equips;
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
