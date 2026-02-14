import requests
from bs4 import BeautifulSoup
import json
import time
import re

# URL base
BASE_URL = "https://dblegends.net"
EQUIPMENT_LIST_URL = f"{BASE_URL}/equipment"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}

def get_soup(url):
    try:
        # Aumentei o timeout ligeiramente para garantir conexões mais lentas
        response = requests.get(url, headers=HEADERS, timeout=15)
        response.raise_for_status()
        return BeautifulSoup(response.content, "html.parser")
    except requests.RequestException as e:
        print(f"Erro ao aceder a {url}: {e}")
        return None

def scrape_equip_details(equip_url, basic_info):
    soup = get_soup(equip_url)
    if not soup:
        return basic_info

    details = basic_info.copy()
    
    # --- 1. Extrair Nome (H2) ---
    h2_tag = soup.find("h2")
    if h2_tag:
        details['name'] = h2_tag.get_text(strip=True)
    
    # --- 2. Extrair Raridade (rarity class) ---
    # A raridade está numa div com class "rarity [tipo]" dentro do container "equip-thumb"
    rarity = "unknown"
    equip_thumb = soup.find("div", class_="equip-thumb")
    if equip_thumb:
        rarity_div = equip_thumb.find("div", class_=lambda c: c and "rarity" in c)
        if rarity_div:
            # A class é algo como "rarity platinum", queremos extrair o nome completo
            rarity = rarity_div.get("class", [])
            # rarity é uma lista de classes, vamos juntar todas
            if isinstance(rarity, list):
                rarity = " ".join(rarity)
    details['rarity'] = rarity
    
    # --- 3. Extrair Slots (card-body) ---
    # O site usa card-body para os slots. Vamos apanhar todos e limpar o texto.
    slots = []
    # Procuramos especificamente dentro da zona principal para evitar apanhar lixo do footer/header
    # Mas como o pedido foi genérico, vamos apanhar todos os card-body relevantes.
    cards = soup.find_all("div", class_="card-body")
    
    for i, card in enumerate(cards):
        text = card.get_text(" ", strip=True)
        # Filtro simples: Slots de equipamento costumam ter texto de percentagens ou stats.
        # Se for vazio ou muito curto, ignoramos (opcional, removível se quiseres tudo)
        if text: 
            slots.append({
                "slot_index": i + 1,
                "effect": text
            })
    details['slots'] = slots

    # --- 4. Extrair Condições (Lógica AND/OR) ---
    # Classe indicada: "trait-container-equip mb-4 ms-4"
    # Usamos apenas "trait-container-equip" no find_all para ser mais robusto, 
    # pois o mb-4 e ms-4 são espaçamentos visuais.
    # Classe indicada: "trait-container-equip mb-4 ms-4" ou apenas "trait-container"
    # Usamos um lambda para encontrar qualquer div que tenha "trait-container" na classe
    trait_containers = soup.find_all("div", class_=lambda c: c and "trait-container" in c)
    
    condition_groups = []
    
    for container in trait_containers:
        tags_in_group = []
        # Dentro do container, a tag real do nome é <div class="name">, está dentro de um <a>.
        # Vamos buscar diretamente as divs com class="name" dentro deste container.
        name_divs = container.find_all("div", class_="name")
        for name_div in name_divs:
            tags_in_group.append(name_div.get_text(strip=True))
        
        if tags_in_group:
            condition_groups.append(tags_in_group)
    
    details['conditions_data'] = condition_groups
    
    # Lógica explicita baseada no número de contentores
    # 1 contentor = Requer todas as tags dentro dele (Implicitamente AND)
    # 2+ contentores = Pode usar as tags do contentor 1 OU do contentor 2 (OR)
    if len(condition_groups) > 1:
        details['condition_logic'] = "OR"
        details['condition_desc'] = "Must meet requirements of Group 1 OR Group 2..."
    else:
        details['condition_logic'] = "AND" 
        details['condition_desc'] = "Must meet all tags in the group"

    return details

def main():
    print(f"A iniciar scraping de: {EQUIPMENT_LIST_URL}")
    soup = get_soup(EQUIPMENT_LIST_URL)
    
    if not soup:
        print("Falha ao carregar a página de lista de equipamentos.")
        return

    # Procura todos os links que tenham href a começar por /equip/
    # O seletor CSS 'a[href^="/equip/"]' faz exatamente isso.
    equip_links = soup.select('a[href^="/equip/"]')
    
    all_equipment = []
    total_equips = len(equip_links)
    
    print(f"Encontrados {total_equips} equipamentos. A começar extração detalhada...")

    # Usamos um Set para evitar duplicados caso o site tenha links repetidos
    processed_ids = set()

    for index, link in enumerate(equip_links):
        href = link.get('href')
        equip_id = href.split('/')[-1]
        
        if equip_id in processed_ids:
            continue
        processed_ids.add(equip_id)

        # Dados básicos iniciais
        full_url = f"{BASE_URL}{href}"
        
        # Tentar apanhar a imagem da lista (é mais eficiente que entrar na página)
        img_tag = link.find("img")
        image_url = ""
        if img_tag:
            raw_src = img_tag.get("src", "")
            if raw_src:
                image_url = f"{BASE_URL}/{raw_src.lstrip('/')}" if not raw_src.startswith("http") else raw_src

        basic_data = {
            "id": equip_id,
            "url": full_url,
            "image": image_url,
            "name": "Unknown" # Será preenchido dentro da função de detalhe
        }

        # --- CONTROLO DE TESTE ---
        # REMOVE O COMENTÁRIO ABAIXO PARA SACAR TODOS (está limitado a 5 para teste rápido)
        # if len(all_equipment) >= 5: break 
        
        print(f"[{index+1}/{total_equips}] A extrair ID {equip_id}...")
        
        try:
            full_data = scrape_equip_details(full_url, basic_data)
            all_equipment.append(full_data)
        except Exception as e:
            print(f"Erro inesperado no equip {equip_id}: {e}")

        # --- CONTROLO DE DELAY ---
        # 1.0 segundo é "simpático". Se tiveres pressa podes baixar para 0.5,
        # mas 1.0 garante que o site não se chateia contigo.
        time.sleep(1.0)

    # Guardar ficheiro final
    filename = "dbl_equipment_full.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(all_equipment, f, ensure_ascii=False, indent=4)

    print(f"Concluído! {len(all_equipment)} equipamentos guardados em '{filename}'")

if __name__ == "__main__":
    main()