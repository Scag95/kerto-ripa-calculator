# Kerto-Ripa Box Slab Design Calculator

Web calculator for structural design of Kerto-Ripa Box Slab floor systems using LVL (Laminated Veneer Lumber).

## Technical Documentation

### 1. Material Properties

Based on **ETA-07/0029** (European Technical Approval) and **Spanish National Annex to EC5**:

| Property | Kerto-Q (Flanges) | Kerto-S (Webs) |
|---------|-----------------|---------------|
| E_mean (N/mm²) | 10,500 | 13,800 |
| E_0.05 (N/mm²) | 8,800 | 11,600 |
| G_mean (N/mm²) | 600 | 650 |
| f_mk (N/mm²) | 44 | 50 |
| f_t0,k (N/mm²) | 30 | 35 |
| f_c0,k (N/mm²) | 38 | 40 |
| f_v,k (N/mm²) | 4.1 | 4.1 |
| ρ_k (kg/m³) | 480 | 480 |

### 2. Cross-Section Geometry

Kerto-Ripa Box Slab consists of:
- **Top flange (slab 1)**: Kerto-Q, thickness h_f1
- **Web (rib)**: Kerto-S, width b_w, height h_w
- **Bottom flange (slab 3)**: Kerto-Q, thickness h_f2
- **Rib spacing**: Center-to-center distance between ribs

### 3. Calculation Methodology

#### 3.1 Effective Flange Width (b_ef)

Per EC5 and PDF Section A:

**For ULS (eq. A.3a):**
```
b_ef = min(0.05·L, 12·h_f, b_f/2)
```

**For SLS (eq. A.2a):**
```
b_ef = min(0.05·L, b_f/2)
```

Where:
- L = Effective span
- h_f = Flange thickness
- b_f = Rib spacing

#### 3.2 Neutral Axis Position (a₂)

Per equation (A.8):

```
a₂ = [E₁·A₁·(h₁+h₂) - E₃·A₃·(h₂+h₃)] / [2·(E₁·A₁ + E₂·A₂ + E₃·A₃)]
```

Where:
- E₁, E₂, E₃ = Elastic moduli (flange1, web, flange2)
- A₁, A₂, A₃ = Areas of each part
- h₁, h₂, h₃ = Heights of each part

#### 3.3 Effective Bending Stiffness (EI_ef)

Per equation (A.5):

```
EI_ef = E₁·I₁ + E₂·I₂ + E₃·I₃ + E₁·A₁·a₁² + E₂·A₂·a₂² + E₃·A₃·a₃²
```

#### 3.4 Design Moment Resistance (R_M,d)

Per equations (A.11)-(A.19):

```
R_M,c = f_c0,k · (EI_ef / (E₁·a₁))          # Compression in top flange
R_M,t = k·l · f_t0,k · (EI_ef / (E₃·a₃))   # Tension in bottom flange  
R_M,m = k_h · f_m,k · (EI_ef / (E₂·(a₂ + h₂/2)))  # Web bending

R_M,k = min(R_M,c, R_M,t, R_M,m)
R_M,d = (k_mod / γ_M) · R_M,k
```

Where:
- k_l = min(1.1, (3000/L)^0.06) - Length factor
- k_h = min(1.2, (300/h₂)^0.12) - Height factor
- k_mod = Modification factor (see EC5 Table 3.1)
- γ_M = 1.2 (partial factor for LVL)

#### 3.5 Design Shear Resistance (R_V,d)

Per equations (A.22)-(A.24):

```
R_V,top = min(f_v_flat_slab·b_eff, f_v_flat_web·b_w) · (EI_ef / (E₁·A₁·a₁))  # Flange-web joint
R_V,web = f_v_flat_web · ...                                   # Web shear

R_V,k = min(R_V,top, R_V,web)
R_V,d = (k_mod / γ_M) · R_V,k
```

Where:
- f_v_flat_slab = 1.3 N/mm² (flatwise shear)
- f_v_flat_web = 2.3 N/mm² (edgewise shear)
- b_eff = 0.7·b_w + 30 (effective joint width)

### 4. Load Combinations

Per **EC EN 1990** and **Spanish National Annex**:

**ULS - Fundamental:**
```
Σ γ_G·G_k + γ_Q·Q_k + ψ₀·Q_i + ...
```

**SLS - Characteristic:**
```
G_k + Q_k + ψ₀·Q_i + ...
```

**SLS - Quasi-permanent:**
```
G_k + ψ₂·Q_k + ψ₂·Q_i + ...
```

Partial factors (Spain):
- γ_G (unfavorable) = 1.35
- γ_G (favorable) = 1.00
- γ_Q = 1.50
- ψ₀ (office) = 0.70
- ψ₁ (office) = 0.50
- ψ₂ (office) = 0.30

### 5. Deflection Check (SLS)

Per EC5 clause 7.3:

```
δ_inst = q·L⁴ / (EI_ef·8)  # For simply supported
δ_fin = δ_inst · (1 + k_def)
```

Limits:
- Instantaneous: L/300 to L/200
- Final: L/200 to L/150

Where k_def (creep factor):
- SC1: 0.60
- SC2: 0.80

---

## Project Structure

```
kerto-ripa-calculator/
├── backend/
│   ├── app.py              # Flask REST API
│   ├── material.py         # Material properties
│   ├── cross_section.py    # Section geometry
│   ├── load_case.py        # Load combinations EC
│   ├── beam_element.py    # Matrix analysis
│   ├── design_checks.py  # ULS/SLS verifications
│   └── requirements.txt
├── frontend/
│   ├── index.html         # Main UI
│   ├── js/main.js         # Client logic
│   └── css/styles.css    # Styles
└── README.md
```

## Running the Project

### Backend
```bash
cd backend
pip install -r requirements.txt
python app.py
```

The API runs on `http://localhost:5000`

### Frontend
Open `frontend/index.html` in a web browser.

## API Endpoints

### GET /api/health
Health check.

### POST /api/analyze
Perform structural analysis and design verification.

**Request body:**
```json
{
  "cross_section": {
    "element_width_mm": 585,
    "n_ribs": 2,
    "h_w_mm": 225,
    "b_w_mm": 45,
    "h_f1_mm": 25,
    "h_f2_mm": 25,
    "rib_spacing": 585
  },
  "span": {
    "L_ef_mm": 5500,
    "L_support_mm": 100
  },
  "supports": [
    {"support_type": "pinned", "position_m": 0},
    {"support_type": "roller", "position_m": 5.5}
  ],
  "action_catalog": {
    "actions": [
      {
        "id": "G1",
        "pattern": {
          "action_type": "permanent",
          "name": "Peso propio",
          "distribution": "uniform",
          "value_kN_per_m2": 1.5
        }
      }
    ]
  },
  "design_basis": {
    "service_class": "SC1",
    "load_duration_class": "medium"
  }
}
```

**Response:**
```json
{
  "EI_ef": 1234567890,
  "section_properties": {
    "a1": 12.5,
    "a2": -3.2,
    "a3": 8.7
  },
  "moment_diagram": {"x": [...], "M": [...]},
  "shear_diagram": {"x": [...], "V": [...]},
  "deflection_diagram": {"x": [...], "delta": [...]},
  "uls_combinations": {...},
  "sls_combinations": {...}
}
```

---

## References

- **ETA-07/0029**: European Technical Approval for Kerto-Ripa
- **EN 1995-1-1**: Eurocode 5 - Design of timber structures
- **EN 1990**: Eurocode - Basis of structural design
- **Spanish National Annex**: Anejo Nacional de España al EC5