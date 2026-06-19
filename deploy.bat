@echo off
setlocal

set REPO=C:\Users\gmedici\Desktop\fintech\fintech

echo Pushing to GitHub...
cd /d "%REPO%"
git add -A
git commit -m "Update"
git push

echo.
echo Done!
pause
