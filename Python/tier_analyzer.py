"""
DBL Equipment Tier Analyzer
============================
Lê dbl_equipment_full.json e gera equipment_tiers.json com {name, type, tier, score}.

Lógica:
  1. Determina o "tipo" de cada equipamento com base na rarity + conditions_data
  2. Calcula um score numérico a partir dos valores % nos efeitos + bónus por keywords
  3. Mapeia o score para um tier (神 / Z+ / Z / S / A / B / C)
     - Equipamentos genéricos → thresholds absolutos (SCORE_TIERS)
     - Equipamentos *_specific → ranking RELATIVO por percentil dentro do grupo
       (comparam-se entre si, não contra equipamentos genéricos)

Platinum → sempre 神 (exclusivos ULTRA)
Event / Iron → sempre C (sem uso competitivo)
"""

import json
import re
import os
from pathlib import Path

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURAÇÃO — ajusta estes valores conforme o meta do jogo
# ─────────────────────────────────────────────────────────────────────────────

# Thresholds de score → tier (do maior para o menor)
SCORE_TIERS = [
    (280, "神"),
    (200, "Z+"),
    (140, "Z"),
    (90,  "S"),
    (55,  "A"),
    (25,  "B"),
    (0,   "C"),
]

# Bónus multiplicativo por keywords especiais nos efeitos
# (aplicado ao valor % extraído quando a keyword aparece na mesma frase)
KEYWORD_MULTIPLIERS = {
    "inflicted damage":        2.0,
    "damage guard":            1.8,
    "damage inflicted":        2.0,
    "base health":             1.5,
    "health restoration":      1.3,
    "base strike attack":      1.4,
    "base blast attack":       1.4,
    "base strike defense":     1.3,
    "base blast defense":      1.3,
    "base strike & blast attack": 1.6,
    "base strike & blast defense": 1.5,
    "base ki recovery":        1.2,
    "special move damage":     1.4,
    "ultimate damage":         1.4,
    "awakened arts damage":    1.4,
    "strike attack":           1.6,
    "blast attack":            1.6,
    "strike defense":          1.5,
    "blast defense":           1.5,
    "strike & blast attack":   1.7,
    "strike & blast defense":  1.6,
    "ki recovery":             1.7,
}

# Penalização para equipamentos com apenas efeitos de raid/drop (event puro)
EVENT_KEYWORDS = ["raid medal", "z power", "drops", "anniversary"]

# Penalizações por tags limitantes em conditions_data.
# O score é multiplicado pelo fator (< 1.0 = penalização).
# As penalizações acumulam-se (multiplicam entre si).
# Cada entrada: (substring_a_detetar_na_tag, fator_de_penalizacao, descricao)
CONDITION_PENALTIES = [
    # Tags de raridades antigas com pouco/nenhum suporte atual
    ("HERO",            0.50, "Raridade HERO — muito antiga, sem suporte"),
    ("EXTREME",         0.65, "Raridade EXTREME — antiga, uso reduzido"),
    # Personagens de eventos (normalmente fracas no meta longo prazo)
    ("Event Exclusive", 0.75, "Personagem de evento exclusivo"),
    # Tags de personagens concretas (DBL...) — já são _specific, mas o score
    # é penalizado para refletir que só funciona numa personagem
    ("DBL",             0.85, "Tag específica de personagem (DBL)"),
]

# Percentis para ranking relativo dos *_specific (comparação interna ao grupo)
# Cada entrada: (percentil_mínimo, tier) — do mais alto para o mais baixo
# Ex: top 10% → 神, 10-25% → Z+, 25-50% → Z, 50-70% → S, 70-85% → A, 85-95% → B, 95-100% → C
SPECIFIC_TIER_PERCENTILES = [
    (90, "神"),
    (75, "Z+"),
    (50, "Z"),
    (30, "S"),
    (15, "A"),
    (5,  "B"),
    (0,  "C"),
]

# Tipos que usam ranking relativo (sufixo _specific de qualquer rarity)
SPECIFIC_SUFFIXES = ("_specific",)

# Tamanho mínimo do grupo para aplicar ranking relativo.
# Grupos mais pequenos usam os thresholds absolutos (SCORE_TIERS) para evitar
# que um equipamento medíocre fique 神 só por ser o único no grupo.
MIN_GROUP_SIZE_FOR_RELATIVE = 10

# ─────────────────────────────────────────────────────────────────────────────
# FUNÇÕES DE CLASSIFICAÇÃO DE TIPO
# ─────────────────────────────────────────────────────────────────────────────

def has_dbl_tag(conditions_data: list) -> bool:
    """Verifica se algum grupo em conditions_data contém uma tag 'DBL...'."""
    for group in conditions_data:
        for tag in group:
            if isinstance(tag, str) and tag.upper().startswith("DBL"):
                return True
    return False


def has_any_condition(conditions_data: list) -> bool:
    """Verifica se conditions_data não está vazio."""
    return bool(conditions_data)


