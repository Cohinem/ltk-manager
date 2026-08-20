//! Process-level diagnostics: manager-not-admin, league-not-running.
//!
//! Both are deliberately worded as positive ("X should be true"). The supported
//! configuration is *non-elevated* manager + *non-elevated* League; running
//! either as administrator breaks the patcher's process-injection.

use super::{Category, Check, Severity, check};

#[cfg(target_os = "windows")]
use super::{CheckDetail, check_ok};

#[cfg(target_os = "windows")]
pub fn check_manager_not_admin() -> Check {
    if is_running_as_admin() {
        let mut c = check(
            "process.manager_not_admin",
            "LTK Manager not running as admin",
            Category::Manager,
            Severity::Bad,
            "LTK Manager is running elevated",
        );
        c.suggestion = Some(
            "Running the manager as administrator is the single most common cause of \"patcher running but mods don't load\". Close LTK Manager and relaunch it normally (double-click - do NOT \"Run as administrator\"). If you have a compatibility flag on ltk-manager.exe forcing elevation, remove it from Properties → Compatibility."
                .into(),
        );
        c
    } else {
        check_ok(
            "process.manager_not_admin",
            "LTK Manager not running as admin",
            Category::Manager,
            "Not elevated",
        )
    }
}

#[cfg(not(target_os = "windows"))]
pub fn check_manager_not_admin() -> Check {
    check(
        "process.manager_not_admin",
        "LTK Manager not running as admin",
        Category::Manager,
        Severity::Info,
        "Not applicable",
    )
}

/// Whether the current (manager) process is running with an elevated token.
#[cfg(target_os = "windows")]
pub(crate) fn is_running_as_admin() -> bool {
    use std::mem::size_of;
    use std::ptr;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::Security::{
        GetTokenInformation, TOKEN_ELEVATION, TOKEN_QUERY, TokenElevation,
    };
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    let mut token = ptr::null_mut();
    // SAFETY: GetCurrentProcess is a pseudo-handle that needs no closing.
    let ok = unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) };
    if ok == 0 {
        return false;
    }
    let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
    let mut ret_len: u32 = 0;
    // SAFETY: token is valid; struct sizes match.
    let ok = unsafe {
        GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut _,
            size_of::<TOKEN_ELEVATION>() as u32,
            &mut ret_len,
        )
    };
    // SAFETY: token came from OpenProcessToken.
    unsafe { CloseHandle(token) };
    ok != 0 && elevation.TokenIsElevated != 0
}

/// Diagnostic that flags running League/Vanguard processes.
///
/// Currently NOT included in the default suite - see [`super::run_all`]. The
/// problem it tries to surface ("close League before re-running") was noisy
/// for every user who ran diagnostics mid-session, while none of the other
/// checks actually require League to be closed. Kept here so the phase-2
/// Vanguard handle-correlation work can call it and present a more specific
/// signal ("vgc.exe holds a handle on the patcher DLL") instead.
#[cfg(target_os = "windows")]
#[allow(dead_code)]
pub fn check_league_not_running() -> Check {
    let running = ritoclient::processes::list_matching(
        &[
            ritoclient::processes::RIOT_PROCESS_NAMES,
            &[
                "league of legends.exe",
                crate::launcher::LEAGUE_CLIENT_EXE,
                "leagueclientux.exe",
                "leagueclientuxrender.exe",
            ],
        ]
        .concat(),
    );
    if running.is_empty() {
        return check_ok(
            "process.league_not_running",
            "League is not currently running",
            Category::Manager,
            "League is closed",
        );
    }
    let mut c = check(
        "process.league_not_running",
        "League is not currently running",
        Category::Manager,
        Severity::Warn,
        format!(
            "{} League/Riot process(es) running - close the game before re-running diagnostics",
            running.len()
        ),
    );
    for (name, pid) in &running {
        c.details
            .push(CheckDetail::new(name, format!("PID {}", pid)));
    }
    c.suggestion = Some(
        "Some checks (especially the patcher DLL lock probe) give cleaner results when League and Vanguard are not running. Close the client and any running game, then re-run diagnostics."
            .into(),
    );
    c
}

#[cfg(not(target_os = "windows"))]
#[allow(dead_code)]
pub fn check_league_not_running() -> Check {
    check(
        "process.league_not_running",
        "League is not currently running",
        Category::Manager,
        Severity::Info,
        "Not applicable",
    )
}
