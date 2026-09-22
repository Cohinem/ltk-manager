import { m } from "@/i18n";

import { nameHash } from "../../../shared/utils/binHash";
import { fieldHash } from "../../../tree/utils/binRows";
import { GROUP_TITLE, type InspectorGroup } from "./emitterGroups";

const LABELS: ReadonlyMap<string, () => string> = new Map(
  Object.entries({
    rate: m.workshop_bin_vfx_rate_label,
    particleLifetime: m.workshop_bin_vfx_particle_lifetime_label,
    particleLinger: m.workshop_bin_vfx_particle_linger_label,
    birthVelocity: m.workshop_bin_vfx_birth_velocity_label,
    birthAcceleration: m.workshop_bin_vfx_birth_acceleration_label,
    birthDrag: m.workshop_bin_vfx_birth_drag_label,
    birthRotation0: m.workshop_bin_vfx_birth_rotation_label,
    birthRotationalVelocity0: m.workshop_bin_vfx_birth_rotation_speed_label,
    birthScale0: m.workshop_bin_vfx_birth_scale_label,
    birthColor: m.workshop_bin_vfx_birth_color_label,
    translationOverride: m.workshop_bin_vfx_translation_label,
    rotationOverride: m.workshop_bin_vfx_orientation_label,
    isUniformScale: m.workshop_bin_vfx_uniform_scale_label,
    isDirectionOriented: m.workshop_bin_vfx_direction_oriented_label,
    isFollowingTerrain: m.workshop_bin_vfx_follow_terrain_label,
    isGroundLayer: m.workshop_bin_vfx_ground_layer_label,
    blendMode: m.workshop_bin_vfx_blend_mode_label,
    particleColorTexture: m.workshop_bin_vfx_color_texture_label,
    uvMode: m.workshop_bin_vfx_uv_mode_label,
    birthUvScrollRate: m.workshop_bin_vfx_birth_uv_scroll_label,
    timeBeforeFirstEmission: m.workshop_bin_vfx_start_delay_label,
    isSingleParticle: m.workshop_bin_vfx_single_particle_label,
    flexRate: m.workshop_bin_vfx_property_flex_rate_label,
    period: m.workshop_bin_vfx_property_period_label,
    lifetime: m.workshop_bin_vfx_property_lifetime_label,
    flexParticleLifetime: m.workshop_bin_vfx_property_flex_particle_lifetime_label,
    timeActiveDuringPeriod: m.workshop_bin_vfx_property_time_active_during_period_label,
    Linger: m.workshop_bin_vfx_property_linger_label,
    emitterLinger: m.workshop_bin_vfx_property_emitter_linger_label,
    particleLingerType: m.workshop_bin_vfx_property_particle_linger_type_label,
    ChanceToNotExist: m.workshop_bin_vfx_property_chance_to_not_exist_label,
    MaximumRateByVelocity: m.workshop_bin_vfx_property_maximum_rate_by_velocity_label,
    rateByVelocityFunction: m.workshop_bin_vfx_property_rate_by_velocity_function_label,
    ParticlesShareRandomValue: m.workshop_bin_vfx_property_particles_share_random_value_label,
    HasVariableStartTime: m.workshop_bin_vfx_property_has_variable_start_time_label,
    importance: m.workshop_bin_vfx_property_importance_label,
    birthFrameRate: m.workshop_bin_vfx_property_birth_frame_rate_label,
    birthUVOffset: m.workshop_bin_vfx_property_birth_uvoffset_label,
    flexBirthUVOffset: m.workshop_bin_vfx_property_flex_birth_uvoffset_label,
    birthUvRotateRate: m.workshop_bin_vfx_property_birth_uv_rotate_rate_label,
    flexBirthUVScrollRate: m.workshop_bin_vfx_property_flex_birth_uvscroll_rate_label,
    flexScaleBirthScale: m.workshop_bin_vfx_property_flex_scale_birth_scale_label,
    flexBirthVelocity: m.workshop_bin_vfx_property_flex_birth_velocity_label,
    birthOrbitalVelocity: m.workshop_bin_vfx_property_birth_orbital_velocity_label,
    flexBirthRotationalVelocity0: m.workshop_bin_vfx_property_flex_birth_rotational_velocity0_label,
    birthRotationalAcceleration: m.workshop_bin_vfx_property_birth_rotational_acceleration_label,
    velocity: m.workshop_bin_vfx_property_velocity_label,
    acceleration: m.workshop_bin_vfx_property_acceleration_label,
    worldAcceleration: m.workshop_bin_vfx_property_world_acceleration_label,
    drag: m.workshop_bin_vfx_property_drag_label,
    EmitterPosition: m.workshop_bin_vfx_property_emitter_position_label,
    SpawnShape: m.workshop_bin_vfx_property_spawn_shape_label,
    FlexShapeDefinition: m.workshop_bin_vfx_property_flex_shape_definition_label,
    shape: m.workshop_bin_vfx_property_shape_label,
    IsEmitterSpace: m.workshop_bin_vfx_property_is_emitter_space_label,
    useNavmeshMask: m.workshop_bin_vfx_property_use_navmesh_mask_label,
    bindWeight: m.workshop_bin_vfx_property_bind_weight_label,
    directionVelocityScale: m.workshop_bin_vfx_property_direction_velocity_scale_label,
    directionVelocityMinScale: m.workshop_bin_vfx_property_direction_velocity_min_scale_label,
    flexOffset: m.workshop_bin_vfx_property_flex_offset_label,
    offsetLifetimeScaling: m.workshop_bin_vfx_property_offset_lifetime_scaling_label,
    offsetLifeScalingSymmetryMode:
      m.workshop_bin_vfx_property_offset_life_scaling_symmetry_mode_label,
    rotation0: m.workshop_bin_vfx_property_rotation0_label,
    isRotationEnabled: m.workshop_bin_vfx_property_is_rotation_enabled_label,
    hasPostRotateOrientation: m.workshop_bin_vfx_property_has_post_rotate_orientation_label,
    postRotateOrientationAxis: m.workshop_bin_vfx_property_post_rotate_orientation_axis_label,
    isLocalOrientation: m.workshop_bin_vfx_property_is_local_orientation_label,
    particleIsLocalOrientation: m.workshop_bin_vfx_property_particle_is_local_orientation_label,
    emissionMeshName: m.workshop_bin_vfx_property_emission_mesh_name_label,
    emissionMeshScale: m.workshop_bin_vfx_property_emission_mesh_scale_label,
    emissionSurfaceDefinition: m.workshop_bin_vfx_property_emission_surface_definition_label,
    useEmissionMeshNormalForBirth:
      m.workshop_bin_vfx_property_use_emission_mesh_normal_for_birth_label,
    scale0: m.workshop_bin_vfx_property_scale0_label,
    scaleOverride: m.workshop_bin_vfx_property_scale_override_label,
    FlexInstanceScale: m.workshop_bin_vfx_property_flex_instance_scale_label,
    doesLifetimeScale: m.workshop_bin_vfx_property_does_lifetime_scale_label,
    doesParticleLifetimeScale: m.workshop_bin_vfx_property_does_particle_lifetime_scale_label,
    Color: m.workshop_bin_vfx_property_color_label,
    modulationFactor: m.workshop_bin_vfx_property_modulation_factor_label,
    censorModulateValue: m.workshop_bin_vfx_property_censor_modulate_value_label,
    colorblindVisibility: m.workshop_bin_vfx_property_colorblind_visibility_label,
    colorRenderFlags: m.workshop_bin_vfx_property_color_render_flags_label,
    colorLookUpTypeX: m.workshop_bin_vfx_property_color_look_up_type_x_label,
    colorLookUpTypeY: m.workshop_bin_vfx_property_color_look_up_type_y_label,
    colorLookUpOffsets: m.workshop_bin_vfx_property_color_look_up_offsets_label,
    colorLookUpScales: m.workshop_bin_vfx_property_color_look_up_scales_label,
    paletteDefinition: m.workshop_bin_vfx_property_palette_definition_label,
    texture: m.workshop_bin_vfx_property_texture_label,
    textureMult: m.workshop_bin_vfx_property_texture_mult_label,
    falloffTexture: m.workshop_bin_vfx_property_falloff_texture_label,
    isTexturePixelated: m.workshop_bin_vfx_property_is_texture_pixelated_label,
    texAddressModeBase: m.workshop_bin_vfx_property_tex_address_mode_base_label,
    texDiv: m.workshop_bin_vfx_property_tex_div_label,
    TextureFlipU: m.workshop_bin_vfx_property_texture_flip_u_label,
    TextureFlipV: m.workshop_bin_vfx_property_texture_flip_v_label,
    Filtering: m.workshop_bin_vfx_property_filtering_label,
    numFrames: m.workshop_bin_vfx_property_num_frames_label,
    frameRate: m.workshop_bin_vfx_property_frame_rate_label,
    startFrame: m.workshop_bin_vfx_property_start_frame_label,
    isRandomStartFrame: m.workshop_bin_vfx_property_is_random_start_frame_label,
    uvScale: m.workshop_bin_vfx_property_uv_scale_label,
    uvRotation: m.workshop_bin_vfx_property_uv_rotation_label,
    uvScrollClamp: m.workshop_bin_vfx_property_uv_scroll_clamp_label,
    uvTransformCenter: m.workshop_bin_vfx_property_uv_transform_center_label,
    uvParallaxScale: m.workshop_bin_vfx_property_uv_parallax_scale_label,
    particleUVRotateRate: m.workshop_bin_vfx_property_particle_uvrotate_rate_label,
    particleUVScrollRate: m.workshop_bin_vfx_property_particle_uvscroll_rate_label,
    emitterUvScrollRate: m.workshop_bin_vfx_property_emitter_uv_scroll_rate_label,
    primitive: m.workshop_bin_vfx_property_primitive_label,
    pass: m.workshop_bin_vfx_property_pass_label,
    renderPhaseOverride: m.workshop_bin_vfx_property_render_phase_override_label,
    alphaRef: m.workshop_bin_vfx_property_alpha_ref_label,
    WriteAlphaOnly: m.workshop_bin_vfx_property_write_alpha_only_label,
    disableBackfaceCull: m.workshop_bin_vfx_property_disable_backface_cull_label,
    doesCastShadow: m.workshop_bin_vfx_property_does_cast_shadow_label,
    depthBiasFactors: m.workshop_bin_vfx_property_depth_bias_factors_label,
    DepthPushPull: m.workshop_bin_vfx_property_depth_push_pull_label,
    softParticleParams: m.workshop_bin_vfx_property_soft_particle_params_label,
    sliceTechniqueRange: m.workshop_bin_vfx_property_slice_technique_range_label,
    stencilMode: m.workshop_bin_vfx_property_stencil_mode_label,
    stencilRef: m.workshop_bin_vfx_property_stencil_ref_label,
    StencilReferenceId: m.workshop_bin_vfx_property_stencil_reference_id_label,
    miscRenderFlags: m.workshop_bin_vfx_property_misc_render_flags_label,
    meshRenderFlags: m.workshop_bin_vfx_property_mesh_render_flags_label,
    SortEmittersByPos: m.workshop_bin_vfx_property_sort_emitters_by_pos_label,
    LegacySimple: m.workshop_bin_vfx_property_legacy_simple_label,
    Material: m.workshop_bin_vfx_property_material_label,
    CustomMaterial: m.workshop_bin_vfx_property_custom_material_label,
    materialOverrideDefinitions: m.workshop_bin_vfx_property_material_override_definitions_label,
    materialDrivers: m.workshop_bin_vfx_property_material_drivers_label,
    Audio: m.workshop_bin_vfx_property_audio_label,
    alphaErosionDefinition: m.workshop_bin_vfx_property_alpha_erosion_definition_label,
    distortionDefinition: m.workshop_bin_vfx_property_distortion_definition_label,
    reflectionDefinition: m.workshop_bin_vfx_property_reflection_definition_label,
    childParticleSetDefinition: m.workshop_bin_vfx_property_child_particle_set_definition_label,
    fieldCollectionDefinition: m.workshop_bin_vfx_property_field_collection_definition_label,
    disabled: m.workshop_bin_vfx_property_disabled_label,
    emitterName: m.workshop_bin_vfx_property_emitter_name_label,
    constantValue: m.workshop_bin_vfx_property_constant_value_label,
    dynamics: m.workshop_bin_vfx_property_dynamics_label,
    Position: m.workshop_bin_vfx_property_position_label,
    radius: m.workshop_bin_vfx_property_radius_label,
    frequency: m.workshop_bin_vfx_property_frequency_label,
    velocityDelta: m.workshop_bin_vfx_property_velocity_delta_label,
    axisFraction: m.workshop_bin_vfx_property_axis_fraction_label,
    isLocalSpace: m.workshop_bin_vfx_property_is_local_space_label,
    strength: m.workshop_bin_vfx_property_strength_label,
    direction: m.workshop_bin_vfx_property_direction_label,
    mesh: m.workshop_bin_vfx_property_mesh_label,
    size: m.workshop_bin_vfx_property_size_label,
    offset: m.workshop_bin_vfx_property_offset_label,
    rotation: m.workshop_bin_vfx_property_rotation_label,
    scale: m.workshop_bin_vfx_property_scale_label,
    normal: m.workshop_bin_vfx_property_normal_label,
  }).map(([name, label]) => [nameHash(name), label]),
);

