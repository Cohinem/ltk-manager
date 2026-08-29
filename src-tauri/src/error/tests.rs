//! Unit tests for the error codes, the response payload and the IPC envelope.

use super::*;
use ltk_manager_core::hashtables::{HashtableError, SyncHolder};
use ltk_manager_core::launcher::LauncherError;
use ltk_manager_core::patcher::injector::InjectorError;
use ltk_manager_core::patcher::session::SessionError;
use ltk_manager_core::patcher::{InjectionStage, PatcherError};

#[test]
fn error_code_serializes_as_screaming_snake_case() {
    assert_eq!(serde_json::to_string(&ErrorCode::Io).unwrap(), "\"IO\"");
    assert_eq!(
        serde_json::to_string(&ErrorCode::LeagueNotFound).unwrap(),
        "\"LEAGUE_NOT_FOUND\""
    );
    assert_eq!(
        serde_json::to_string(&ErrorCode::ModNotFound).unwrap(),
        "\"MOD_NOT_FOUND\""
    );
    assert_eq!(
        serde_json::to_string(&ErrorCode::InvalidPath).unwrap(),
        "\"INVALID_PATH\""
    );
    assert_eq!(
        serde_json::to_string(&ErrorCode::WorkshopNotConfigured).unwrap(),
        "\"WORKSHOP_NOT_CONFIGURED\""
    );
    assert_eq!(
        serde_json::to_string(&ErrorCode::ProjectAlreadyExists).unwrap(),
        "\"PROJECT_ALREADY_EXISTS\""
    );
    assert_eq!(
        serde_json::to_string(&ErrorCode::Patcher).unwrap(),
        "\"PATCHER\""
    );
    assert_eq!(
        serde_json::to_string(&ErrorCode::Hashtable).unwrap(),
        "\"HASHTABLE\""
    );
}

/// Every hashtable failure shares one code, and the message says which.
/// `HashtableError` is not `Serialize`, so the message is the only place
/// the detail can ride.
#[test]
fn every_hashtable_failure_shares_one_code() {
    let resp: AppErrorResponse =
        AppError::Hashtable(HashtableError::SyncLocked(SyncHolder::unknown())).into();
    assert_eq!(resp.code, ErrorCode::Hashtable);
    assert!(resp.message.contains("already syncing"));
}

#[test]
fn error_code_round_trips() {
    for code in [
        ErrorCode::Io,
        ErrorCode::Serialization,
        ErrorCode::Modpkg,
        ErrorCode::LeagueNotFound,
        ErrorCode::InvalidPath,
        ErrorCode::ModNotFound,
        ErrorCode::ValidationFailed,
        ErrorCode::InternalState,
        ErrorCode::MutexLockFailed,
        ErrorCode::Unknown,
        ErrorCode::WorkshopNotConfigured,
        ErrorCode::ProjectNotFound,
        ErrorCode::ProjectAlreadyExists,
        ErrorCode::PackFailed,
        ErrorCode::Fantome,
        ErrorCode::Wad,
        ErrorCode::Patcher,
        ErrorCode::Zip,
        ErrorCode::SchemaVersionTooNew,
        ErrorCode::Workshop,
        ErrorCode::Launcher,
        ErrorCode::Hashtable,
        ErrorCode::Preview,
        ErrorCode::Overlay,
    ] {
        let json = serde_json::to_string(&code).unwrap();
        let deserialized: ErrorCode = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, code);
    }
}

#[test]
fn app_error_response_new() {
    let resp = AppErrorResponse::new(ErrorCode::Io, "disk full");
    assert_eq!(resp.code, ErrorCode::Io);
    assert_eq!(resp.message, "disk full");
    assert!(resp.context.is_none());
}

#[test]
fn app_error_response_with_context() {
    let resp = AppErrorResponse::new(ErrorCode::InvalidPath, "bad path")
        .with_context(serde_json::json!({ "path": "/foo" }));
    assert_eq!(resp.context.unwrap()["path"], "/foo");
}

#[test]
fn app_error_to_response_invalid_path_preserves_context() {
    let error = AppError::InvalidPath("/bad/path".to_string());
    let resp: AppErrorResponse = error.into();
    assert_eq!(resp.code, ErrorCode::InvalidPath);
    assert_eq!(resp.context.unwrap()["path"], "/bad/path");
}

