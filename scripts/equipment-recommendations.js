import { allEquipments, currentSelectedCharacter, selectedEquipments } from './state.js';
import { filterEquipments } from './equipment-filters.js';
import { getRarityBorder, renderSlots } from './equipment-slots.js';
import { getElementColor } from './character-manager.js';
import { calculateStats } from './stats-calculator.js';

// Global reference to store calculated options
let currentSoloOptions = [];
let currentTeamOptions = [];
let currentGoldOptions = [];

// Check if an equipment has team-based conditional effects
export function isTeamEquipment(equip) {
    if (!equip.slots) return false;
    // Check if the effect has keywords like "battle member", "battle members", "per ... member", "for each ... member", "other than this character"
    const teamKeywords = /battle\s+member|per\s+.*?\s+member|for\s+each\s+.*?\s+member|other\s+than\s+this\s+character/i;
    return equip.slots.some(s => s.effect && teamKeywords.test(s.effect));
}

// Extract numeric values from slot effect texts
function getStatValueFromText(text, statName, assumeFullTeam = false) {
    const escapedKey = statName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefix = !statName.startsWith("Base ") ? "(?<!Base\\s+)" : "";
    const regex = new RegExp(`${prefix}${escapedKey}\\s*([+-]?\\d+(?:\\.\\d+)?)(?:\\s*~\\s*([+-]?\\d+(?:\\.\\d+)?))?\\s*%`, 'i');
    const match = regex.exec(text);
    if (match) {
        const val1 = parseFloat(match[1]);
        const val2 = match[2] ? parseFloat(match[2]) : val1;
        return (val1 + val2) / 2;
    }

    // Compound stats check
    if (statName === "Base Strike Attack" || statName === "Base Blast Attack") {
        const compRegex = /Base Strike & Blast Attack\s*([+-]?\d+(?:\.\d+)?)(?:\s*~\s*([+-]?\d+(?:\.\d+)?))?\s*%/i;
        const m = compRegex.exec(text);
        if (m) {
            const val1 = parseFloat(m[1]);
            const val2 = m[2] ? parseFloat(m[2]) : val1;
            return (val1 + val2) / 2;
        }
    }
    if (statName === "Base Strike Defense" || statName === "Base Blast Defense") {
        const compRegex = /Base Strike & Blast Defense\s*([+-]?\d+(?:\.\d+)?)(?:\s*~\s*([+-]?\d+(?:\.\d+)?))?\s*%/i;
        const m = compRegex.exec(text);
        if (m) {
            const val1 = parseFloat(m[1]);
            const val2 = m[2] ? parseFloat(m[2]) : val1;
            return (val1 + val2) / 2;
        }
    }
    if (statName === "Strike Attack" || statName === "Blast Attack") {
        const compRegex = /(?<!Base\s+)Strike & Blast Attack\s*([+-]?\d+(?:\.\d+)?)(?:\s*~\s*([+-]?\d+(?:\.\d+)?))?\s*%/i;
        const m = compRegex.exec(text);
        if (m) {
            const val1 = parseFloat(m[1]);
            const val2 = m[2] ? parseFloat(m[2]) : val1;
            return (val1 + val2) / 2;
        }
    }
    if (statName === "Strike Defense" || statName === "Blast Defense") {
        const compRegex = /(?<!Base\s+)Strike & Blast Defense\s*([+-]?\d+(?:\.\d+)?)(?:\s*~\s*([+-]?\d+(?:\.\d+)?))?\s*%/i;
        const m = compRegex.exec(text);
        if (m) {
            const val1 = parseFloat(m[1]);
            const val2 = m[2] ? parseFloat(m[2]) : val1;
            return (val1 + val2) / 2;
        }
    }

    // Scaling / Threshold stats check
    const scalingRegex = /([+-]?\d+(?:\.\d+)?)(?:\s*~\s*([+-]?\d+(?:\.\d+)?))?\s*%\s*to\s*([^.]+?)\s*(?:per|for each|when|if)\s*/i;
    const sMatch = scalingRegex.exec(text);
    if (sMatch) {
        const statPart = sMatch[3];
        const cleanKey = statName.replace("Base ", "");
        if (statPart.includes(statName) || statPart.includes(cleanKey)) {
            if (statName.includes("Defense") && !statPart.includes("Defense")) return 0;
            if (statName.includes("Attack") && !statPart.includes("Attack")) return 0;
            const val1 = parseFloat(sMatch[1]);
            const val2 = sMatch[2] ? parseFloat(sMatch[2]) : val1;
            let avgVal = (val1 + val2) / 2;
            if (text.toLowerCase().includes("per") || text.toLowerCase().includes("each")) {
                avgVal *= assumeFullTeam ? 3 : 2; // Full team scales by 3 battle members!
            } else if (text.toLowerCase().includes("when") || text.toLowerCase().includes("if")) {
                avgVal *= 1.0;
            }
            return avgVal;
        }
    }

    return 0;
}

