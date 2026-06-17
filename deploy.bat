@echo off
copy /Y "C:\Users\gmedici\Desktop\fintech\fintech\index.html" "%~dp0"
copy /Y "C:\Users\gmedici\Desktop\fintech\fintech\style.css" "%~dp0"
cd /d "%~dp0"
git add -A
git commit -m "Update"
git push
echo Done! Files pushed to GitHub.
pause