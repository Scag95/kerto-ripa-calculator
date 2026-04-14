"""
Flask API for Kerto-Ripa Box Slab Design Calculator.
REST API for structural analysis and design verification.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np

from material import Material, MaterialType, ServiceClass
from cross_section import CrossSection, BoxSlabGeometry
from beam_element import Support, PointLoad, DistributedLoad, StructuralAnalysis
from load_case import LoadCase, LoadType, LoadDirection, LoadCombinationGenerator
from design_checks import DesignChecker, DesignReport

app = Flask(__name__)
CORS(app)


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'message': 'Kerto-Ripa API running'})


@app.route('/api/analyze', methods=['POST'])
def analyze_structure():
    """
    Perform structural analysis and design verification.
    
    Accepts two formats:
    1. Simple format (legacy):
       {"geometry": {...}, "loads": [...], "supports": [...], "span": 5500}
    
    2. Frontend format:
       {"cross_section": {...}, "span": {...}, "supports": [...], "action_catalog": {...}}
    """
    try:
        data = request.json

        # Detect format and normalize
        if 'action_catalog' in data:
            # Frontend format
            cross_section_data = data.get('cross_section', {})
            span_data = data.get('span', {})
            action_catalog = data.get('action_catalog', {})
            design_basis = data.get('design_basis', {})

            # Build geometry
            geometry = BoxSlabGeometry(
                h_f1=cross_section_data.get('h_f1_mm', 25),
                h_w=cross_section_data.get('h_w_mm', 225),
                h_f2=cross_section_data.get('h_f2_mm', 25),
                b_w=cross_section_data.get('b_w_mm', 45),
                b_ef_f1=cross_section_data.get('element_width_mm', 585),
                b_ef_f2=cross_section_data.get('element_width_mm', 585),
                rib_spacing=cross_section_data.get('rib_spacing', 585)
            )

            # Build loads from action_catalog
            load_cases = []
            for action in action_catalog.get('actions', []):
                pattern = action.get('pattern', {})
                action_type = pattern.get('action_type', 'permanent')
                value = pattern.get('value_kN_per_m2', 0)

                # Convert action_type to LoadType
                if action_type == 'permanent':
                    load_type = LoadType.PERMANENT
                elif action_type == 'imposed':
                    load_type = LoadType.VARIABLE_OFFICE
                elif action_type == 'snow':
                    load_type = LoadType.VARIABLE_SNOW
                elif action_type == 'wind':
                    load_type = LoadType.VARIABLE_WIND
                else:
                    load_type = LoadType.PERMANENT

                load_cases.append(LoadCase(
                    name=action.get('id', 'unnamed'),
                    load_type=load_type,
                    value=value,
                    direction=LoadDirection.DOWN
                ))

            span = span_data.get('L_ef_mm', 5500)
            supports_data = data.get('supports', [])
            service_class_str = design_basis.get('service_class', 'SC1')
            service_class = ServiceClass.SC1 if service_class_str == 'SC1' else ServiceClass.SC2
            load_duration = design_basis.get('load_duration_class', 'medium')

        else:
            # Legacy format
            geo_data = data.get('geometry', {})
            geometry = BoxSlabGeometry(
                h_f1=geo_data.get('h_f1', 25),
                h_w=geo_data.get('h_w', 225),
                h_f2=geo_data.get('h_f2', 25),
                b_w=geo_data.get('b_w', 45),
                b_ef_f1=geo_data.get('b_ef_f1', 585),
                b_ef_f2=geo_data.get('b_ef_f2', 585),
                rib_spacing=geo_data.get('rib_spacing', 585)
            )

            load_cases = []
            for load in data.get('loads', []):
                load_type = LoadType[load.get('type', 'PERMANENT')]
                direction = LoadDirection[load.get('direction', 'DOWN')]
                load_cases.append(LoadCase(
                    name=load.get('name', 'unnamed'),
                    load_type=load_type,
                    value=load.get('value', 0),
                    direction=direction
                ))

            span = data.get('span', 5500)
            supports_data = data.get('supports', [])
            service_class_str = data.get('service_class', 'SC1')
            service_class = ServiceClass.SC1 if service_class_str == 'SC1' else ServiceClass.SC2
            load_duration = data.get('load_duration', 'medium')

        # Parse supports
        supports = []
        for sup in supports_data:
            sup_type = sup.get('support_type', 'pinned')
            if sup_type == 'fixed':
                sup_type = 'fixed'
            elif sup_type == 'roller':
                sup_type = 'roller'
            else:
                sup_type = 'pin'
            supports.append(Support(
                position=float(sup.get('position_m', 0)) * 1000,  # Convert m to mm
                type=sup_type
            ))

        # Generate load combinations
        generator = LoadCombinationGenerator(load_cases)
        uls_combinations = generator.generate_uls_combinations()
        sls_combinations = generator.generate_sls_combinations()

        # Calculate EI
        cross_section = CrossSection(geometry)
        mat_flange = Material(MaterialType.KERTO_Q, service_class)
        mat_web = Material(MaterialType.KERTO_S, service_class)

        E1 = mat_flange.get_E_mean()
        E2 = mat_web.get_E_mean()
        E3 = mat_flange.get_E_mean()

        a2 = cross_section.calculate_neutral_axis(E1, E2, E3)
        a1, _, a3 = cross_section.calculate_centroid_distances(a2)
        EI_ef = cross_section.calculate_effective_bending_stiffness(
            E1, E2, E3, a1, a2, a3
        )

        # Prepare loads for analysis (use total distributed load)
        total_load = sum(lc.value for lc in load_cases if lc.direction == LoadDirection.DOWN)
        
        dist_loads = [
            DistributedLoad(
                start=0,
                end=span,
                value=total_load,
                is_favorable=False
            )
        ]

        # Analyze for each ULS combination
        results_by_combination = {}

        for combo in uls_combinations:
            # Calculate load factor for this combination
            load_factor = combo.calculate_combination_value() / total_load if total_load > 0 else 1.0
            
            analysis = StructuralAnalysis(
                length=span,
                EI=EI_ef,
                supports=supports,
                distributed_loads=[
                    DistributedLoad(
                        start=0,
                        end=span,
                        value=total_load * load_factor,
                        is_favorable=False
                    )
                ]
            )

            beam_results = analysis.analyze()

            # Get max values
            M_max = max(abs(m) for m in beam_results.moments)
            V_max = max(abs(v) for v in beam_results.shear_forces)
            delta_max = max(abs(d) for d in beam_results.deflections)

            # Design check
            checker = DesignChecker(
                cross_section=cross_section,
                material_flange=mat_flange,
                material_web=mat_web,
                beam_results=beam_results,
                L_ef=span,
                service_class=service_class,
                load_duration=load_duration
            )

            verification = checker.verify(M_max, V_max, delta_max)
            report = DesignReport(verification)

            results_by_combination[combo.name] = {
                'M_max': round(M_max, 2),
                'V_max': round(V_max, 2),
                'delta_max': round(delta_max, 2),
                'reactions': {str(k): round(float(v), 2) for k, v in beam_results.reactions.items()},
                'design': report.to_dict()
            }

        # SLS analysis
        sls_results = {}
        for combo in sls_combinations:
            load_factor = combo.calculate_combination_value() / total_load if total_load > 0 else 1.0
            
            analysis = StructuralAnalysis(
                length=span,
                EI=EI_ef,
                supports=supports,
                distributed_loads=[
                    DistributedLoad(
                        start=0,
                        end=span,
                        value=total_load * load_factor,
                        is_favorable=False
                    )
                ]
            )
            beam_results = analysis.analyze()
            delta_max = max(abs(d) for d in beam_results.deflections)

            sls_results[combo.name] = {
                'delta_max': round(delta_max, 2)
            }

        return jsonify({
            'success': True,
            'EI_ef': float(EI_ef),
            'section_properties': {
                'a1': round(float(a1), 2),
                'a2': round(float(a2), 2),
                'a3': round(float(a3), 2)
            },
            'uls_combinations': results_by_combination,
            'sls_combinations': sls_results,
            'moment_diagram': {
                'x': [round(float(x), 0) for x in beam_results.positions],
                'M': [round(float(m), 3) for m in beam_results.moments]
            },
            'shear_diagram': {
                'x': [round(float(x), 0) for x in beam_results.positions],
                'V': [round(float(v), 3) for v in beam_results.shear_forces]
            },
            'deflection_diagram': {
                'x': [round(float(x), 0) for x in beam_results.positions],
                'delta': [round(float(d), 4) for d in beam_results.deflections]
            }
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
