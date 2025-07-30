// Weather station data for snowmobile conditions and legacy compatibility

export const snowmobileConditionsStations = {
    // Stations with both temperature AND snow depth - ideal for snowmobile conditions
    "159770": { 
        name: "Glommersträsk", 
        hasTemperature: true, 
        hasSnowDepth: true,
        region: "Northern Sweden"
    },
    "188850": { 
        name: "Katterjåkk/Riksgränsen", 
        hasTemperature: true, 
        hasSnowDepth: true,
        region: "Arctic/Mountain"
    },
    "166810": { 
        name: "Gautosjö", 
        hasTemperature: true, 
        hasSnowDepth: true,
        region: "Northern Sweden"
    },
    
    // Temperature-only stations in snowmobile regions
    "155960": { 
        name: "Tärnaby/Hemavan (800m)", 
        hasTemperature: true, 
        hasSnowDepth: false,
        region: "Mountain"
    },
    "155970": { 
        name: "Tärnaby/Hemavan (450m)", 
        hasTemperature: true, 
        hasSnowDepth: false,
        region: "Mountain"
    },
    "155790": { 
        name: "Gielas A", 
        hasTemperature: true, 
        hasSnowDepth: false,
        region: "Northern Sweden"
    },
    "166910": { 
        name: "Mierkenis", 
        hasTemperature: true, 
        hasSnowDepth: false,
        region: "Northern Sweden"
    },
    "132170": { 
        name: "Storlien-Storvallen", 
        hasTemperature: true, 
        hasSnowDepth: false,
        region: "Mountain"
    },
    "159880": { 
        name: "Arvidsjaur", 
        hasTemperature: true, 
        hasSnowDepth: false,
        region: "Northern Sweden"
    },
    "151280": { 
        name: "Lövånger/Bjuröklubb", 
        hasTemperature: true, 
        hasSnowDepth: false,
        region: "Coastal"
    },
    
    // Snow depth-only stations in snowmobile regions
    "145500": { 
        name: "Borgafjäll", 
        hasTemperature: false, 
        hasSnowDepth: true,
        region: "Mountain"
    },
    "158970": { 
        name: "Arvidsjaur", 
        hasTemperature: false, 
        hasSnowDepth: true,
        region: "Northern Sweden"
    },
    "132180": { 
        name: "Storlien-Storvallen", 
        hasTemperature: false, 
        hasSnowDepth: true,
        region: "Mountain"
    },
    "155770": { 
        name: "Kittelfjäll", 
        hasTemperature: false, 
        hasSnowDepth: true,
        region: "Mountain"
    },
    "155940": { 
        name: "Tärnaby/Hemavan", 
        hasTemperature: false, 
        hasSnowDepth: true,
        region: "Mountain"
    },
    "158820": { 
        name: "Adak", 
        hasTemperature: false, 
        hasSnowDepth: true,
        region: "Northern Sweden"
    },
    "144530": { 
        name: "Jorm", 
        hasTemperature: false, 
        hasSnowDepth: true,
        region: "Mountain"
    },
    "151220": { 
        name: "Lövånger", 
        hasTemperature: false, 
        hasSnowDepth: true,
        region: "Coastal"
    }
};

// Legacy station maps for backward compatibility (deprecated)
export const temperatureStations = {
    "155960": "Tärnaby/Hemavan at altitude 800m ",
    "155970": "Tärnaby/Hemavan at altitude 450m",
    "155790": "Gielas A",
    "166910": "Mierkenis",
    "159770": "Glommersträsk",
    "132170": "Storlien-Storvallen",
    "188850": "Katterjåkk/Riksgränsen",
    "159880": "Arvidsjaur",
    "166810": "Gautosjö",
    "151280": "Lövånger/Bjuröklubb"
};

export const snowDepthStations = {
    "145500": "Borgafjäll",
    "158970": "Arvidsjaur",
    "159770": "Glommersträsk",
    "132180": "Storlien-Storvallen",
    "188850": "Katterjåkk/Riksgränsen",
    "155770": "Kittelfjäll",
    "155940": "Tärnaby/Hemavan",
    "158820": "Adak",
    "166810": "Gautosjö",
    "144530": "Jorm",
    "151220": "Lövånger"
};