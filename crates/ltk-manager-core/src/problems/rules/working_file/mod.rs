//! `project/working-file` - a source or editor file in the package of a
//! workshop project that has no ignore rules.
//!
//! Per "The problems rule" in docs/ux/PROJECT_EDITOR.md.

use camino::Utf8PathBuf;
use ltk_mod_project::{MODIGNORE_FILE_NAME, ModIgnoreMatch};

use crate::error::AppError;
use crate::problems::{
    Applied, Detail, FixError, FixPreview, FixRun, Pass, Problem, ProblemSeverity, Rule, RuleId,
    Site,
};
use crate::workshop::{ProjectDir, holds_ignore_rules, recommended_ignore_filter};

/// The id every row of this rule carries.
pub const ID: RuleId = RuleId("project/working-file");

/// Reports each file that the recommended ignore rules would exclude from a package.
#[derive(Debug, Default)]
pub struct WorkingFile;

impl WorkingFile {
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

impl Rule for WorkingFile {
    fn id(&self) -> RuleId {
        ID
    }

    fn title(&self) -> &'static str {
        "Working file in package"
    }

    fn description(&self) -> &'static str {
        "A source or editor file that the game never loads, in the package of a project that has no ignore rules"
    }

    fn severity(&self) -> Option<ProblemSeverity> {
        Some(ProblemSeverity::Warning)
    }

    fn subscribe(&self, pass: &mut Pass<'_>) {
        if !pass.project().lacks_ignore_rules() {
            return;
        }

        let recommended = recommended_ignore_filter();
        pass.finish(move |finish| {
            let project = finish.project();
            for handle in project.files() {
                let in_content = Utf8PathBuf::from(handle.layer()).join(handle.path());
                let ModIgnoreMatch::Ignore(rule) =
                    recommended.matched_with_parents(&in_content, false)
                else {
                    continue;
                };

                finish.problem(
                    ProblemSeverity::Warning,
                    Site::file(handle.layer(), handle.path()),
                    Detail {
                        mismatch: None,
                        message: None,
                        fix: Some(FixPreview::note(format!(
                            "Excluded by {} in the recommended {MODIGNORE_FILE_NAME}",
                            rule.pattern()
                        ))),
                    },
                );
            }
        });
    }

    fn fix(&self, problems: &[&Problem], run: &mut FixRun<'_>) -> Result<Applied, FixError> {
        let wrote = write_recommended(run)?;

        let mut applied = Applied::default();
        for problem in problems {
            let (layer, path) = (&problem.site.layer, &problem.site.path);
            if wrote {
                run.repaired(layer, path, 1);
                applied.applied += 1;
            } else {
                run.skipped(layer, path, 1);
                applied.skipped += 1;
            }
        }

        Ok(applied)
    }
}

/// Write the recommended `.modignore` into a project that has no rules.
///
/// Returns `false` and writes nothing for a run over an archive, and for a
/// project that has a `.modignore` since the check.
fn write_recommended(run: &FixRun<'_>) -> Result<bool, FixError> {
    let Some(root) = run.tree() else {
        return Ok(false);
    };
    let failed = |error: AppError| FixError::Project {
        path: MODIGNORE_FILE_NAME.to_owned(),
        message: error.to_string(),
    };

    let project = ProjectDir::open(root).map_err(failed)?;
    if holds_ignore_rules(&project.ignore_filter()) {
        return Ok(false);
    }

    project.write_default_ignore_rules().map_err(failed)?;
    Ok(true)
}

#[cfg(test)]
mod tests;
