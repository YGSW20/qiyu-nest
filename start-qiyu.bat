@echo off
chcp 65001 >nul
title 栖语 Nest · 启动中...

echo.
echo   ╔════════════════════════════════════╗
echo   ║    🪹 栖语 Nest · 一键启动       ║
echo   ╚════════════════════════════════════╝
echo.

:: ── 1. 启动后端服务器 ──
echo [1/3] 启动后端服务器...
start "栖语-Nest-后端" /MIN cmd /c "cd /d %~dp0 && node server.js"
timeout /t 3 /nobreak >nul
echo        后端已启动 → http://localhost:8080

:: ── 2. 启动 Cloudflare Tunnel ──
echo [2/3] 启动公网隧道...
start "栖语-Nest-隧道" /MIN cmd /c "cd /d %~dp0 && npx cloudflared tunnel --url http://localhost:8080"
timeout /t 8 /nobreak >nul
echo        隧道已启动

:: ── 3. 打开 Landing Page ──
echo [3/3] 打开网站...
start "" https://qiyu-nest.pages.dev

echo.
echo   ╔════════════════════════════════════╗
echo   ║   ✅ 启动完成！                   ║
echo   ║                                  ║
echo   ║   Landing: qiyu-nest.pages.dev   ║
echo   ║   后端:    localhost:8080        ║
echo   ║                                  ║
echo   ║   关掉此窗口不影响运行            ║
echo   ║   要停止: 关闭两个后台窗口        ║
echo   ╚════════════════════════════════════╝
echo.

:: 获取当前的 Tunnel URL（从日志提取）
timeout /t 4 /nobreak >nul
echo   正在获取公网地址...

:: 保持窗口打开显示信息
pause
