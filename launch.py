"""
CLOSD 桌面应用启动器
双击此文件或在终端运行: python launch.py
现在使用 Node.js Express 服务器（支持 AI 功能）
"""
import subprocess
import webbrowser
import threading
import os
import sys
import time

DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(DIR)

PORT = 8080
URL = f"http://localhost:{PORT}"

def start_server():
    """启动 Node.js Express 服务器"""
    node_cmd = "node" if sys.platform != "win32" else "node.exe"
    try:
        proc = subprocess.Popen(
            [node_cmd, "server.js"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
        )
        # 等待服务器启动
        for line in proc.stdout:
            print(line, end="")
            if "服务已启动" in line or "CLOSD" in line:
                break
        return proc
    except FileNotFoundError:
        print("错误：未找到 Node.js，请先安装 Node.js")
        print("下载地址：https://nodejs.org/")
        return None

proc = start_server()

if proc:
    # 等待服务器就绪
    time.sleep(1.5)
    # 打开浏览器
    try:
        browser = webbrowser.get('chrome')
        browser.open(URL, new=1, autoraise=True)
    except:
        webbrowser.open(URL)

    print(f"\nCLOSD 桌面应用已启动 → {URL}")
    print("关闭此窗口退出服务。")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n已退出。")
        proc.terminate()
else:
    print("按回车键退出...")
    input()