// Verify if the active character satisfies "if this character is [condition]" effects in this slot part
function doesCharacterSatisfySlotCondition(text) {
    const condRegex = /if\s*this\s*character\s*is\s*["']?([^"'\n]+?)["']?(?:\.|$|\s)/i;
    const match = condRegex.exec(text);
    if (!match) return true; // No requirement condition in this part

    const conditionTag = match[1].trim();
    const cleanCondition = conditionTag.replace(/^(Tag: |Episode: |Element: |Character: )/i, "");

    let hasTag = false;
    if (currentSelectedCharacter && currentSelectedCharacter.visual_tags) {
        hasTag = currentSelectedCharacter.visual_tags.some(t => t.trim().toLowerCase() === cleanCondition.toLowerCase());
        
        // Element color fallback (e.g. cleanCondition is "RED", character element matches RED)
        if (!hasTag && currentSelectedCharacter.element) {
            if (currentSelectedCharacter.element.toLowerCase() === cleanCondition.toLowerCase()) {
                hasTag = true;
            }
        }
        // Substring fallback
        if (!hasTag) {
            hasTag = currentSelectedCharacter.visual_tags.some(t => t.toLowerCase().includes(cleanCondition.toLowerCase()));
        }
        if (!hasTag && currentSelectedCharacter.name.toLowerCase().includes(cleanCondition.toLowerCase())) {
            hasTag = true;
        }
    }
    return hasTag;
}

