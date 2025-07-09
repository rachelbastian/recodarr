// Test script for Intel PresentMon integration
// This file can be used to test the Intel PresentMon functionality independently

import { 
    initializeIntelPresentMon, 
    getIntelGpuMetrics, 
    isIntelGpuDetected, 
    shutdownIntelPresentMon,
    isIntelPresentMonAvailable 
} from './intelPresentMon.js';

async function testIntelPresentMon() {
    console.log('=== Intel PresentMon Integration Test ===');
    
    // Test Intel GPU detection
    console.log('\n1. Testing Intel GPU detection:');
    const testVendors = ['Intel', 'intel', 'INTEL', 'Nvidia', 'AMD'];
    testVendors.forEach(vendor => {
        const isIntel = isIntelGpuDetected(vendor);
        console.log(`  ${vendor}: ${isIntel ? 'INTEL GPU' : 'not Intel'}`);
    });
    
    // Test PresentMon initialization
    console.log('\n2. Testing PresentMon initialization:');
    try {
        const initialized = await initializeIntelPresentMon();
        console.log(`  Initialization result: ${initialized ? 'SUCCESS' : 'FAILED/SKIPPED'}`);
        
        if (initialized) {
            console.log(`  PresentMon available: ${isIntelPresentMonAvailable()}`);
            
            // Test getting metrics
            console.log('\n3. Testing GPU metrics retrieval:');
            const metrics = await getIntelGpuMetrics();
            
            if (metrics.error) {
                console.log(`  Error: ${metrics.error}`);
            } else {
                console.log('  Metrics received:');
                console.log(`    GPU Utilization: ${metrics.gpuUtilization}%`);
                console.log(`    GPU Memory Used: ${metrics.gpuMemoryUsed} MB`);
                console.log(`    GPU Memory Total: ${metrics.gpuMemoryTotal} MB`);
                console.log(`    GPU Temperature: ${metrics.gpuTemperature}°C`);
                console.log(`    GPU Power Draw: ${metrics.gpuPowerDraw}W`);
            }
            
            // Test shutdown
            console.log('\n4. Testing PresentMon shutdown:');
            await shutdownIntelPresentMon();
            console.log('  Shutdown completed');
            console.log(`  PresentMon available after shutdown: ${isIntelPresentMonAvailable()}`);
        } else {
            console.log('  Skipping metrics test - PresentMon not initialized');
            console.log('  Possible reasons:');
            console.log('    - PresentMon.dll not found in resources/presentmon/');
            console.log('    - DLL loading failed');
            console.log('    - PresentMon API initialization failed');
        }
    } catch (error) {
        console.error('  Test failed with error:', error);
    }
    
    console.log('\n=== Test Complete ===');
}

// Export for use in other modules
export { testIntelPresentMon };

// Run test if this file is executed directly
if (require.main === module) {
    testIntelPresentMon().catch(console.error);
} 