def classify_type(equipment: dict) -> str:
    """
    Determina o tipo do equipamento com base na rarity e conditions_data.

    Tipos possíveis:
      platinum
      awakenedunique_specific / awakenedunique_team / awakenedunique_independent
      unique_specific          / unique_team          / unique_independent
      awakenedgold_specific   / awakenedgold_team   / awakenedgold_independent
      gold_specific            / gold_team            / gold_independent
      awakenedsilver_specific / awakenedsilver_team / awakenedsilver_independent
      silver_specific          / silver_team          / silver_independent
      awakenedbronze / bronze
      event
      iron
    """
    rarity = equipment.get("rarity", "").replace("rarity ", "").lower()
    conditions = equipment.get("conditions_data", [])

    if rarity == "platinum":
        return "platinum"

    if rarity in ("event",):
        return "event"

    if rarity in ("iron",):
        return "iron"

    # Bronze e awakenedbronze — sem sub-tipos por agora
    if rarity in ("bronze", "awakenedbronze"):
        return rarity

    # Silver / awakenedsilver / gold / awakenedgold / unique / awakenedunique
    if has_dbl_tag(conditions):
        suffix = "specific"
    elif has_any_condition(conditions):
        suffix = "team"
    else:
        suffix = "independent"

    return f"{rarity}_{suffix}"


# ─────────────────────────────────────────────────────────────────────────────
# FUNÇÕES DE CÁLCULO DE SCORE
# ─────────────────────────────────────────────────────────────────────────────

# Regex para capturar valores percentuais: ex "15.00 ~ 40.00 %" ou "30%"
_PERCENT_RE = re.compile(
    r"(\d+(?:\.\d+)?)"          # número inicial (min ou único)
    r"(?:\s*~\s*(\d+(?:\.\d+)?))?",  # opcional: ~ valor_max
)

def extract_percents_from_text(text: str) -> float:
    """
    Extrai todos os valores % de uma string de efeito e retorna a soma.
    Usa o valor superior do range (ex: '15 ~ 40 %' → 40).
    Aplica bónus se keywords relevantes aparecem no texto.
    """
    text_lower = text.lower()

    # Detectar keyword multiplier para este bloco de texto
    multiplier = 1.0
    for kw, mult in KEYWORD_MULTIPLIERS.items():
        if kw in text_lower:
            multiplier = max(multiplier, mult)

    # Encontrar segmentos "NUMBER [~ NUMBER] %"
    # Dividimos o texto por '%' e processamos cada segmento antes do '%'
    score = 0.0
    # Encontra todos os "X %" ou "X ~ Y %" no texto
    pattern = re.compile(
        r"(\d+(?:\.\d+)?)"
        r"(?:\s*~\s*(\d+(?:\.\d+)?))?"
        r"\s*%"
    )
    for m in pattern.finditer(text):
        val_min = float(m.group(1))
        val_max = float(m.group(2)) if m.group(2) else val_min
        score += val_max

    return score * multiplier


def is_event_only(equipment: dict) -> bool:
    """Verifica se todos os efeitos são apenas drops de raid/medals (event puro)."""
    all_effects = " ".join(
        slot.get("effect", "") for slot in equipment.get("slots", [])
    ).lower()
    return any(kw in all_effects for kw in EVENT_KEYWORDS)


def get_condition_penalty(conditions_data: list) -> tuple[float, list[str]]:
    """
    Calcula o multiplicador de penalização com base nas tags em conditions_data.

    Retorna:
        (fator_total, lista_de_razões)

    As penalizações acumulam-se por multiplicação. Por exemplo, uma tag
    EXTREME + DBL resulta em 0.65 × 0.85 = ~0.55.
    """
    # Flatten de todas as tags numa lista de strings
    all_tags = [
        tag
        for group in conditions_data
        for tag in group
        if isinstance(tag, str)
    ]
    all_tags_str = " ".join(all_tags)

    factor = 1.0
    reasons = []
    applied = set()  # evitar aplicar a mesma penalização duas vezes

    for substring, penalty, desc in CONDITION_PENALTIES:
        if substring in all_tags_str and substring not in applied:
            factor *= penalty
            reasons.append(desc)
            applied.add(substring)

    return round(factor, 4), reasons


def calculate_score(equipment: dict) -> float:
    """Calcula o score total de um equipamento com base nos seus slots."""
    equip_type = equipment.get("_type", "")

    # Casos especiais
    if equip_type == "platinum":
        return 9999.0
    if equip_type in ("event", "iron"):
        return 0.0

    total = 0.0
    for slot in equipment.get("slots", []):
        effect = slot.get("effect", "")
        # Ignorar slots de drop/raid
        if any(kw in effect.lower() for kw in EVENT_KEYWORDS):
            continue
        total += extract_percents_from_text(effect)

    # Aplicar penalizações por tags limitantes
    penalty_factor, penalty_reasons = get_condition_penalty(
        equipment.get("conditions_data", [])
    )
    total *= penalty_factor

    return round(total, 2)


