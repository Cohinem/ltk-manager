//! A project layer's declarations manifest (ADR-0042), edited through
//! `ltk-declarations`.

use ltk_declarations::Manifest;

use super::{ProjectDir, WorkshopError};
use crate::error::{AppError, AppResult};

impl ProjectDir {
    /// The declarations manifest of one of the project's layers.
    ///
    /// # Errors
    ///
    /// [`AppError::ValidationFailed`] for a layer name that is not one path
    /// component, and the errors of [`Manifest::read`].
    pub fn declarations_manifest(&self, layer: &str) -> AppResult<Manifest> {
        if layer.is_empty() || layer.contains(['/', '\\']) || matches!(layer, "." | "..") {
            return Err(AppError::ValidationFailed(format!(
                "Invalid layer name: {layer}"
            )));
        }
        Ok(Manifest::read(self.path().join("content").join(layer))?)
    }
}

impl From<ltk_declarations::Error> for AppError {
    fn from(error: ltk_declarations::Error) -> Self {
        use ltk_declarations::Error;

        match error {
            Error::ChangedOnDisk { path } => WorkshopError::DeclarationsChangedOnDisk {
                path: path.display().to_string(),
            }
            .into(),
            Error::NotYaml { path } => WorkshopError::DeclarationsNotYaml {
                path: path.display().to_string(),
            }
            .into(),
            Error::Invalid { path, message } => WorkshopError::DeclarationsInvalid {
                path: path.display().to_string(),
                message,
            }
            .into(),
            Error::Uneditable { path, reason } => WorkshopError::DeclarationsUneditable {
                path: path.display().to_string(),
                reason: reason.to_string(),
            }
            .into(),
            Error::InvalidValue(reason) => AppError::ValidationFailed(reason),
            Error::Io(error) => AppError::Io(error),
            other => AppError::Other(other.to_string()),
        }
    }
}

#[cfg(test)]
mod tests;
