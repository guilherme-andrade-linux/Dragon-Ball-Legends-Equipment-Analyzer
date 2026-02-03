# DBL Equipment Analyzer Dashboard

An advanced tool for Dragon Ball Legends players to analyze equipment effects, calculate stat boosts, and optimize character builds.

## Overview

The **DBL Equipment Analyzer** is a web-based dashboard that allows users to:
1.  **Browse & Select Characters**: Import your character roster or browse the full database.
2.  **Equip Items**: Assign up to 3 equipment pieces to a specific character.
3.  **Analyze Stats**: Instantly see how equipment buffs (Strike/Blast Attack, Defense, Health, etc.) stack up.
4.  **Smart Filtering**: The tool automatically filters equipment based on the selected character's compatibility (Tags, Element, Rarity).

## Key Features

-   **Character Management**
    -   Search by name.
    -   Visual indicators for Element and Rarity (SP, ULTRA).
    -   Import character data from **JSON** files or **Firebase**.

-   **Equipment System**
    -   **Smart Filtering**: Only shows equipment that can actually be equipped by the selected character.
    -   **Slot Management**: Add/Remove equipment in 3 dedicated slots.
    -   **Import Capabilities**: Load equipment databases via JSON or Firebase.

-   **Stats Analysis Engine**
    -   **Real-time Calculation**: Sums up percentage buffs from all equipped items.
    -   **Condition Handling**: Supports "OR" conditions in equipment effects (e.g., "Strike Atk +10% OR Blast Atk +10%").
    -   **Visual Bars**: Progress bars visualize the magnitude of boosts for easy comparison.
    -   **Unique Effects**: Extracts and displays non-numerical effects (e.g., "Damage to Saiyans +5%") in a separate panel.

-   **Modern UI/UX**
    -   Built with **Tailwind CSS** for a responsive, dark-mode design.
    -   Interactive hover states and smooth transitions.
    -   Grid-based layout for efficient browsing.

## Technologies Used

-   **HTML5 / CSS3**: Semantic structure and modern styling.
-   **Tailwind CSS**: Utility-first CSS framework for rapid and consistent UI development.
-   **JavaScript (ES6+)**: Core logic for state management, filtering, and stats calculation.
-   **Firebase Firestore**: Cloud database integration for storing and retrieving character/equipment data.

## How to Run

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/guilherme-andrade-linux/DBL_Equips.git
    ```
2.  **Open the Project**:
    Simply open `Index.html` in your modern web browser.
    
    > **Note**: For features like Firebase or JSON importing to work correctly without CORS issues, it is recommended to run the project using a local server (e.g., `Live Server` in VS Code or `python3 -m http.server`).

3.  **Usage**:
    -   **Left Panel**: Load characters (Firebase/JSON) and select a unit.
    -   **Middle Panel**: Load equipment (Firebase/JSON). Click an equipment to add it to a slot.
    -   **Right Panel**: View the selected unit, manage slots, and analyze the calculated stats.

## Project Structure

-   `Index.html`: Main entry point and UI layout.
-   `script.js`: Application logic (Firebase init, event handling, calculating stats).
-   `style.css`: Custom overrides and specific styles.
-   `dbl_characters_full.json` / `dbl_equipment_full.json`: Reference data files (if available locally).

---

*This tool is a fan-made project and is not affiliated with Dragon Ball Legends or Bandai Namco.*