// Calculate the quality score of an equipment piece for a given character type and focus
export function scoreEquipmentForCharacter(equip, charType, assumeFullTeam = false) {
    let strikeVal = 0;
    let blastVal = 0;
    let generalOffVal = 0;
    let survivalVal = 0;
    let critVal = 0;
    let strikeDefVal = 0;
    let blastDefVal = 0;
    let generalDefVal = 0;

    if (equip.slots) {
        equip.slots.forEach(slot => {
            if (!slot.effect) return;
            const parts = slot.effect.split(/- OR -/i);
            
            let maxStrikeVal = 0;
            let maxBlastVal = 0;
            let maxGeneralOffVal = 0;
            let maxSurvivalVal = 0;
            let maxCritVal = 0;
            let maxStrikeDefVal = 0;
            let maxBlastDefVal = 0;
            let maxGeneralDefVal = 0;

            parts.forEach(part => {
                // Enforce condition validation first
                if (!doesCharacterSatisfySlotCondition(part)) {
                    return;
                }

                // 1. Melee/Strike Offensive
                const bSAtk = getStatValueFromText(part, "Base Strike Attack", assumeFullTeam);
                const pSAtk = getStatValueFromText(part, "Strike Attack", assumeFullTeam);
                const sDmg = getStatValueFromText(part, "Strike Damage Inflicted", assumeFullTeam);
                const sVal = bSAtk + (pSAtk + sDmg) * 1.5;

                // 2. Ranged/Blast Offensive
                const bBAtk = getStatValueFromText(part, "Base Blast Attack", assumeFullTeam);
                const pBAtk = getStatValueFromText(part, "Blast Attack", assumeFullTeam);
                const bDmg = getStatValueFromText(part, "Blast Damage Inflicted", assumeFullTeam);
                const bVal = bBAtk + (pBAtk + bDmg) * 1.5;

                // 3. General Offensive Utility
                const iDmg = getStatValueFromText(part, "Inflicted Damage", assumeFullTeam);
                const spM = getStatValueFromText(part, "Special Move Damage", assumeFullTeam);
                const ultM = getStatValueFromText(part, "Ultimate Damage", assumeFullTeam);
                const cDmg = getStatValueFromText(part, "Critical Damage", assumeFullTeam);
                const goVal = (iDmg + spM + ultM + cDmg) * 1.5;

                // 4. Survival & Ki Utility
                const bHp = getStatValueFromText(part, "Base Health", assumeFullTeam);
                const hRest = getStatValueFromText(part, "Health Restoration", assumeFullTeam);
                const bKi = getStatValueFromText(part, "Base Ki Recovery", assumeFullTeam);
                const vRec = getStatValueFromText(part, "Vanishing Gauge Recovery", assumeFullTeam);
                const uGg = getStatValueFromText(part, "Unique Gauge Charge Rate", assumeFullTeam);
                const survVal = bHp * 1.5 + hRest + bKi + vRec * 1.5 + uGg * 1.5;

                // 5. Critical
                const bCrit = getStatValueFromText(part, "Base Critical", assumeFullTeam);
                const pCrit = getStatValueFromText(part, "Critical", assumeFullTeam);
                const crVal = bCrit + pCrit * 1.5;

                // 6. Strike Defense
                const bSDef = getStatValueFromText(part, "Base Strike Defense", assumeFullTeam);
                const pSDef = getStatValueFromText(part, "Strike Defense", assumeFullTeam);
                const sdVal = bSDef + pSDef * 1.5;

                // 7. Blast Defense
                const bBDef = getStatValueFromText(part, "Base Blast Defense", assumeFullTeam);
                const pBDef = getStatValueFromText(part, "Blast Defense", assumeFullTeam);
                const bdVal = bBDef + pBDef * 1.5;

                // 8. General Defense Cuts / Guard
                const dGrd = getStatValueFromText(part, "Damage Guard", assumeFullTeam);
                const sCut = getStatValueFromText(part, "Sustained Damage CUT", assumeFullTeam);
                const gdVal = (dGrd + sCut) * 1.5;

                maxStrikeVal = Math.max(maxStrikeVal, sVal);
                maxBlastVal = Math.max(maxBlastVal, bVal);
                maxGeneralOffVal = Math.max(maxGeneralOffVal, goVal);
                maxSurvivalVal = Math.max(maxSurvivalVal, survVal);
                maxCritVal = Math.max(maxCritVal, crVal);
                maxStrikeDefVal = Math.max(maxStrikeDefVal, sdVal);
                maxBlastDefVal = Math.max(maxBlastDefVal, bdVal);
                maxGeneralDefVal = Math.max(maxGeneralDefVal, gdVal);
            });

            strikeVal += maxStrikeVal;
            blastVal += maxBlastVal;
            generalOffVal += maxGeneralOffVal;
            survivalVal += maxSurvivalVal;
            critVal += maxCritVal;
            strikeDefVal += maxStrikeDefVal;
            blastDefVal += maxBlastDefVal;
            generalDefVal += maxGeneralDefVal;
        });
    }

    let finalScore = 0;

    if (charType === "hybrid") {
        finalScore = strikeVal * 1.5 + blastVal * 1.5 + generalOffVal * 1.5 + survivalVal * 1.8 + critVal * 1.2 + (strikeDefVal + blastDefVal + generalDefVal) * 1.5;
    } else if (charType === "utility") {
        let score = survivalVal * 3.0 + critVal * 2.0 + generalOffVal * 2.5 + generalDefVal * 2.0;
        
        let actualCharType = "Melee Type";
        if (currentSelectedCharacter && currentSelectedCharacter.visual_tags) {
            if (currentSelectedCharacter.visual_tags.includes("Ranged Type")) actualCharType = "Ranged Type";
            else if (currentSelectedCharacter.visual_tags.includes("Defense Type")) actualCharType = "Defense Type";
            else if (currentSelectedCharacter.visual_tags.includes("Support Type")) actualCharType = "Support Type";
        }

        if (actualCharType === "Melee Type") {
            score += strikeVal * 2.5;
        } else if (actualCharType === "Ranged Type") {
            score += blastVal * 2.5;
        } else if (actualCharType === "Defense Type") {
            score += (strikeDefVal + blastDefVal) * 2.5;
        } else if (actualCharType === "Support Type") {
            score += survivalVal * 1.5 + (strikeDefVal + blastDefVal) * 1.5;
        }
        finalScore = score;
    } else {
        // Standard focus (Primary / Principal) based strictly on foco_de_tipo.md
        let activeCharType = charType;
        if (activeCharType === "Melee Type" || activeCharType === "Ranged Type" || activeCharType === "Defense Type" || activeCharType === "Support Type") {
            // Valid character type
        } else {
            // Fallback checking visual_tags
            activeCharType = "Melee Type";
            if (currentSelectedCharacter && currentSelectedCharacter.visual_tags) {
                if (currentSelectedCharacter.visual_tags.includes("Ranged Type")) activeCharType = "Ranged Type";
                else if (currentSelectedCharacter.visual_tags.includes("Defense Type")) activeCharType = "Defense Type";
                else if (currentSelectedCharacter.visual_tags.includes("Support Type")) activeCharType = "Support Type";
            }
        }

        if (activeCharType === "Melee Type") {
            finalScore = (
                strikeVal * 3.5 +
                generalOffVal * 2.8 +
                survivalVal * 2.0 +
                critVal * 1.4 +
                (strikeDefVal + generalDefVal) * 0.8 +
                blastVal * 0.4 +
                blastDefVal * 0.2
            );
        } else if (activeCharType === "Ranged Type") {
            finalScore = (
                blastVal * 3.5 +
                generalOffVal * 2.8 +
                survivalVal * 2.0 +
                critVal * 1.4 +
                (blastDefVal + generalDefVal) * 0.8 +
                strikeVal * 0.4 +
                strikeDefVal * 0.2
            );
        } else if (activeCharType === "Defense Type") {
            finalScore = (
                (strikeDefVal + blastDefVal + generalDefVal) * 3.5 +
                survivalVal * 2.5 +
                critVal * 1.8 +
                (strikeVal + blastVal) * 1.2 +
                generalOffVal * 0.8
            );
        } else if (activeCharType === "Support Type") {
            finalScore = (
                survivalVal * 3.5 +
                critVal * 2.5 +
                generalOffVal * 1.8 +
                (strikeVal + blastVal) * 1.2 +
                (strikeDefVal + blastDefVal + generalDefVal) * 0.8
            );
        }
    }

    // Apply a major penalty (70%) to unrealistic, multi-attribute team conditional equipments
    if (equip && (equip.name === "Has My Wish...Come True?" || equip.name === "Cool. Thanks.")) {
        finalScore *= 0.3;
    }

    return finalScore;
}

