import os
import json
import urllib.request
import urllib.parse

MORPH_API_KEY = "sk-IqgEgFDaEzxzuM6yDZ2SHJbft6D54dwaJHn0UduruRP1G310"

prompt = """
Generate a JSON array of exactly 100 REAL AgTech, FoodTech, Biotech, and Environmental startups/companies that are headquartered or have significant operations in Yolo County, California (e.g., Davis, Woodland, Winters, West Sacramento). 
Davis is a massive hub for agricultural innovation, so include university spin-offs, seed companies, biotech firms, and precision ag companies.
Do NOT fake the data. Use actual company names. 
For each startup, provide exactly this schema:
{
    "id": "string",
    "name": "string",
    "city": "string (Davis, Woodland, etc.)",
    "focus": "string (e.g. Precision Ag, Biologicals, Alt Protein)",
    "description": "2-sentence real description"
}

Output ONLY valid JSON. Start with [ and end with ]. Do not include markdown blocks.
"""

def generate_startups():
    url = "https://api.morphllm.com/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {MORPH_API_KEY}"
    }
    
    data = {
        "model": "morph-pro",
        "messages": [
            {"role": "system", "content": "You are a Yolo County agricultural business directory expert."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2
    }
    
    req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode())
            text = result["choices"][0]["message"]["content"]
            
            # Clean up markdown if any
            if text.startswith("```json"):
                text = text[7:-3]
            elif text.startswith("```"):
                text = text[3:-3]
                
            startups = json.loads(text.strip())
            
            os.makedirs("data", exist_ok=True)
            with open("data/yolo_startups.json", "w") as f:
                json.dump(startups, f, indent=4)
                
            print(f"Successfully wrote {len(startups)} real startups to data/yolo_startups.json")
    except Exception as e:
        print(f"Error generating startups: {e}")

if __name__ == "__main__":
    generate_startups()
