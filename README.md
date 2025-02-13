<h1 align="center">Electron + Vite + React + Typescript + TailWindCSS + ShadCN</h1>

This is an **Electron** template using **Vite, React, Typescript, TailWindCSS and ShadCN**. It includes hot reloading, IPC type-safety and general security.

## Project Setup
#### It works on Windows but I haven't tested it on neither Linux nor Mac
1. Clone the repository
1. Run **```npm install```** inside the cloned repository

## For development
1. **Starting the application** - Run **```npm run dev```** - This starts the application as well as a local server on port **```3524```**
1. **Changing the port** - You can change the server port at the **```vite.config.ts```**. After that you need to type the same port in the **```src/electron/util.ts```** folder in the **```validateEventFrame()```** function. You also have to change the port at **```src/electron/main.ts```** in the **```if(isDev())```**. 

## For production
1. To create a production for Windows run **```npm run dist:win```**
1. To create a production for Linux run **```npm run dist:linux```**
1. To create a production for Mac run **```npm run dist:mac```**

**I hope you find this template useful!** If you want to support me you can-
[<h1 align="center">!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)</h1>](https://www.buymeacoffee.com/georgimy)
