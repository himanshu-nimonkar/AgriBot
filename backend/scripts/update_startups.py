import json

raw_data = [
  {
    "name": "BioConsortia",
    "description": "BioConsortia develops microbial-based agricultural products that enhance nutrient efficiency, disease resistance, and crop productivity. Their technology platform identifies and optimizes beneficial soil microbes to reduce dependence on synthetic fertilizers and pesticides.",
    "location": "Davis, CA, USA",
    "phone": "(530) 564-5570"
  },
  {
    "name": "Biome Makers",
    "description": "Biome Makers analyzes soil microbiomes using DNA sequencing and data analytics to guide agronomic decisions. Their BeCrop platform helps farmers improve soil health, optimize inputs, and increase long-term productivity.",
    "location": "Davis, CA, USA",
    "phone": "+1 916-378-8580"
  },
  {
    "name": "FloraPulse",
    "description": "FloraPulse develops microtensiometer sensors embedded in plants to measure water stress in real time. These sensors help orchard and vineyard managers optimize irrigation and improve water-use efficiency.",
    "location": "Davis, CA, USA",
    "phone": "+1-530-220-7668"
  },
  {
    "name": "InnerPlant",
    "description": "InnerPlant engineers crops that emit biological signals when stressed by pests, disease, or nutrient deficiencies. Their living sensor technology enables early detection and proactive crop management.",
    "location": "Davis, CA, USA",
    "phone": "(877) 418-2062"
  },
  {
    "name": "AIVision Food",
    "description": "AIVision Food builds AI-powered monitoring systems for pest detection and quality control in food storage and processing facilities. Their technology helps reduce crop losses and improve food safety.",
    "location": "Davis, CA, USA",
    "phone": ""
  },
  {
    "name": "Advanced Farm Technologies",
    "description": "Advanced Farm Technologies develops robotic harvesting systems for specialty crops such as strawberries and apples. Their automation reduces labor dependency while increasing harvesting efficiency.",
    "location": "Davis, CA, USA",
    "phone": ""
  },
  {
    "name": "Oobli",
    "description": "Oobli uses biotechnology to produce sweet proteins that replace sugar in food products. Their ingredients offer sweetness without calories, helping reduce sugar-related health and environmental impacts.",
    "location": "Davis, CA, USA",
    "phone": ""
  },
  {
    "name": "One Bio",
    "description": "One Bio converts agricultural by-products into functional fibers and food ingredients. Their upcycling platform improves sustainability while creating value from agricultural waste streams.",
    "location": "Davis, CA, USA",
    "phone": ""
  },
  {
    "name": "MyFloraDNA",
    "description": "MyFloraDNA provides genetic testing and pathogen diagnostics for cannabis and specialty crops. Their services help growers improve crop quality, disease resistance, and operational efficiency.",
    "location": "Woodland, CA, USA",
    "phone": ""
  },
  {
    "name": "BioMilitus",
    "description": "BioMilitus uses insect-based bioconversion systems to transform agricultural waste into high-protein feed ingredients. Their technology supports circular agriculture and waste reduction.",
    "location": "Davis, CA, USA",
    "phone": ""
  },
  {
    "name": "Botanical Solution",
    "description": "Botanical Solution develops scalable botanical compounds using advanced bioprocessing methods. Their products support food, agriculture, and pharmaceutical applications with a focus on sustainability.",
    "location": "Yolo County, CA, USA",
    "phone": ""
  },
  {
    "name": "Pheronym",
    "description": "Pheronym develops pheromone-based solutions to control nematodes and soil pests without toxic chemicals. Their products improve plant health while reducing environmental impact.",
    "location": "Davis, CA, USA",
    "phone": ""
  },
  {
    "name": "TurtleTree",
    "description": "TurtleTree produces animal-free dairy proteins using precision fermentation technology. Their sustainable ingredients aim to replace conventional dairy in food and nutrition products.",
    "location": "West Sacramento / Davis Area, CA, USA",
    "phone": ""
  },
  {
    "name": "Nexture Bio",
    "description": "Nexture Bio develops edible scaffolds and microcarriers for cultivated meat production. Their materials enable cell growth in cellular agriculture systems while remaining food-safe and sustainable.",
    "location": "Davis Ecosystem / USA",
    "phone": ""
  },
  {
    "name": "Astrid Pharma",
    "description": "Astrid Pharma researches nanocarrier-based oral drug delivery systems. Their technology aims to replace injectable medicines with safer, drinkable alternatives.",
    "location": "Yolo County, CA, USA",
    "phone": ""
  },
  {
    "name": "Prism Bio Inc.",
    "description": "Prism Bio uses engineered microbes to produce natural pigments through biotechnology. Their platform enables scalable and sustainable alternatives to synthetic food dyes.",
    "location": "Yolo County, CA, USA",
    "phone": ""
  },
  {
    "name": "FRINJ Coffee",
    "description": "FRINJ develops climate-adapted coffee cultivars for California through selective breeding. Their work aims to establish a high-quality domestic coffee industry.",
    "location": "Yolo County, CA, USA",
    "phone": ""
  },
  {
    "name": "Balletic Foods",
    "description": "Balletic Foods produces animal-free proteins using fermentation and biotechnology. Their products target sustainable nutrition with reduced environmental footprint.",
    "location": "Yolo County, CA, USA",
    "phone": ""
  },
  {
    "name": "Macro Oceans",
    "description": "Macro Oceans converts seaweed into low-carbon chemicals and biomaterials. Their technology supports marine ecosystem restoration and bio-based manufacturing.",
    "location": "Yolo County, CA, USA",
    "phone": ""
  },
  {
    "name": "BCD Bioscience",
    "description": "BCD Bioscience develops diverse oligosaccharides for prebiotic and immune-support applications. Their platform links molecular structure to biological function.",
    "location": "Davis, CA, USA",
    "phone": ""
  },
  {
    "name": "Persist AI",
    "description": "Persist AI uses artificial intelligence and automation to accelerate long-acting drug formulation. Their systems reduce development timelines from years to months.",
    "location": "Davis, CA, USA",
    "phone": ""
  },
  {
    "name": "Corteva Agriscience",
    "description": "Corteva supplies seeds, crop protection products, and digital agronomy services. The company supports large-scale farming operations with advanced agricultural inputs.",
    "location": "Woodland, CA, USA",
    "phone": "(530) 666-1084"
  },
  {
    "name": "Nano-Yield",
    "description": "Nano-Yield develops micronutrient delivery technologies for crop enhancement. Their formulations improve nutrient uptake and plant resilience.",
    "location": "Woodland, CA, USA",
    "phone": "(916) 202-4846"
  },
  {
    "name": "Wilbur-Ellis Company",
    "description": "Wilbur-Ellis provides fertilizer, crop protection products, and agronomic consulting. They support growers across input management and farm optimization.",
    "location": "Woodland, CA, USA",
    "phone": "(530) 662-4182"
  },
  {
    "name": "AgWest Farm Credit",
    "description": "AgWest Farm Credit offers loans and financial services to farmers and agribusinesses. Their programs support land acquisition, equipment, and operational growth.",
    "location": "Woodland, CA, USA",
    "phone": "(530) 666-3333"
  },
  {
    "name": "Grow West",
    "description": "Grow West provides agronomic consulting, crop planning, and farm advisory services. Their team helps growers improve yield, efficiency, and compliance.",
    "location": "Woodland, CA, USA",
    "phone": "(530) 662-5442"
  },
  {
    "name": "Yolo Land & Cattle Co.",
    "description": "Yolo Land & Cattle Company manages large-scale cattle ranching and agricultural lands. The company integrates livestock operations with land stewardship.",
    "location": "Yolo County, CA, USA",
    "phone": ""
  },
  {
    "name": "Sierra Orchards",
    "description": "Sierra Orchards operates organic walnut orchards using sustainable farming practices. The company focuses on regenerative agriculture and soil conservation.",
    "location": "Winters, CA, USA",
    "phone": ""
  },
  {
    "name": "Farm Fresh To You",
    "description": "Farm Fresh To You operates a community-supported agriculture (CSA) delivery service. They connect regional farms directly to consumers through subscription boxes.",
    "location": "Yolo / Sacramento Region, CA, USA",
    "phone": ""
  },
  {
    "name": "Sac Valley Orchards Cooperative Extension",
    "description": "This UC-affiliated program provides research-based guidance to orchard growers. It supports pest management, irrigation, and crop productivity improvement.",
    "location": "Sacramento Valley, CA, USA",
    "phone": ""
  }
]

