//! Which Riot processes are running.
//!
//! The remoting API cannot answer this: a lockfile survives a crash, and its pid
//! may since have been recycled onto something unrelated. So the process table
//! is the only source that can tell a live client from a stale record.

/// Lowercase basename of the League client. `riotclientservices.exe` running is
/// *normal* and must never block a launch - only this one does.
pub const LEAGUE_CLIENT_EXE: &str = "leagueclient.exe";
/// Lowercase basename of the Riot Client bootstrapper.
pub const RIOT_CLIENT_EXE: &str = "riotclientservices.exe";

/// Lowercase basenames considered League / Riot / Vanguard processes.
#[cfg(target_os = "windows")]
const RIOT_PROCESS_NAMES: &[&str] = &[
    "league of legends.exe",
    LEAGUE_CLIENT_EXE,
    "leagueclientux.exe",
    "leagueclientuxrender.exe",
    RIOT_CLIENT_EXE,
    "riotclientux.exe",
    "riotclientuxrender.exe",
    "riotclientcrashhandler.exe",
    "vgc.exe",
    "vgtray.exe",
];

/// Every running League / Riot / Vanguard process as `(exe name, pid)`.
///
/// One snapshot walker answers every question anyone here has - "is League up?",
/// "is the pid in the lockfile still a Riot Client?", "what should diagnostics
/// warn about?" - so there is deliberately no second one.
#[cfg(target_os = "windows")]
pub fn list_riot_processes() -> Vec<(String, u32)> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
        TH32CS_SNAPPROCESS,
    };

    let mut out = Vec::new();
    // SAFETY: documented snapshot creation.
    let snap = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snap == INVALID_HANDLE_VALUE || snap.is_null() {
        return out;
    }
    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
    // SAFETY: entry is correctly sized.
    if unsafe { Process32FirstW(snap, &mut entry) } == 0 {
        unsafe { CloseHandle(snap) };
        return out;
    }
    loop {
        let len = entry
            .szExeFile
            .iter()
            .position(|&c| c == 0)
            .unwrap_or(entry.szExeFile.len());
        let name = String::from_utf16_lossy(&entry.szExeFile[..len]);
        if RIOT_PROCESS_NAMES.contains(&name.to_lowercase().as_str()) {
            out.push((name, entry.th32ProcessID));
        }
        // SAFETY: entry is correctly sized; loop terminates on Process32NextW returning 0.
        if unsafe { Process32NextW(snap, &mut entry) } == 0 {
            break;
        }
    }
    // SAFETY: snap came from CreateToolhelp32Snapshot.
    unsafe { CloseHandle(snap) };
    out
}

#[cfg(not(target_os = "windows"))]
pub fn list_riot_processes() -> Vec<(String, u32)> {
    Vec::new()
}

/// Whether `LeagueClient.exe` is up.
pub fn league_client_running() -> bool {
    list_riot_processes()
        .iter()
        .any(|(name, _)| name.eq_ignore_ascii_case(LEAGUE_CLIENT_EXE))
}

/// Whether this pid is still a Riot Client.
///
/// Both halves matter: pids get recycled, so "a process with this pid exists"
/// would happily accept an unrelated program that inherited it.
pub fn riot_client_alive(pid: u32) -> bool {
    list_riot_processes().iter().any(|(name, running_pid)| {
        *running_pid == pid && name.eq_ignore_ascii_case(RIOT_CLIENT_EXE)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Whatever this machine is running, a pid that cannot exist is not a Riot
    /// Client - and on a non-Windows runner nothing is.
    #[test]
    fn an_impossible_pid_is_never_a_live_client() {
        assert!(!riot_client_alive(0));
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn nothing_is_running_off_windows() {
        assert!(list_riot_processes().is_empty());
        assert!(!league_client_running());
    }
}
