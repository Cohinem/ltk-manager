//! The edits and the sources a frontend sends the workshop, as one wire type each. ADR-0059.

use indexmap::IndexMap;
use serde::Deserialize;

use super::{
    CreateProjectArgs, ImportFantomeArgs, ImportGitRepoArgs, ProjectMetadata, Workshop,
    WorkshopProject,
};
use crate::config::Config;
use crate::error::AppResult;
use crate::hashtables::WadPathResolver;

/// One edit of a project's config or its layers, one variant per [`Workshop`] method.
#[derive(Debug, Clone, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum ProjectEdit {
    /// Replace the metadata. [`Workshop::save_config`].
    Metadata { metadata: ProjectMetadata },
    /// Make the image at `image_path` the thumbnail. [`Workshop::set_thumbnail`].
    SetThumbnail { image_path: String },
    /// Take the thumbnail away. [`Workshop::remove_thumbnail`].
    RemoveThumbnail,
    /// Replace the string overrides of `layer`. [`Workshop::save_layer_string_overrides`].
    StringOverrides {
        layer: String,
        overrides: IndexMap<String, IndexMap<String, String>>,
    },
    /// Add a layer named `name`. [`Workshop::create_layer`].
    CreateLayer {
        name: String,
        display_name: Option<String>,
        description: Option<String>,
    },
    /// Show `layer` as `display_name`, which renames its folder. [`Workshop::rename_layer`].
    RenameLayer { layer: String, display_name: String },
    /// Take `layer` and its content out. [`Workshop::delete_layer`].
    DeleteLayer { layer: String },
    /// Set or clear the description of `layer`. [`Workshop::update_layer_description`].
    DescribeLayer {
        layer: String,
        description: Option<String>,
    },
    /// Put the layers above the base in the order of `layers`. [`Workshop::reorder_layers`].
    ReorderLayers { layers: Vec<String> },
}

impl ProjectEdit {
    /// Whether the edit changes the layers a sandbox of the project reads.
    #[must_use]
    pub fn reshapes_layers(&self) -> bool {
        matches!(
            self,
            Self::CreateLayer { .. }
                | Self::RenameLayer { .. }
                | Self::DeleteLayer { .. }
                | Self::ReorderLayers { .. }
        )
    }
}

/// Where a new project comes from, one variant per [`Workshop`] method.
#[derive(Debug, Clone, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum ProjectSource {
    /// An empty project. [`Workshop::create_project`].
    New { args: CreateProjectArgs },
    /// The `.modpkg` at `file_path`. [`Workshop::import_from_modpkg`].
    Modpkg { file_path: String },
    /// A `.fantome` archive. [`Workshop::import_from_fantome`].
    Fantome { args: ImportFantomeArgs },
    /// A GitHub repository. [`Workshop::import_from_git_repo`].
    GitRepo { args: ImportGitRepoArgs },
}

impl Workshop {
    /// Apply `edit` to the project at `project_path` through the method of its variant.
    ///
    /// # Errors
    ///
    /// What the variant's method raises.
    pub fn edit_project(
        &self,
        config: &Config,
        project_path: &str,
        edit: ProjectEdit,
    ) -> AppResult<WorkshopProject> {
        let edited = match edit {
            ProjectEdit::Metadata { metadata } => self.save_config(project_path, metadata),
            ProjectEdit::SetThumbnail { image_path } => {
                self.set_thumbnail(project_path, &image_path)
            }
            ProjectEdit::RemoveThumbnail => self.remove_thumbnail(project_path),
            ProjectEdit::StringOverrides { layer, overrides } => {
                self.save_layer_string_overrides(project_path, &layer, overrides)
            }
            ProjectEdit::CreateLayer {
                name,
                display_name,
                description,
            } => self.create_layer(project_path, &name, display_name, description),
            ProjectEdit::RenameLayer {
                layer,
                display_name,
            } => self.rename_layer(project_path, &layer, &display_name),
            ProjectEdit::DeleteLayer { layer } => self.delete_layer(project_path, &layer),
            ProjectEdit::DescribeLayer { layer, description } => {
                self.update_layer_description(project_path, &layer, description)
            }
            ProjectEdit::ReorderLayers { layers } => self.reorder_layers(project_path, layers),
        }?;
        Ok(self.describe(config, edited))
    }

    /// Make a project out of `source` in the workshop folder, through the method of its variant.
    ///
    /// # Errors
    ///
    /// What the variant's method raises.
    pub fn create_from(
        &self,
        config: &Config,
        source: ProjectSource,
        resolver: &WadPathResolver,
    ) -> AppResult<WorkshopProject> {
        let created = match source {
            ProjectSource::New { args } => self.create_project(config, args),
            ProjectSource::Modpkg { file_path } => self.import_from_modpkg(config, &file_path),
            ProjectSource::Fantome { args } => self.import_from_fantome(config, args, resolver),
            ProjectSource::GitRepo { args } => self.import_from_git_repo(config, args),
        }?;
        Ok(self.describe(config, created))
    }
}
