Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
nodeExe = "C:\Program Files\nodejs\node.exe"
url = "http://localhost:8080"

If fso.FileExists(nodeExe) Then
  WshShell.Run """" & nodeExe & """ """ & dir & "\server.js""", 0, False
End If

WScript.Sleep 3000
WshShell.Run """" & url & """", 1, False
