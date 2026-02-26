!macro NSIS_HOOK_PREINSTALL
  ; Force x64 installs into Program Files (64-bit), not Program Files (x86).
  StrCpy $INSTDIR "$PROGRAMFILES64\Glance"

  ; Avoid locked-file failures during upgrade/reinstall.
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /IM glance.exe'
  Pop $0

  ; Clean up broken legacy path from older installers.
  IfFileExists "$PROGRAMFILES32\Glance\*.*" 0 +2
  RMDir /r /REBOOTOK "$PROGRAMFILES32\Glance"
!macroend