/** Creator labels keyed by field identity, independent of the installed name tables. */
export function emitterLabel(hash: string, name?: string): string | undefined {
  const alias = LABELS.get(hash.toLowerCase())?.();
  if (alias !== undefined || name === undefined || /^(0x[\da-f]+|\[\d+\])$/i.test(name)) {
    return alias;
  }

  return name
    .replace(/^m(?=[A-Z])/, "")
    .replace(/([a-z\d])([A-Z])/g, (_match, left: string, right: string) => `${left} ${right}`)
    .replace(/([A-Z])([A-Z][a-z])/g, (_match, left: string, right: string) => `${left} ${right}`)
    .replace(/[_-]+/g, " ")
    .replace(/\b(uv|id)\b/gi, (word) => word.toUpperCase())
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Space-separated terms match the alias, raw name, hash, or group title together. */
export function matchesEmitterField(
  query: string,
  hash: string,
  name: string,
  group: string,
): boolean {
  const text = `${emitterLabel(hash, name) ?? ""} ${name} ${hash} ${group}`.toLocaleLowerCase();

  return query
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .every((term) => text.includes(term));
}

/** Empty sections retain their identity so search does not reset folds or curve subscriptions. */
export function filterEmitterGroups(
  groups: readonly InspectorGroup[],
  query: string,
): readonly InspectorGroup[] {
  if (query.trim() === "") {
    return groups;
  }

  return groups.map((group) => {
    const title = GROUP_TITLE[group.group]();

    return {
      ...group,
      rows: group.rows.filter((row) =>
        matchesEmitterField(query, fieldHash(row.path), row.name, title),
      ),
      defaults: group.defaults.filter((field) =>
        matchesEmitterField(query, field.hash, field.name, title),
      ),
    };
  });
}