# ─────────────────────────────────────────────────────────────────────────────
# MAPEAMENTO SCORE → TIER
# ─────────────────────────────────────────────────────────────────────────────

def score_to_tier(score: float, equip_type: str) -> str:
    """Converte score numérico em tier com thresholds absolutos (para equipamentos genéricos)."""
    if equip_type == "platinum":
        return "神"
    if equip_type in ("event", "iron"):
        return "C"

    for threshold, tier in SCORE_TIERS:
        if score >= threshold:
            return tier
    return "C"


def rank_specific_groups(results: list[dict]) -> None:
    """
    Aplica ranking RELATIVO por percentil a todos os grupos *_specific.

    Em vez de comparar os Unique/Gold/Silver Específicos contra thresholds
    globais (o que os inflacionava), compara-os apenas entre si dentro do
    mesmo grupo. O melhor do grupo → 神, o pior → C.

    Modifica `results` in-place.
    """
    # Agrupar índices por tipo _specific
    groups: dict[str, list[int]] = {}
    for i, entry in enumerate(results):
        if any(entry["type"].endswith(s) for s in SPECIFIC_SUFFIXES):
            groups.setdefault(entry["type"], []).append(i)

    for group_type, indices in groups.items():
        n = len(indices)

        # Grupo pequeno demais → fallback para thresholds absolutos
        if n < MIN_GROUP_SIZE_FOR_RELATIVE:
            for idx in indices:
                results[idx]["tier"] = score_to_tier(results[idx]["score"], group_type)
                results[idx]["tier_method"] = f"absolute (group too small: {n})"
            continue

        # Ordenar por score dentro do grupo
        indices_sorted = sorted(indices, key=lambda i: results[i]["score"])

        for rank, idx in enumerate(indices_sorted):
            # percentil: 0 = pior, 100 = melhor
            percentile = (rank / max(n - 1, 1)) * 100

            tier = "C"
            for pct_threshold, tier_label in SPECIFIC_TIER_PERCENTILES:
                if percentile >= pct_threshold:
                    tier = tier_label
                    break

            results[idx]["tier"] = tier
            results[idx]["tier_method"] = "relative"  # marcar que foi ranking relativo

    # Marcar os restantes como absoluto
    for entry in results:
        if "tier_method" not in entry:
            entry["tier_method"] = "absolute"


# ─────────────────────────────────────────────────────────────────────────────
# PIPELINE PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────

def analyze(input_path: str, output_path: str) -> None:
    print(f"📂 A ler: {input_path}")
    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    results = []
    type_counts: dict[str, int] = {}

    # Passo 1: calcular scores e tiers iniciais (absolutos)
    for equip in data:
        equip_type = classify_type(equip)
        equip["_type"] = equip_type

        score = calculate_score(equip)
        tier = score_to_tier(score, equip_type)
        type_counts[equip_type] = type_counts.get(equip_type, 0) + 1

        _, penalty_reasons = get_condition_penalty(equip.get("conditions_data", []))

        results.append({
            "name":     equip.get("name", ""),
            "type":     equip_type,
            "tier":     tier,
            "score":    score,
            "penalties": penalty_reasons,
        })

    # Passo 2: sobrepor tiers dos *_specific com ranking relativo
    print("🔄 Aplicando ranking relativo aos grupos *_specific...")
    rank_specific_groups(results)

    # Ordenar por score descendente
    results.sort(key=lambda x: x["score"], reverse=True)

    # Contagem final de tiers (depois do ranking relativo)
    tier_counts: dict[str, int] = {}
    for entry in results:
        t = entry["tier"]
        tier_counts[t] = tier_counts.get(t, 0) + 1

    print(f"✅ Total de equipamentos analisados: {len(results)}")
    print("\n📊 Distribuição por tier:")
    for tier_label in ["神", "Z+", "Z", "S", "A", "B", "C"]:
        count = tier_counts.get(tier_label, 0)
        bar = "█" * min(count, 50)
        print(f"  {tier_label:>3}  {bar} ({count})")

    print("\n🏷️  Distribuição por tipo:")
    for t, c in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"  {t:<35} {c}")

    # Mostrar distribuição interna dos _specific
    specific_types = sorted({e["type"] for e in results if e["type"].endswith("_specific")})
    if specific_types:
        print("\n🎯 Distribuição relativa dos grupos *_specific:")
        for stype in specific_types:
            entries = sorted([e for e in results if e["type"] == stype],
                             key=lambda x: -x["score"])
            tiers_str = " | ".join(f"{e['tier']}:{e['name'][:25]}" for e in entries[:5])
            print(f"  [{stype}] ({len(entries)} equips) → {tiers_str}...")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n💾 Output guardado em: {output_path}")


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    base_dir = Path(__file__).parent
    input_file  = base_dir / "dbl_equipment_full.json"
    output_file = base_dir / "equipment_tiers.json"

    analyze(str(input_file), str(output_file))
