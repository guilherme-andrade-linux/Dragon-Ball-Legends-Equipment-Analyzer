import { selectedEquipments, currentSelectedCharacter } from './state.js';

export const STAT_MAPPING = {
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

export function calculateStats() {
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

export function getGradientColor(percentage, isConditional) {
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

export function updateStatsUI(stats, conditionalStats, otherEffects) {
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


export function toggleEquipEffectSelection(equipIndex, slotIndex) {
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
