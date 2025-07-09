# Intel PresentMon Integration

This directory is used to store the Intel PresentMon DLL for enhanced Intel GPU monitoring in Recodarr.

## Overview

Intel PresentMon provides detailed GPU performance metrics for Intel graphics hardware, including:
- GPU utilization percentage
- GPU memory usage (used/total)
- GPU temperature
- GPU power consumption
- More accurate metrics than generic system information tools

## Getting Intel PresentMon DLL

### Option 1: Download from Intel (Recommended)

1. Visit the Intel PresentMon GitHub repository: https://github.com/GameTechDev/PresentMon
2. Download the latest release for Windows
3. Extract the archive and locate `PresentMonAPI2.dll` (usually in the application directory)
4. Copy `PresentMonAPI2.dll` to this directory (`src/resources/presentmon/`)

### Option 2: Build from Source

1. Clone the Intel PresentMon repository
2. Follow the build instructions in their README
3. Build the DLL for x64 Windows
4. Copy the resulting `PresentMonAPI2.dll` to this directory

## File Structure

```
src/resources/presentmon/
├── README.md (this file)
├── PresentMonAPI2.dll (Intel PresentMon API DLL - you need to add this)
└── LICENSE (optional - Intel's license file)
```

## Which DLL to Use

Intel PresentMon typically includes several DLL files:
- **`PresentMonAPI2.dll`** - Main API DLL (THIS IS THE ONE YOU NEED)
- `Intel-PresentMon.dll` - Provider-specific DLL (not needed for this integration)
- Other supporting DLLs

**Use `PresentMonAPI2.dll` from the application directory of the Intel PresentMon distribution.**

## Application Integration

When `PresentMonAPI2.dll` is present:
- The application will automatically initialize Intel PresentMon during startup
- Intel GPU monitoring will use PresentMon for enhanced metrics
- Fallback to systeminformation library if PresentMon fails

When `PresentMonAPI2.dll` is not present:
- The application will use the standard systeminformation library
- Intel GPU monitoring will use basic system APIs
- A log message will indicate PresentMon is not available

## Bundling with Distribution

For distribution builds, the DLL will be bundled in the `resources/presentmon/` directory of the packaged application.

## License Considerations

Intel PresentMon is licensed under the MIT License. Make sure to comply with Intel's licensing terms when distributing the DLL with your application.

## Troubleshooting

### DLL Not Loading
- Ensure the DLL is the correct architecture (x64)
- Check Windows Event Logs for DLL loading errors
- Verify all dependencies are available
- Make sure you're using `PresentMonAPI2.dll` and not other DLLs

### Metrics Not Available
- Check console logs for PresentMon initialization errors
- Verify Intel GPU drivers are installed and up to date
- Ensure the Intel GPU is the selected monitoring target

### Performance Issues
- PresentMon polling runs every 2 seconds by default
- Monitor CPU usage to ensure polling isn't too frequent
- Check for memory leaks in long-running sessions

## Development Notes

The integration is implemented in:
- `src/electron/intelPresentMon.ts` - PresentMon wrapper
- `src/electron/systemUtils.ts` - Integration with system monitoring

Function signatures and structures may need adjustment based on the actual PresentMon API version you're using. 