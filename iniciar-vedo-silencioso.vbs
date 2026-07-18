' Inicia o VEDO em segundo plano, sem janela preta de terminal.
' Use este arquivo no atalho da pasta Inicializar do Windows.
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run """" & shell.CurrentDirectory & "\iniciar-vedo.bat""", 0, False
