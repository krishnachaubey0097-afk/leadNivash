@echo off
echo Testing Login via curl...
curl.exe -X POST "http://localhost:5000/api/v1/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"broker@leadnivesh.com\",\"password\":\"Broker@123456\"}"
echo.
pause
