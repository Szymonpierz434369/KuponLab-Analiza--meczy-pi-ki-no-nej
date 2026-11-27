@echo off
title Kursor
rem Uruchamia aplikacje z folderu, w ktorym lezy ten plik (dziala na kazdym komputerze).
cd /d "%~dp0"
rem Kopia tego pliku na pulpicie: szukamy aplikacji w domyslnym folderze.
if not exist package.json if exist "%USERPROFILE%\Documents\projekty\kuponlab\package.json" cd /d "%USERPROFILE%\Documents\projekty\kuponlab"
if not exist package.json (
  echo Nie znaleziono aplikacji obok tego pliku. Uruchom go z folderu Kursora.
  pause
  exit /b
)
if not exist node_modules (
  echo Aplikacja nie jest jeszcze zainstalowana. Uruchom najpierw plik Zainstaluj.bat.
  pause
  exit /b
)
echo Uruchamiam Kursor... Nie zamykaj tego okna, dopoki korzystasz z aplikacji.
start "" cmd /c "timeout /t 6 >nul & start http://localhost:3000"
call npm run dev
pause
