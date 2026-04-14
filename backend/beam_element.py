"""
Structural analysis module for beam elements.
Matrix method implementation for continuous beams with multiple supports.
"""

from dataclasses import dataclass
from typing import List, Tuple, Dict
import numpy as np


@dataclass
class Support:
    """Represents a support in the beam."""
    position: float      # Position from left end (mm)
    type: str            # 'pin', 'roller', 'fixed' (fixed not used in 2D)


@dataclass
class PointLoad:
    """Point load on the beam."""
    position: float      # Position from left end (mm)
    value: float         # Load value (kN)
    is_favorable: bool = False


@dataclass
class DistributedLoad:
    """Distributed load on the beam."""
    start: float         # Start position (mm)
    end: float           # End position (mm)
    value: float         # Load value (kN/m, positive = downward)
    is_favorable: bool = False


@dataclass
class BeamResults:
    """Results from beam analysis."""
    positions: List[float]
    moments: List[float]
    shear_forces: List[float]
    deflections: List[float]
    reactions: Dict[int, float]  # support_index -> reaction (kN)


class BeamElement:
    """
    Single beam element for matrix analysis.
    """

    def __init__(self, start: float, end: float, EI: float, EA: float = None):
        """
        Args:
            start, end: Element endpoints (mm)
            EI: Bending stiffness (N·mm²)
            EA: Axial stiffness (N) - optional
        """
        self.start = start
        self.end = end
        self.L = end - start
        self.EI = EI
        self.EA = EA

    def get_stiffness_matrix(self) -> np.ndarray:
        """
        Returns the 4x4 stiffness matrix in local coordinates.
        """
        k = self.EI / self.L**3

        # Local stiffness matrix for beam element
        # DOFs: [v1, θ1, v2, θ2]
        m = np.array([
            [12,   6*self.L,   -12,  6*self.L],
            [6*self.L, 4*self.L**2, -6*self.L, 2*self.L**2],
            [-12,  -6*self.L,   12, -6*self.L],
            [6*self.L, 2*self.L**2, -6*self.L, 4*self.L**2]
        ]) * k

        return m

    def get_fixed_end_forces(self, load: DistributedLoad) -> np.ndarray:
        """
        Fixed end forces for uniform distributed load.
        Returns [F1, M1, F2, M2] in local coordinates.
        """
        w = load.value * 1000  # Convert kN/m to N/mm

        # Account for load position within element
        a = max(load.start, self.start)
        b = min(load.end, self.end)
        L_load = b - a

        if L_load <= 0:
            return np.array([0, 0, 0, 0])

        # Uniform load over entire element (simplified)
        F = w * self.L / 2
        M = w * self.L**2 / 12

        return np.array([-F, -M, -F, M])


