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
    let strikeAtk = 0;
    let blastAtk = 0;
    let strikeDef = 0;
    let blastDef = 0;
    let critical = 0;
    let kiRecovery = 0;
    let health = 0;
    let restoration = 0;
    let specialMoveDmg = 0;
    let ultimateDmg = 0;

    if (equip.slots) {
        equip.slots.forEach(slot => {
            if (!slot.effect) return;
            const parts = slot.effect.split(/- OR -/i);
            
            let maxStrikeAtk = 0;
            let maxBlastAtk = 0;
            let maxStrikeDef = 0;
            let maxBlastDef = 0;
            let maxCritical = 0;
            let maxKiRecovery = 0;
            let maxHealth = 0;
            let maxRestoration = 0;
            let maxSpecialMoveDmg = 0;
            let maxUltimateDmg = 0;

            parts.forEach(part => {
                // Enforce condition validation first
                if (!doesCharacterSatisfySlotCondition(part)) {
                    return;
                }

                const baseSAtk = getStatValueFromText(part, "Base Strike Attack", assumeFullTeam);
                const pureSAtk = getStatValueFromText(part, "Strike Attack", assumeFullTeam);
                const dmgInflicted = getStatValueFromText(part, "Inflicted Damage", assumeFullTeam);

                const baseBAtk = getStatValueFromText(part, "Base Blast Attack", assumeFullTeam);
                const pureBAtk = getStatValueFromText(part, "Blast Attack", assumeFullTeam);

                const baseSDef = getStatValueFromText(part, "Base Strike Defense", assumeFullTeam);
                const pureSDef = getStatValueFromText(part, "Strike Defense", assumeFullTeam);

                const baseBDef = getStatValueFromText(part, "Base Blast Defense", assumeFullTeam);
                const pureBDef = getStatValueFromText(part, "Blast Defense", assumeFullTeam);

                const baseCrit = getStatValueFromText(part, "Base Critical", assumeFullTeam);
                const pureCrit = getStatValueFromText(part, "Critical", assumeFullTeam);

                const ki = getStatValueFromText(part, "Base Ki Recovery", assumeFullTeam);
                const hp = getStatValueFromText(part, "Base Health", assumeFullTeam);
                const rest = getStatValueFromText(part, "Health Restoration", assumeFullTeam);
                const spMove = getStatValueFromText(part, "Special Move Damage", assumeFullTeam);
                const ult = getStatValueFromText(part, "Ultimate Damage", assumeFullTeam);

                // Pure modifiers (including Inflicted Damage) are multiplied by 1.5x as they are more valuable in DBL calculations
                const sAtkVal = baseSAtk + (pureSAtk + dmgInflicted) * 1.5;
                const bAtkVal = baseBAtk + (pureBAtk + dmgInflicted) * 1.5;
                const sDefVal = baseSDef + pureSDef * 1.5;
                const bDefVal = baseBDef + pureBDef * 1.5;
                const critVal = baseCrit + pureCrit * 1.5;

                maxStrikeAtk = Math.max(maxStrikeAtk, sAtkVal);
                maxBlastAtk = Math.max(maxBlastAtk, bAtkVal);
                maxStrikeDef = Math.max(maxStrikeDef, sDefVal);
                maxBlastDef = Math.max(maxBlastDef, bDefVal);
                maxCritical = Math.max(maxCritical, critVal);

                maxKiRecovery = Math.max(maxKiRecovery, ki);
                maxHealth = Math.max(maxHealth, hp);
                maxRestoration = Math.max(maxRestoration, rest);
                maxSpecialMoveDmg = Math.max(maxSpecialMoveDmg, spMove);
                maxUltimateDmg = Math.max(maxUltimateDmg, ult);
            });

            strikeAtk += maxStrikeAtk;
            blastAtk += maxBlastAtk;
            strikeDef += maxStrikeDef;
            blastDef += maxBlastDef;
            critical += maxCritical;
            kiRecovery += maxKiRecovery;
            health += maxHealth;
            restoration += maxRestoration;
            specialMoveDmg += maxSpecialMoveDmg;
            ultimateDmg += maxUltimateDmg;
        });
    }

    let finalScore = 0;

    if (charType === "hybrid") {
        finalScore = strikeAtk * 1.5 + blastAtk * 1.5 + (strikeDef + blastDef) * 1.5 + health * 2.0 + kiRecovery * 1.5 + restoration * 1.0 + critical * 1.0;
    } else if (charType === "utility") {
        let score = health * 3.0 + kiRecovery * 2.5 + specialMoveDmg * 2.5 + ultimateDmg * 2.5 + restoration * 2.0 + critical * 1.5;
        
        let actualCharType = "Melee Type";
        if (currentSelectedCharacter && currentSelectedCharacter.visual_tags) {
            if (currentSelectedCharacter.visual_tags.includes("Ranged Type")) actualCharType = "Ranged Type";
            else if (currentSelectedCharacter.visual_tags.includes("Defense Type")) actualCharType = "Defense Type";
            else if (currentSelectedCharacter.visual_tags.includes("Support Type")) actualCharType = "Support Type";
        }

        if (actualCharType === "Melee Type") {
            score += strikeAtk * 2.5;
        } else if (actualCharType === "Ranged Type") {
            score += blastAtk * 2.5;
        } else if (actualCharType === "Defense Type") {
            score += (strikeDef + blastDef) * 2.5;
        } else if (actualCharType === "Support Type") {
            score += (strikeDef + blastDef) * 1.5 + kiRecovery * 1.5;
        }
        finalScore = score;
    } else {
        // Standard focus
        let score = health * 1.5 + kiRecovery * 1.0 + critical * 1.0;
        if (charType === "Melee Type") {
            score += strikeAtk * 3.0;
            score += blastAtk * 0.5;
            score += (strikeDef + blastDef) * 0.5;
        } else if (charType === "Ranged Type") {
            score += blastAtk * 3.0;
            score += strikeAtk * 0.5;
            score += (strikeDef + blastDef) * 0.5;
        } else if (charType === "Defense Type") {
            score += (strikeDef + blastDef) * 3.0;
            score += (strikeAtk + blastAtk) * 0.5;
        } else if (charType === "Support Type") {
            score += (strikeDef + blastDef) * 2.0;
            score += kiRecovery * 3.0;
            score += (strikeAtk + blastAtk) * 0.5;
        }
        finalScore = score;
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
