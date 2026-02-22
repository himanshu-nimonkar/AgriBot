import re

text = """
<voice_summary> Your tomato plants in Russell Park are showing severe water stress, which is a major concern given the upcoming heat wave. I'd recommend taking immediate action to ensure their survival. We need to assess the current soil moisture levels and consider supplemental irrigation. The 7-day forecast indicates two rainy days, but that might not be enough to alleviate the stress. We should also consider the heat units and growing degree days to determine the optimal timing for any interventions.

The current soil moisture levels are relatively low, especially in the top 7cm of soil. Given the heat wave, it's crucial to take action to prevent further stress and potential damage to the plants. Supplemental irrigation could be a good option to alleviate the water stress. We should also keep a close eye on the soil moisture levels and adjust our strategy accordingly.

The 7-day forecast indicates two rainy days, but that might not be enough to alleviate the stress. We should also consider the potential for heat-related stress and take proactive measures to protect your plants.

</voice_summary>

Current Situation
Your tomato plants in Russell Park are facing severe water stress
"""

print("BEFORE:")
print(text)

text = re.sub(r'<voice_summary>.*?</voice_summary>', '', text, flags=re.DOTALL | re.IGNORECASE)

print("AFTER:")
print(text)

