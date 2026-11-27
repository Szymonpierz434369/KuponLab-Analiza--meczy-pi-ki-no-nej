@echo off
title Instalacja Kursora
cd /d "%~dp0"
echo ==============================================
echo   Instalacja aplikacji Kursor
echo ==============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Na tym komputerze nie ma programu Node.js, ktory jest potrzebny do dzialania aplikacji.
  echo Otwieram strone pobierania. Pobierz wersje LTS, zainstaluj ja z domyslnymi ustawieniami,
  echo a potem uruchom ten plik jeszcze raz.
  start "" https://nodejs.org/
  pause
  exit /b
)
for /f "delims=" %%v in ('node -v') do echo Znaleziono Node.js %%v
echo.

echo [1/3] Instaluje biblioteki (to potrwa 1-3 minuty)...
call npm install
if errorlevel 1 (
  echo.
  echo Instalacja bibliotek nie powiodla sie. Sprawdz polaczenie z internetem i sprobuj ponownie.
  pause
  exit /b
)
call npm install-scripts approve better-sqlite3 >nul 2>nul
call npm rebuild better-sqlite3
echo.

echo [2/3] Klucz do asystenta AI...
if exist .env.local (
  echo Plik .env.local juz istnieje, zostawiam go bez zmian.
) else (
  copy /y .env.example .env.local >nul
  echo Za chwile otworzy sie Notatnik. Wklej swoj klucz API po znaku = w linii ANTHROPIC_API_KEY=,
  echo zapisz plik ^(Ctrl+S^) i zamknij Notatnik. Bez klucza dziala wszystko oprocz asystenta AI.
  pause
  notepad .env.local
)
echo.

echo [3/3] Tworze skrot "Kursor" na pulpicie...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'Kursor.lnk')); $s.TargetPath='%~dp0KuponLab.bat'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%~dp0public\brand\kursor.ico'; $s.Save()"
echo.
echo Gotowe. Aplikacje uruchamiasz skrotem "Kursor" na pulpicie albo plikiem KuponLab.bat.
pause
