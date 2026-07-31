; Tauri NSIS installer hooks (bundle.windows.nsis.installerHooks).

!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /T /IM ltk_patcher_host.exe'
  Pop $0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /T /IM ltk_patcher_host.exe'
  Pop $0
!macroend