// Generate an order-agnostic unique string signature for a 3-item gear set
function getOptionSignature(opt) {
    const parts = opt
        .filter(eq => eq !== null && eq !== undefined)
        .map(eq => eq.id !== undefined ? eq.id.toString() : eq.name)
        .sort();
    if (parts.length === 0) return '';
    return parts.join('|');
}

// Filter and pad unique sets of items
function getUniqueSet(sourceList, count) {
    const result = [];
    const seen = new Set();
    for (const eq of sourceList) {
        if (!eq) continue;
        const key = eq.id !== undefined ? eq.id.toString() : eq.name;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(eq);
            if (result.length === count) break;
        }
    }
    while (result.length < count) {
        result.push(null);
    }
    return result;
}

// Select a unique combination of 3 items from a pool that has not yet been registered
function selectUniqueOptionSet(sortedPool, existingSignatures, requireAtLeastOneTeamItem = false) {
    if (sortedPool.length < 3) {
        return getUniqueSet(sortedPool, 3);
    }

    const uniquePool = [];
    const seenItems = new Set();
    for (const eq of sortedPool) {
        if (!eq) continue;
        const key = eq.id !== undefined ? eq.id.toString() : eq.name;
        if (!seenItems.has(key)) {
            seenItems.add(key);
            uniquePool.push(eq);
        }
    }

    if (uniquePool.length < 3) {
        return getUniqueSet(uniquePool, 3);
    }

    // Check if there are any team items in the unique pool at all
    const hasAnyTeamItemInPool = uniquePool.some(eq => isTeamEquipment(eq));

    const maxScan = Math.min(uniquePool.length, 12);
    const combinations = [];

    for (let i = 0; i < maxScan; i++) {
        for (let j = i + 1; j < maxScan; j++) {
            for (let k = j + 1; k < maxScan; k++) {
                combinations.push({
                    indices: [i, j, k],
                    indexSum: i + j + k
                });
            }
        }
    }

    // Sort by sum of indices ascending to prefer the absolute highest scoring items
    combinations.sort((a, b) => {
        if (a.indexSum !== b.indexSum) return a.indexSum - b.indexSum;
        return a.indices[0] - b.indices[0];
    });

    for (const comb of combinations) {
        const [i, j, k] = comb.indices;
        const candidateSet = [uniquePool[i], uniquePool[j], uniquePool[k]];

        // If team item is required and pool actually has team items, ensure at least one item is team equipment!
        if (requireAtLeastOneTeamItem && hasAnyTeamItemInPool) {
            const hasTeamItem = candidateSet.some(eq => isTeamEquipment(eq));
            if (!hasTeamItem) continue; // Skip combinations with 0 team items
        }

        const signature = getOptionSignature(candidateSet);
        if (signature !== '' && !existingSignatures.has(signature)) {
            existingSignatures.add(signature);
            return candidateSet;
        }
    }

    // Fallback if all permutations are duplicates or filtered out
    let fallback = [uniquePool[0], uniquePool[1], uniquePool[2]];
    if (requireAtLeastOneTeamItem && hasAnyTeamItemInPool) {
        const hasTeamItem = fallback.some(eq => isTeamEquipment(eq));
        if (!hasTeamItem) {
            const firstTeamEq = uniquePool.find(eq => isTeamEquipment(eq));
            if (firstTeamEq) {
                fallback[2] = firstTeamEq;
            }
        }
    }

    const fallbackSig = getOptionSignature(fallback);
    if (fallbackSig !== '') existingSignatures.add(fallbackSig);
    return fallback;
}

