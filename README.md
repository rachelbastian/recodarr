<h1 align="center">RE:CODARR</h1>

An easy to use Windows App to organize and reclaim precious space in your home media Library.  

Features: 
Automatic Library Monitoring and Indexing.
    Track File Size, Encoding Parameters and More!
    Fully Searchable and indexed in a localdb
Workflow editor
    Easily Create conditional workflows to automate your library encode without overloading your system. 
System Monitor for CPU/GPU Stats (AMD/Nvidia)
Powershell Integration for Intel IGPU's and ARC (WARNING: MAY TRIGGER AV USE AT OWN DISCRETION!)

## Project Setup
#### Designed for Windows
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
[<h1 align="center">!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)</h1>](buymeacoffee.com/rachelbastian)