#[test]
fn app_error_to_response_mod_not_found_preserves_context() {
    let error = AppError::ModNotFound("mod123".to_string());
    let resp: AppErrorResponse = error.into();
    assert_eq!(resp.code, ErrorCode::ModNotFound);
    assert_eq!(resp.context.unwrap()["modId"], "mod123");
}

#[test]
fn app_error_to_response_project_not_found_preserves_context() {
    let error = AppError::ProjectNotFound("my-project".to_string());
    let resp: AppErrorResponse = error.into();
    assert_eq!(resp.code, ErrorCode::ProjectNotFound);
    assert_eq!(resp.context.unwrap()["projectName"], "my-project");
}

#[test]
fn app_error_to_response_patcher_carries_the_variant_in_context() {
    let resp: AppErrorResponse = AppError::Patcher(PatcherError::Busy).into();
    assert_eq!(resp.code, ErrorCode::Patcher);
    assert_eq!(resp.context.unwrap()["kind"], "BUSY");
}

/// Every patcher failure shares one code, so `context.kind` is the only
/// thing separating them - it must survive the mapping for each variant.
#[test]
fn every_patcher_variant_reaches_the_frontend_distinguishable() {
    let kinds = [
        (PatcherError::Busy, "BUSY"),
        (PatcherError::AlreadyRunning, "ALREADY_RUNNING"),
        (PatcherError::NotRunning, "NOT_RUNNING"),
        (PatcherError::UnsupportedPlatform, "UNSUPPORTED_PLATFORM"),
        (
            PatcherError::InjectionFailed {
                stage: InjectionStage::Host,
                message: "host died".to_string(),
            },
            "INJECTION_FAILED",
        ),
    ];
    for (error, expected) in kinds {
        let resp: AppErrorResponse = AppError::Patcher(error).into();
        assert_eq!(resp.code, ErrorCode::Patcher);
        assert_eq!(resp.context.unwrap()["kind"], expected);
    }
}

#[test]
fn injection_failure_context_keeps_the_stage_and_the_reason() {
    let error = PatcherError::from(SessionError::Injector(InjectorError::Failed(
        "DLL never attached after 60s".to_string(),
    )));
    let resp: AppErrorResponse = AppError::Patcher(error).into();

    assert!(resp.message.contains("DLL never attached"));
    let context = resp.context.unwrap();
    assert_eq!(context["kind"], "INJECTION_FAILED");
    assert_eq!(context["stage"], "INJECTION");
}

/// Each launcher failure has its own remedy in the UI, and the context is
/// what tells them apart. One code per variant put the discriminant on the
/// wire twice, and lossily - two variants shared `LAUNCH_FAILED`, which the
/// context distinguishes.
#[test]
fn every_launcher_variant_shares_one_code_and_keeps_its_kind() {
    let cases = [
        (
            LauncherError::RiotClientNotFound {
                installs_path: "C:/ProgramData/…/RiotClientInstalls.json".to_string(),
            },
            "RIOT_CLIENT_NOT_FOUND",
        ),
        (
            LauncherError::RiotClientUnreachable {
                reason: "HTTP 404".to_string(),
            },
            "RIOT_CLIENT_UNREACHABLE",
        ),
        (
            LauncherError::Refused {
                riot_error_code: "eula_not_accepted".to_string(),
                message: "Accept the Terms of Service".to_string(),
            },
            "REFUSED",
        ),
        (LauncherError::Stopped, "STOPPED"),
        (
            LauncherError::Misconfigured {
                reason: "the game process name is empty".to_string(),
            },
            "MISCONFIGURED",
        ),
        (
            LauncherError::SpawnFailed {
                reason: "access denied".to_string(),
            },
            "SPAWN_FAILED",
        ),
        (LauncherError::UnsupportedPlatform, "UNSUPPORTED_PLATFORM"),
        (
            LauncherError::Other {
                message: "something new upstream".to_string(),
            },
            "OTHER",
        ),
    ];

    for (error, expected_kind) in cases {
        let resp: AppErrorResponse = AppError::Launcher(error).into();
        assert_eq!(resp.code, ErrorCode::Launcher);
        assert_eq!(
            resp.context.expect("a launcher context")["kind"],
            expected_kind
        );
    }
}