// Render dynamic card sets to the UI
function renderRecommendationList(containerId, options, typeLabel, borderGlowColor) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    options.forEach((option, idx) => {
        const hasItems = option.some(x => x !== null);
        if (!hasItems) {
            container.innerHTML = `
                <div class="col-span-full py-8 text-center text-xs text-gray-500 italic">
                    Sem equipamentos suficientes carregados para gerar recomendações.
                </div>
            `;
            return;
        }

        const optionCard = document.createElement('div');
        optionCard.className = "flex flex-col bg-[#101322] border border-border-dark hover-glow-card rounded-xl p-4 transition-all duration-300 relative group";
        optionCard.style.hoverBorderColor = borderGlowColor;

        let titleLabel = "Principal";
        let titleIcon = "swords";
        let titleColorClass = "text-red-400";
        let subLabel = "Solo";

        if (idx === 0) {
            titleLabel = "Principal";
            titleIcon = "swords";
            titleColorClass = "text-red-400";
        } else if (idx === 1) {
            titleLabel = "Híbrido";
            titleIcon = "balance";
            titleColorClass = "text-green-400";
        } else if (idx === 2) {
            titleLabel = "Utilitário";
            titleIcon = "build";
            titleColorClass = "text-blue-400";
        }

        if (typeLabel === "solo") {
            subLabel = "Solo";
        } else if (typeLabel === "team") {
            subLabel = "Equipa";
        } else if (typeLabel === "gold") {
            subLabel = "Acessível";
        }

        let thumbsHTML = '';
        option.forEach(eq => {
            if (eq) {
                const borderImage = getRarityBorder(eq.rarity);
                const imageUrl = eq.image || 'https://dblegends.net/assets/equips/EqIco_1578.webp';
                
                let imageHTML;
                if (borderImage) {
                    imageHTML = `
                        <div class="relative size-14 shrink-0 rounded overflow-hidden shadow-sm cursor-pointer" title="${eq.name} (${eq.rarity.replace(/^rarity\s*/i, '').toUpperCase()})">
                            <div class="absolute inset-0 bg-cover bg-center" style='background-image: url("${imageUrl}"); bg-color: #101322;'></div>
                            <div class="absolute inset-0 pointer-events-none" style='background-image: url("${borderImage}"); background-size: 110%; background-position: center; background-repeat: no-repeat;'></div>
                        </div>
                    `;
                } else {
                    imageHTML = `
                        <div class="relative size-14 shrink-0 rounded overflow-hidden bg-gradient-to-br from-gray-700 to-gray-500 p-0.5 shadow-sm cursor-pointer" title="${eq.name}">
                            <div class="w-full h-full bg-[#101322] rounded-[2px] bg-cover bg-center" style='background-image: url("${imageUrl}");'></div>
                        </div>
                    `;
                }
                thumbsHTML += imageHTML;
            } else {
                thumbsHTML += `
                    <div class="size-14 rounded border border-dashed border-[#2d3455] bg-[#151a2d]/50 flex items-center justify-center text-[10px] text-gray-600">
                        Nenhum
                    </div>
                `;
            }
        });

        optionCard.innerHTML = `
            <div class="flex items-center justify-between mb-3 h-6">
                <div class="flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[16px] ${titleColorClass}">${titleIcon}</span>
                    <span class="text-xs font-extrabold text-white tracking-wide uppercase">${titleLabel}</span>
                </div>
                <span class="text-[9px] bg-primary/20 text-primary px-2 py-0.5 rounded font-bold uppercase tracking-wider">${subLabel}</span>
            </div>
            <div class="flex gap-3 items-center justify-center mb-4">
                ${thumbsHTML}
            </div>
            <button class="apply-rec-btn w-full h-8 bg-[#151a2d] hover:bg-primary border border-border-dark hover:border-primary text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95" data-idx="${idx}" data-type="${typeLabel}">
                <span class="material-symbols-outlined text-[14px]">playlist_add</span>
                <span>Usar Loadout</span>
            </button>
        `;

        optionCard.querySelector('.apply-rec-btn').addEventListener('click', () => {
            applyLoadout(idx, typeLabel);
        });

        container.appendChild(optionCard);
    });
}

