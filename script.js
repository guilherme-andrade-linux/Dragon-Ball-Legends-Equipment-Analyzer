// Import modules
import { handleFileUpload, fetchFromFirebase, filterAndRenderCharacters } from './scripts/character-manager.js';
import { updateTagFilterUI, initializeTags } from './scripts/character-tags.js';
import { handleEquipFileUpload, fetchEquipmentsFromFirebase } from './scripts/equipment-manager.js';
import { renderSlots } from './scripts/equipment-slots.js';
import { renderEquipEffectFilters, renderEquipRarityFilters } from './scripts/equipment-filters.js';
import { clearSelectedTags } from './scripts/state.js';

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
            clearSelectedTags();
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
    const toggleEquipRarityBtn = document.getElementById('toggleEquipRarityBtn');
    const equipRarityContainer = document.getElementById('equipRarityContainer');

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

    if (toggleEquipRarityBtn && equipRarityContainer) {
        toggleEquipRarityBtn.addEventListener('click', () => {
            equipRarityContainer.classList.toggle('hidden');
            equipRarityContainer.classList.toggle('flex');
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

    // Initial Render of Rarity Filters
    renderEquipRarityFilters();

    // Initial Slot Render
    renderSlots();
});
