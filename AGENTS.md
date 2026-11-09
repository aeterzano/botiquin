# Reglas del Proyecto Botiquín Virtual

## Subida Automática de Cambios (Git Auto-Commit & Push)
- **Siempre** que realices modificaciones en el código a pedido del usuario, al finalizar los ajustes debes ejecutar automáticamente `git add -A`, `git commit -m "..."` y `git push origin main` sin esperar a que el usuario lo pida manualmente.
- En este entorno Windows, si el binario `git` no está en el `PATH` por defecto de la sesión, utiliza la ruta de Git de GitHub Desktop:
  `C:\Users\aeter\AppData\Local\GitHubDesktop\app-3.6.10\resources\app\git\cmd\git.exe`
- El comando `git push origin main` requiere acceso de red, por lo que debe ejecutarse fuera del sandbox (`BypassSandbox: true`) si el sandbox bloquea la salida de red.
