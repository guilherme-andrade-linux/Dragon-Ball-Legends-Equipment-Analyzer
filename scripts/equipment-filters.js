import { allEquipments, currentSelectedCharacter, selectedEquipEffects, selectedEquipConditions, selectedEquipRarities } from './state.js';
import { renderEquipList } from './equipment-manager.js';
import { STAT_MAPPING } from './stats-calculator.js';

// Helper to render filter buttons
export function renderGenericFilterButtons(containerId, items, selectedSet, updateCallback, countId) {
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

export function renderEquipEffectFilters() {
    // Populate from STAT_MAPPING keys
    const effects = Object.keys(STAT_MAPPING).sort();
    renderGenericFilterButtons('equipEffectContainer', effects, selectedEquipEffects, updateEquipmentList, 'equipEffectCount');
}

export function renderEquipConditionFilters(char) {
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
    // Update the set reference
    selectedEquipConditions.clear();
    newSelection.forEach(sel => selectedEquipConditions.add(sel));

    // Update count UI immediatelly
    const countSpan = document.getElementById('equipConditionCount');
    if (countSpan) {
        countSpan.textContent = selectedEquipConditions.size;
        countSpan.classList.toggle('hidden', selectedEquipConditions.size === 0);
    }

    renderGenericFilterButtons('equipConditionContainer', sortedTags, selectedEquipConditions, updateEquipmentList, 'equipConditionCount');
}

export function renderEquipRarityFilters() {
    // Extract all unique rarities from equipment
    const rarities = new Set();
    allEquipments.forEach(equip => {
        if (equip.rarity) {
            rarities.add(equip.rarity);
        }
    });

    // Create display-friendly labels
    const rarityOptions = Array.from(rarities).map(rarity => {
        // Convert "rarity gold" to "Gold", "rarity awakenedgold" to "Awakened Gold"
        const cleaned = rarity.replace(/^rarity\s*/i, '');
        // Split on capital letters and space them properly
        const formatted = cleaned
            .replace(/awakened/i, 'Awakened ')
            .split(/(?=[A-Z])/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
            .trim();
        return formatted || rarity; // Fallback to original if formatting fails
    }).sort();

    renderGenericFilterButtons('equipRarityContainer', rarityOptions, selectedEquipRarities, updateEquipmentList, 'equipRarityCount');
}

export function filterEquipments(char, equips) {
    if (!char) return equips;

    const charAttributes = new Set();
    // STRICT FILTERING: Only use visual_tags
    let visualTags = char.visual_tags;

    // DATA NORMALIZATION: Handle Firestore Map for visual_tags
    if (!Array.isArray(visualTags) && visualTags && typeof visualTags === 'object') {
        visualTags = Object.values(visualTags);
    }

    if (Array.isArray(visualTags)) {
        visualTags.forEach(tag => charAttributes.add(tag));
    }

    // DEBUG LOG
    // console.log(`[Filter Debug] Character: ${char.name}`, Array.from(charAttributes));

    return equips.filter((equip, index) => {
        // 1. Character Applicability
        let charMatch = true;
        if (equip.conditions_data && equip.conditions_data.length > 0) {
            const groups = equip.conditions_data;
            const logic = equip.condition_logic || "AND";

            // DEBUG LOGGING (First 10 items with conditions ONLY)
            // if (index < 10 && equip.conditions_data.length > 0) {
            //     console.log(`[Filter Debug] Equip: ${equip.name} (${equip.id})`, JSON.stringify(equip.conditions_data));
            // }

            const matchesGroup = (group) => {
                let requirements = [];

                // DATA NORMALIZATION: Handle various formats of "Group"
                if (Array.isArray(group)) {
                    requirements = group;
                } else if (group && typeof group === 'object') {
                    // Log unknown object structure
                    // console.log(`[Filter Debug] Unknown Group Object for ${equip.name}:`, group);

                    if (Array.isArray(group.tags)) {
                        requirements = group.tags;
                    } else if (group.tags && typeof group.tags === 'object') {
                        // Handle Firestore Map {0: "Tag", 1: "Tag"}
                        requirements = Object.values(group.tags);
                    } else if (group.value) {
                        // Format: { value: "Saiyan", ... } OR { value: ["Saiyan", "GT"] }
                        if (Array.isArray(group.value)) {
                            requirements = group.value;
                        } else {
                            requirements = [group.value];
                        }
                    } else if (group.original_text) {
                        requirements = [group.original_text];
                    } else {
                        // Fallback: Check if group itself is an array-like object (Firestore Map)
                        // Heuristic: has numeric keys?
                        const values = Object.values(group);
                        if (values.length > 0 && values.every(v => typeof v === 'string')) {
                            requirements = values;
                        }
                    }
                } else if (typeof group === 'string') {
                    requirements = [group];
                }

                if (!Array.isArray(requirements) || requirements.length === 0) {
                    // IF group exists but we found no requirements.
                    // Case: "[]" or "[[]]" in conditions_data means "No specific tags required" -> Universal.
                    // So return TRUE.
                    return true;
                }

                // Check if ALL requirements in this group are met by the character
                return requirements.every(req => {
                    if (typeof req !== 'string') return false;

                    // 1. Exact Match
                    if (charAttributes.has(req)) return true;

                    // 2. Prefix Match (e.g. "Tag: Saiyan" vs "Saiyan")
                    // Relaxed Regex: Optional space after colon
                    const cleanReq = req.replace(/^(Tag:|Episode:|Element:|Character:|Rarity:)\s*/, "");
                    const isMatch = charAttributes.has(cleanReq);

                    if (!isMatch && index < 5) {
                        console.log(`[Filter Debug] FAIL: Reqs: "${req}" (Clean: "${cleanReq}") NOT FOUND in Char Attributes.`, Array.from(charAttributes));
                    }
                    if (isMatch) return true;

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

        // 4. Rarity Filter
        if (selectedEquipRarities.size > 0) {
            // Normalize the equipment rarity for comparison
            const normalizeRarity = (rarity) => {
                if (!rarity) return '';
                const cleaned = rarity.replace(/^rarity\s*/i, '');
                return cleaned
                    .replace(/awakened/i, 'Awakened ')
                    .split(/(?=[A-Z])/)
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join(' ')
                    .trim();
            };

            const equipRarity = normalizeRarity(equip.rarity);
            if (!selectedEquipRarities.has(equipRarity)) return false;
        }

        return true;
    });
}


export function updateEquipmentList() {
    // Re-render the equipment list based on current selection
    if (allEquipments.length === 0) return;

    const filtered = filterEquipments(currentSelectedCharacter, allEquipments);
    renderEquipList(filtered);
}
