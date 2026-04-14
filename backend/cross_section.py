"""
Cross-section geometry for Kerto-Ripa Box Slab elements.
Based on Section A of the design instructions PDF.
"""

from dataclasses import dataclass
from typing import Tuple
import math


@dataclass
class BoxSlabGeometry:
    """
    Geometric parameters for a Kerto-Ripa Box Slab cross-section.

    For Box Slab:
    - Top flange (slab 1): Kerto-Q
    - Web (rib): Kerto-S
    - Bottom flange (slab 3): Kerto-Q
    """
    # Top flange (slab 1)
    b_ef_f1: float = 585.0    # Effective width of top flange (mm)
    h_f1: float = 25.0        # Thickness of top flange (mm)

    # Web (rib)
    b_w: float = 45.0         # Width of web (mm)
    h_w: float = 225.0        # Height of web (mm)

    # Bottom flange (slab 3)
    b_ef_f2: float = 585.0    # Effective width of bottom flange (mm)
    h_f2: float = 25.0        # Thickness of bottom flange (mm)

    # Spacing
    rib_spacing: float = 585.0  # Center-to-center spacing of ribs (mm)


class CrossSection:
    """
    Calculates cross-section properties for Kerto-Ripa Box Slab.

    Based on the theory of thin-flanged beams (EC5).
    """

    def __init__(self, geometry: BoxSlabGeometry):
        self.geom = geometry

    def get_area(self, part: str) -> float:
        """
        Get cross-sectional area of a part.

        Args:
            part: 'f1' (top flange), 'w' (web), 'f2' (bottom flange)

        Returns:
            Area in mm²
        """
        if part == 'f1':
            return self.geom.b_ef_f1 * self.geom.h_f1
        elif part == 'w':
            return self.geom.b_w * self.geom.h_w
        elif part == 'f2':
            return self.geom.b_ef_f2 * self.geom.h_f2
        raise ValueError(f"Unknown part: {part}")

    def get_moment_of_inertia(self, part: str) -> float:
        """
        Get moment of inertia about its own centroidal axis.

        Args:
            part: 'f1', 'w', or 'f2'

        Returns:
            I in mm⁴
        """
        if part == 'f1':
            b, h = self.geom.b_ef_f1, self.geom.h_f1
        elif part == 'w':
            b, h = self.geom.b_w, self.geom.h_w
        elif part == 'f2':
            b, h = self.geom.b_ef_f2, self.geom.h_f2
        else:
            raise ValueError(f"Unknown part: {part}")

        return (b * h**3) / 12

    def calculate_neutral_axis(self, E1: float, E2: float, E3: float) -> float:
        """
        Calculate distance 'a2' from web center to neutral axis.
        Equation (A.8) from PDF.

        Args:
            E1, E2, E3: Modulus of elasticity for flanges and web

        Returns:
            a2 in mm
        """
        A1 = self.get_area('f1')
        A2 = self.get_area('w')
        A3 = self.get_area('f2')
        h1, h2, h3 = self.geom.h_f1, self.geom.h_w, self.geom.h_f2

        numerator = E1 * A1 * (h1 + h2) - E3 * A3 * (h2 + h3)
        denominator = 2 * (E1 * A1 + E2 * A2 + E3 * A3)

        return numerator / denominator

    def calculate_centroid_distances(self, a2: float) -> Tuple[float, float, float]:
        """
        Calculate distances from neutral axis to centroids of each part.
        Equations (A.7), (A.10).

        Args:
            a2: Distance from web center to neutral axis

        Returns:
            (a1, a2, a3) distances
        """
        h1 = self.geom.h_f1
        h2 = self.geom.h_w
        h3 = self.geom.h_f2

        a1 = 0.5 * h1 + 0.5 * h2 - a2
        a3 = 0.5 * h3 + 0.5 * h2 + a2

        return a1, a2, a3

    def calculate_effective_flange_width_uls(self, L_ef: float,
                                              b_f: float,
                                              h_f: float,
                                              is_edge_rib: bool = False) -> float:
        """
        Calculate effective flange width for ULS.
        Equations (A.2a), (A.2b), (A.3a), (A.3b) from PDF.

        Args:
            L_ef: Effective span length (mm)
            b_f: Spacing between adjacent webs (mm)
            h_f: Flange thickness (mm)
            is_edge_rib: True if edge rib

        Returns:
            Effective width in mm
        """
        # From equation (A.3a) for middle ribs
        b1 = 0.05 * L_ef
        b2 = 12 * h_f
        b3 = b_f / 2

        b_ef = min(b1, b2, b3)

        return b_ef

    def calculate_effective_flange_width_sls(self, L_ef: float,
                                              b_f: float,
                                              is_edge_rib: bool = False) -> float:
        """
        Calculate effective flange width for SLS.
        Equation (A.2a), (A.2b) from PDF.

        Args:
            L_ef: Effective span length (mm)
            b_f: Spacing between adjacent webs (mm)
            is_edge_rib: True if edge rib

        Returns:
            Effective width in mm
        """
        # From equation (A.2a) for middle ribs
        b1 = 0.05 * L_ef
        b2 = b_f / 2

        b_ef = min(b1, b2)

        return b_ef

    def calculate_effective_bending_stiffness(self,
                                               E1: float, E2: float, E3: float,
                                               a1: float, a2: float, a3: float) -> float:
        """
        Calculate effective bending stiffness EI_ef.
        Equation (A.5) from PDF for Box Slab.

        EI_ef = E1*I1 + E2*I2 + E3*I3 + E1*A1*a1² + E2*A2*a2² + E3*A3*a3²

        Args:
            E1, E2, E3: Modulus of elasticity
            a1, a2, a3: Distances from neutral axis

        Returns:
            EI_ef in N·mm²
        """
        I1 = self.get_moment_of_inertia('f1')
        I2 = self.get_moment_of_inertia('w')
        I3 = self.get_moment_of_inertia('f2')

        A1 = self.get_area('f1')
        A2 = self.get_area('w')
        A3 = self.get_area('f2')

        EI = (E1 * I1 + E2 * I2 + E3 * I3 +
              E1 * A1 * a1**2 + E2 * A2 * a2**2 + E3 * A3 * a3**2)

        return EI

    def calculate_section_modulus(self, part: str, a: float) -> float:
        """
        Calculate section modulus for a part.

        Args:
            part: 'f1', 'w', or 'f2'
            a: Distance from neutral axis to extreme fiber

        Returns:
            W in mm³
        """
        I = self.get_moment_of_inertia(part)
        h = getattr(self.geom, f"h_{part.replace('f', 'f').replace('w', 'w')}")

        return I / (h / 2 + a)
