import { m } from "@/i18n";
import type { MaterialWarning } from "@/lib/tauri";

/** What a material read's warning says to a reader, one line. */
export function warningText(warning: MaterialWarning): string {
  switch (warning.kind) {
    case "noShaderDefs":
      return m.workshop_bin_material_warning_no_shader_defs_label();
    case "noPass":
      return m.workshop_bin_material_warning_no_pass_label();
    case "unresolvedShader":
      return m.workshop_bin_material_warning_unresolved_shader_label({ hash: warning.hash });
    case "secondPass":
      return m.workshop_bin_material_warning_second_pass_label();
    case "undeclaredSampler":
      return m.workshop_bin_material_warning_undeclared_sampler_label({ name: warning.name });
    case "undeclaredParam":
      return m.workshop_bin_material_warning_undeclared_param_label({ name: warning.name });
    case "undeclaredSwitch":
      return m.workshop_bin_material_warning_undeclared_switch_label({ name: warning.name });
    case "stringTexturePath":
      return m.workshop_bin_material_warning_string_texture_path_label({
        name: warning.name,
        path: warning.path,
      });
    case "textureNotFound":
      return m.workshop_bin_material_warning_texture_not_found_label({
        name: warning.name,
        path: warning.path,
      });
    case "noTexturePath":
      return m.workshop_bin_material_warning_no_texture_path_label({ name: warning.name });
  }
}