class StructuralAnalysis:
    """
    Matrix analysis for continuous beams with multiple supports.
    Uses direct stiffness method.
    """

    def __init__(self, length: float, EI: float, supports: List[Support],
                 point_loads: List[PointLoad] = None,
                 distributed_loads: List[DistributedLoad] = None):
        """
        Args:
            length: Total beam length (mm)
            EI: Bending stiffness (N·mm²)
            supports: List of support positions
            point_loads: List of point loads
            distributed_loads: List of distributed loads
        """
        self.length = length
        self.EI = EI
        self.supports = supports
        self.point_loads = point_loads or []
        self.distributed_loads = distributed_loads or []

        # Discretization
        self.n_points = 200
        self.positions = np.linspace(0, length, self.n_points)

    def analyze(self) -> BeamResults:
        """
        Perform matrix analysis of the beam.

        Returns:
            BeamResults with M, V, δ along the beam
        """
        # Build global stiffness matrix
        n_dofs = 2 * (self.n_points)  # v and θ at each node
        K = np.zeros((n_dofs, n_dofs))
        F = np.zeros(n_dofs)

        # Create elements
        elements = []
        for i in range(self.n_points - 1):
            elem = BeamElement(
                start=self.positions[i],
                end=self.positions[i+1],
                EI=self.EI
            )
            elements.append(elem)

        # Assemble stiffness matrix
        for i, elem in enumerate(elements):
            dofs = [2*i, 2*i+1, 2*(i+1), 2*(i+1)+1]
            Ke = elem.get_stiffness_matrix()
            for a in range(4):
                for b in range(4):
                    K[dofs[a], dofs[b]] += Ke[a, b]

        # Apply loads
        for pload in self.point_loads:
            # Find nearest node
            idx = int(pload.position / self.length * (self.n_points - 1))
            dof = 2 * idx  # vertical displacement
            F[dof] += pload.value * 1000  # kN to N

        for dload in self.distributed_loads:
            for i, elem in enumerate(elements):
                fe = elem.get_fixed_end_forces(dload)
                if np.any(fe != 0):
                    dofs = [2*i, 2*i+1, 2*(i+1), 2*(i+1)+1]
                    for a in range(4):
                        F[dofs[a]] += fe[a]

        # Apply boundary conditions (elimination method)
        for i, support in enumerate(self.supports):
            # Find node at support position
            idx = int(support.position / self.length * (self.n_points - 1))

            if support.type == 'pin':
                # Pin: v = 0, θ = 0
                dof_v = 2 * idx
                dof_theta = 2 * idx + 1
            elif support.type == 'roller':
                # Roller: v = 0, free θ
                dof_v = 2 * idx
                dof_theta = None
            elif support.type == 'fixed':
                # Fixed: v = 0, θ = 0
                dof_v = 2 * idx
                dof_theta = 2 * idx + 1
            else:
                continue

            # Elimination method
            for dof in [dof_v, dof_theta]:
                if dof is not None:
                    K[dof, :] = 0
                    K[:, dof] = 0
                    K[dof, dof] = 1
                    F[dof] = 0

        # Solve
        try:
            displacements = np.linalg.solve(K, F)
        except np.linalg.LinAlgError:
            displacements = np.zeros(n_dofs)

        # Extract results
        v = displacements[0::2]  # vertical displacements (mm)
        theta = displacements[1::2]  # rotations (rad)

        # Calculate moments and shear
        moments = []
        shear_forces = []

        for i, elem in enumerate(elements):
            dofs = [2*i, 2*i+1, 2*(i+1), 2*(i+1)+1]
            de = displacements[dofs]

            # Internal forces at element start
            Ke = elem.get_stiffness_matrix()
            fe = Ke @ de

            # Convert to kN, kNm
            V1 = -fe[0] / 1000  # kN
            M1 = -fe[1] / 1e6   # kNm
            V2 = fe[2] / 1000
            M2 = fe[3] / 1e6

            # Add to results
            n_elem_points = self.n_points - 1
            for j in range(n_elem_points):
                if j == i:
                    moments.append(M1)
                    shear_forces.append(V1)

        # Pad to full length
        moments = [m for m in moments for _ in range(2)]
        shear_forces = [v for v in shear_forces for _ in range(2)]
        moments = moments[:self.n_points]
        shear_forces = shear_forces[:self.n_points]

        # Calculate reactions
        reactions = {}
        for i, support in enumerate(self.supports):
            idx = int(support.position / self.length * (self.n_points - 1))
            dof = 2 * idx
            reactions[int(i)] = float(displacements[dof] * 1000 / 1e6)  # kN

        # Deflections (already in mm)
        deflections = v.tolist()

        return BeamResults(
            positions=self.positions.tolist(),
            moments=moments[:self.n_points],
            shear_forces=shear_forces[:self.n_points],
            deflections=deflections[:self.n_points],
            reactions=reactions
        )

    def calculate_deflection_shear(self, GA: float) -> List[float]:
        """
        Calculate shear deformation contribution to deflection.
        Simplified: δ_V = V * L / (2 * GA)
        """
        results = self.analyze()
        shear_deflections = []

        for V in results.shear_forces:
            # Simplified shear deflection
            delta_v = abs(V * 1000 * self.length) / (2 * GA) if GA else 0
            shear_deflections.append(delta_v / 1e6)  # mm

        return shear_deflections