#[test]
fn riot_client_not_found_carries_the_path_it_tried() {
    let resp: AppErrorResponse = AppError::Launcher(LauncherError::RiotClientNotFound {
        installs_path: "C:/ProgramData/Riot Games/RiotClientInstalls.json".to_string(),
    })
    .into();

    let context = resp.context.unwrap();
    assert_eq!(context["kind"], "RIOT_CLIENT_NOT_FOUND");
    assert_eq!(
        context["installsPath"],
        "C:/ProgramData/Riot Games/RiotClientInstalls.json"
    );
}

#[test]
fn ipc_result_ok_serialization() {
    let result: IpcResult<String> = IpcResult::ok("hello".to_string());
    let json = serde_json::to_value(&result).unwrap();
    assert_eq!(json["ok"], true);
    assert_eq!(json["value"], "hello");
}

#[test]
fn ipc_result_err_serialization() {
    let resp = AppErrorResponse::new(ErrorCode::Io, "disk full");
    let result: IpcResult<String> = IpcResult::err(resp);
    let json = serde_json::to_value(&result).unwrap();
    assert_eq!(json["ok"], false);
    assert_eq!(json["error"]["code"], "IO");
    assert_eq!(json["error"]["message"], "disk full");
}

#[test]
fn ipc_result_from_ok() {
    let result: IpcResult<i32> = Ok::<i32, AppErrorResponse>(42).into();
    let json = serde_json::to_value(&result).unwrap();
    assert_eq!(json["ok"], true);
    assert_eq!(json["value"], 42);
}

#[test]
fn ipc_result_from_err() {
    let err = AppErrorResponse::new(ErrorCode::Unknown, "oops");
    let result: IpcResult<i32> = Err::<i32, AppErrorResponse>(err).into();
    let json = serde_json::to_value(&result).unwrap();
    assert_eq!(json["ok"], false);
    assert_eq!(json["error"]["code"], "UNKNOWN");
}

#[test]
fn app_error_response_context_skipped_when_none() {
    let resp = AppErrorResponse::new(ErrorCode::Io, "err");
    let json = serde_json::to_value(&resp).unwrap();
    assert!(json.get("context").is_none());
}

/// The overlay's failure categories exist so the frontend can branch on the
/// remedy - fix the game dir, blame a mod, split a mod, report a bug - and
/// `context.category` is where each must land.
#[test]
fn every_overlay_category_reaches_the_frontend_distinguishable() {
    use ltk_overlay::{CorruptionError, GameDirError, Invariant, ModContentError, WadLimitError};

    let cases: [(ltk_overlay::Error, &str); 6] = [
        (
            GameDirError::MissingDataFinal {
                path: "D:/Games/League".into(),
            }
            .into(),
            "GAME_DIR",
        ),
        (ModContentError::FantomeInfoMissing.into(), "MOD_CONTENT"),
        (
            WadLimitError::TooManyChunks {
                wad: "Map11.wad.client".into(),
                count: u32::MAX as usize + 1,
            }
            .into(),
            "WAD_LIMIT",
        ),
        (
            CorruptionError::TruncatedWad {
                wad: "Aatrox.wad.client".into(),
                reach: 100,
                len: 50,
            }
            .into(),
            "CORRUPT",
        ),
        (
            ltk_overlay::Error::Bug(Invariant::OverrideNeverPrepared),
            "BUG",
        ),
        (
            std::io::Error::from(std::io::ErrorKind::PermissionDenied).into(),
            "OTHER",
        ),
    ];

    for (error, expected_category) in cases {
        let resp: AppErrorResponse = AppError::Overlay(error).into();
        assert_eq!(resp.code, ErrorCode::Overlay);
        assert_eq!(
            resp.context.expect("an overlay context")["category"],
            expected_category
        );
    }
}

/// The category names the remedy, but the user still reads the message, so
/// the detail's own words must survive the mapping.
#[test]
fn overlay_response_message_carries_the_detail() {
    use ltk_overlay::GameDirError;

    let resp: AppErrorResponse = AppError::Overlay(
        GameDirError::MissingDataFinal {
            path: "D:/Games/League".into(),
        }
        .into(),
    )
    .into();

    assert!(resp.message.contains("D:/Games/League"), "{}", resp.message);
    assert!(resp.message.contains("DATA/FINAL"), "{}", resp.message);
}