formatted_startups = []
for i, d in enumerate(raw_data):
    city = d["location"].split(",")[0].strip()
    desc = d["description"].lower()
    focus = "AgTech Focus"
    if "seed" in desc or "genetics" in desc or "breed" in desc:
        focus = "Seed Genetics"
    elif "microbi" in desc or "soil" in desc or "fertilizer" in desc or "nutrient" in desc:
        focus = "Soil Health"
    elif "water" in desc or "irrigation" in desc or "tensiometer" in desc:
        focus = "Water Management"
    elif "pest" in desc or "disease" in desc or "protection" in desc or "nematode" in desc:
        focus = "Crop Protection"
    elif "roboti" in desc or "ai" in desc or "sensor" in desc or "automation" in desc:
        focus = "Ag Robotics"
    elif "protein" in desc or "fermentation" in desc or "cultivated" in desc:
        focus = "Alternative Protein"
    elif "compound" in desc or "drug" in desc or "bioconversion" in desc or "seaweed" in desc:
        focus = "Biologicals"
        
    formatted_startups.append({
        "id": f"s{i+1}",
        "name": d["name"],
        "city": city,
        "focus": focus,
        "description": d["description"]
    })

with open("backend/data/yolo_startups.json", "w") as f:
    json.dump(formatted_startups, f, indent=4)
