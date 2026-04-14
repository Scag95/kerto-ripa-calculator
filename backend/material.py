"""
Material properties for Kerto-Ripa Box Slab elements.
Based on ETA-07/0029 and Spanish National Annex to EC5 (EN 1995-1-1)
"""

from enum import Enum
from dataclasses import dataclass


class MaterialType(Enum):
    KERTO_Q = "Kerto-Q"      # Flange material
    KERTO_S = "Kerto-S"      # Web material


class ServiceClass(Enum):
    SC1 = 1  # Service class 1 (dry conditions, humidity < 65%)
    SC2 = 2  # Service class 2 (humidity < 85%)


@dataclass
class MaterialProperties:
    """Mechanical properties for Kerto LVL materials."""
    E_mean: float       # Mean modulus of elasticity (N/mm²)
    E_0_05: float       # 5th percentile modulus (N/mm²)
    G_mean: float       # Mean shear modulus (N/mm²)
    f_m_k: float        # Bending strength (N/mm²)
    f_t_0_k: float      # Tensile strength parallel to grain (N/mm²)
    f_c_0_k: float      # Compressive strength parallel to grain (N/mm²)
    f_v_k: float        # Shear strength (N/mm²)
    f_c_90_k: float     # Compressive strength perpendicular to grain (N/mm²)
    rho_k: float        # Characteristic density (kg/m³)


# Kerto-Q properties (ETA-07/0029, Table 1-2)
KERTO_Q = MaterialProperties(
    E_mean=10500,       # N/mm²
    E_0_05=8800,        # N/mm²
    G_mean=600,         # N/mm²
    f_m_k=44,           # N/mm² (bending - edgewise)
    f_t_0_k=30,         # N/mm²
    f_c_0_k=38,         # N/mm²
    f_v_k=4.1,         # N/mm² (edgewise shear)
    f_c_90_k=6.0,      # N/mm²
    rho_k=480           # kg/m³
)

# Kerto-S properties (ETA-07/0029, Table 1-2)
KERTO_S = MaterialProperties(
    E_mean=13800,       # N/mm²
    E_0_05=11600,       # N/mm²
    G_mean=650,         # N/mm²
    f_m_k=50,           # N/mm²
    f_t_0_k=35,         # N/mm²
    f_c_0_k=40,         # N/mm²
    f_v_k=4.1,         # N/mm²
    f_c_90_k=6.0,      # N/mm²
    rho_k=480           # kg/m³
)

# Flatwise shear strength for slab-web joint (from PDF)
f_v_0_flat_slab_k = 1.3    # N/mm² (Kerto-S flatwise)
f_v_0_flat_web_k = 2.3     # N/mm² (Kerto-S flatwise, edge)


class Material:
    """Material class for Kerto-Ripa elements."""

    def __init__(self, material_type: MaterialType, service_class: ServiceClass):
        self.type = material_type
        self.service_class = service_class
        self._set_properties()

    def _set_properties(self):
        if self.type == MaterialType.KERTO_Q:
            self.props = KERTO_Q
        else:
            self.props = KERTO_S

    def get_E_mean(self) -> float:
        return self.props.E_mean

    def get_E_0_05(self) -> float:
        return self.props.E_0_05

    def get_G_mean(self) -> float:
        return self.props.G_mean

    def get_f_m_k(self) -> float:
        return self.props.f_m_k

    def get_f_t_0_k(self) -> float:
        return self.props.f_t_0_k

    def get_f_c_0_k(self) -> float:
        return self.props.f_c_0_k

    def get_f_v_k(self) -> float:
        return self.props.f_v_k

    def get_f_c_90_k(self) -> float:
        return self.props.f_c_90_k

    def get_rho_k(self) -> float:
        return self.props.rho_k

    def get_k_mod(self, load_duration_class: str = "medium") -> float:
        """
        Modification factor k_mod according to EC5 Table 3.1.
        For Spain (National Annex), values are aligned with EC5.

        Load duration classes:
        - permanent:   > 10 years (self-weight)
        - long:        6 months - 10 years (storage)
        - medium:       1 week - 6 months (imposed floor loads)
        - short:        < 1 week (snow, wind)
        - instantaneous: (wind)
        """
        k_mod_table = {
            ServiceClass.SC1: {
                "permanent": 0.60,
                "long": 0.70,
                "medium": 0.80,
                "short": 0.90,
                "instantaneous": 1.10
            },
            ServiceClass.SC2: {
                "permanent": 0.50,
                "long": 0.55,
                "medium": 0.65,
                "short": 0.70,
                "instantaneous": 0.90
            }
        }
        return k_mod_table[self.service_class][load_duration_class]

    def get_k_def(self) -> float:
        """
        Deformation factor k_def for creep calculation.
        Spanish National Annex to EC5 Table 3.2.
        """
        k_def_table = {
            ServiceClass.SC1: 0.60,
            ServiceClass.SC2: 0.80
        }
        return k_def_table[self.service_class]

    def get_gamma_M(self) -> float:
        """
        Partial factor for material properties.
        Spanish National Annex: γ_M = 1.2 for LVL.
        """
        return 1.2
