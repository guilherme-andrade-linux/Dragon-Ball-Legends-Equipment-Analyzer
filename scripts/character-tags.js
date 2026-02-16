import { allCharacters, selectedTags } from './state.js';
import { filterAndRenderCharacters } from './character-manager.js';

export function initializeTags() {
    const tagCounts = new Map();
    allCharacters.forEach(char => {
        if (Array.isArray(char.visual_tags)) {
            char.visual_tags.forEach(tag => {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            });
        }
    });

    // Sort tags alphabetically but ignore singletons
    const validTags = [];
    tagCounts.forEach((count, tag) => {
        if (count > 1) {
            validTags.push(tag);
        }
    });
    validTags.sort();

    renderTagFilters(validTags);
}

export function renderTagFilters(tags) {
    const container = document.getElementById('tagFiltersContainer');
    if (!container) return;

    container.innerHTML = '';

    tags.forEach(tag => {
        const btn = document.createElement('button');
        // Default Style
        btn.className = "px-2 py-0.5 rounded text-[10px] border border-[#2d3455] text-[#929bc9] hover:text-white hover:border-[#566089] transition-all bg-[#1e233b]";
        btn.textContent = tag;

        btn.onclick = () => {
            if (selectedTags.has(tag)) {
                selectedTags.delete(tag);
                btn.classList.remove('bg-primary/20', 'border-primary', 'text-primary');
                btn.classList.add('bg-[#1e233b]', 'border-[#2d3455]', 'text-[#929bc9]');
            } else {
                selectedTags.add(tag);
                btn.classList.remove('bg-[#1e233b]', 'border-[#2d3455]', 'text-[#929bc9]');
                btn.classList.add('bg-primary/20', 'border-primary', 'text-primary');
            }
            updateTagCount();
            filterAndRenderCharacters();
        };

        container.appendChild(btn);
    });
}

export function updateTagFilterUI() {
    const container = document.getElementById('tagFiltersContainer');
    if (!container) return;

    const btns = container.querySelectorAll('button');
    btns.forEach(btn => {
        const tag = btn.textContent;
        if (selectedTags.has(tag)) {
            btn.className = "px-2 py-0.5 rounded text-[10px] border border-primary text-primary bg-primary/20 transition-all";
        } else {
            btn.className = "px-2 py-0.5 rounded text-[10px] border border-[#2d3455] text-[#929bc9] hover:text-white hover:border-[#566089] transition-all bg-[#1e233b]";
        }
    });
    updateTagCount();
}

export function updateTagCount() {
    const countSpan = document.getElementById('tagCount');
    if (countSpan) {
        if (selectedTags.size > 0) {
            countSpan.textContent = selectedTags.size;
            countSpan.classList.remove('hidden');
        } else {
            countSpan.classList.add('hidden');
        }
    }
}
