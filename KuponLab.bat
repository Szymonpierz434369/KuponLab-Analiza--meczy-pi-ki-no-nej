@echo off
title Kursor
cd /d "%USERPROFILE%\Documents\projekty\kuponlab"
if not exist package.json (
  echo Nie znaleziono projektu w %USERPROFILE%\Documents\projekty\kuponlab
  echo Popraw sciezke w tym pliku ^(prawy przycisk - Edytuj^).
  pause
  exit /b
)
echo Uruchamiam Kursor... Nie zamykaj tego okna, dopoki korzystasz z aplikacji.
start "" cmd /c "timeout /t 6 >nul & start http://localhost:3000"
npm run dev
pause