// Apply the selected recommended gear set to the active slots
export function applyLoadout(optionIndex, type) {
    const list = type === 'solo' ? currentSoloOptions : (type === 'team' ? currentTeamOptions : currentGoldOptions);
    const selectedSet = list[optionIndex];

    if (!selectedSet) return;

    let appliedCount = 0;
    for (let i = 0; i < 3; i++) {
        const eq = selectedSet[i];
        if (eq) {
            const clonedEq = { ...eq };
            clonedEq.multiplier = isTeamEquipment(clonedEq) ? 3 : 0;
            selectedEquipments[i] = clonedEq;
            appliedCount++;
        } else {
            selectedEquipments[i] = null;
        }
    }

    renderSlots();
    calculateStats();

    if (window.showToast) {
        const charColor = currentSelectedCharacter ? getElementColor(currentSelectedCharacter.element) : '#1337ec';
        window.showToast(`Loadout de Sugestão Aplicado (${appliedCount} Equipamentos)!`, 'auto_awesome', charColor);
    }
}

// Generate the recommendations based on currently active character and equipment lists
export function generateRecommendations() {
    const cardContainer = document.getElementById('recommendations-card');
    if (!cardContainer) return;

    if (!currentSelectedCharacter || allEquipments.length === 0) {
        cardContainer.classList.add('hidden');
        return;
    }

    cardContainer.classList.remove('hidden');

    const nameSpan = document.getElementById('recommend-char-name');
    if (nameSpan) {
        nameSpan.textContent = currentSelectedCharacter.name;
        nameSpan.style.color = getElementColor(currentSelectedCharacter.element);
    }

    let charType = "Melee Type";
    if (currentSelectedCharacter.visual_tags) {
        if (currentSelectedCharacter.visual_tags.includes("Melee Type")) charType = "Melee Type";
        else if (currentSelectedCharacter.visual_tags.includes("Ranged Type")) charType = "Ranged Type";
        else if (currentSelectedCharacter.visual_tags.includes("Defense Type")) charType = "Defense Type";
        else if (currentSelectedCharacter.visual_tags.includes("Support Type")) charType = "Support Type";
    }

    const usableEquips = filterEquipments(currentSelectedCharacter, allEquipments);

    // 1. Split global pools for Solo vs Team
    const teamBasePool = [];
    const soloBasePool = [];

    usableEquips.forEach(eq => {
        if (isTeamEquipment(eq)) {
            teamBasePool.push(eq);
        } else {
            soloBasePool.push(eq);
        }
    });

    // ----------------------------------------------------
    // BUILD SOLO OPTIONS (strictly order-agnostic distinct sets)
    // ----------------------------------------------------
    const soloStandardSorted = [...soloBasePool].map(eq => {
        return { eq, score: scoreEquipmentForCharacter(eq, charType, false) };
    }).sort((a, b) => b.score - a.score).map(item => item.eq);

    const soloHybridSorted = [...soloBasePool].map(eq => {
        return { eq, score: scoreEquipmentForCharacter(eq, "hybrid", false) };
    }).sort((a, b) => b.score - a.score).map(item => item.eq);

    const soloUtilitySorted = [...soloBasePool].map(eq => {
        return { eq, score: scoreEquipmentForCharacter(eq, "utility", false) };
    }).sort((a, b) => b.score - a.score).map(item => item.eq);

    const soloSignatures = new Set();
    const soloOptions = [
        selectUniqueOptionSet(soloStandardSorted, soloSignatures),
        selectUniqueOptionSet(soloHybridSorted, soloSignatures),
        selectUniqueOptionSet(soloUtilitySorted, soloSignatures)
    ];

    // ----------------------------------------------------
    // BUILD TEAM SYNERGY OPTIONS (strictly order-agnostic distinct sets)
    // ----------------------------------------------------
    const combinedStandard = [];
    teamBasePool.forEach(eq => combinedStandard.push({ eq, score: scoreEquipmentForCharacter(eq, charType, true) }));
    soloBasePool.forEach(eq => combinedStandard.push({ eq, score: scoreEquipmentForCharacter(eq, charType, true) }));
    combinedStandard.sort((a, b) => b.score - a.score);
    const poolStandard = combinedStandard.map(x => x.eq);

    const combinedHybrid = [];
    teamBasePool.forEach(eq => combinedHybrid.push({ eq, score: scoreEquipmentForCharacter(eq, "hybrid", true) }));
    soloBasePool.forEach(eq => combinedHybrid.push({ eq, score: scoreEquipmentForCharacter(eq, "hybrid", true) }));
    combinedHybrid.sort((a, b) => b.score - a.score);
    const poolHybrid = combinedHybrid.map(x => x.eq);

    const combinedUtility = [];
    teamBasePool.forEach(eq => combinedUtility.push({ eq, score: scoreEquipmentForCharacter(eq, "utility", true) }));
    soloBasePool.forEach(eq => combinedUtility.push({ eq, score: scoreEquipmentForCharacter(eq, "utility", true) }));
    combinedUtility.sort((a, b) => b.score - a.score);
    const poolUtility = combinedUtility.map(x => x.eq);

    const teamSignatures = new Set();
    const teamOptions = [
        selectUniqueOptionSet(poolStandard, teamSignatures, true),
        selectUniqueOptionSet(poolHybrid, teamSignatures, true),
        selectUniqueOptionSet(poolUtility, teamSignatures, true)
    ];

    // ----------------------------------------------------
    // BUILD ACCESSIBLE GOLD-ONLY OPTIONS (strictly Gold rarity)
    // ----------------------------------------------------
    const goldEquips = usableEquips.filter(eq => {
        if (!eq.rarity) return false;
        const normalized = eq.rarity.toLowerCase().trim().replace(/\s+/g, '');
        return normalized === 'raritygold' || normalized === 'gold';
    });

    const goldTeamBasePool = [];
    const goldSoloBasePool = [];
    goldEquips.forEach(eq => {
        if (isTeamEquipment(eq)) {
            goldTeamBasePool.push(eq);
        } else {
            goldSoloBasePool.push(eq);
        }
    });

    const combinedGoldStandard = [];
    goldTeamBasePool.forEach(eq => combinedGoldStandard.push({ eq, score: scoreEquipmentForCharacter(eq, charType, true) }));
    goldSoloBasePool.forEach(eq => combinedGoldStandard.push({ eq, score: scoreEquipmentForCharacter(eq, charType, true) }));
    combinedGoldStandard.sort((a, b) => b.score - a.score);
    const poolGoldStandard = combinedGoldStandard.map(x => x.eq);

    const combinedGoldHybrid = [];
    goldTeamBasePool.forEach(eq => combinedGoldHybrid.push({ eq, score: scoreEquipmentForCharacter(eq, "hybrid", true) }));
    goldSoloBasePool.forEach(eq => combinedGoldHybrid.push({ eq, score: scoreEquipmentForCharacter(eq, "hybrid", true) }));
    combinedGoldHybrid.sort((a, b) => b.score - a.score);
    const poolGoldHybrid = combinedGoldHybrid.map(x => x.eq);

    const combinedGoldUtility = [];
    goldTeamBasePool.forEach(eq => combinedGoldUtility.push({ eq, score: scoreEquipmentForCharacter(eq, "utility", true) }));
    goldSoloBasePool.forEach(eq => combinedGoldUtility.push({ eq, score: scoreEquipmentForCharacter(eq, "utility", true) }));
    combinedGoldUtility.sort((a, b) => b.score - a.score);
    const poolGoldUtility = combinedGoldUtility.map(x => x.eq);

    const goldSignatures = new Set();
    const goldOptions = [
        selectUniqueOptionSet(poolGoldStandard, goldSignatures, true),
        selectUniqueOptionSet(poolGoldHybrid, goldSignatures, true),
        selectUniqueOptionSet(poolGoldUtility, goldSignatures, true)
    ];

    // Save globally
    currentSoloOptions = soloOptions;
    currentTeamOptions = teamOptions;
    currentGoldOptions = goldOptions;

    // Render lists
    const borderGlowColor = getElementColor(currentSelectedCharacter.element);
    renderRecommendationList('solo-recommendations', soloOptions, 'solo', borderGlowColor);
    renderRecommendationList('team-recommendations', teamOptions, 'team', borderGlowColor);
    renderRecommendationList('gold-recommendations', goldOptions, 'gold', borderGlowColor);
}

