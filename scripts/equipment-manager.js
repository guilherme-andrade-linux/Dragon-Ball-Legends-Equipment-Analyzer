import { db } from './firebase-config.js';
import { collection, getDocs, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { allEquipments, setAllEquipments } from './state.js';
import { updateEquipmentList } from './equipment-filters.js';
import { getRarityBorder } from './equipment-slots.js';
import { addEquipment } from './equipment-slots.js';

export function handleEquipFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const equipments = JSON.parse(e.target.result);
            setAllEquipments(equipments);
            updateEquipmentList(); // Use update function to handle filtering
            alert(`Sucesso! ${allEquipments.length} equipamentos carregados.`);
        } catch (error) {
            alert("Erro ao ler JSON de equipamentos.");
            console.error(error);
        }
    };
    reader.readAsText(file);
}

export async function fetchEquipmentsFromFirebase() {
    const btn = document.getElementById('btnImportEquipFirebase');
    if (btn) btn.classList.add('animate-pulse');

    try {
        const querySnapshot = await getDocs(collection(db, "equipments"));
        let equipments = [];
        querySnapshot.forEach((doc) => {
            equipments.push(doc.data());
        });

        if (equipments.length === 0) {
            alert("Nenhum equipamento encontrado no Firebase.");
        } else { // NORMALIZE DATA: Convert Firebase object structure back to arrays if needed
            equipments = equipments.map(eq => {
                if (Array.isArray(eq.conditions_data)) {
                    // Check if elements are objects (Firebase structure) instead of arrays (Local JSON structure)
                    // The user mentioned "value" as key, and code uses "tags". checking both.
                    const isFirebaseStructure = eq.conditions_data.some(item => !Array.isArray(item) && typeof item === 'object');

                    if (isFirebaseStructure) {
                        const normalizedConditions = eq.conditions_data.map(item => {
                            if (Array.isArray(item)) return item; // Already array

                            // Firebase stores as { values: [...] } (PLURAL!)
                            if (item.values && Array.isArray(item.values)) return item.values;

                            // Fallback checks for other possible keys
                            if (item.tags && Array.isArray(item.tags)) return item.tags;
                            if (item.value && Array.isArray(item.value)) return item.value;

                            return []; // Fallback
                        });
                        return { ...eq, conditions_data: normalizedConditions };
                    }
                }
                return eq;
            });

            setAllEquipments(equipments);
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

export async function uploadEquipmentsToFirebase() {
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

export function renderEquipList(equips) {
    const list = document.getElementById('equipList');
    if (!list) return;

    list.innerHTML = '';

    equips.forEach(equip => {
        // Create equipment card
        const div = document.createElement('div');
        div.className = "group flex gap-3 p-3 rounded-lg bg-[#1e233b] border border-transparent hover:border-primary/50 hover:bg-[#252b46] cursor-grab active:cursor-grabbing transition-all shadow-sm";

        // Image
        const imageUrl = equip.image || 'https://dblegends.net/assets/equips/EqIco_1578.webp'; // Fallback
        const borderImage = getRarityBorder(equip.rarity);

        // Build the image container HTML with rarity border on top
        let imageContainerHTML;
        if (borderImage) {
            imageContainerHTML = `
              <div class="relative size-14 shrink-0 rounded overflow-hidden shadow-md">
                <div class="absolute inset-0 bg-cover bg-center"
                     style='background-image: url("${imageUrl}"); background-color: #101322;'>
                </div>
                <div class="absolute inset-0 pointer-events-none"
                     style='background-image: url("${borderImage}"); background-size: 110%; background-position: center; background-repeat: no-repeat;'>
                </div>
              </div>`;
        } else {
            imageContainerHTML = `
              <div class="relative size-14 shrink-0 rounded bg-gradient-to-br from-gray-700 to-gray-500 p-0.5 shadow-md">
                <div class="w-full h-full bg-[#101322] rounded-[2px] flex items-center justify-center overflow-hidden">
                  <div class="w-full h-full bg-cover bg-center opacity-90"
                    style='background-image: url("${imageUrl}");'>
                  </div>
                </div>
              </div>`;
        }

        div.innerHTML = `
          ${imageContainerHTML}
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
