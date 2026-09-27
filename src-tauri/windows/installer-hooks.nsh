; Tauri NSIS installer hooks (bundle.windows.nsis.installerHooks).
;
; The install directory is pinned to Program Files per
; docs/adr/0055-ltk-manager-installs-per-machine.md.

Var LtkInstDirProtected

; Whether $INSTDIR sits under a Program Files root, which only an
; administrator can write.
Function LtkCheckInstDir
  Push $0
  Push $1

  StrCpy $LtkInstDirProtected 0

  StrLen $0 "$PROGRAMFILES64\"
  StrCpy $1 "$INSTDIR" $0
  ${If} $1 == "$PROGRAMFILES64\"
    StrCpy $LtkInstDirProtected 1
  ${EndIf}

  StrLen $0 "$PROGRAMFILES32\"
  StrCpy $1 "$INSTDIR" $0
  ${If} $1 == "$PROGRAMFILES32\"
    StrCpy $LtkInstDirProtected 1
  ${EndIf}

  Pop $1
  Pop $0
FunctionEnd

; Greys out the install button while the chosen directory is unprotected.
Function .onVerifyInstDir
  Call LtkCheckInstDir

  ${If} $LtkInstDirProtected == 0
    Abort
  ${EndIf}
FunctionEnd

; Uninstall a per-user install left by a currentUser bundle. `SHCTX` is `HKLM`
; here, so the template's own reinstall page never sees one, and what it leaves
; behind is a writable copy of the binaries the patcher elevates.
!macro LtkRemovePerUserInstall
  ReadRegStr $2 HKCU "${MANUPRODUCTKEY}" ""
  ReadRegStr $3 HKCU "${UNINSTKEY}" "UninstallString"

  ${If} $2 != ""
  ${AndIf} $3 != ""
  ${AndIf} $2 != "$INSTDIR"
  ${AndIf} ${FileExists} "$2\uninstall.exe"
    DetailPrint "Removing the per-user install at $2"

    ; `_?=` keeps the uninstaller in place rather than running a copy from
    ; %TEMP%, which is what makes ExecWait wait for it.
    ExecWait '$3 /S _?=$2'

    Delete "$2\uninstall.exe"
    RMDir "$2"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; The directory page does not run under /S, so /D= is checked here too.
  Call LtkCheckInstDir

  ${If} $LtkInstDirProtected == 0
    MessageBox MB_ICONSTOP "LTK Manager installs under Program Files. $INSTDIR is writable without administrator rights, which the patcher does not allow."
    Abort
  ${EndIf}

  nsExec::Exec 'taskkill /F /T /IM ltk_patcher_host.exe'
  Pop $0

  !insertmacro LtkRemovePerUserInstall
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /T /IM ltk_patcher_host.exe'
  Pop $0
!macroend
