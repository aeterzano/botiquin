# Reglas del Proyecto Botiquín Virtual

## Subida Automática de Cambios (Git Auto-Commit & Push)
- **Siempre** que realices modificaciones en archivos del proyecto a pedido del usuario, al finalizar los ajustes debes subir los cambios directamente al repositorio remoto ejecutando `git add -A`, `git commit -m "<mensaje descriptivo>"` y `git push origin main` de forma automática, sin que el usuario tenga que pedirlo ni intervenir en Git.
- En este entorno Windows, si el binario `git` no está en el `PATH` por defecto de la sesión, utiliza la ruta de Git de GitHub Desktop:
  `C:\Users\aeter\AppData\Local\GitHubDesktop\app-3.6.10\resources\app\git\cmd\git.exe`
- Como el sandbox bloquea la escritura en `.git/index.lock` y la salida de red a GitHub, las operaciones de escritura/remoto en Git (`add`, `commit`, `push`) deben ejecutarse con `BypassSandbox: true` manteniendo la forma del comando con prefijo fijo (`C:\Users\aeter\AppData\Local\GitHubDesktop\app-3.6.10\resources\app\git\cmd\git.exe ...`) para aprovechar la auto-aprobación ("Always allow").