// Expose tab switcher globally
window.switchRecTab = function(type) {
    const tabSolo = document.getElementById('tab-solo-rec');
    const tabTeam = document.getElementById('tab-team-rec');
    const tabGold = document.getElementById('tab-gold-rec');
    const listSolo = document.getElementById('solo-recommendations');
    const listTeam = document.getElementById('team-recommendations');
    const listGold = document.getElementById('gold-recommendations');

    if (!tabSolo || !tabTeam || !tabGold || !listSolo || !listTeam || !listGold) return;

    const inactiveClass = "px-4 py-1.5 rounded-md text-xs font-bold text-[#929bc9] hover:text-white transition-all";
    const activeClass = "px-4 py-1.5 rounded-md text-xs font-bold text-white bg-primary transition-all";

    tabSolo.className = inactiveClass;
    tabTeam.className = inactiveClass;
    tabGold.className = inactiveClass;
    
    listSolo.classList.add('hidden');
    listTeam.classList.add('hidden');
    listGold.classList.add('hidden');

    if (type === 'solo') {
        tabSolo.className = activeClass;
        listSolo.classList.remove('hidden');
    } else if (type === 'team') {
        tabTeam.className = activeClass;
        listTeam.classList.remove('hidden');
    } else if (type === 'gold') {
        tabGold.className = activeClass;
        listGold.classList.remove('hidden');
    }
};
