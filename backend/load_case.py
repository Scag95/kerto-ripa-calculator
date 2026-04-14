"""
Load cases and load combinations according to EC EN 1990.
Spanish National Annex implementation.
"""

from enum import Enum
from dataclasses import dataclass
from typing import List, Dict


class LoadType(Enum):
    PERMANENT = "G"           # Permanent (self-weight)
    VARIABLE_OFFICE = "Q"     # Imposed load (office)
    VARIABLE_SNOW = "S"       # Snow
    VARIABLE_WIND = "W"       # Wind


class LoadDirection(Enum):
    DOWN = "down"     # Gravity direction (positive = unfavorable)
    UP = "up"         # Uplift (negative = favorable)


@dataclass
class LoadCase:
    """
    Represents a single load case.

    Attributes:
        name: Identifier for the load
        load_type: Type of load (PERMANENT, VARIABLE_*)
        value: Characteristic value (kN/m for distributed, kN for point)
        direction: Direction of the load
    """
    name: str
    load_type: LoadType
    value: float
    direction: LoadDirection = LoadDirection.DOWN

    def is_favorable(self, dominant_solicitation: str = "M") -> bool:
        """
        Determines if the load is favorable based on its direction.

        For gravity loads (DOWN):
            - Unfavorable for positive bending moment
            - Favorable for negative bending moment (upward deflection)

        For uplift loads (UP):
            - Favorable (reduces sagging moments)
            - Unfavorable for hogging moments
        """
        if self.direction == LoadDirection.UP:
            return True  # Uplift reduces sagging moment
        return False  # Gravity loads are unfavorable for sagging


class LoadCombination:
    """
    Handles load combinations according to EC EN 1990.
    Spanish National Annex implementation.
    """

    # Partial factors for ULS (Spain National Annex)
    gamma_G_sup = 1.35   # Permanent unfavorable
    gamma_G_inf = 1.00   # Permanent favorable
    gamma_Q = 1.50       # Variable

    # ψ factors for Spain
    psi = {
        LoadType.PERMANENT: {'ψ0': 0.0, 'ψ1': 0.0, 'ψ2': 0.0},
        LoadType.VARIABLE_OFFICE: {'ψ0': 0.70, 'ψ1': 0.50, 'ψ2': 0.30},
        LoadType.VARIABLE_SNOW: {'ψ0': 0.70, 'ψ1': 0.50, 'ψ2': 0.20},
        LoadType.VARIABLE_WIND: {'ψ0': 0.60, 'ψ1': 0.20, 'ψ2': 0.00},
    }

    def __init__(self, name: str, load_cases: List[LoadCase],
                 combination_type: str = "ULS",
                 dominant_load: LoadType = None):
        """
        Args:
            name: Combination identifier
            load_cases: List of LoadCase objects
            combination_type: "ULS" or "SLS"
            dominant_load: Load type that dominates (for ψ factors)
        """
        self.name = name
        self.load_cases = load_cases
        self.combination_type = combination_type
        self.dominant_load = dominant_load or self._identify_dominant(load_cases)

    def _identify_dominant(self, load_cases: List[LoadCase]) -> LoadType:
        """Identify the dominant load type from the list."""
        for lc in load_cases:
            if lc.load_type != LoadType.PERMANENT:
                return lc.load_type
        return LoadType.PERMANENT

    def get_gamma(self, load_case: LoadCase) -> float:
        """
        Get partial factor γ for a load case (ULS only).

        Rules (Spain):
        - Permanent: 1.35 if unfavorable, 1.00 if favorable
        - Variable: always 1.50 (unfavorable)
        """
        if load_case.load_type == LoadType.PERMANENT:
            if load_case.is_favorable():
                return self.gamma_G_inf
            return self.gamma_G_sup
        return self.gamma_Q

    def get_psi(self, load_type: LoadType, psi_type: str = 'ψ0') -> float:
        """
        Get ψ factor for a given load type.

        Args:
            psi_type: 'ψ0', 'ψ1', or 'ψ2'
        """
        return self.psi[load_type][psi_type]

    def calculate_combination_value(self) -> float:
        """
        Calculate the combined characteristic value.
        For ULS: applies γ factors
        For SLS: applies ψ factors
        """
        total = 0.0

        for lc in self.load_cases:
            if self.combination_type == "ULS":
                gamma = self.get_gamma(lc)
                total += gamma * lc.value
            else:  # SLS
                if lc == self.dominant_load:
                    total += lc.value  # Full value for dominant
                else:
                    total += self.get_psi(lc.load_type, 'ψ0') * lc.value

        return total

    def get_load_factor(self, load_case: LoadCase) -> float:
        """
        Get the factor to apply to a specific load case in this combination.
        """
        if self.combination_type == "ULS":
            return self.get_gamma(load_case)
        else:
            if load_case == self.dominant_load:
                return 1.0
            return self.get_psi(load_case.load_type, 'ψ0')


class LoadCombinationGenerator:
    """
    Generates all relevant load combinations according to EC EN 1990.
    """

    def __init__(self, load_cases: List[LoadCase]):
        self.load_cases = load_cases

    def generate_uls_combinations(self) -> List[LoadCombination]:
        """
        Generate ULS combinations per EC EN 1990 Table A1.2.

        For each variable load as dominant, create a combination.
        """
        combinations = []
        variable_loads = [lc for lc in self.load_cases
                         if lc.load_type != LoadType.PERMANENT]

        if not variable_loads:
            return []

        # Find permanent loads
        permanent_loads = [lc for lc in self.load_cases
                         if lc.load_type == LoadType.PERMANENT]

        # For each variable as dominant
        for i, dominant in enumerate(variable_loads):
            combo_cases = permanent_loads + variable_loads
            combo_name = f"ULS_{i+1}_{dominant.load_type.value}_dom"

            # Determine unfavorable permanent loads
            for perm in permanent_loads:
                perm._favorable = False  # Assume unfavorable for main combos

            combos = LoadCombination(
                name=combo_name,
                load_cases=combo_cases,
                combination_type="ULS",
                dominant_load=dominant
            )
            combinations.append(combos)

        # Add combination with favorable permanent (for M- effects)
        if permanent_loads:
            for perm in permanent_loads:
                perm._favorable = True

            combo_name = "ULS_favorable_G"
            combos = LoadCombination(
                name=combo_name,
                load_cases=permanent_loads + variable_loads,
                combination_type="ULS"
            )
            combinations.append(combos)

        return combinations

    def generate_sls_combinations(self) -> List[LoadCombination]:
        """
        Generate SLS combinations per EC EN 1990.

        Types:
        - Characteristic (rare): G + Q + ψ0·Qi
        - Frequent: G + ψ1·Q + ψ2·Qi
        - Quasi-permanent: G + ψ2·Q + ψ2·Qi
        """
        combinations = []

        if not self.load_cases:
            return combinations

        # Quasi-permanent (most unfavorable for deflection)
        combo_name = "SLS_quasi_permanent"
        combos = LoadCombination(
            name=combo_name,
            load_cases=self.load_cases,
            combination_type="SLS"
        )
        combinations.append(combos)

        return combinations
