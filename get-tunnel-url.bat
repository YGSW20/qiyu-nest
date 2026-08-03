@echo off
chcp 65001 >nul
title 获取隧道公网地址

echo 正在获取当前隧道公网地址...
echo.

:: 从 cloudflared 窗口查找 URL
for /f "tokens=2 delims=│" %%a in ('tasklist /fi "windowtitle eq 栖语-Nest-隧道*" /fo csv ^| find /c "cmd.exe"') do (
    if %%a GTR 0 (
        echo ✅ 隧道正在运行
    )
)

:: 尝试连接本地服务器获取健康状态
curl -s http://localhost:8080/api/health >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 本地服务器正常运行
) else (
    echo ❌ 本地服务器未启动！请先运行 start-qiyu.bat
    pause
    exit /b 1
)

echo.
echo ────────────────────────────────────
echo  获取公网地址：
echo.
echo  方法 1：看"栖语-Nest-隧道"窗口
echo         底部有 trycloudflare.com 链接
echo.
echo  方法 2：访问 qiyu-nest.pages.dev
echo         点"打开应用"会自动跳转
echo.
echo  方法 3：运行下方命令测试
echo         curl 隧道地址/api/health
echo ────────────────────────────────────
echo.

:: 从 cloudflared 进程的输出中提取 URL
powershell -Command "Get-Process cloudflared -ErrorAction SilentlyContinue | ForEach-Object { Write-Host '隧道进程运行中 (PID:' \$_.Id ')' }"

echo.
pause
